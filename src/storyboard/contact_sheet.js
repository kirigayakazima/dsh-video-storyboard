import { randomUUID } from 'node:crypto';
import { resolveInput } from './fetch.js';
import { resolveDirectUrl } from './direct-url.js';
import { probeVideo } from './probe.js';
import { isHttpUrl } from './url.js';
import { imageTokens } from './plan.js';
import { composeSheet, drawGlyphs, fillRect, encodePngBuffer, extractFrameRaw } from './sheet.js';

export const CONTACT_SIZE = 768;
export const CONTACT_IMAGE_BUDGET = 384;

function timecode(seconds) {
  const ms = Math.round(seconds * 1000);
  return [Math.floor(ms / 60000), Math.floor(ms / 1000) % 60, ms % 1000]
    .map((part, i) => String(part).padStart(i === 2 ? 3 : 2, '0')).join('-');
}

export function composeContactSheet(frames) {
  const grid = Math.sqrt(frames.length);
  if (![2, 3, 4].includes(grid)) throw new RangeError('Expected 4, 9, or 16 frames');
  const cell = CONTACT_SIZE / grid;
  const sheet = composeSheet({
    frames, cols: grid, rows: grid, cellAspect: 1, gutter: 0, budget: CONTACT_SIZE ** 2,
  });
  const cells = frames.map((frame, i) => {
    const at = frame.at;
    const label = timecode(at);
    const column = i % grid;
    const row = Math.floor(i / grid);
    const x = (column + 1) * cell - 6 * label.length - 4;
    const y = (row + 1) * cell - 13;
    fillRect(sheet.buffer, CONTACT_SIZE, CONTACT_SIZE, x, y, 6 * label.length + 4, 13, [0, 0, 0], 0.85);
    drawGlyphs(sheet.buffer, CONTACT_SIZE, CONTACT_SIZE, label, x + 2, y + 3, 1, [255, 255, 255]);
    return { cell: String.fromCharCode(65 + row) + (column + 1), at, timecode: label };
  });
  return { ...sheet, cells };
}

const output = {
  schema: { type: 'object', properties: {}, additionalProperties: true },
  render: (_args, value) => [
    { type: 'text', text: JSON.stringify({ ...value, image: undefined }) },
    ...(value.image ? [{ type: 'image', attachment: value.image }] : []),
  ],
};

export function contactTools(ctx) {
  const recent = new Map();
  async function attach(buffer, width, height, name) {
    return ctx.attachments.saveImage({ data: await encodePngBuffer(buffer, width, height), mediaType: 'image/png', name });
  }
  return [{
    name: 'storyboard_contact_sheet',
    description: 'Return one 768×768 contact sheet with 4, 9, or 16 timestamped frames. Use this overview before requesting a single detail by cell.',
    parameters: {
      input: { type: 'string', required: true, description: 'Video file or URL' },
      cells: { type: 'integer', enum: [4, 9, 16] },
      from: { type: 'number', description: 'Start time in seconds' },
      to: { type: 'number', description: 'End time in seconds' },
      allowAnonymous: { type: 'boolean', description: 'Allow unsigned URL fetches when no cookies are configured' },
    },
    output,
    async execute({ input, cells = 9, from = 0, to, allowAnonymous = false }, exec) {
      const heart = ctx.get?.('heart');
      const gate = await heart?.evaluateActivity?.({ intent: 'storyboard', category: 'vision' }, { execution: exec });
      if (gate?.suitable === false) return { status: 'blocked', reason: gate.reason };
      const resolved = await resolveInput(input, { allowAnonymous });
      const source = resolved.path;
      const media = await probeVideo(source);
      to ??= media.duration;
      if (![4, 9, 16].includes(cells) || !Number.isFinite(from) || !Number.isFinite(to) ||
          from < 0 || to <= from || to > media.duration) throw new RangeError('Invalid contact sheet window or cell count');
      const cell = CONTACT_SIZE / Math.sqrt(cells);
      const frames = [];
      for (let i = 0; i < cells; i++) {
        exec?.signal?.throwIfAborted();
        const at = from + (i + 0.5) * (to - from) / cells;
        const frame = await extractFrameRaw({ input: source, at, cellW: cell, cellH: cell, reportPts: true });
        frames.push({ ...frame, at: frame.t, seek: at, index: i + 1 });
      }
      const sheet = composeContactSheet(frames);
      const sheetId = randomUUID();
      const image = await attach(sheet.buffer, sheet.width, sheet.height, 'contact-sheet.png');
      recent.set(sheetId, {
        input, source, allowAnonymous, frameSource: resolved.frameSource, cells: sheet.cells,
        seeks: frames.map(frame => frame.seek), session: exec?.agent?.id, at: Date.now(),
      });
      if (recent.size > 24) recent.delete(recent.keys().next().value);
      await heart?.observe?.({
        type: 'vision', source: 'custom', confidence: 1,
        summary: '生成视频接触表', evidence: { cells }, timestamp: new Date().toISOString(),
      });
      return { sheetId, image, cells: sheet.cells, imageTokenBudget: CONTACT_IMAGE_BUDGET,
        estimatedDshImageTokens: imageTokens(sheet.width, sheet.height) };
    },
  }, {
    name: 'storyboard_inspect_detail',
    description: 'Only when a specific contact-sheet cell needs a close look, return its single high-resolution crop.',
    parameters: {
      sheetId: { type: 'string', required: true },
      cell: { type: 'string', required: true, description: 'Cell address such as B2' },
    },
    output,
    async execute({ sheetId, cell }, exec) {
      const sheet = recent.get(sheetId);
      const index = sheet?.cells.findIndex(item => item.cell === cell.toUpperCase());
      const hit = sheet?.cells[index];
      if (!hit || sheet.session !== exec?.agent?.id || Date.now() - sheet.at > 30 * 60_000) {
        throw new Error('Contact sheet or cell is unavailable in this session');
      }
      const gate = await ctx.get?.('heart')?.evaluateActivity?.({ intent: 'storyboard_detail', category: 'vision' }, { execution: exec });
      if (gate?.suitable === false) return { status: 'blocked', reason: gate.reason };
      exec?.signal?.throwIfAborted();
      let direct = null;
      if (isHttpUrl(sheet.input)) {
        direct = sheet.frameSource?.expiresAt > Date.now() + 60_000
          ? sheet.frameSource
          : await resolveDirectUrl(sheet.input, { height: 1080, allowAnonymous: sheet.allowAnonymous });
      }
      exec?.signal?.throwIfAborted();
      const frame = await extractFrameRaw({
        input: direct?.url ?? sheet.source, http: direct, at: sheet.seeks[index], cellW: CONTACT_SIZE, cellH: CONTACT_SIZE,
      });
      return { ...hit, image: await attach(frame.buffer, CONTACT_SIZE, CONTACT_SIZE, `contact-${hit.cell}.png`) };
    },
  }];
}
