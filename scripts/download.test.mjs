import assert from 'node:assert/strict';
import { fetchImageBlob } from '../src/download.ts';

const originalFetch = globalThis.fetch;
try {
  const image = new Blob(['image'], { type: 'image/jpeg' });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://example.com/image.jpg');
    assert.equal(options.mode, 'cors');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(image);
  };
  assert.equal(await (await fetchImageBlob('https://example.com/image.jpg')).text(), 'image');

  globalThis.fetch = async () => new Response('Not found', { status: 404 });
  await assert.rejects(fetchImageBlob('https://example.com/missing.jpg'), /HTTP 404/);

  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(fetchImageBlob('https://example.com/offline.jpg'), /Failed to fetch/);
  console.log('Download checks passed');
} finally {
  globalThis.fetch = originalFetch;
}
