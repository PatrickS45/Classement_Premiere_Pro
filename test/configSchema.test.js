'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { defaults, mergeConfig, normalizeConfig, moveCriterion } = require('../src/core/configSchema');

test('mergeConfig : objet vide -> défauts complets', () => {
  const c = mergeConfig({});
  assert.deepEqual(c.rangement.ordre_criteres, ['type', 'resolution_fps', 'prefixe']);
  assert.equal(c.nettoyage.jamais_supprimer_disque, true);
});

test('mergeConfig : override partiel conservé', () => {
  const c = mergeConfig({ nettoyage: { gerer_doublons: 'demander' } });
  assert.equal(c.nettoyage.gerer_doublons, 'demander');
  assert.equal(c.nettoyage.retirer_orphelins, true); // défaut préservé
});

test('normalizeConfig : ordre nettoyé (doublons/inconnus retirés, manquants ajoutés)', () => {
  const c = normalizeConfig({
    rangement: { ordre_criteres: ['prefixe', 'inconnu', 'prefixe'], criteres_actifs: {} },
    nettoyage: {}, compatibilite: {},
  });
  assert.deepEqual(c.rangement.ordre_criteres, ['prefixe', 'type', 'resolution_fps']);
});

test('normalizeConfig : criteres_actifs complété par critère connu', () => {
  const c = normalizeConfig({
    rangement: { ordre_criteres: [], criteres_actifs: { type: false } },
    nettoyage: {}, compatibilite: {},
  });
  assert.deepEqual(c.rangement.criteres_actifs, { type: false, resolution_fps: true, prefixe: true });
});

test('moveCriterion : monter / descendre / bornes', () => {
  const order = ['type', 'resolution_fps', 'prefixe'];
  assert.deepEqual(moveCriterion(order, 2, -1), ['type', 'prefixe', 'resolution_fps']);
  assert.deepEqual(moveCriterion(order, 0, -1), order); // déjà en haut : no-op
  assert.deepEqual(moveCriterion(order, 2, 1), order); // déjà en bas : no-op
  assert.deepEqual(order, ['type', 'resolution_fps', 'prefixe'], 'entrée non mutée');
});
