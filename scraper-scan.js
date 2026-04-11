#!/usr/bin/env node
/**
 * MINI GT Scraper - 从 ID 9000 开始扫描，收集所有有效商品
 */

const puppeteer = require('puppeteer-core');
const executablePath = '/usr/bin/chromium';
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://minigt.tsm-models.com';
const DATA_FILE = path.join(__dirname, 'data', 'minigt-products.json');
const IMAGES_DIR = path.join(__dirname, 'data', 'images');

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// 读取已有数据
let allProducts = [];
if (fs.existsSync(DATA_FILE)) {
  allProducts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}
console.log(`已有 ${allProducts.length} 个商品`);

// 已有的 SKU
const existingSkus = new Set(allProducts.map(p => p.sku).filter(Boolean));
console.log(`已有 SKU: ${existingSkus.size} 个`);

async function scrapeOne(productId) {
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

  const url = `${BASE_URL}/index.php?action=product-detail&id=${productId}`;
  let product = { id: productId, sku: '', name: '', scale: '', marque: '', status: '', images: [] };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    product = await page.evaluate(() => {
      const result = { id: null, sku: '', name: '', scale: '', marque: '', status: '', images: [] };
      const idMatch = window.location.href.match(/id=(\d+)/);
      if (idMatch) result.id = idMatch[1];

      const title = document.querySelector('h1, h2');
      if (title) result.name = title.textContent.trim();

      const pageText = document.body.innerText;
      const skuMatch = pageText.match(/(MGT\d+)/i);
      if (skuMatch) result.sku = skuMatch[1];

      const scaleMatch = pageText.match(/Scale[:\s]*(\d+:\d+)/i);
      if (scaleMatch) result.scale = scaleMatch[1];

      const marqueMatch = pageText.match(/Marque[:\s]*([A-Za-z]+)/i);
      if (marqueMatch) result.marque = marqueMatch[1];

      const statusMatch = pageText.match(/Status[:\s]*(Pre-Order|In Stock|Sold Out)/i);
      if (statusMatch) result.status = statusMatch[1];

      const imgs = document.querySelectorAll('img[src*="upload"]');
      imgs.forEach(img => {
        if (img.src && img.src.includes('upload') && !img.src.includes('logo') && !img.src.includes('icon') && !img.src.includes('OG')) {
          if (!result.images.includes(img.src)) result.images.push(img.src);
        }
      });

      return result;
    });

  } catch (e) {
    // 静默失败
  }

  await browser.close();
  return product;
}

async function downloadImage(url, filepath) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buf));
    return true;
  } catch { return false; }
}

async function main() {
  const START_ID = 9000;
  const END_ID = 9400;
  let saved = 0;

  console.log(`\n扫描 ID ${START_ID} - ${END_ID}...\n`);

  for (let id = START_ID; id <= END_ID; id++) {
    if (id % 20 === 0) console.log(`进度: ${id - START_ID + 1}/${END_ID - START_ID + 1}`);

    const product = await scrapeOne(String(id));

    // 有 SKU 或者是有效商品就保存
    if (product.sku && product.images.length > 0) {
      // 检查是否已存在
      if (!existingSkus.has(product.sku)) {
        console.log(`[${id}] ${product.sku} - ${product.name} (${product.images.length} 图)`);

        // 下载图片
        const localImages = [];
        for (let j = 0; j < product.images.length; j++) {
          const url = product.images[j];
          const ext = url.split('.').pop().split('?')[0] || 'jpg';
          const filename = `${id}_${j}.${ext}`;
          const filepath = path.join(IMAGES_DIR, filename);

          if (!fs.existsSync(filepath)) {
            await downloadImage(url, filepath);
            await new Promise(r => setTimeout(r, 200));
          }

          if (fs.existsSync(filepath)) {
            localImages.push(`data/images/${filename}`);
          }
        }
        product.images = localImages;

        // 添加到列表
        allProducts.push(product);
        existingSkus.add(product.sku);
        saved++;

        // 定期保存
        if (saved % 10 === 0) {
          fs.writeFileSync(DATA_FILE, JSON.stringify(allProducts, null, 2));
          console.log(`  [已保存 ${allProducts.length} 个商品]`);
        }
      }
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // 最终保存
  fs.writeFileSync(DATA_FILE, JSON.stringify(allProducts, null, 2));
  console.log(`\n完成！共 ${allProducts.length} 个商品，新增 ${saved} 个`);
}

main();
