import assert from 'node:assert/strict';
import { fetchImageBlob } from '../src/download.ts';

const originalFetch = globalThis.fetch;
const imageUrl = 'https://pic.imgdd.cc/i/0ckpKA8SsUtSr0RIMq6rSV.JPG';
const download = () => fetchImageBlob(imageUrl);
try {
  const image = new Blob(['image'], { type: 'image/jpeg' });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, imageUrl);
    assert.equal(options.mode, 'cors');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(image);
  };
  assert.equal(await (await download()).text(), 'image');

  globalThis.fetch = async () => new Response('Not found', { status: 404 });
  await assert.rejects(download(), /HTTP 404/);

  globalThis.fetch = async () => new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } });
  await assert.rejects(download(), /未返回图片/);

  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(download(), /Failed to fetch/);
  console.log('Download checks passed');
} finally {
  globalThis.fetch = originalFetch;
}
