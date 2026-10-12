import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openProgress, saveProgress, runBatch, syncSummary } from './scraper-progress.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minigt-progress-'));
try {
  const baseline = [{ id: '1', sku: 'A', images: ['old1', 'old2', 'old3'] }];
  const { state, products } = openProgress(directory, baseline);
  let active = 0;
  let maximum = 0;
  let saves = 0;
  const save = () => { saves++; saveProgress(directory, state, products); };
  await runBatch(Array.from({ length: 23 }, (_, i) => String(i)), state, async link => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    if (link === '7') throw new Error('temporary failure');
  }, save);
  assert.equal(maximum, 2);
  assert.equal(saves, 3, 'save by processed count, not number of new products');
  assert.deepEqual(state.failed, ['7']);
  const restored = openProgress(directory, baseline);
  const retried = [];
  await runBatch(['0', '7', '22', 'new'], restored.state, async link => retried.push(link), () => {});
  assert.deepEqual(retried, ['7', 'new'], 'resume only failed and unprocessed links');
  assert.deepEqual(restored.state.failed, []);
  state.finalized = true;
  save();
  assert.equal(openProgress(directory, baseline).state.completed.length, 0, 'successful unchanged catalogs must start a fresh cycle');
  save();
  assert.equal(openProgress(directory, [{ ...baseline[0], name: 'manual edit' }]).state.completed.length, 0);
  const report = syncSummary(baseline, [{ ...baseline[0], images: ['1', '2', '3', '4', '5'] }, { sku: 'B', images: ['1'] }], 'start', 'end');
  assert.deepEqual(report.addedKeys, ['B']);
  assert.deepEqual(report.imageCountChanges, [{ key: 'A', from: 3, to: 5 }]);
  assert.equal(report.lastSuccessfulSync, 'end');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
console.log('Checkpoint, bounded concurrency and sync summary checks passed');
