import assert from 'node:assert/strict';
import { previewImageUrl } from '../src/image-url.ts';

const original = 'https://pic1.imgdb.cn/i/abc.jpg';
assert.equal(previewImageUrl(original, 800), `${original}?w=800&fit=contain&fmt=webp&q=85`);
assert.equal(new URL(previewImageUrl(original, 160)).searchParams.get('w'), '160');
assert.equal(previewImageUrl('https://pic.imgdd.cc/i/abc.JPG', 800), 'https://pic.imgdd.cc/i/abc.JPG?w=800&fit=contain&fmt=webp&q=85');
for (const source of ['invalid-url', 'https://example.com/i/a.jpg', 'https://pic1.imgdb.cn/legacy/a.jpg', `${original}?signature=value`]) {
  assert.equal(previewImageUrl(source, 800), source);
}
console.log('Preview URLs resize supported images without changing original URLs');
