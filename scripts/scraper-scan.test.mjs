import assert from 'node:assert/strict';
import { findExistingProductIndex, scrapeProductDetail } from './scraper-scan.js';

// 历史数据中的错误 ID 不能抢先匹配，覆盖另一款产品。
const products = [
  { id: '2326', sku: 'MGT01081' },
  { id: '100', sku: 'MGT01327' },
];
assert.equal(findExistingProductIndex({ id: '2326', sku: 'MGT01327' }, products), 1);
assert.equal(findExistingProductIndex({ id: '101', sku: ' mgt01327 ' }, products), 1);
assert.equal(findExistingProductIndex({ id: '2326', sku: 'MGTNEW' }, products), -1);
assert.equal(findExistingProductIndex({ id: '102', sku: 'KHMG113' }, products), -1);
const unnumbered = [{ id: '1853', sku: '' }, { id: '100', sku: '' }];
assert.equal(findExistingProductIndex({ id: '100', sku: '' }, unnumbered), 1);
assert.equal(findExistingProductIndex({ id: '1853', sku: 'MGTNEW' }, unnumbered), 0);

const originalFetch = globalThis.fetch;
try {
  const html = sku => `<div class="pro-name"><p>Porsche 911 Dakar</p></div>
    <div class="info-list"><li>Item No.<span class="right-column">${sku}</span></li></div>
    <div class="owl-carousel-5"><!-- <img src="upload/own.jpg"> --></div>
    <div class="related_pro">MGT01341<img src="upload/other.jpg"></div>`;
  globalThis.fetch = async () => ({ ok: true, text: async () => html('') });
  const detail = await scrapeProductDetail('https://minigt.tsm-models.com/index.php?action=product-detail&id=1853');
  assert.equal(detail.sku, '');
  assert.deepEqual(detail.images, ['https://minigt.tsm-models.com/upload/own.jpg']);
  globalThis.fetch = async () => ({ ok: true, text: async () => html('KHMG113').replace('upload/own.jpg', 'no-image') });
  const numbered = await scrapeProductDetail('https://minigt.tsm-models.com/index.php?action=product-detail&id=100');
  assert.equal(numbered.sku, 'KHMG113');
  assert.deepEqual(numbered.images, []);
  globalThis.fetch = async () => ({ ok: true, text: async () => '<h1>Database error</h1>' });
  assert.equal(await scrapeProductDetail('https://minigt.tsm-models.com/index.php?action=product-detail&id=100'), null);
} finally {
  globalThis.fetch = originalFetch;
}
console.log('Scraper product matching checks passed');
