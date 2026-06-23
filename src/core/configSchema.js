/*
 * Schéma de config — logique PURE (CDC §5). Fusion, validation, normalisation
 * et réordonnancement des critères. Aucun accès disque ici : la persistance
 * `fs` UXP vit dans src/api/configStore.js. Donc tout est testable sous Node.
 */

'use strict';

const KNOWN_CRITERIA = ['type', 'resolution_fps', 'prefixe'];

function defaults() {
  return {
    rangement: {
      ordre_criteres: ['type', 'resolution_fps', 'prefixe'],
      criteres_actifs: { type: true, resolution_fps: true, prefixe: true },
      prefixe: { separateur: '_', longueur_min: 2 },
      bin_non_classe: 'Non classé',
      ranger_sequences: false,
    },
    nettoyage: {
      retirer_orphelins: true,
      retirer_bins_vides: true,
      gerer_doublons: 'garder_un',
      jamais_supprimer_disque: true,
    },
    compatibilite: { version_premiere_min: '25.0' },
  };
}

/**
 * Fusionne une config partielle (ex. fichier utilisateur) sur les défauts, puis
 * normalise. Tolère un objet incomplet ou corrompu sans planter.
 */
function mergeConfig(partial) {
  const base = defaults();
  const p = partial && typeof partial === 'object' ? partial : {};
  const out = {
    rangement: { ...base.rangement, ...(p.rangement || {}) },
    nettoyage: { ...base.nettoyage, ...(p.nettoyage || {}) },
    compatibilite: { ...base.compatibilite, ...(p.compatibilite || {}) },
  };
  out.rangement.criteres_actifs = {
    ...base.rangement.criteres_actifs,
    ...((p.rangement && p.rangement.criteres_actifs) || {}),
  };
  out.rangement.prefixe = {
    ...base.rangement.prefixe,
    ...((p.rangement && p.rangement.prefixe) || {}),
  };
  return normalizeConfig(out);
}

/**
 * Garantit un état cohérent : `ordre_criteres` est une permutation exacte des
 * critères connus (doublons et inconnus retirés, manquants ajoutés à la fin) ;
 * `criteres_actifs` a un booléen par critère connu.
 */
function normalizeConfig(cfg) {
  const r = cfg.rangement;
  const seen = new Set();
  const order = [];
  for (const c of Array.isArray(r.ordre_criteres) ? r.ordre_criteres : []) {
    if (KNOWN_CRITERIA.includes(c) && !seen.has(c)) {
      seen.add(c);
      order.push(c);
    }
  }
  for (const c of KNOWN_CRITERIA) if (!seen.has(c)) order.push(c);
  r.ordre_criteres = order;

  const actifs = {};
  for (const c of KNOWN_CRITERIA) {
    actifs[c] = r.criteres_actifs && c in r.criteres_actifs ? !!r.criteres_actifs[c] : true;
  }
  r.criteres_actifs = actifs;
  return cfg;
}

/**
 * Déplace un critère dans l'ordre. `dir` = -1 (monter) ou +1 (descendre).
 * Retourne un NOUVEAU tableau (immuable) ; no-op si hors limites.
 */
function moveCriterion(order, index, dir) {
  const next = order.slice();
  const target = index + dir;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

module.exports = { KNOWN_CRITERIA, defaults, mergeConfig, normalizeConfig, moveCriterion };
