/*
 * Adaptateur Premiere DOM API (UXP) -> ProjectModel.
 *
 * COUCHE FINE ET LA SEULE NON TESTABLE HORS DE PREMIERE. Toute la logique de
 * décision vit dans src/core/*. Ici on ne fait que LIRE le projet et remplir le
 * modèle consommé par le cœur, puis (modules B/C) GÉNÉRER des actions.
 *
 * ⚠️ À vérifier dans Premiere 25.0+ (UXP Developer Tool) : les détails de cast
 *    ProjectItem -> FolderItem/ClipProjectItem et l'accès résolution (voir
 *    getClipResolution, marqué TODO — seul vrai trou d'API, cf. PLAN.md §Risque).
 */

'use strict';

let ppro = null;
function getPpro() {
  if (!ppro) ppro = require('premierepro');
  return ppro;
}

/** Item racine et parcours récursif de l'arbre de bins. */
async function buildProjectModel() {
  const api = getPpro();
  const project = await api.Project.getActiveProject();
  if (!project) throw new Error('Aucun projet ouvert.');

  const items = [];
  const root = await project.getRootItem();
  await walkFolder(api, root, null, items);

  // Map: id de projectItem-séquence -> ids des sources de ses trackItems.
  const sequenceClips = new Map();
  const sequences = await project.getSequences();
  for (const seq of sequences) {
    const seqItem = await seq.getProjectItem();
    const seqId = await seqItem.getId();
    sequenceClips.set(seqId, await collectReferencedItemIds(api, seq));
  }

  return { items, sequenceClips };
}

async function walkFolder(api, folder, parentBinId, out) {
  const children = await folder.getItems();
  for (const child of children) {
    const id = await child.getId();
    const name = child.name;
    const folderItem = api.FolderItem.cast ? api.FolderItem.cast(child) : null;

    if (folderItem) {
      out.push({ id, name, kind: 'bin', parentBinId });
      await walkFolder(api, folderItem, id, out);
      continue;
    }

    const clip = api.ClipProjectItem.cast ? api.ClipProjectItem.cast(child) : null;
    if (clip) {
      const isSeq = await clip.isSequence();
      out.push({
        id,
        name,
        kind: isSeq ? 'sequence' : 'clip',
        parentBinId,
        mediaPath: isSeq ? null : safe(await clip.getMediaFilePath()),
        isOffline: isSeq ? false : safe(await clip.isOffline()),
        isMulticam: safe(await clip.isMulticamClip()),
        isMerged: safe(await clip.isMergedClip()),
      });
      continue;
    }

    // Type non reconnu : on l'enregistre comme clip pour ne JAMAIS le perdre.
    out.push({ id, name, kind: 'clip', parentBinId, mediaPath: null });
  }
}

/** Sources référencées par tous les trackItems (vidéo + audio) d'une séquence. */
async function collectReferencedItemIds(api, seq) {
  const ids = new Set();
  const Clip = api.Constants.TrackItemType.Clip;

  const vCount = await seq.getVideoTrackCount();
  for (let i = 0; i < vCount; i++) {
    const track = await seq.getVideoTrack(i);
    await collectFromTrack(track, Clip, ids);
  }
  const aCount = await seq.getAudioTrackCount();
  for (let i = 0; i < aCount; i++) {
    const track = await seq.getAudioTrack(i);
    await collectFromTrack(track, Clip, ids);
  }
  return Array.from(ids);
}

async function collectFromTrack(track, clipType, ids) {
  const trackItems = await track.getTrackItems(clipType, false);
  for (const ti of trackItems) {
    const pItem = await ti.getProjectItem();
    if (pItem) ids.add(await pItem.getId());
  }
}

/*
 * TODO (Risque PLAN.md) : la résolution n'a pas d'accesseur direct.
 * Piste : getProjectColumnsMetadata() puis parser la colonne "Video Info"
 * (ex. "1920 x 1080"). À prototyper séparément. fps OK via FootageInterpretation.
 */
async function getClipFps(clip) {
  try {
    const interp = await clip.getFootageInterpretation();
    return interp ? safe(await interp.getFrameRate()) : null;
  } catch {
    return null;
  }
}

function safe(v) {
  return v === undefined ? null : v;
}

module.exports = { buildProjectModel, getClipFps, getPpro };
