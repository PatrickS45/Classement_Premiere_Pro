'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseVideoInfo, parseFps, extractResolutionFps } = require('../src/core/resolution');

test('parseVideoInfo : formats variés', () => {
  assert.deepEqual(parseVideoInfo('1920 x 1080'), { width: 1920, height: 1080 });
  assert.deepEqual(parseVideoInfo('1920x1080'), { width: 1920, height: 1080 });
  assert.deepEqual(parseVideoInfo('3840 X 2160 (1,0)'), { width: 3840, height: 2160 });
  assert.deepEqual(parseVideoInfo('1920 × 1080'), { width: 1920, height: 1080 });
  assert.equal(parseVideoInfo(''), null);
  assert.equal(parseVideoInfo('audio only'), null);
});

test('parseFps : entier, décimal, virgule FR, suffixe', () => {
  assert.equal(parseFps('25'), 25);
  assert.equal(parseFps('25,00 fps'), 25);
  assert.equal(parseFps('29.97'), 29.97);
  assert.equal(parseFps(30), 30);
  assert.equal(parseFps(null), null);
});

test('extractResolutionFps depuis colonnes (FR + EN)', () => {
  const cols = [
    { ColumnName: 'Name', ColumnValue: 'clip.mp4' },
    { ColumnName: 'Video Info', ColumnValue: '1920 x 1080' },
    { ColumnName: 'Frame Rate', ColumnValue: '25,00 fps' },
  ];
  assert.deepEqual(extractResolutionFps(cols), { width: 1920, height: 1080, fps: 25 });
});

test('extractResolutionFps : colonnes manquantes -> null', () => {
  const cols = [{ ColumnName: 'Name', ColumnValue: 'son.wav' }];
  assert.deepEqual(extractResolutionFps(cols), { width: null, height: null, fps: null });
});
