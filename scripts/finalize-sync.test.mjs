import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finalizeSync } from './finalize-sync.js';
import { openProgress, saveProgress, writeJson } from './scraper-progress.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minigt-finalize-'));
const root = pathToFileURL(`${directory}/`);
try {
  const baseline = [{ id: '1', sku: 'A', name: 'Car', scale: '', marque: '', status: '', images: ['https://example.com/old.jpg'] }];
  const file = path.join(directory, 'data/products.json');
  writeJson(file, baseline);
  writeJson(path.join(directory, 'data/product-brands.json'), [{ id: '1', name: 'All', logo: 'all.png', productKeys: ['A'] }]);
  const stateDirectory = path.join(directory, '.scraper-state');
  const { state, products } = openProgress(stateDirectory, baseline);
  const save = () => saveProgress(stateDirectory, state, products);
  save();
  assert.throws(() => finalizeSync(root), /抓取未完成/);
  state.complete = true;
  products[0].images = ['.scraper-state/images/a.jpg'];
  save();
  assert.throws(() => finalizeSync(root), /HTTP/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), baseline, 'invalid sync cannot replace published catalog');
  assert.equal(fs.existsSync(path.join(directory, 'data/sync-info.json')), false);
  products[0].images = ['https://example.com/1.jpg', 'https://example.com/2.jpg'];
  save();
  finalizeSync(root);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), products);
  const info = JSON.parse(fs.readFileSync(path.join(directory, 'data/sync-info.json')));
  assert.deepEqual(info.imageCountChanges, [{ key: 'A', from: 1, to: 2 }]);
  assert.throws(() => finalizeSync(root), /公开目录已变化/);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
console.log('Only successful, uploaded and validated syncs can publish');
