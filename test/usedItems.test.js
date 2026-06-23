'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  getUsedProjectItemIds,
  findOrphans,
  findDuplicatesByPath,
  findEmptyBins,
  findOffline,
} = require('../src/core/usedItems');

// Petit fabricant de modèle pour lisibilité des tests.
function model({ items = [], sequenceClips = {} }) {
  return { items, sequenceClips: new Map(Object.entries(sequenceClips)) };
}

test('clip référencé = utilisé ; clip non référencé = orphelin', () => {
  const m = model({
    items: [
      { id: 'seqA', name: 'Séquence A', kind: 'sequence' },
      { id: 'clipA', name: 'a.mp4', kind: 'clip', mediaPath: 'C:/a.mp4' },
      { id: 'clipB', name: 'b.mp4', kind: 'clip', mediaPath: 'C:/b.mp4' },
    ],
    sequenceClips: { seqA: ['clipA'] },
  });
  const used = getUsedProjectItemIds(m);
  assert.ok(used.has('clipA'));
  assert.ok(!used.has('clipB'));
  assert.deepEqual(findOrphans(m).map((i) => i.id), ['clipB']);
});

test('séquence imbriquée : clip uniquement dans A, A posée dans B → utilisé', () => {
  // C'est LE cas où un faux positif détruit la confiance (CDC §6).
  const m = model({
    items: [
      { id: 'seqA', name: 'A', kind: 'sequence' },
      { id: 'seqB', name: 'B', kind: 'sequence' },
      { id: 'clipA', name: 'a.mp4', kind: 'clip', mediaPath: 'C:/a.mp4' },
    ],
    sequenceClips: {
      seqA: ['clipA'],   // clip seulement ici
      seqB: ['seqA'],    // B contient la séquence A
    },
  });
  const used = getUsedProjectItemIds(m);
  assert.ok(used.has('clipA'), 'le clip imbriqué doit être utilisé');
  assert.ok(used.has('seqA'), 'la séquence imbriquée est référencée');
  assert.equal(findOrphans(m).length, 0, 'aucun orphelin');
});

test('récursion profonde sur plusieurs niveaux', () => {
  const m = model({
    items: [{ id: 'clip', name: 'x', kind: 'clip', mediaPath: 'x' }],
    sequenceClips: {
      s1: ['s2'],
      s2: ['s3'],
      s3: ['clip'],
    },
  });
  assert.ok(getUsedProjectItemIds(m).has('clip'));
});

test('cycle entre séquences : pas de boucle infinie', () => {
  const m = model({
    items: [{ id: 'clip', name: 'x', kind: 'clip', mediaPath: 'x' }],
    sequenceClips: {
      s1: ['s2', 'clip'],
      s2: ['s1'], // cycle s1 <-> s2
    },
  });
  const used = getUsedProjectItemIds(m); // ne doit pas planter
  assert.ok(used.has('clip'));
  assert.ok(used.has('s1') && used.has('s2'));
});

test('une séquence non référencée n’est jamais orpheline (garde-fou §6)', () => {
  const m = model({
    items: [
      { id: 'seqLibre', name: 'WIP', kind: 'sequence' },
      { id: 'clip', name: 'x', kind: 'clip', mediaPath: 'x' },
    ],
    sequenceClips: { seqLibre: ['clip'] }, // seqLibre dans aucune autre séquence
  });
  const orphans = findOrphans(m).map((i) => i.id);
  assert.ok(!orphans.includes('seqLibre'), 'une séquence ne doit jamais être orpheline');
});

test('clips multicam / merged référencés sont utilisés', () => {
  const m = model({
    items: [
      { id: 's', kind: 'sequence', name: 's' },
      { id: 'mc', kind: 'clip', name: 'multi', mediaPath: 'mc', isMulticam: true },
      { id: 'mg', kind: 'clip', name: 'merged', mediaPath: 'mg', isMerged: true },
    ],
    sequenceClips: { s: ['mc', 'mg'] },
  });
  const used = getUsedProjectItemIds(m);
  assert.ok(used.has('mc') && used.has('mg'));
  assert.equal(findOrphans(m).length, 0);
});

test('doublons : même chemin média, casse/séparateurs ignorés', () => {
  const m = model({
    items: [
      { id: 'c1', kind: 'clip', name: 'a', mediaPath: 'C:\\Media\\a.mp4' },
      { id: 'c2', kind: 'clip', name: 'a copie', mediaPath: 'c:/media/a.mp4' },
      { id: 'c3', kind: 'clip', name: 'b', mediaPath: 'C:/Media/b.mp4' },
      { id: 'c4', kind: 'clip', name: 'offline', mediaPath: null },
    ],
  });
  const dups = findDuplicatesByPath(m);
  assert.equal(dups.length, 1);
  assert.deepEqual(dups[0].items.map((i) => i.id).sort(), ['c1', 'c2']);
});

test('bins vides détectés ; bin avec enfant ignoré', () => {
  const m = model({
    items: [
      { id: 'binVide', kind: 'bin', name: 'Vide' },
      { id: 'binPlein', kind: 'bin', name: 'Plein' },
      { id: 'clip', kind: 'clip', name: 'x', mediaPath: 'x', parentBinId: 'binPlein' },
    ],
  });
  assert.deepEqual(findEmptyBins(m).map((i) => i.id), ['binVide']);
});

test('médias hors-ligne listés', () => {
  const m = model({
    items: [
      { id: 'on', kind: 'clip', name: 'on', mediaPath: 'a', isOffline: false },
      { id: 'off', kind: 'clip', name: 'off', mediaPath: 'b', isOffline: true },
    ],
  });
  assert.deepEqual(findOffline(m).map((i) => i.id), ['off']);
});
