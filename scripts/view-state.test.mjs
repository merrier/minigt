import assert from 'node:assert/strict';
import { readView, viewUrl, sortModels } from '../src/view-state.ts';

const state = { q: '007 & 宝马', category: '73', sort: 'recent', order: 'desc', page: 2 };
const url = viewUrl('https://example.com/minigt/?utm_source=friend#cars', state);
assert.deepEqual(readView(new URL(url).search), state);
assert.equal(new URL(url).searchParams.get('utm_source'), 'friend');
assert.equal(new URL(url).hash, '#cars');
for (const page of ['0', '-1', 'Infinity', '1.3', '99999999999999999999', 'abc']) {
  assert.equal(readView(`?page=${page}&sort=bad`).page, 1);
}
const models = [{ sku: 'OLD' }, { sku: 'A', firstSeenAt: '2026-10-11T00:00:00Z' }, { sku: 'B', firstSeenAt: '2026-10-12T00:00:00Z' }];
assert.deepEqual(sortModels(models, 'recent', 'desc').map(p => p.sku), ['B', 'A', 'OLD']);
assert.deepEqual(sortModels(models, 'recent', 'asc').map(p => p.sku), ['A', 'B', 'OLD']);
console.log('Share URL and recent sorting checks passed');
