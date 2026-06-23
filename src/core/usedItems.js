/*
 * Tâche n°0 (CDC §3) — logique PURE, sans dépendance à `premierepro`.
 *
 * Pourquoi pure : le module `premierepro` n'existe que dans Premiere Pro.
 * En isolant ici toute la récursion (séquences imbriquées, cycles), on peut
 * la PROUVER par des tests Node exécutables hors de Premiere. L'accès réel à
 * l'API vit dans src/api/pproAdapter.js, qui ne fait que construire le modèle
 * ci-dessous puis délègue tout le raisonnement à ces fonctions.
 *
 * --- Modèle de projet attendu (ProjectModel) ---------------------------------
 * {
 *   items: Array<{
 *     id: string,                 // identifiant projectItem unique
 *     name: string,
 *     kind: 'clip' | 'sequence' | 'bin',
 *     mediaPath?: string | null,  // chemin média (clips) — sert aux doublons
 *     isOffline?: boolean,        // média hors-ligne
 *     isMulticam?: boolean,
 *     isMerged?: boolean,
 *     parentBinId?: string | null
 *   }>,
 *   // Pour chaque projectItem de type 'sequence', la liste des ids de
 *   // projectItems sources référencés par ses trackItems (vidéo + audio).
 *   // Un id peut pointer vers un clip OU vers une autre séquence (imbrication).
 *   sequenceClips: Map<string, string[]>
 * }
 */

'use strict';

/**
 * Calcule l'ensemble des ids de projectItems UTILISÉS par au moins une
 * séquence, récursion sur les séquences imbriquées incluse.
 *
 * Sémantique choisie (la plus sûre, cf. CDC §3 pt 3) : on part de TOUTES les
 * séquences du projet, pas seulement celles de premier niveau. Ainsi un clip
 * présent uniquement dans une séquence imbriquée est toujours marqué utilisé,
 * même si l'imbrication n'était pas détectée. La récursion reste implémentée
 * (et protégée contre les cycles) car elle sert aussi à savoir quelles
 * séquences sont référencées par d'autres.
 *
 * @param {ProjectModel} model
 * @returns {Set<string>} ids de projectItems utilisés
 */
function getUsedProjectItemIds(model) {
  const { sequenceClips } = model;
  const used = new Set();
  const visitedSequences = new Set(); // garde anti-cycle

  // Racines = toutes les séquences connues.
  const roots = Array.from(sequenceClips.keys());

  const stack = [...roots];
  while (stack.length > 0) {
    const seqId = stack.pop();
    if (visitedSequences.has(seqId)) continue;
    visitedSequences.add(seqId);

    const refs = sequenceClips.get(seqId) || [];
    for (const refId of refs) {
      used.add(refId);
      // Si l'item référencé est lui-même une séquence, on récurse dedans.
      if (sequenceClips.has(refId)) {
        stack.push(refId);
      }
    }
  }

  return used;
}

/**
 * Identifie les clips ORPHELINS : projectItems médias non référencés par
 * aucune séquence. Les séquences ne sont JAMAIS orphelines (garde-fou CDC §6 :
 * une séquence n'est jamais retirée automatiquement). Les bins ne sont pas
 * traités ici (voir findEmptyBins).
 *
 * @param {ProjectModel} model
 * @returns {Array<object>} items orphelins (kind === 'clip')
 */
function findOrphans(model) {
  const used = getUsedProjectItemIds(model);
  return model.items.filter(
    (it) => it.kind === 'clip' && !used.has(it.id)
  );
}

/**
 * Détecte les doublons : plusieurs clips pointant vers le même chemin média.
 * Les médias hors-ligne (mediaPath null/vide) sont ignorés.
 *
 * @param {ProjectModel} model
 * @returns {Array<{ mediaPath: string, items: object[] }>} groupes de doublons
 */
function findDuplicatesByPath(model) {
  const byPath = new Map();
  for (const it of model.items) {
    if (it.kind !== 'clip') continue;
    const p = normalizePath(it.mediaPath);
    if (!p) continue;
    if (!byPath.has(p)) byPath.set(p, []);
    byPath.get(p).push(it);
  }
  const groups = [];
  for (const [mediaPath, items] of byPath) {
    if (items.length > 1) groups.push({ mediaPath, items });
  }
  return groups;
}

/**
 * Liste les bins vides (aucun enfant). Un bin est vide si aucun item ne le
 * déclare comme parent.
 *
 * @param {ProjectModel} model
 * @returns {Array<object>} bins vides
 */
function findEmptyBins(model) {
  const hasChild = new Set();
  for (const it of model.items) {
    if (it.parentBinId) hasChild.add(it.parentBinId);
  }
  return model.items.filter(
    (it) => it.kind === 'bin' && !hasChild.has(it.id)
  );
}

/**
 * Liste les médias hors-ligne.
 * @param {ProjectModel} model
 * @returns {Array<object>}
 */
function findOffline(model) {
  return model.items.filter((it) => it.kind === 'clip' && it.isOffline === true);
}

function normalizePath(p) {
  if (!p) return null;
  // Comparaison insensible à la casse + séparateurs uniformisés (Windows).
  return String(p).replace(/\\/g, '/').trim().toLowerCase();
}

module.exports = {
  getUsedProjectItemIds,
  findOrphans,
  findDuplicatesByPath,
  findEmptyBins,
  findOffline,
  normalizePath,
};
