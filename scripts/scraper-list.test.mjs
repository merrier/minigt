import assert from 'node:assert/strict';
import { crawlProductLists } from './scraper-list.js';

const base = 'https://minigt.tsm-models.com/index.php?action=product-list';
const search = 'https://minigt.tsm-models.com/index.php?action=product-search&keywords=';
const product = id => `<a href="index.php?action=product-detail&id=${id}"></a>`;
const fixture = (links, pages = '') => `<div class="pd-list">${links}</div><div class="cdp">${pages}</div>`;
const pages = new Map([
  [base, fixture(product(2403), '<a href="index.php?action=product-list&b_id=&p=5">5</a>') +
    '<a class="sec-open-t" href="index.php?action=product-list&b_id=13">Full Collection</a>'],
  [search, fixture(`${product(1000)}<a href="index.php?action=product-detail&id=2403&b_id=13"></a>`,
    '<a href="index.php?action=product-search&keywords=&p=2">2</a>')],
  [`${search}&p=2`, fixture(product(2402),
    '<a href="index.php?action=product-search&keywords=&p=2">2</a>' +
    '<a href="index.php?action=product-search&keywords=&p=3">next</a>')],
]);
const requests = [];
const results = [];
for await (const page of crawlProductLists(base, async url => {
  requests.push(url);
  assert.ok(pages.has(url), `Unexpected list: ${url}`);
  return pages.get(url);
})) results.push(...page.productLinks);
assert.deepEqual(requests, [...pages.keys()]);
assert.deepEqual(results, [2403, 1000, 2402].map(id => `https://minigt.tsm-models.com/index.php?action=product-detail&id=${id}`));

// 独立分类仍使用实际的 p 分页，不访问不存在的 next 页。
const category = `${base}&b_id=21`;
const categoryRequests = [];
for await (const page of crawlProductLists(category, async url => {
  categoryRequests.push(url);
  return fixture(product(1000), '<a href="index.php?action=product-list&b_id=21&p=2">next</a>');
})) void page;
assert.deepEqual(categoryRequests, [category]);
for (const html of [null, '<html>Database error</html>']) {
  await assert.rejects(async () => {
    for await (const page of crawlProductLists(base, async () => html)) void page;
  }, /列表/);
}
console.log('Scraper pagination checks passed');
