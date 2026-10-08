import assert from 'node:assert/strict';
import fs from 'node:fs';
import { filterModels, productKey } from '../src/filter.ts';

const model = (sku, id, name = sku) => ({ sku, id, name, marque: '', scale: '', status: '', images: [] });
const brands = [
  { id: '73', name: '007 Movie Car', productKeys: ['MGT00900', 'MGT00926'] },
  { id: '39', name: 'Aston Martin', productKeys: ['MGT00900', 'MGT00926', 'MGT01008'] },
  { id: '21', name: 'KAIDOHOUSE x MINI GT', productKeys: ['KHMG011'] },
  { id: '13', name: 'Full Collection', productKeys: ['id:1853'] },
];
const products = [
  model('MGT00007', '26', 'LB★WORKS Nissan GT-R'),
  model('MGT00007-R', '26', 'LB★WORKS Nissan GT-R'),
  model('MGT00709', '1302', 'BMW M Hybrid V8'),
  model('MGT00709', '1302', 'Duplicate BMW'),
  model('MGT00900', '1510', 'Aston Martin DB5 Goldfinger'),
  model('MGT00926', '2392', 'Aston Martin V12 Vanquish Die Another Day'),
  model('MGT01008', '1771', 'Aston Martin DBS 007 Edition'),
  model('KHMG011', '600', 'Datsun 510'),
  model('', '1853', 'Porsche 911 Dakar'),
];
const skus = rows => rows.map(p => p.sku);
assert.deepEqual(skus(filterModels(products, '007', '73', brands)), ['MGT00900', 'MGT00926']);
assert.deepEqual(skus(filterModels(products, '', '73', brands)), ['MGT00900', 'MGT00926']);
assert.deepEqual(skus(filterModels(products, '  goldFINGER ', '73', brands)), ['MGT00900']);
assert.deepEqual(skus(filterModels(products, 'MGT00926', '73', brands)), ['MGT00926']);
assert.deepEqual(filterModels(products, 'MGT00709', '73', brands), []);
assert.equal(filterModels(products, '', '39', brands).length, 3);
assert.deepEqual(skus(filterModels(products, '', '21', brands)), ['KHMG011']);
assert.deepEqual(skus(filterModels(products, 'kaidohouse', '', brands)), ['KHMG011']);
assert.deepEqual(filterModels(products, '', 'missing', brands), []);
assert.deepEqual(filterModels(products, '', '13', brands).map(p => p.id), ['1853']);
const all = filterModels(products, '', '', brands);
assert.equal(all.length, products.length - 1);
assert.equal(new Set(all.map(productKey)).size, all.length);
assert.notEqual(productKey(products[0]), productKey(products[1]), 'shared official IDs must not produce duplicate React keys');
assert.ok(all.some(p => p.sku === 'MGT00007-R'), 'regional variants must remain distinct');
assert.equal(all.find(p => p.sku === 'MGT00709').name, 'BMW M Hybrid V8');
assert.equal(productKey(model(' khmg011 ', '600')), 'KHMG011');

// 官网 007 分类的独立验收名单，防止只有部分电影名/车厂名能筛出来。
const official007 = ['MGT00900', 'MGT00901', 'MGT00902', 'MGT00903', 'MGT00904', 'MGT00905',
  'MGT00906', 'MGT00907', 'MGT00908', 'MGT00909', 'MGT00910', 'MGT00912', 'MGT00913',
  'MGT00914', 'MGT00915', 'MGT00916', 'MGT00917', 'MGT00918', 'MGT00919', 'MGT00920',
  'MGT00922', 'MGT00923', 'MGT00926', 'MGT00928'];
const catalog = JSON.parse(fs.readFileSync(new URL('../data/products.json', import.meta.url)));
const categories = JSON.parse(fs.readFileSync(new URL('../data/product-brands.json', import.meta.url)));
const selected = filterModels(catalog, '007', '73', categories);
assert.deepEqual(skus(selected).sort(), official007);
assert.ok(selected.every(p => p.name && p.images.length && p.status));
const kaido = filterModels(catalog, '', '21', categories);
assert.ok(kaido.length > 0);
assert.ok(kaido.every(p => p.sku.startsWith('KHMG')));
// 官网当前分类成员与全部历史 KHMG 编号不完全相同；历史车型仍可独立搜索。
for (const sku of ['KHMG001', 'KHMG064', 'KHMG319']) assert.ok(kaido.some(p => p.sku === sku));
assert.equal(filterModels(catalog, 'KHMG011', '', categories).length, 1);
for (const category of categories) {
  assert.deepEqual(filterModels(catalog, '', category.id, categories).map(productKey).sort(), category.productKeys);
}
console.log(`Category filtering checks passed: ${selected.length} 007, ${kaido.length} KaidoHouse products`);
