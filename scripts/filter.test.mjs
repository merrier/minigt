import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchesBrand } from '../src/filter.ts';

const products = JSON.parse(fs.readFileSync(new URL('../data/products.json', import.meta.url)));
const brands = JSON.parse(fs.readFileSync(new URL('../data/product-brands.json', import.meta.url)));
const kaido = 'KAIDOHOUSE x MINI GT';
const selected = products.filter(model => matchesBrand(model, kaido, brands));
const kaidoProducts = products.filter(model => /^KHMG/i.test(model.sku));
assert.ok(kaidoProducts.length > 0);
assert.deepEqual(selected.map(p => p.id).sort(), kaidoProducts.map(p => p.id).sort());

// 覆盖名称不含 Kaido、分类字段记录为车厂或缺失的产品。
for (const sku of ['KHMG011', 'KHMG017', 'KHMG079']) {
  assert.ok(selected.some(model => model.sku === sku), `${sku} must remain in KaidoHouse`);
}
const model = { ...kaidoProducts[0], sku: ' khmg113 ', name: 'Nissan Skyline GT-R', marque: '' };
assert.equal(matchesBrand(model, kaido, brands), true);
assert.equal(matchesBrand({ ...model, sku: 'MGT01217', name: 'Nissan Skyline Kaido Works' }, kaido, brands), false);
assert.equal(matchesBrand({ ...model, sku: '', marque: kaido }, kaido, brands), true);
assert.equal(matchesBrand(model, '', brands), true);
assert.equal(matchesBrand(model, 'Nissan', brands), true);
assert.equal(matchesBrand(model, 'BMW', brands), false);
assert.equal(matchesBrand({ ...model, name: 'BMW M3' }, 'BMW', brands), true);
console.log(`Brand filtering checks passed: ${selected.length} KaidoHouse products`);
