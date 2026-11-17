import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { samplingWindows } from '../src/storyboard/frames.js';
import { runStoryboard } from '../src/storyboard/pipeline.js';

const cells = Array.from({ length: 4 }, (_, i) => ({ a: i * 2.5, b: (i + 1) * 2.5 }));

test('all candidates in ordinary adjacent cells are separated when the source provides enough time', () => {
  const windows = samplingWindows(cells, { frameRate: 24 });
  for (let i = 1; i < windows.length; i++) assert.ok(windows[i].from - windows[i - 1].to >= 1.2);
});

test('a late fingerprint event keeps a gap and replaces only one center-anchored cell', () => {
  const prints = Array.from({ length: 240 }, (_, i) => Uint8Array.of(i === 232 ? 100 : 0));
  const windows = samplingWindows(cells, { anchored: true, frameRate: 24, prints, fps: 24 });
  for (let i = 0; i < 3; i++) {
    assert.ok(windows[i].from >= (i + 0.5) * 2.5 - 0.35);
    assert.ok(windows[i].to <= (i + 0.5) * 2.5 + 0.35);
  }
  assert.equal(windows[3].center, 232 / 24);
  assert.equal(windows[3].from, windows[3].to);
});

test('zero-cut ten-second footage yields four spaced frames and short clips respect available duration', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'storyboard-single-shot-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'one-shot.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=blue:s=192x108:r=24:d=10',
    '-c:v', 'libx264', '-threads', '1', input]);
  const options = { input, cells: 4, encode: false, transcript: 'off', cache: false };
  const long = await runStoryboard(options);
  assert.equal(long.cuts.length, 0);
  const times = long.sheets.flatMap(sheet => sheet.cells.map(cell => cell.t_frame));
  assert.equal(times.length, 4);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 1.2);
  const short = await runStoryboard({ ...options, to: 2 });
  assert.equal(short.sheets.flatMap(sheet => sheet.cells).length, 1);
});
