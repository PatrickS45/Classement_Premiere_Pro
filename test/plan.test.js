'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { planCleanup, planArrange } = require('../src/core/plan');

function model({ items = [], sequenceClips = {} }) {
  return { items, sequenceClips: new Map(Object.entries(sequenceClips)) };
}

test('planCleanup : orphelins + bins vides, jamais de séquence', () => {
  const m = model({
    items: [
      { id: 'seq', kind: 'sequence', name: 'S' },
      { id: 'used', kind: 'clip', name: 'used', mediaPath: 'a' },
      { id: 'orph', kind: 'clip', name: 'orph', mediaPath: 'b' },
      { id: 'binVide', kind: 'bin', name: 'Vide' },
    ],
    sequenceClips: { seq: ['used'] },
  });
  const { removals } = planCleanup(m, {
    retirer_orphelins: true,
    retirer_bins_vides: true,
    gerer_doublons: 'non',
  });
  const ids = removals.map((r) => r.id).sort();
  assert.deepEqual(ids, ['binVide', 'orph']);
  assert.ok(!ids.includes('seq'), 'une séquence ne doit jamais être planifiée pour retrait');
});

test('planCleanup : doublons — ne retire jamais une occurrence utilisée', () => {
  const m = model({
    items: [
      { id: 'seq', kind: 'sequence', name: 'S' },
      { id: 'dupUsed', kind: 'clip', name: 'a (1)', mediaPath: 'C:/a.mp4' },
      { id: 'dupUnused', kind: 'clip', name: 'a (2)', mediaPath: 'C:/a.mp4' },
    ],
    sequenceClips: { seq: ['dupUsed'] },
  });
  const { removals } = planCleanup(m, { gerer_doublons: 'garder_un' });
  // L'occurrence utilisée est gardée ; seule l'inutilisée est retirée.
  assert.deepEqual(removals.map((r) => r.id), ['dupUnused']);
});

test('planCleanup : doublons tous inutilisés — en garde un', () => {
  const m = model({
    items: [
      { id: 'd1', kind: 'clip', name: 'a1', mediaPath: 'C:/a.mp4' },
      { id: 'd2', kind: 'clip', name: 'a2', mediaPath: 'C:/a.mp4' },
      { id: 'd3', kind: 'clip', name: 'a3', mediaPath: 'C:/a.mp4' },
    ],
  });
  const { removals } = planCleanup(m, { gerer_doublons: 'garder_un' });
  assert.equal(removals.length, 2, 'garde une occurrence sur trois');
});

test('planArrange : bins parents créés avant enfants', () => {
  const clips = [
    { id: '1', name: 'interview_001', type: 'video', width: 1920, height: 1080, fps: 25 },
  ];
  const cfg = {
    ordre_criteres: ['type', 'resolution_fps', 'prefixe'],
    criteres_actifs: { type: true, resolution_fps: true, prefixe: true },
    prefixe: { separateur: '_', longueur_min: 2 },
  };
  const plan = planArrange(clips, cfg);
  // Parents d'abord : Vidéo, puis Vidéo/1920x1080_25, puis .../interview.
  assert.deepEqual(plan.binsToCreate[0], ['Vidéo']);
  assert.deepEqual(plan.binsToCreate[1], ['Vidéo', '1920x1080_25']);
  assert.deepEqual(plan.binsToCreate[2], ['Vidéo', '1920x1080_25', 'interview']);
  assert.equal(plan.moves[0].clipId, '1');
});
