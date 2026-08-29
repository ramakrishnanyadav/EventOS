import { test, describe } from 'node:test';
import assert from 'node:assert';
import { computeNormalizedScores } from '../../modules/judging/index.js';

describe('Judging Normalization Engine', () => {
  const scores = [60, 80, 85, 90, 100];

  test('RAW strategy returns weighted mean', () => {
    const raw = computeNormalizedScores(scores, 'RAW');
    assert.strictEqual(raw, 83);
  });

  test('MEDIAN strategy returns median score', () => {
    const med = computeNormalizedScores(scores, 'MEDIAN');
    assert.strictEqual(med, 85);
  });

  test('TRIMMED_MEAN strategy removes min and max before computing average', () => {
    const trimmed = computeNormalizedScores(scores, 'TRIMMED_MEAN');
    // Trim 60 and 100 -> average of [80, 85, 90] = 255 / 3 = 85
    assert.strictEqual(trimmed, 85);
  });

  test('WINSORIZED strategy replaces extremes with next inner value', () => {
    const winsorized = computeNormalizedScores(scores, 'WINSORIZED');
    // Winsorized array: [80, 80, 85, 90, 90] -> sum 425 / 5 = 85
    assert.strictEqual(winsorized, 85);
  });
});
