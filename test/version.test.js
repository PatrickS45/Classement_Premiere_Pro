'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseVersion, compareVersions, isAtLeast } = require('../src/core/version');

test('parseVersion : formats variés', () => {
  assert.deepEqual(parseVersion('25'), [25]);
  assert.deepEqual(parseVersion('25.6'), [25, 6]);
  assert.deepEqual(parseVersion('26.3.0'), [26, 3, 0]);
  assert.deepEqual(parseVersion('26.3.0 (Build 123)'), [26, 3, 0]);
  assert.deepEqual(parseVersion(''), []);
  assert.deepEqual(parseVersion(null), []);
});

test('compareVersions : ordre et segments manquants', () => {
  assert.equal(compareVersions('25.0', '25'), 0);          // 25 == 25.0.0
  assert.equal(compareVersions('25.6', '25.10'), -1);      // comparaison numérique, pas lexicale
  assert.equal(compareVersions('26.0', '25.9'), 1);
  assert.equal(compareVersions('24.6', '25.0'), -1);
});

test('isAtLeast : conforme / non conforme / illisible', () => {
  assert.equal(isAtLeast('26.3.0', '25.0'), true);
  assert.equal(isAtLeast('25.0', '25.0'), true);
  assert.equal(isAtLeast('24.6', '25.0'), false);
  assert.equal(isAtLeast('', '25.0'), false);  // version inconnue => prudence
});
