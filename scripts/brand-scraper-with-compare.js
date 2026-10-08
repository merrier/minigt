import * as cheerio from 'cheerio';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { crawlProductLists } from './scraper-list.js';

const __filename = fileURLToPath(import.meta.url);
const dataDir = path.join(path.dirname(__filename), '..', 'data');
const baseUrl = 'https://minigt.tsm-models.com/';

export function parseBrands(html) {
  const $ = cheerio.load(html);
  const names = new Map();
  $('.cat-wrap .sec-open-arrow a[href]').each((i, el) => {
    const id = new URL($(el).attr('href'), baseUrl).searchParams.get('b_id');
    if (id) names.set(id, $(el).text().trim());
  });
  const brands = [];
  $('.pd-list-a > a[href]').each((i, el) => {
    const id = new URL($(el).attr('href'), baseUrl).searchParams.get('b_id');
    const logo = $(el).find('img').attr('src');
    if (!names.get(id) || !logo) throw new Error(`分类信息不完整: ${id}`);
    brands.push({ id, name: names.get(id), logo: new URL(logo, baseUrl).href });
  });
  if (!brands.length || brands.length !== names.size || new Set(brands.map(b => b.id)).size !== brands.length) {
    throw new Error('官网分类列表不完整');
  }
  return brands;
}

export async function scrapeCategory(brandId, fetchPage) {
  const productKeys = new Set();
  const url = `${baseUrl}index.php?action=product-list&b_id=${brandId}`;
  for await (const { html, productLinks } of crawlProductLists(url, fetchPage)) {
    const $ = cheerio.load(html);
    const parsedIds = new Set();
    $('.pd-list-in').each((i, el) => {
      const href = $(el).find('a[href*="product-detail"]').first().attr('href');
      const id = href && new URL(href, baseUrl).searchParams.get('id');
      if (!id) return;
      const sku = $(el).find('p.m-0').text().trim().toUpperCase();
      productKeys.add(sku || `id:${id}`);
      parsedIds.add(id);
    });
    if (productLinks.some(link => !parsedIds.has(new URL(link).searchParams.get('id')))) {
      throw new Error(`分类 ${brandId} 的产品信息不完整`);
    }
  }
  return [...productKeys].sort();
}

async function fetchPage(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    try {
      return (await axios.get(url, { timeout: 30000 })).data;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}

async function main() {
  const brands = parseBrands(await fetchPage(`${baseUrl}index.php?action=product`));
  fs.mkdirSync(path.join(dataDir, 'brands'), { recursive: true });
  for (const brand of brands) {
    brand.productKeys = await scrapeCategory(brand.id, fetchPage);
    const logoFileName = `${brand.name.replace(/\s+/g, '-').toLowerCase()}.png`;
    const logoPath = path.join(dataDir, 'brands', logoFileName);
    if (!fs.existsSync(logoPath)) {
      const response = await axios.get(brand.logo, { responseType: 'arraybuffer', timeout: 30000 });
      fs.writeFileSync(logoPath, response.data);
    }
    brand.logo = `./brands/${logoFileName}`;
    console.log(`${brand.name}: ${brand.productKeys.length} 个产品`);
  }
  // 全部分页成功后替换快照，避免追加旧名称、重复分类或发布半份分类名单。
  const destination = path.join(dataDir, 'product-brands.json');
  fs.writeFileSync(`${destination}.tmp`, JSON.stringify(brands, null, 2));
  fs.renameSync(`${destination}.tmp`, destination);
  console.log(`已更新 ${brands.length} 个官网分类`);
}

if (process.argv[1] && __filename === fs.realpathSync(process.argv[1])) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
