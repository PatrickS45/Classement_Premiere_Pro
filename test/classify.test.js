'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildBinTree, flattenMoves, UNCLASSIFIED } = require('../src/core/classify');

const clips = [
  { id: '1', name: 'interview_001', type: 'video', width: 1920, height: 1080, fps: 25 },
  { id: '2', name: 'interview_002', type: 'video', width: 1920, height: 1080, fps: 25 },
  { id: '3', name: 'broll_010', type: 'video', width: 3840, height: 2160, fps: 30 },
  { id: '4', name: 'ambiance.wav', type: 'audio' },
  { id: '5', name: 'logo.png', type: 'image', width: 500, height: 500 },
];

const baseConfig = {
  ordre_criteres: ['type', 'resolution_fps', 'prefixe'],
  criteres_actifs: { type: true, resolution_fps: true, prefixe: true },
  prefixe: { separateur: '_', longueur_min: 2 },
};

function paths(tree) {
  return flattenMoves(tree).map((m) => m.path.join('/') + ' :: ' + m.clip.id).sort();
}

test('arbo conforme à l’ordre [type → résolution → préfixe]', () => {
  const tree = buildBinTree(clips, baseConfig);
  const p = paths(tree);
  assert.ok(p.includes('Vidéo/1920x1080_25/interview :: 1'));
  assert.ok(p.includes('Vidéo/1920x1080_25/interview :: 2'));
  assert.ok(p.includes('Vidéo/3840x2160_30/broll :: 3'));
  assert.ok(p.includes('Audio :: 4')); // audio : pas de résolution ni préfixe
});

test('réordonner les critères change toute l’arbo (préfixe d’abord)', () => {
  const cfg = { ...baseConfig, ordre_criteres: ['prefixe', 'type', 'resolution_fps'] };
  const tree = buildBinTree(clips, cfg);
  const p = paths(tree);
  assert.ok(p.includes('interview/Vidéo/1920x1080_25 :: 1'));
  assert.ok(p.includes('broll/Vidéo/3840x2160_30 :: 3'));
});

test('désactiver un critère le retire de la hiérarchie', () => {
  const cfg = {
    ...baseConfig,
    criteres_actifs: { type: true, resolution_fps: false, prefixe: false },
  };
  const tree = buildBinTree(clips, cfg);
  const p = paths(tree);
  assert.ok(p.includes('Vidéo :: 1'));
  assert.ok(p.includes('Vidéo :: 3'));
  assert.ok(p.includes('Audio :: 4'));
});

test('clip sans critère exploitable tombe dans "Non classé"', () => {
  // audio sans résolution ni préfixe, mais on n'active QUE résolution.
  const cfg = {
    ...baseConfig,
    ordre_criteres: ['resolution_fps'],
    criteres_actifs: { type: false, resolution_fps: true, prefixe: false },
  };
  const tree = buildBinTree([{ id: '9', name: 'son.wav', type: 'audio' }], cfg);
  const p = flattenMoves(tree).map((m) => m.path.join('/'));
  assert.deepEqual(p, [UNCLASSIFIED]);
});

test('aperçu stable : "Non classé" trié en dernier', () => {
  const cfg = {
    ordre_criteres: ['prefixe'],
    criteres_actifs: { prefixe: true },
    prefixe: { separateur: '_', longueur_min: 2 },
  };
  const data = [
    { id: 'a', name: 'zoulou_1', type: 'video' },
    { id: 'b', name: 'alpha_1', type: 'video' },
    { id: 'c', name: 'sansprefixe', type: 'video' },
  ];
  const tree = buildBinTree(data, cfg);
  assert.deepEqual(tree.children.map((c) => c.name), ['alpha', 'zoulou', UNCLASSIFIED]);
});
