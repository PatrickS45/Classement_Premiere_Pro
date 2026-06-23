/*
 * Câblage UI du panneau (squelette, CDC §8 étape 1).
 *
 * Objectif de l'étape 1 : panneau qui charge dans Premiere, accès
 * `require("premierepro")` vérifié par un appel trivial (Audit branché sur le
 * vrai projet via l'adaptateur). Modules Nettoyage/Rangement : UI présente,
 * actions désactivées (garde-fou : aperçu obligatoire avant toute action).
 */

'use strict';

const audit = require('./core/usedItems');
const report = (msg) => {
  document.getElementById('report').textContent = msg;
};

// --- Onglets -----------------------------------------------------------------
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.panel').forEach((p) =>
      p.classList.toggle('active', p.dataset.panel === name)
    );
  });
});

// --- Audit (lecture seule) ---------------------------------------------------
document.getElementById('btn-scan').addEventListener('click', async () => {
  const out = document.getElementById('audit-results');
  out.textContent = 'Scan en cours…';
  try {
    const { buildProjectModel } = require('./api/pproAdapter');
    const model = await buildProjectModel(); // appel trivial premierepro -> vérifie l'accès DOM
    const orphans = audit.findOrphans(model);
    const dups = audit.findDuplicatesByPath(model);
    const offline = audit.findOffline(model);
    const emptyBins = audit.findEmptyBins(model);

    out.textContent = [
      `Items au total      : ${model.items.length}`,
      `Séquences           : ${model.sequenceClips.size}`,
      `Clips orphelins     : ${orphans.length}`,
      `Groupes de doublons : ${dups.length}`,
      `Médias hors-ligne   : ${offline.length}`,
      `Bins vides          : ${emptyBins.length}`,
      '',
      ...orphans.slice(0, 50).map((o) => `  orphelin: ${o.name}`),
    ].join('\n');
    report('Audit terminé — rien n’a été modifié.');
  } catch (err) {
    out.textContent = `Erreur : ${err.message}`;
    report('Échec du scan.');
  }
});

// --- Rangement : aperçu de l'ordre des critères (config) ---------------------
(function initCriteriaPreview() {
  const labels = { type: 'Type', resolution_fps: 'Résolution / fps', prefixe: 'Préfixe' };
  const order = ['type', 'resolution_fps', 'prefixe'];
  const ol = document.getElementById('criteria-order');
  if (ol) order.forEach((c) => {
    const li = document.createElement('li');
    li.textContent = labels[c] || c;
    ol.appendChild(li);
  });
})();
