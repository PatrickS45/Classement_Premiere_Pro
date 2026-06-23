/*
 * Module C (CDC §4) — moteur de rangement, logique PURE et testable.
 *
 * Produit une arborescence de bins à partir d'une liste de clips et d'une
 * config hiérarchique (ordre + activation des critères). C'est ici qu'on prouve
 * que réordonner les critères change toute l'arborescence (risque CDC §4), sans
 * toucher à Premiere. L'adaptateur traduira ensuite l'arbo en
 * createBinAction / createMoveItemAction dans une transaction.
 *
 * --- Clip attendu ------------------------------------------------------------
 * {
 *   id, name,
 *   type: 'video' | 'audio' | 'image' | 'graphic',
 *   width?: number, height?: number, fps?: number   // peuvent manquer
 * }
 *
 * --- Sortie : nœud d'arbre ---------------------------------------------------
 * { name: string, children: TreeNode[], clips: Clip[] }
 * (un nœud feuille porte les clips ; un nœud interne porte des children)
 */

'use strict';

const UNCLASSIFIED = 'Non classé';

const CRITERIA = {
  // Regroupe par grande famille de média.
  type(clip) {
    switch (clip.type) {
      case 'video': return 'Vidéo';
      case 'audio': return 'Audio';
      case 'image': return 'Images';
      case 'graphic': return 'Graphiques';
      default: return null;
    }
  },
  // ex. "1920x1080_25". Null si résolution/fps indisponibles (cf. risque CDC).
  resolution_fps(clip) {
    if (!clip.width || !clip.height) return null;
    const fps = clip.fps ? `_${formatFps(clip.fps)}` : '';
    return `${clip.width}x${clip.height}${fps}`;
  },
  // Préfixe de nom avant le séparateur. ex. "interview_001" -> "interview".
  prefixe(clip, opts) {
    const sep = (opts && opts.separateur) || '_';
    const minLen = (opts && opts.longueur_min) || 1;
    const name = clip.name || '';
    const idx = name.indexOf(sep);
    if (idx < minLen) return null;
    return name.slice(0, idx);
  },
};

function formatFps(fps) {
  // 25 -> "25", 29.97 -> "29.97"
  return Number.isInteger(fps) ? String(fps) : String(Math.round(fps * 100) / 100);
}

/**
 * Construit l'arborescence de bins.
 *
 * @param {Clip[]} clips
 * @param {object} rangement  bloc "rangement" de la config (CDC §5)
 * @returns {TreeNode} racine (name: '', children: [...])
 */
function buildBinTree(clips, rangement) {
  const order = (rangement.ordre_criteres || []).filter(
    (c) => rangement.criteres_actifs && rangement.criteres_actifs[c]
  );
  const opts = { prefixe: rangement.prefixe || {} };

  const root = { name: '', children: [], clips: [] };
  for (const clip of clips) {
    placeClip(root, clip, order, opts);
  }
  sortTree(root);
  return root;
}

function placeClip(root, clip, order, opts) {
  let node = root;
  let matchedAny = false;
  for (const criterion of order) {
    const fn = CRITERIA[criterion];
    if (!fn) continue; // critère inconnu
    const bucket = fn(clip, opts[criterion]);
    // Critère non applicable à CE clip (ex. audio sans résolution) : on saute
    // ce niveau, conforme à l'arbo du CDC §4 où "Audio/" est sous la racine.
    if (bucket == null) continue;
    node = descend(node, bucket);
    matchedAny = true;
  }
  // Un clip qui ne matche AUCUN critère retombe dans "Non classé" (CDC §10).
  if (!matchedAny) node = descend(root, UNCLASSIFIED);
  node.clips.push(clip);
}

function descend(node, name) {
  let child = node.children.find((c) => c.name === name);
  if (!child) {
    child = { name, children: [], clips: [] };
    node.children.push(child);
  }
  return child;
}

function sortTree(node) {
  // "Non classé" toujours en dernier, le reste alphabétique : aperçu stable.
  node.children.sort((a, b) => {
    if (a.name === UNCLASSIFIED) return 1;
    if (b.name === UNCLASSIFIED) return -1;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) sortTree(c);
}

/**
 * Aplatit l'arbre en chemins de bins + clips à déplacer. Sert l'aperçu textuel
 * et la génération des actions (createBinAction par chemin, puis move).
 *
 * @returns {Array<{ path: string[], clip: object }>}
 */
function flattenMoves(root) {
  const moves = [];
  walk(root, []);
  return moves;

  function walk(node, path) {
    const here = node.name ? [...path, node.name] : path;
    for (const clip of node.clips) moves.push({ path: here, clip });
    for (const child of node.children) walk(child, here);
  }
}

module.exports = { buildBinTree, flattenMoves, CRITERIA, UNCLASSIFIED };
