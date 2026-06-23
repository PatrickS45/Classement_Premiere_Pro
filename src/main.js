/*
 * Câblage UI du panneau (CDC §7/§8).
 *
 * Garde-fous : aucune action sans aperçu (boutons Nettoyer/Ranger désactivés
 * tant qu'un aperçu n'a pas été calculé), retrait projet seulement, compte-rendu
 * après chaque action. Config éditable depuis l'UI et persistée (étape 6).
 */

'use strict';

const audit = require('./core/usedItems');
const { planCleanup, planArrange, renderTree } = require('./core/plan');
const { defaults, moveCriterion } = require('./core/configSchema');

const $ = (id) => document.getElementById(id);
const report = (msg) => { $('report').textContent = msg; };

const state = { model: null, cleanupPlan: null, arrangePlan: null, config: defaults() };
const CRITERIA_LABELS = { type: 'Type', resolution_fps: 'Résolution / fps', prefixe: 'Préfixe' };

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
      '', '— Orphelins —', ...orphans.slice(0, 100).map((o) => `  ${o.name}`),
      '— Hors-ligne —', ...offline.slice(0, 100).map((o) => `  ${o.name}`),
      '— Bins vides —', ...emptyBins.slice(0, 100).map((o) => `  ${o.name}`),
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
    state.cleanupPlan = planCleanup(model, {
      retirer_orphelins: $('clean-orphans').checked,
      retirer_bins_vides: $('clean-bins').checked,
      gerer_doublons: $('clean-dups').checked ? 'garder_un' : 'non',
    });
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
  if (window.confirm && !window.confirm(`Retirer ${n} élément(s) DU PROJET (jamais du disque) ?`)) return;
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

// --- Rangement : éditeur d'ordre des critères --------------------------------
function renderCriteria() {
  const ol = $('criteria-order');
  ol.innerHTML = '';
  const order = state.config.rangement.ordre_criteres;
  const actifs = state.config.rangement.criteres_actifs;
  order.forEach((crit, i) => {
    const li = document.createElement('li');

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!actifs[crit];
    chk.addEventListener('change', () => { actifs[crit] = chk.checked; });

    const label = document.createElement('span');
    label.textContent = ' ' + (CRITERIA_LABELS[crit] || crit) + ' ';

    const up = document.createElement('button');
    up.textContent = '↑';
    up.disabled = i === 0;
    up.addEventListener('click', () => {
      state.config.rangement.ordre_criteres = moveCriterion(order, i, -1);
      renderCriteria();
    });

    const down = document.createElement('button');
    down.textContent = '↓';
    down.disabled = i === order.length - 1;
    down.addEventListener('click', () => {
      state.config.rangement.ordre_criteres = moveCriterion(order, i, 1);
      renderCriteria();
    });

    li.append(chk, label, up, down);
    ol.appendChild(li);
  });
}

$('btn-arrange-preview').addEventListener('click', async () => {
  try {
    const model = state.model || (await ensureModel());
    const { enrichClipsForArrange } = require('./api/pproAdapter');
    const clips = await enrichClipsForArrange(model);
    state.arrangePlan = planArrange(clips, state.config.rangement);
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

// --- Config : charger / enregistrer / réinitialiser --------------------------
function applyConfigToUI() {
  $('clean-orphans').checked = state.config.nettoyage.retirer_orphelins;
  $('clean-bins').checked = state.config.nettoyage.retirer_bins_vides;
  $('clean-dups').checked = state.config.nettoyage.gerer_doublons === 'garder_un';
  renderCriteria();
}

function readUIIntoConfig() {
  state.config.nettoyage.retirer_orphelins = $('clean-orphans').checked;
  state.config.nettoyage.retirer_bins_vides = $('clean-bins').checked;
  state.config.nettoyage.gerer_doublons = $('clean-dups').checked ? 'garder_un' : 'non';
  // ordre_criteres et criteres_actifs sont déjà tenus à jour dans state.config.
}

$('btn-config-save').addEventListener('click', async () => {
  try {
    readUIIntoConfig();
    const { saveConfig } = require('./api/configStore');
    const ok = await saveConfig(state.config);
    report(ok ? 'Configuration enregistrée.' : 'Échec de l’enregistrement.');
  } catch (err) {
    report(`Erreur config : ${err.message}`);
  }
});

$('btn-config-reset').addEventListener('click', () => {
  state.config = defaults();
  applyConfigToUI();
  report('Configuration réinitialisée (non encore enregistrée).');
});

// --- Démarrage ---------------------------------------------------------------
(async function init() {
  try {
    const { loadConfig } = require('./api/configStore');
    state.config = await loadConfig();
  } catch {
    state.config = defaults();
  }
  applyConfigToUI();
})();
