/*
 * Extraction résolution/fps — logique PURE (le risque identifié au PLAN.md).
 *
 * L'API UXP n'expose pas width/height directement. On les récupère côté
 * adaptateur via `ClipProjectItem.getProjectColumnsMetadata()` (JSON de colonnes
 * du chutier), puis on PARSE ici la chaîne — partie pure donc testable.
 *
 * Colonnes utiles selon Premiere :
 *   "Video Info"        -> "1920 x 1080 (1,0)"   (taille + parfois PAR)
 *   "Frame Rate" / "Image par seconde" -> "25,00 fps"
 */

'use strict';

/**
 * Parse une chaîne "Video Info" en { width, height }.
 * Tolère "1920 x 1080", "1920x1080", "1920 X 1080 (1,0)", etc.
 * @returns {{width:number,height:number}|null}
 */
function parseVideoInfo(value) {
  if (!value) return null;
  const m = String(value).match(/(\d{2,5})\s*[x×X]\s*(\d{2,5})/);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * Parse un fps depuis une chaîne ("25", "25,00 fps", "29.97").
 * Gère la virgule décimale (locales FR).
 * @returns {number|null}
 */
function parseFps(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const m = String(value).replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/**
 * Cherche une colonne par une liste de noms candidats (FR/EN), insensible casse.
 * `columns` = tableau d'objets { ColumnName, ColumnValue, ... } (cf. API).
 * @returns {string|null} la valeur trouvée
 */
function findColumn(columns, candidates) {
  if (!Array.isArray(columns)) return null;
  const wanted = candidates.map((c) => c.toLowerCase());
  for (const col of columns) {
    const name = (col && col.ColumnName ? col.ColumnName : '').toLowerCase();
    if (wanted.includes(name)) return col.ColumnValue;
  }
  return null;
}

/**
 * À partir du JSON de colonnes, retourne { width, height, fps } (champs null si absents).
 * @param {Array} columns
 */
function extractResolutionFps(columns) {
  const videoInfo = findColumn(columns, ['Video Info', 'Infos vidéo', 'Infos video']);
  const fpsRaw = findColumn(columns, [
    'Frame Rate', 'Media Frame Rate', 'Images par seconde', 'Fréquence d’image',
  ]);
  const size = parseVideoInfo(videoInfo) || { width: null, height: null };
  return { width: size.width, height: size.height, fps: parseFps(fpsRaw) };
}

module.exports = { parseVideoInfo, parseFps, findColumn, extractResolutionFps };
