import assert from 'node:assert/strict';
import { loadCatalog, loadSyncInfo } from '../src/catalog.ts';

const products = [{ id: '1', sku: 'MGT00001', name: 'Car', scale: '', marque: '', status: '', images: ['https://example.com/1.jpg'] }];
const brands = [{ id: '13', name: 'Full Collection', logo: './brands/full.png', productKeys: ['MGT00001'] }];
const originalFetch = globalThis.fetch;
let badResource = '';
let badResponse;
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(options.cache, 'no-cache');
    assert.ok(options.signal instanceof AbortSignal);
    options.signal.throwIfAborted();
    if (url.endsWith(badResource) && badResource) return badResponse();
    return Response.json(url.endsWith('/products.json') ? products : brands);
  };
  const load = () => loadCatalog('/minigt/', new AbortController().signal);
  assert.deepEqual(await load(), { products, brands });
  for (const resource of ['products.json', 'product-brands.json']) {
    badResource = resource;
    for (const response of [
      () => new Response('unavailable', { status: 503 }),
      () => new Response('<html>fallback</html>'),
      () => Response.json({ error: 'invalid catalog' }),
      () => Response.json([null]),
      () => Response.json([{ id: '1' }]),
      () => { throw new TypeError('Failed to fetch'); },
    ]) {
      badResponse = response;
      await assert.rejects(load());
    }
  }
  badResource = '';
  assert.deepEqual(await load(), { products, brands }, 'retry must recover both datasets');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadCatalog('/minigt/', controller.signal));
  const info = { lastSuccessfulSync: '2026-10-12T00:00:00Z', startedAt: '2026-10-11T23:00:00Z', total: 1, addedKeys: ['A'], imageCountChanges: [{ key: 'B', from: 3, to: 5 }] };
  globalThis.fetch = async () => Response.json(info);
  assert.deepEqual(await loadSyncInfo('/minigt/', new AbortController().signal), info);
  for (const invalid of [null, {}, { ...info, lastSuccessfulSync: 'bad' }, { ...info, addedKeys: [null] }, { ...info, imageCountChanges: [null] }]) {
    globalThis.fetch = async () => Response.json(invalid);
    assert.equal(await loadSyncInfo('/minigt/', new AbortController().signal), null);
  }
  globalThis.fetch = async () => new Response('missing', { status: 404 });
  assert.equal(await loadSyncInfo('/minigt/', new AbortController().signal), null);
  console.log('Catalog loading and retry checks passed');
} finally {
  globalThis.fetch = originalFetch;
}
