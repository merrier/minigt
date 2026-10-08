import assert from 'node:assert/strict';
import { parseBrands, scrapeCategory } from './brand-scraper-with-compare.js';

const html = `<div class="cat-wrap"><div class="sec-open-arrow">
  <a href="index.php?action=product-list&b_id=2">Chevrolet</a>
  <a href="index.php?action=product-list&b_id=23">Limited Edition</a>
  <a href="index.php?action=product-list&b_id=73">007 Movie Car</a>
</div></div><div class="pd-list-a">
  <a href="index.php?action=product-list&b_id=2"><img src="chevrolet.png"></a>
  <a href="index.php?action=product-list&b_id=23"><img src="limited.png"></a>
  <a href="index.php?action=product-list&b_id=73"><img src="007.png"></a>
</div>`;
assert.deepEqual(parseBrands(html).map(({ id, name }) => [id, name]), [
  ['2', 'Chevrolet'], ['23', 'Limited Edition'], ['73', '007 Movie Car'],
]);
assert.throws(() => parseBrands('<h1>Database error</h1>'), /分类列表/);
assert.throws(() => parseBrands(html.replace('<img src="007.png">', '')), /分类信息/);

const base = 'https://minigt.tsm-models.com/index.php?action=product-list&b_id=73';
const card = (id, sku) => `<div class="pd-list-in"><a href="index.php?action=product-detail&id=${id}"></a><p class="m-0">${sku}</p></div>`;
const page = (cards, nav = '') => `<div class="pd-list">${cards}</div><div class="cdp">${nav}</div>`;
const pages = new Map([
  [base, page(card(1510, 'MGT00900'), '<a href="index.php?action=product-list&b_id=73&p=2">2</a>')],
  [`${base}&p=2`, page(card(2392, ' mgt00926 ') + card(1510, 'MGT00900') + card(1853, ''),
    '<a href="index.php?action=product-list&b_id=73&p=3">next</a>')],
]);
const requests = [];
assert.deepEqual(await scrapeCategory('73', async url => {
  requests.push(url);
  assert.ok(pages.has(url));
  return pages.get(url);
}), ['MGT00900', 'MGT00926', 'id:1853']);
assert.deepEqual(requests, [...pages.keys()]);
await assert.rejects(() => scrapeCategory('73', async url => url === base ? pages.get(base) : null), /列表/);
await assert.rejects(() => scrapeCategory('73', async () => page('<a href="index.php?action=product-detail&id=1"></a>')), /产品信息不完整/);
console.log('Official category parsing and pagination checks passed');
