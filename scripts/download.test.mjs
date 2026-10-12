import assert from 'node:assert/strict';
import { fetchImageBlob, imageFilename, createModelZip } from '../src/download.ts';
import { unzipSync } from 'fflate';

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

  const model = { id: '1', sku: 'KHMG113', images: [imageUrl, imageUrl, imageUrl] };
  const progress = [];
  const archive = await createModelZip(model, current => progress.push(current));
  const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
  assert.deepEqual(Object.keys(entries), ['KHMG113_01.jpg', 'KHMG113_02.jpg', 'KHMG113_03.jpg']);
  assert.deepEqual(progress, [1, 2, 3]);
  assert.equal(new TextDecoder().decode(entries['KHMG113_03.jpg']), 'image');
  assert.equal(imageFilename({ sku: '', id: '1853' }, 1, 'image/png'), 'id-1853_02.png');
  assert.equal(imageFilename({ sku: 'A/../B', id: '1' }, 0, 'image/webp'), 'A____B_01.webp');

  globalThis.fetch = async () => new Response('Not found', { status: 404 });
  await assert.rejects(download(), /HTTP 404/);
  await assert.rejects(createModelZip(model, () => {}), /HTTP 404/, 'failed image must not produce a partial ZIP');

  globalThis.fetch = async () => new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } });
  await assert.rejects(download(), /未返回图片/);

  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(download(), /Failed to fetch/);
  console.log('Download checks passed');
} finally {
  globalThis.fetch = originalFetch;
}
