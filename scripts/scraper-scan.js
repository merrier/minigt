#!/usr/bin/env node
/**
 * MINI GT Scraper - 从产品列表页爬取所有车模信息
 */

import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { crawlProductLists } from './scraper-list.js';
import { openProgress, saveProgress, runBatch, requestGate } from './scraper-progress.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://minigt.tsm-models.com';
const LIST_URL = `${BASE_URL}/index.php?action=product-list`;
const DATA_FILE = path.join(__dirname, '..', 'data', 'products.json');
const STATE_DIR = path.join(__dirname, '..', '.scraper-state');
const IMAGES_DIR = path.join(STATE_DIR, 'images');
const waitForRequest = requestGate();
const normalizeSku = (sku) => String(sku || '').trim().toUpperCase();

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

export function canReuseExistingImages(existingProduct, scrapedImageCount) {
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
      await waitForRequest();

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

    const fields = extractInfoFields($);

    // 未编号产品保留空值，不能从描述或相关产品中借用另一个 SKU。
    result.sku = normalizeSku(fields['item no.']);

    // 官网未提供的字段保留空值，不能从导航、相邻字段或相关车型补值。
    result.scale = fields.scale || '';
    result.marque = fields.marque || '';
    result.status = fields.status || '';

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
    await waitForRequest();
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
  const baseline = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const { state, products } = openProgress(STATE_DIR, baseline);
  const save = () => saveProgress(STATE_DIR, state, products);
  console.log(`已有 ${products.length} 个产品，恢复 ${state.completed.length} 个已完成详情`);
  if (state.complete) return;
  save();

  const processLink = async link => {
    const product = await scrapeProductDetail(link);
    if (!product?.id || !product.name || !product.images.length) {
      throw new Error('详情不完整');
    }
    const previous = products[findExistingProductIndex(product, products)];
    product.sourceUrl = link;
    if (previous?.firstSeenAt) product.firstSeenAt = previous.firstSeenAt;
    if (!previous) product.firstSeenAt = state.startedAt;
    if (canReuseExistingImages(previous, product.images.length)) {
      product.images = previous.images;
    } else {
      const imageFolder = (product.sku || `id-${product.id}`).replace(/[^a-z0-9_-]/gi, '_');
      const skuDir = path.join(IMAGES_DIR, imageFolder);
      fs.mkdirSync(skuDir, { recursive: true });
      const localImages = [];
      for (const [index, url] of product.images.entries()) {
        const ext = path.extname(new URL(url).pathname).replace(/[^a-z0-9.]/gi, '') || '.jpg';
        const filename = `${index + 1}${ext}`;
        const filepath = path.join(skuDir, filename);
        if (!fs.existsSync(filepath) && !await downloadImage(url, filepath)) {
          throw new Error(`${product.sku} 第 ${index + 1} 张图片下载失败`);
        }
        localImages.push(`.scraper-state/images/${imageFolder}/${filename}`);
      }
      product.images = localImages;
    }
    const index = findExistingProductIndex(product, products);
    if (index === -1) products.push(product);
    else products[index] = product;
    console.log(`[${product.id}] ${product.sku || '未编号'} (${product.images.length} 图)`);
  };

  try {
    for await (const { pageUrl, productLinks } of crawlProductLists(LIST_URL, fetchPage)) {
      console.log(`处理列表 ${pageUrl}，${productLinks.length} 个产品`);
      await runBatch(productLinks, state, processLink, save);
    }
    // 短暂失败在本轮末尾再试；仍失败的 URL 保存下来供重跑。
    if (state.failed.length) await runBatch([...state.failed], state, processLink, save);
    if (state.failed.length) throw new Error(`${state.failed.length} 个产品抓取失败，进度已保存`);
    state.complete = true;
  } finally {
    save();
  }
  console.log(`详情完成：${products.length} 个产品，等待图片上传和目录校验后发布`);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && __filename === fs.realpathSync(process.argv[1])) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
