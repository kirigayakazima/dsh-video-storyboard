export function trackStoryboard(ctx, execute) {
  return async (args, exec) => {
    const agent = exec?.agent;
    const target = agent?.session?.id ?? agent?.session?.header?.id ?? agent?.id;
    const ledger = target ? ctx.get?.('companion')?.tasks : null;
    let task;
    let firstFrame;
    function record(status, progress, details) {
      try {
        if (task) ledger.update(task.id, status, progress, details);
      } catch (error) {
        ctx.logger?.warn?.('[storyboard] task status update failed: %s', error.message);
      }
    }
    try {
      task = ledger?.create('video_storyboard', null, target);
    } catch (error) {
      ctx.logger?.warn?.('[storyboard] task status creation failed: %s', error.message);
    }
    record('processing', 0);
    try {
      const output = await execute(args, exec, (completed, total, phase = 'extracting_frames') => {
        const now = performance.now();
        firstFrame ??= { completed, at: now };
        const intervals = completed - firstFrame.completed;
        const eta = intervals > 0 ? Math.round((now - firstFrame.at) * (total - completed) / intervals / 1000) : null;
        record('processing', Math.floor(95 * completed / total), {
          result: { eta_seconds: eta, eta_stage: phase },
        });
      });
      if (output.status === 'blocked') record('failed', undefined, { error: output.reason || 'activity_blocked' });
      else {
        record('completed', 100, { result: null });
        record('delivered', 100);
      }
      return output;
    } catch (error) {
      record('failed', undefined, { error: (error?.message || String(error)).slice(0, 500) });
      throw error;
    }
  };
}
