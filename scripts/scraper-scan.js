#!/usr/bin/env node
/**
 * MINI GT Scraper - 从产品列表页爬取所有车模信息
 */

import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { crawlProductLists } from './scraper-list.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://minigt.tsm-models.com';
const LIST_URL = `${BASE_URL}/index.php?action=product-list`;
const DATA_FILE = path.join(__dirname, '..', 'data', 'products.json');
const IMAGES_DIR = path.join(__dirname, '..', 'data', 'images');

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// 读取已有数据
let allProducts = [];
if (fs.existsSync(DATA_FILE)) {
  allProducts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}
console.log(`已有 ${allProducts.length} 个商品`);

// 已有的 SKU
const normalizeSku = (sku) => String(sku || '').trim().toUpperCase();
const existingSkus = new Set(allProducts.map(p => normalizeSku(p.sku)).filter(Boolean));
console.log(`已有 SKU: ${existingSkus.size} 个`);

function extractInfoFields($) {
  const fields = {};

  $('.info-list li, .p_det_info li').each((i, el) => {
    const value = $(el).find('.right-column').first().text().trim();
    const label = $(el)
      .clone()
      .children()
      .remove()
      .end()
      .text()
      .trim()
      .replace(/\s+/g, ' ');

    if (label && value) fields[label.toLowerCase()] = value;
  });

  return fields;
}

export function findExistingProductIndex(product, products) {
  const productSku = normalizeSku(product.sku);
  const skuIndex = productSku ? products.findIndex(p => normalizeSku(p.sku) === productSku) : -1;
  return skuIndex !== -1 ? skuIndex : products.findIndex(p =>
    String(p.id || '') === String(product.id || '') && !normalizeSku(p.sku)
  );
}

function canReuseExistingImages(existingProduct, scrapedImageCount) {
  return (
    existingProduct &&
    Array.isArray(existingProduct.images) &&
    existingProduct.images.length === scrapedImageCount &&
    existingProduct.images.every(image => /^https?:\/\//.test(image))
  );
}

async function fetchPage(url, retry = 3) {
  for (let i = 0;i < retry;i++) {
    try {
      // 随机延迟，避免请求过于频繁
      await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));

      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.text();
    } catch (e) {
      console.error(`获取页面失败 (${i + 1}/${retry}): ${url}`, e);
      if (i === retry - 1) return null;
      // 重试前延迟
      await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
    }
  }
  return null;
}

export async function scrapeProductDetail(productUrl) {
  try {
    const html = await fetchPage(productUrl);
    if (!html) return null;

    // 不再保存HTML到本地，只用于获取图片链接

    // 提取 ID
    const idMatch = productUrl.match(/id=(\d+)/);

    const $ = cheerio.load(html);
    const result = { id: null, sku: '', name: '', scale: '', marque: '', status: '', images: [] };

    // 提取 ID
    if (idMatch) result.id = idMatch[1];

    // 提取名称 - 从产品页面的特定结构中提取
    const title = $('.pro-name p').first().text().trim();
    if (!title) return null;
    result.name = title;

    // 提取页面文本
    const pageText = $('body').text();
    const fields = extractInfoFields($);

    // 未编号产品保留空值，不能从描述或相关产品中借用另一个 SKU。
    result.sku = normalizeSku(fields['item no.']);

    // 提取比例
    const scaleMatch = pageText.match(/Scale[:\s]*(\d+:\d+)/i);
    if (fields.scale) result.scale = fields.scale;
    if (!result.scale && scaleMatch) result.scale = scaleMatch[1];

    // 提取品牌
    const marqueMatch = pageText.match(/Marque[:\s]*([A-Za-z]+)/i);
    if (fields.marque) result.marque = fields.marque;
    if (!result.marque && marqueMatch) result.marque = marqueMatch[1];

    // 提取状态
    const statusMatch = pageText.match(/Status[:\s]*(Pre-Order|In Stock|Sold Out|Released)/i);
    if (fields.status) result.status = fields.status;
    if (!result.status && statusMatch) result.status = statusMatch[1];

    // 提取图片 - 只从轮播图中提取
    const images = new Set();

    // 从大图轮播中提取图片
    $('.owl-carousel-5 .pro_wrap-d .product_hover img').each((i, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('upload')) {
        // 确保 URL 是完整的
        const fullUrl = src.startsWith('http') ? src : `${BASE_URL}/${src}`;
        images.add(fullUrl);
      }
    });

    // 如果轮播图中没有找到图片，尝试从小图轮播中提取
    if (images.size === 0) {
      $('.owl-carousel-1.carousel-item-7 .product_box img').each((i, el) => {
        const src = $(el).attr('src');
        if (src && src.includes('upload')) {
          // 确保 URL 是完整的
          const fullUrl = src.startsWith('http') ? src : `${BASE_URL}/${src}`;
          images.add(fullUrl);
        }
      });
    }

    // 如果仍然没有找到图片，尝试从HTML注释中提取
    if (images.size === 0) {
      console.log('尝试从HTML注释中提取图片...');
      // 仅从当前产品的轮播中提取被注释的图片，排除相关产品。
      const carouselHtml = $('.owl-carousel-5, .owl-carousel-1.carousel-item-7')
        .map((i, el) => $(el).html()).get().join('');
      const commentRegex = /src="(upload[^"\s]+)"/g;
      let match;
      while ((match = commentRegex.exec(carouselHtml)) !== null) {
        const src = match[1];
        if (src && src.includes('upload')) {
          const fullUrl = src.startsWith('http') ? src : `${BASE_URL}/${src}`;
          images.add(fullUrl);
          console.log('提取图片:', fullUrl);
          // 只提取第一个图片，避免下载其他产品的图片
          break;
        }
      }
    }

    // 不再从其他地方查找图片，避免下载不属于该产品的图片
    result.images = Array.from(images);

    return result;
  } catch (e) {
    console.error(`爬取详情页失败: ${productUrl}`, e);
    return null;
  }
}

async function downloadImage(url, filepath) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) return false;
    const buf = await res.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buf));
    return true;
  } catch (e) {
    console.error(`下载图片失败: ${url}`, e);
    return false;
  }
}

async function main() {
  let saved = 0;
  let failed = 0;

  for await (const { pageUrl, productLinks: uniqueLinks } of crawlProductLists(LIST_URL, fetchPage)) {
    console.log(`处理列表 ${pageUrl}，${uniqueLinks.length} 个产品`);

    for (const link of uniqueLinks) {
      try {
        console.log(`处理产品链接: ${link}`);
        const product = await scrapeProductDetail(link);

        if (product && product.id && product.name && product.images.length > 0) {
          console.log(`[${product.id}] ${product.sku} - ${product.name} (${product.images.length} 图)`);

          const existingProduct = allProducts[findExistingProductIndex(product, allProducts)];

          if (canReuseExistingImages(existingProduct, product.images.length)) {
            product.images = existingProduct.images;
            console.log(`  [复用已上传图片] ${product.sku}`);
          } else {
            // 下载图片 - 按照编号归纳
            const localImages = [];
            const imageFolder = product.sku || `id-${product.id}`;
            const skuDir = path.join(IMAGES_DIR, imageFolder);
            if (!fs.existsSync(skuDir)) fs.mkdirSync(skuDir, { recursive: true });

            for (let j = 0;j < product.images.length;j++) {
              try {
                const url = product.images[j];
                const ext = url.split('.').pop().split('?')[0] || 'jpg';
                const filename = `${j + 1}.${ext}`; // 按照编号 1, 2, 3... 命名
                const filepath = path.join(skuDir, filename);

                if (!fs.existsSync(filepath)) {
                  await downloadImage(url, filepath);
                  // 随机延迟，避免请求过于频繁
                  await new Promise(r => setTimeout(r, Math.random() * 500 + 200));
                }

                if (fs.existsSync(filepath)) {
                  localImages.push(`data/images/${imageFolder}/${filename}`);
                }
              } catch (e) {
                console.error(`下载图片失败: ${product.images[j]}`, e);
              }
            }
            if (localImages.length !== product.images.length) {
              throw new Error(`${product.sku} 图片未下载完整`);
            }
            product.images = localImages;
          }

          // 检查是否已存在
          const productSku = normalizeSku(product.sku);
          const existingIndex = findExistingProductIndex(product, allProducts);

          if (existingIndex === -1) {
            // 添加到列表
            allProducts.push(product);
            existingSkus.add(productSku);
            saved++;
          } else {
            // 更新已存在的产品信息
            allProducts[existingIndex] = product;
            existingSkus.add(productSku);
            console.log(`  [更新产品信息] ${product.sku}`);
          }

          // 定期保存
          if (saved % 10 === 0) {
            fs.writeFileSync(DATA_FILE, JSON.stringify(allProducts, null, 2));
            console.log(`  [已保存 ${allProducts.length} 个商品]`);
          }
        } else if (product) {
          failed++;
          console.log(`产品信息不完整: ${product.id} - ${product.sku || '无SKU'} - 图片数: ${product.images.length}`);
        } else {
          failed++;
          console.log(`爬取失败: ${link}`);
        }
      } catch (e) {
        failed++;
        console.error(`处理产品失败: ${link}`, e);
      }

      // 随机延迟，避免请求过于频繁
      await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));
    }
    // 每页保存进度，后续页面失败时不丢失已抓取的产品。
    fs.writeFileSync(DATA_FILE, JSON.stringify(allProducts, null, 2));
  }

  // 最终保存
  fs.writeFileSync(DATA_FILE, JSON.stringify(allProducts, null, 2));
  console.log(`\n完成！共 ${allProducts.length} 个商品，新增 ${saved} 个`);
  if (failed) throw new Error(`${failed} 个产品抓取失败`);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && __filename === fs.realpathSync(process.argv[1])) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
