/*
 * Persistance de la config via UXP `fs` (CDC §5 : config dans un fichier JSON).
 * Couche FINE non testable hors UXP. Toute la logique (fusion/validation) est
 * dans src/core/configSchema.js. On stocke dans le dossier data du plugin :
 * pas de permission spéciale, isolé par plugin.
 */

'use strict';

const { mergeConfig, defaults } = require('../core/configSchema');

const FILE = 'config.json';

async function dataFolder() {
  const { storage } = require('uxp');
  return storage.localFileSystem.getDataFolder();
}

/** Charge la config utilisateur, fusionnée sur les défauts. Tolère l'absence de fichier. */
async function loadConfig() {
  try {
    const folder = await dataFolder();
    const entry = await folder.getEntry(FILE);
    const text = await entry.read();
    return mergeConfig(JSON.parse(text));
  } catch {
    // Fichier absent ou illisible : on repart des défauts.
    return defaults();
  }
}

/** Écrit la config (normalisée) sur disque. Retourne true si succès. */
async function saveConfig(config) {
  try {
    const folder = await dataFolder();
    let entry;
    try {
      entry = await folder.getEntry(FILE);
    } catch {
      entry = await folder.createFile(FILE, { overwrite: true });
    }
    await entry.write(JSON.stringify(mergeConfig(config), null, 2));
    return true;
  } catch {
    return false;
  }
}

module.exports = { loadConfig, saveConfig };
