import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const hasText = value => typeof value === 'string' && value.trim().length > 0;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isRemoteImage = value => {
  if (typeof value !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export function validateCatalog(products, categories) {
  const errors = [];
  if (!Array.isArray(products) || !products.length) errors.push('产品列表必须是非空数组');
  if (!Array.isArray(categories) || !categories.length) errors.push('分类列表必须是非空数组');
  if (errors.length) return errors;

  const keys = new Set();
  for (const [index, product] of products.entries()) {
    const label = `产品 ${index + 1}`;
    if (!isObject(product)) {
      errors.push(`${label}: 必须是对象`);
      continue;
    }
    for (const field of ['id', 'name']) {
      if (!hasText(product[field])) errors.push(`${label}: ${field} 不能为空`);
    }
    if (typeof product.sku !== 'string' || product.sku !== product.sku.trim().toUpperCase()) {
      errors.push(`${label}: SKU 必须是去除首尾空格的大写字符串`);
    }
    const key = typeof product.sku === 'string' && product.sku.trim()
      ? product.sku.trim().toUpperCase() : `id:${product.id}`;
    if (keys.has(key)) errors.push(`${label}: 重复产品 ${key}`);
    keys.add(key);
    for (const field of ['scale', 'marque', 'status']) {
      if (typeof product[field] !== 'string') errors.push(`${key}: ${field} 必须是字符串，未知值用空字符串`);
    }
    if (/^(Full$|Status)/i.test(product.marque)) {
      errors.push(`${key}: marque 包含历史解析错误 ${product.marque}`);
    }
    if (!['', 'Pre-Order', 'In Stock', 'Sold Out', 'Released'].includes(product.status)) {
      errors.push(`${key}: 未识别的 status ${product.status}`);
    }
    if (!Array.isArray(product.images) || !product.images.length || !product.images.every(isRemoteImage)) {
      errors.push(`${key}: 图片必须是非空的完整 HTTP(S) 链接列表`);
    }
  }

  const categoryIds = new Set();
  for (const [index, category] of categories.entries()) {
    const label = `分类 ${index + 1}`;
    if (!isObject(category)) {
      errors.push(`${label}: 必须是对象`);
      continue;
    }
    for (const field of ['id', 'name', 'logo']) {
      if (!hasText(category[field])) errors.push(`${label}: ${field} 不能为空`);
    }
    if (categoryIds.has(category.id)) errors.push(`${label}: 重复分类 ${category.id}`);
    categoryIds.add(category.id);
    if (!Array.isArray(category.productKeys)) {
      errors.push(`${label}: productKeys 必须是数组`);
      continue;
    }
    const members = new Set();
    for (const key of category.productKeys) {
      if (!keys.has(key)) errors.push(`${category.name}: 产品 ${key} 不存在`);
      if (members.has(key)) errors.push(`${category.name}: 重复成员 ${key}`);
      members.add(key);
    }
  }
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    const products = JSON.parse(fs.readFileSync(new URL('../data/products.json', import.meta.url), 'utf8'));
    const categories = JSON.parse(fs.readFileSync(new URL('../data/product-brands.json', import.meta.url), 'utf8'));
    const errors = validateCatalog(products, categories);
    if (errors.length) throw new Error(`数据校验失败（${errors.length} 项）：\n${errors.join('\n')}`);
    console.log(`数据校验通过：${products.length} 个产品，${categories.length} 个分类`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
