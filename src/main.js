/*
 * Câblage UI du panneau (CDC §7/§8).
 *
 * Garde-fous appliqués : aucune action sans aperçu (les boutons Nettoyer/Ranger
 * restent désactivés tant qu'un aperçu n'a pas été calculé), retrait projet
 * seulement, compte-rendu après chaque action.
 */

'use strict';

const audit = require('./core/usedItems');
const { planCleanup, planArrange, renderTree } = require('./core/plan');
const config = require('./config');

const $ = (id) => document.getElementById(id);
const report = (msg) => { $('report').textContent = msg; };

const state = { model: null, cleanupPlan: null, arrangePlan: null };

// --- Onglets -----------------------------------------------------------------
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.panel').forEach((p) =>
      p.classList.toggle('active', p.dataset.panel === name));
  });
});

async function ensureModel() {
  const { buildProjectModel } = require('./api/pproAdapter');
  state.model = await buildProjectModel();
  return state.model;
}

// --- Audit (lecture seule) ---------------------------------------------------
$('btn-scan').addEventListener('click', async () => {
  const out = $('audit-results');
  out.textContent = 'Scan en cours…';
  try {
    const model = await ensureModel();
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
      '— Orphelins —',
      ...orphans.slice(0, 100).map((o) => `  ${o.name}`),
      '— Hors-ligne —',
      ...offline.slice(0, 100).map((o) => `  ${o.name}`),
      '— Bins vides —',
      ...emptyBins.slice(0, 100).map((o) => `  ${o.name}`),
    ].join('\n');
    report('Audit terminé — rien n’a été modifié.');
  } catch (err) {
    out.textContent = `Erreur : ${err.message}`;
    report('Échec du scan.');
  }
});

// --- Nettoyage : aperçu (dry-run) puis exécution -----------------------------
$('btn-clean-preview').addEventListener('click', async () => {
  try {
    const model = state.model || (await ensureModel());
    const options = {
      retirer_orphelins: $('clean-orphans').checked,
      retirer_bins_vides: $('clean-bins').checked,
      gerer_doublons: $('clean-dups').checked ? 'garder_un' : 'non',
    };
    state.cleanupPlan = planCleanup(model, options);
    const { removals } = state.cleanupPlan;
    $('clean-preview').textContent = removals.length
      ? removals.map((r) => `  [${r.reason}] ${r.name}`).join('\n')
      : 'Rien à retirer.';
    $('btn-clean').disabled = removals.length === 0;
    $('btn-clean').textContent = `Retirer ${removals.length} élément(s) du projet`;
    report('Aperçu prêt. Rien n’a encore été modifié.');
  } catch (err) {
    report(`Erreur aperçu : ${err.message}`);
  }
});

$('btn-clean').addEventListener('click', async () => {
  if (!state.cleanupPlan) return;
  const n = state.cleanupPlan.removals.length;
  // eslint-disable-next-line no-alert
  const ok = window.confirm
    ? window.confirm(`Retirer ${n} élément(s) DU PROJET (jamais du disque) ?`)
    : true;
  if (!ok) return;
  try {
    const { executeCleanup } = require('./api/pproAdapter');
    const done = await executeCleanup(state.cleanupPlan);
    report(`Nettoyage terminé : ${done.length} élément(s) retiré(s) du projet (annulable : Ctrl+Z).`);
    state.cleanupPlan = null;
    $('btn-clean').disabled = true;
    await ensureModel();
  } catch (err) {
    report(`Erreur nettoyage : ${err.message}`);
  }
});

// --- Rangement : ordre des critères + aperçu + exécution ---------------------
(function initCriteria() {
  const labels = { type: 'Type', resolution_fps: 'Résolution / fps', prefixe: 'Préfixe' };
  const ol = $('criteria-order');
  config.rangement.ordre_criteres.forEach((c) => {
    const li = document.createElement('li');
    li.textContent = labels[c] || c;
    ol.appendChild(li);
  });
})();

$('btn-arrange-preview').addEventListener('click', async () => {
  try {
    const model = state.model || (await ensureModel());
    const { enrichClipsForArrange } = require('./api/pproAdapter');
    const clips = await enrichClipsForArrange(model);
    state.arrangePlan = planArrange(clips, config.rangement);
    $('tree-preview').textContent = renderTree(state.arrangePlan.tree).join('\n') || 'Aucun clip à ranger.';
    $('btn-arrange').disabled = state.arrangePlan.moves.length === 0;
    $('btn-arrange').textContent = `Ranger ${state.arrangePlan.moves.length} clip(s)`;
    report('Aperçu de l’arborescence prêt. Rien n’a encore été déplacé.');
  } catch (err) {
    report(`Erreur aperçu : ${err.message}`);
  }
});

$('btn-arrange').addEventListener('click', async () => {
  if (!state.arrangePlan) return;
  try {
    const { executeArrange } = require('./api/pproAdapter');
    const moved = await executeArrange(state.arrangePlan);
    report(`Rangement terminé : ${moved.length} clip(s) déplacé(s) (annulable : Ctrl+Z).`);
    state.arrangePlan = null;
    $('btn-arrange').disabled = true;
    await ensureModel();
  } catch (err) {
    report(`Erreur rangement : ${err.message}`);
  }
});
