/*
 * Adaptateur Premiere DOM API (UXP) <-> logique pure.
 *
 * COUCHE FINE ET LA SEULE NON TESTABLE HORS DE PREMIERE. Toute décision vit dans
 * src/core/*. Ici : LIRE le projet -> ProjectModel, et EXÉCUTER les plans
 * (purs, déjà calculés) via le pattern Action + Transaction (annulable).
 *
 * ⚠️ Points à vérifier dans Premiere 25.0+ (UXP Developer Tool) :
 *    - cast ProjectItem -> FolderItem / ClipProjectItem (signatures `cast`)
 *    - getProjectColumnsMetadata() pour la résolution (cf. PLAN.md §Risque)
 *    - séquençage exact création de bin -> récupération du FolderItem -> move
 */

'use strict';

const { extractResolutionFps } = require('../core/resolution');

let ppro = null;
function getPpro() {
  if (!ppro) ppro = require('premierepro');
  return ppro;
}

// Handles vivants de la dernière lecture : id -> { item, parentFolder, isFolder }.
// Nécessaire car le ProjectModel ne transporte que des ids (sérialisable/testable).
const handles = new Map();

async function getActiveProject() {
  const project = await getPpro().Project.getActiveProject();
  if (!project) throw new Error('Aucun projet ouvert.');
  return project;
}

/** Construit le ProjectModel et met à jour le cache de handles. */
async function buildProjectModel() {
  const api = getPpro();
  const project = await getActiveProject();
  handles.clear();

  const items = [];
  const root = await project.getRootItem();
  await walkFolder(api, root, null, items);

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
      handles.set(id, { item: child, parentFolder: folder, isFolder: true, folder: folderItem });
      out.push({ id, name, kind: 'bin', parentBinId });
      await walkFolder(api, folderItem, id, out);
      continue;
    }

    const clip = api.ClipProjectItem.cast ? api.ClipProjectItem.cast(child) : null;
    handles.set(id, { item: child, parentFolder: folder, isFolder: false });
    if (clip) {
      const isSeq = await clip.isSequence();
      out.push({
        id, name, parentBinId,
        kind: isSeq ? 'sequence' : 'clip',
        mediaPath: isSeq ? null : safe(await clip.getMediaFilePath()),
        isOffline: isSeq ? false : safe(await clip.isOffline()),
        isMulticam: safe(await clip.isMulticamClip()),
        isMerged: safe(await clip.isMergedClip()),
      });
    } else {
      out.push({ id, name, kind: 'clip', parentBinId, mediaPath: null });
    }
  }
}

async function collectReferencedItemIds(api, seq) {
  const ids = new Set();
  const Clip = api.Constants.TrackItemType.Clip;
  const vCount = await seq.getVideoTrackCount();
  for (let i = 0; i < vCount; i++) await collectFromTrack(await seq.getVideoTrack(i), Clip, ids);
  const aCount = await seq.getAudioTrackCount();
  for (let i = 0; i < aCount; i++) await collectFromTrack(await seq.getAudioTrack(i), Clip, ids);
  return Array.from(ids);
}

async function collectFromTrack(track, clipType, ids) {
  const trackItems = await track.getTrackItems(clipType, false);
  for (const ti of trackItems) {
    const pItem = await ti.getProjectItem();
    if (pItem) ids.add(await pItem.getId());
  }
}

// --- Enrichissement pour le rangement (résolution / type) --------------------

/** Construit la liste de clips enrichis (type, width, height, fps) pour planArrange. */
async function enrichClipsForArrange(model) {
  const api = getPpro();
  const clips = [];
  for (const it of model.items) {
    if (it.kind !== 'clip') continue;
    const h = handles.get(it.id);
    const clip = h && api.ClipProjectItem.cast ? api.ClipProjectItem.cast(h.item) : null;
    let res = { width: null, height: null, fps: null };
    let type = 'video';
    if (clip) {
      res = await readResolutionFps(clip);
      type = await readType(api, clip);
    }
    clips.push({ id: it.id, name: it.name, type, ...res });
  }
  return clips;
}

async function readResolutionFps(clip) {
  try {
    const json = await clip.getProjectColumnsMetadata();
    const cols = typeof json === 'string' ? JSON.parse(json) : json;
    return extractResolutionFps(cols);
  } catch {
    return { width: null, height: null, fps: null };
  }
}

async function readType(api, clip) {
  // Mapping ContentType -> familles du CDC §4. À confirmer en Premiere.
  try {
    const ct = await clip.getContentType();
    const C = api.Constants.ContentType || {};
    if (ct === C.Audio) return 'audio';
    if (ct === C.Still || ct === C.Image) return 'image';
    if (ct === C.Graphic || ct === C.MOGRT) return 'graphic';
    return 'video';
  } catch {
    return 'video';
  }
}

// --- Exécution des plans (transactions annulables) ---------------------------

/** Retire du PROJET (jamais du disque) les items du plan de nettoyage. */
async function executeCleanup(plan) {
  const project = await getActiveProject();
  const done = [];
  await project.executeTransaction((compound) => {
    for (const r of plan.removals) {
      const h = handles.get(r.id);
      if (!h || !h.parentFolder) continue;
      const folder = getPpro().FolderItem.cast(h.parentFolder) || h.parentFolder;
      compound.addAction(folder.createRemoveItemAction(h.item));
      done.push(r);
    }
  }, 'BinKeeper — Nettoyage');
  return done;
}

/**
 * Crée les bins puis déplace les clips selon le plan de rangement.
 * Les bins sont créés d'abord (parents avant enfants), puis re-résolus, car
 * un move nécessite le FolderItem cible vivant.
 */
async function executeArrange(plan) {
  const api = getPpro();
  const project = await getActiveProject();
  const root = await project.getRootItem();

  // 1) Créer les bins manquants, niveau par niveau, en cachant les FolderItem.
  const binByPath = new Map(); // "Vidéo/1920x1080_25" -> FolderItem
  for (const path of plan.binsToCreate) {
    const parentPath = path.slice(0, -1);
    const parent = parentPath.length ? binByPath.get(parentPath.join('/')) : root;
    const name = path[path.length - 1];
    let folder = await findChildFolder(api, parent, name);
    if (!folder) {
      await project.executeTransaction((c) => {
        c.addAction(parent.createBinAction(name, true));
      }, 'BinKeeper — Création bin');
      folder = await findChildFolder(api, parent, name);
    }
    binByPath.set(path.join('/'), folder);
  }

  // 2) Déplacer les clips.
  const moved = [];
  await project.executeTransaction((c) => {
    for (const mv of plan.moves) {
      const h = handles.get(mv.clipId);
      const target = binByPath.get(mv.path.join('/'));
      if (!h || !target) continue;
      c.addAction(target.createMoveItemAction(h.item, target));
      moved.push(mv);
    }
  }, 'BinKeeper — Rangement');
  return moved;
}

async function findChildFolder(api, parentFolder, name) {
  const children = await parentFolder.getItems();
  for (const child of children) {
    if (child.name !== name) continue;
    const f = api.FolderItem.cast ? api.FolderItem.cast(child) : null;
    if (f) return f;
  }
  return null;
}

function safe(v) {
  return v === undefined ? null : v;
}

module.exports = {
  buildProjectModel,
  enrichClipsForArrange,
  executeCleanup,
  executeArrange,
  getPpro,
};
