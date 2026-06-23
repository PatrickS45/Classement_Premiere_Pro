/*
 * Config par défaut (miroir de config.default.json, CDC §5).
 * Étape 6 : édition + persistance via UXP `fs`. Pour l'instant valeurs par défaut.
 */
'use strict';

module.exports = {
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
