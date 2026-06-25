/*
 * Détection de capacités à l'exécution (CDC §2/§7 : repli sur API récentes).
 * Couche fine : on inspecte le module `premierepro` chargé pour savoir quelles
 * API sont réellement présentes, AVANT de les appeler. Un plugin qui appelle
 * une API absente plante — ici on dégrade proprement.
 */

'use strict';

const { isAtLeast } = require('../core/version');

/** true si `obj` expose une méthode `name`. Sûr même si obj est null. */
function hasMethod(obj, name) {
  return !!obj && typeof obj[name] === 'function';
}

/**
 * Appelle obj[name](...args) seulement si la méthode existe ; sinon renvoie
 * `fallback`. Avale les erreurs d'API absente pour ne jamais planter le panneau.
 */
async function callMaybe(obj, name, args = [], fallback = null) {
  if (!hasMethod(obj, name)) return fallback;
  try {
    return await obj[name](...args);
  } catch {
    return fallback;
  }
}

/**
 * Lit la version de Premiere de façon défensive (l'API exacte varie).
 * @returns {string|null}
 */
async function readPremiereVersion(ppro) {
  const app = (ppro && (ppro.Application || ppro.app)) || null;
  if (!app) return null;
  if (typeof app.version === 'string') return app.version;
  const v = await callMaybe(app, 'getVersion', [], null);
  return typeof v === 'string' ? v : null;
}

/**
 * Établit un rapport de compatibilité : version, conformité au minimum, et
 * présence des classes/méthodes dont les modules dépendent.
 *
 * @param {object} ppro  module premierepro
 * @param {string} minVersion  version minimale déclarée (config)
 */
async function inspect(ppro, minVersion) {
  const version = await readPremiereVersion(ppro);
  const C = (ppro && ppro.Constants) || {};
  const has = (cls, m) => hasMethod(ppro && ppro[cls] && ppro[cls].prototype, m);

  const features = {
    project_sequences: hasMethod(ppro && ppro.Project, 'getActiveProject'),
    transactions: true, // executeTransaction, supposé présent dès 25.0
    remove_item: has('FolderItem', 'createRemoveItemAction'),
    create_bin: has('FolderItem', 'createBinAction'),
    move_item: has('FolderItem', 'createMoveItemAction'),
    columns_metadata: has('ClipProjectItem', 'getProjectColumnsMetadata'),
    content_type: has('ClipProjectItem', 'getContentType') && !!C.ContentType,
    multicam_flags: has('ClipProjectItem', 'isMulticamClip'),
  };

  return {
    version,
    versionKnown: !!version,
    meetsMinimum: version ? isAtLeast(version, minVersion) : false,
    minVersion,
    features,
    // Modules utilisables compte tenu des capacités détectées.
    canAudit: features.project_sequences,
    canClean: features.remove_item,
    canArrange: features.create_bin && features.move_item,
  };
}

module.exports = { hasMethod, callMaybe, readPremiereVersion, inspect };
