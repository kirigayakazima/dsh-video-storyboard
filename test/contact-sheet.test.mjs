import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { composeContactSheet, contactTools } from '../src/storyboard/contact_sheet.js';
import { DEFAULT_FFMPEG } from '../src/storyboard/probe.js';

for (const count of [4, 9, 16]) {
  test(`composes ${count} distinguishable tiles and stamps the lower right`, () => {
    const size = 768 / Math.sqrt(count);
    const frames = Array.from({ length: count }, (_, i) => ({
      index: i + 1, at: i + 0.5, buffer: Buffer.alloc(size ** 2 * 3, 90 + i),
    }));
    const sheet = composeContactSheet(frames);
    assert.deepEqual([sheet.width, sheet.height], [768, 768]);
    assert.equal(sheet.cells.at(-1).at, count - 0.5);
    assert.equal(sheet.cells[0].timecode, '00-00-500');
    const sample = (x, y) => sheet.buffer[(y * 768 + x) * 3];
    assert.equal(sample(size / 2, size / 2), 90);
    assert.equal(sample(size + size / 2, size / 2), 91);
    assert.ok(sample(size - 2, size - 2) < 90);
  });
}

test('decodes a real video, writes one PNG, and refetches only cell B2', { timeout: 30_000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'contact-sheet-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'sample.mp4');
  execFileSync(DEFAULT_FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=800x800:r=20:d=2', '-c:v', 'mpeg4', input]);
  const ctx = { attachments: { async saveImage({ name, data, mediaType }) {
    await writeFile(join(dir, name), data);
    return { attachmentId: name, mediaType };
  } } };
  const [overview, detail] = contactTools(ctx);
  const exec = { agent: { id: 'session' } };
  const sheet = await overview.execute({ input, cells: 4 }, exec);
  assert.equal(sheet.imageTokenBudget, 384);
  assert.equal(sheet.estimatedDshImageTokens, 382);
  assert.equal(overview.output.render({}, sheet).filter(x => x.type === 'image').length, 1);
  const selected = await detail.execute({ sheetId: sheet.sheetId, cell: 'B2' }, exec);
  assert.equal(selected.at, sheet.cells[3].at);
  for (const file of [sheet.image.attachmentId, selected.image.attachmentId]) {
    const png = await readFile(join(dir, file));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [768, 768]);
  }
  await assert.rejects(detail.execute({ sheetId: sheet.sheetId, cell: 'B2' }, { agent: { id: 'other' } }), /unavailable/);
});
