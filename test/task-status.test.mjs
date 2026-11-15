import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trackStoryboard } from '../src/storyboard/task_status.js';

test('storyboard logs actual frame progress and preserves the tool output', async () => {
  const calls = [];
  const output = { images: [], text: 'Storyboard' };
  const tasks = {
    create(kind, key, target) {
      assert.deepEqual([kind, key, target], ['video_storyboard', null, 'session']);
      return { id: 'task' };
    },
    update(id, ...details) {
      assert.equal(id, 'task');
      calls.push(details);
    },
  };
  const run = trackStoryboard({ get: () => ({ tasks }) }, async (_args, _exec, progress) => {
    progress(1, 4);
    progress(2, 4);
    return output;
  });
  assert.equal(await run({}, { agent: { session: { id: 'session' } } }), output);
  assert.deepEqual(calls.map(([status, progress]) => [status, progress]), [
    ['processing', 0], ['processing', 23], ['processing', 47], ['completed', 100], ['delivered', 100],
  ]);
  assert.equal(calls[1][2].result.eta_seconds, null);
  assert.equal(calls[2][2].result.eta_stage, 'extracting_frames');
});
