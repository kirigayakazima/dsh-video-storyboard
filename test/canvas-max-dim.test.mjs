import assert from 'node:assert/strict';
import test from 'node:test';

import { imageTokens } from '../src/storyboard/plan.js';
import { layoutCanvas } from '../src/storyboard/sheet.js';

test('portrait 2×2 stays below 896px and 350 estimated tokens at every preset budget', () => {
  for (const budget of [640_000, 1_200_000, 1_650_000]) {
    const { width, height } = layoutCanvas(2, 2, 9 / 16, budget);
    assert.ok(Math.max(width, height) <= 896);
    assert.ok(imageTokens(width, height) <= 350);
    assert.ok(width * height <= budget);
  }
});

test('landscape defaults and explicitly limited callers remain supported', () => {
  assert.equal(layoutCanvas(2, 2, 16 / 9).width, 1066);
  const { width, height } = layoutCanvas(3, 1, 16 / 9, 640_000, 4, 896);
  assert.ok(Math.max(width, height) <= 896);
});
