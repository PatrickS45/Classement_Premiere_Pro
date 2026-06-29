/*
 * Comparaison de versions — logique PURE (CDC §2/§7).
 *
 * Sert à vérifier que la version de Premiere atteint la version minimale
 * déclarée (config.compatibilite.version_premiere_min) avant d'appeler des API
 * récentes. Aucune dépendance : testable sous Node.
 */

'use strict';

/**
 * Découpe une version en tableau de nombres. Tolère "25", "25.6", "26.3.0",
 * "26.3.0 (Build 123)". Les segments non numériques sont ignorés.
 * @returns {number[]}
 */
function parseVersion(v) {
  if (v == null) return [];
  const head = String(v).trim().split(/[^\d.]/)[0]; // coupe au 1er non [chiffre|point]
  if (!head) return [];
  return head.split('.').map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
}

/**
 * Compare deux versions. Retourne -1, 0 ou 1 (a<b, a==b, a>b).
 * Les segments absents valent 0 ("25" == "25.0.0").
 */
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** true si `version` >= `min`. Une version illisible est considérée NON conforme. */
function isAtLeast(version, min) {
  if (parseVersion(version).length === 0) return false;
  return compareVersions(version, min) >= 0;
}

module.exports = { parseVersion, compareVersions, isAtLeast };
