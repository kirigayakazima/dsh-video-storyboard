import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { isAudibleAudio } from '../src/storyboard/audio.js';
import { boardOptions } from '../src/storyboard/board.js';
import { buildEvidence, formatManifest } from '../src/storyboard/format.js';
import { runStoryboard } from '../src/storyboard/pipeline.js';
import { STRIP_BAR } from '../src/storyboard/sheet.js';
import { storyboardToolSpec, zoomToolSpec } from '../src/storyboard/tool-spec.js';

test('audibility uses the momentary threshold and does not promote a brief sample peak', () => {
  assert.equal(isAudibleAudio({ samples: 100, peak: -41.2, mean: -50.8, peak_volume_db: -17.2 }), false);
  assert.equal(isAudibleAudio({ samples: 100, peak: -32, mean: -60 }), true);
  assert.equal(isAudibleAudio({ samples: 100, peak: -40, mean: -48 }), true);
  assert.equal(isAudibleAudio({ samples: 0, peak: -1 }), false);
});

test('board, zoom and tool schema expose the same audio strip modes', () => {
  assert.equal(boardOptions().audioStrip, 'auto');
  assert.equal(boardOptions({ audioStrip: 'off' }, { kind: 'zoom' }).audioStrip, 'off');
  for (const tool of [storyboardToolSpec(), zoomToolSpec()]) {
    assert.deepEqual(tool.parameters.audioStrip.enum, ['auto', 'on', 'off']);
  }
});

test('near-silent portrait clip suppresses auto strip, and forced strip has no raised floor', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'storyboard-audio-strip-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'near-silent.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=180x320:r=15:d=4',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-af', 'volume=0.01',
    '-c:v', 'libx264', '-threads', '1', '-c:a', 'aac', '-shortest', input]);
  const options = { input, cells: 2, budget: 1_200_000, transcript: 'off', cache: false, encode: false, pick: 'mid' };
  const [auto, forced, off] = await Promise.all(['auto', 'on', 'off'].map(audioStrip => runStoryboard({ ...options, audioStrip })));
  assert.equal(auto.audio.strip, 'suppressed_inaudible');
  assert.equal(buildEvidence(auto).audio.audible, false);
  assert.match(formatManifest(auto), /suppressed_inaudible/);
  assert.equal(auto.sheets[0].stripH, undefined);
  assert.equal(off.audio.strip, 'off');
  assert.equal(off.sheets[0].stripH, undefined);
  assert.equal(forced.audio.strip, 'drawn');
  const { buffer, width, height, stripH } = forced.sheets[0];
  assert.ok(stripH > 0 && Math.max(width, height) <= 896);
  const footer = buffer.subarray((height - stripH) * width * 3);
  for (let p = 0; p < footer.length; p += 3) {
    assert.notDeepEqual([...footer.subarray(p, p + 3)], STRIP_BAR);
  }
});
