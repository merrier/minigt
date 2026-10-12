import assert from 'node:assert/strict';
import { validateCatalog } from './validate-data.js';

const product = { id: '1', sku: 'MGT00001', name: 'Test car', scale: '1:64', marque: 'Nissan', status: 'Released', images: ['https://example.com/car.jpg'] };
const category = { id: '13', name: 'Full Collection', logo: './brands/full.png', productKeys: ['MGT00001'] };
const validate = (products = [product], categories = [category]) => validateCatalog(products, categories);
assert.deepEqual(validate(), []);
assert.deepEqual(validate([{ ...product, firstSeenAt: '2026-10-12T00:00:00.000Z', sourceUrl: 'https://minigt.tsm-models.com/index.php?action=product-detail&id=1' }]), []);
assert.ok(validate([{ ...product, firstSeenAt: 'not-a-date' }]).some(e => e.includes('firstSeenAt')));
assert.ok(validate([{ ...product, sourceUrl: 'https://minigt.tsm-models.com/index.php?action=product-detail&id=2' }]).some(e => e.includes('sourceUrl')));
assert.ok(validate([{ ...product, sourceUrl: 'javascript:alert(1)' }]).some(e => e.includes('sourceUrl')));
// 同一官网 ID 的地区变体和不同 ID 的未编号产品都应保留；未知字段允许为空。
assert.deepEqual(validate([
  product, { ...product, sku: 'MGT00001-R' },
  { ...product, id: '2', sku: '', scale: '', marque: '', status: '' },
  { ...product, id: '3', sku: '' },
]), []);
assert.ok(validate([product, { ...product }]).some(e => e.includes('重复产品')));
assert.ok(validate([{ ...product, sku: ' mgt00001 ' }]).some(e => e.includes('SKU')));
assert.ok(validate([{ ...product, name: '' }]).some(e => e.includes('name')));
assert.ok(validate([{ ...product, id: '' }]).some(e => e.includes('id')));
assert.ok(validate([{ ...product, images: [] }]).some(e => e.includes('图片')));
assert.ok(validate([{ ...product, images: ['data/images/1.jpg'] }]).some(e => e.includes('图片')));
assert.ok(validate([{ ...product, images: ['https://'] }]).some(e => e.includes('图片')));
for (const marque of ['Full', 'StatusReleased', 'StatusPre']) {
  assert.ok(validate([{ ...product, marque }]).some(e => e.includes('marque')));
}
assert.ok(validate([{ ...product, status: 'ReleaseOops' }]).some(e => e.includes('status')));
assert.ok(validate([product], [{ ...category, productKeys: ['MISSING'] }]).some(e => e.includes('不存在')));
assert.ok(validate([product], [category, category]).some(e => e.includes('重复分类')));
assert.ok(validate([product], [{ ...category, productKeys: ['MGT00001', 'MGT00001'] }]).some(e => e.includes('重复成员')));
assert.deepEqual(validate([product], [{ ...category, productKeys: [] }]), []);
for (const products of [null, {}, [], [null], [{ ...product, images: null }]]) {
  assert.ok(validate(products).length > 0);
}
for (const categories of [null, {}, [], [null], [{ ...category, productKeys: null }]]) {
  assert.ok(validate([product], categories).length > 0);
}
console.log('Catalog validation checks passed');
