#!/usr/bin/env node
/**
 * MINI GT Scraper - 从产品列表页爬取所有车模信息
 */

import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://minigt.tsm-models.com';
const LIST_URL = `${BASE_URL}/index.php?action=product-list&b_id=13`;
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
const existingSkus = new Set(allProducts.map(p => p.sku).filter(Boolean));
console.log(`已有 SKU: ${existingSkus.size} 个`);

async function fetchPage(url, retry = 3) {
  for (let i = 0;i < retry;i++) {
    try {
      // 随机延迟，避免请求过于频繁
      await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));

      const response = await fetch(url, {
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

async function scrapeProductDetail(productUrl) {
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
    let title = $('.pro-name p').first().text().trim();
    if (!title) {
      // 尝试从其他可能的位置提取标题
      title = $('h1').first().text().trim();
    }
    if (!title) {
      title = $('h2').first().text().trim();
    }
    if (!title) {
      // 尝试从meta标签中提取标题
      title = $('meta[name="title"]').attr('content') || '';
    }
    if (!title) {
      title = $('meta[property="og:title"]').attr('content') || '';
    }
    if (title) result.name = title;

    // 提取页面文本
    const pageText = $('body').text();

    // 提取 SKU
    const skuMatch = pageText.match(/(MGT\d+)/i);
    if (skuMatch) result.sku = skuMatch[1];

    // 提取比例
    const scaleMatch = pageText.match(/Scale[:\s]*(\d+:\d+)/i);
    if (scaleMatch) result.scale = scaleMatch[1];

    // 提取品牌
    const marqueMatch = pageText.match(/Marque[:\s]*([A-Za-z]+)/i);
    if (marqueMatch) result.marque = marqueMatch[1];

    // 提取状态
    const statusMatch = pageText.match(/Status[:\s]*(Pre-Order|In Stock|Sold Out)/i);
    if (statusMatch) result.status = statusMatch[1];

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
      // 尝试从整个页面中提取被注释的图片链接
      const commentRegex = /src="(upload[^"\s]+)"/g;
      let match;
      while ((match = commentRegex.exec(html)) !== null) {
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
    const res = await fetch(url);
    if (!res.ok) return false;
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
  let pageNum = 1;

  console.log(`\n开始从产品列表页爬取...\n`);

  // 只爬取第一页
  console.log(`处理第 ${pageNum} 页...`);

  try {
    const pageUrl = `${LIST_URL}&page=${pageNum}`;
    const html = await fetchPage(pageUrl);
    if (!html) {
      console.log('获取页面失败，结束爬取');
      return;
    }

    const $ = cheerio.load(html);
    // 获取所有产品链接 - 确保提取正确的详情页链接
    const productLinks = [];
    const seenLinks = new Set();

    // 尝试多种选择器提取产品链接
    const selectors = [
      'a[href*="product-detail"]',
      '.product_box a',
      '.pro_wrap a',
      '.item a'
    ];

    console.log('开始提取产品链接...');
    for (const selector of selectors) {
      console.log(`尝试选择器: ${selector}`);
      const elements = $(selector);
      console.log(`找到 ${elements.length} 个元素`);

      elements.each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('product-detail')) {
          const fullUrl = href.startsWith('http') ? href : `${BASE_URL}/${href}`;
          if (!seenLinks.has(fullUrl)) {
            seenLinks.add(fullUrl);
            productLinks.push(fullUrl);
            console.log(`添加链接: ${fullUrl}`);
          }
        }
      });

      // 如果已经找到足够的链接，就停止
      if (productLinks.length > 20) break;
    }

    console.log(`提取到 ${productLinks.length} 个产品链接`);

    // 去重
    const uniqueLinks = [...new Set(productLinks)];

    if (uniqueLinks.length === 0) {
      console.log('没有找到产品，结束爬取');
      return;
    }

    console.log(`第 ${pageNum} 页找到 ${uniqueLinks.length} 个产品`);

    for (const link of uniqueLinks) {
      try {
        console.log(`处理产品链接: ${link}`);
        const product = await scrapeProductDetail(link);

        if (product && product.sku && product.images.length > 0) {
          console.log(`[${product.id}] ${product.sku} - ${product.name} (${product.images.length} 图)`);

          // 下载图片 - 按照编号归纳
          const localImages = [];
          const skuDir = path.join(IMAGES_DIR, product.sku);
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
                localImages.push(`data/images/${product.sku}/${filename}`);
              }
            } catch (e) {
              console.error(`下载图片失败: ${product.images[j]}`, e);
            }
          }
          product.images = localImages;

          // 检查是否已存在
          if (!existingSkus.has(product.sku)) {
            // 添加到列表
            allProducts.push(product);
            existingSkus.add(product.sku);
            saved++;
          } else {
            // 更新已存在的产品信息
            const index = allProducts.findIndex(p => p.sku === product.sku);
            if (index !== -1) {
              allProducts[index] = product;
              console.log(`  [更新产品信息] ${product.sku}`);
            }
          }

          // 定期保存
          if (saved % 10 === 0) {
            fs.writeFileSync(DATA_FILE, JSON.stringify(allProducts, null, 2));
            console.log(`  [已保存 ${allProducts.length} 个商品]`);
          }
        } else if (product) {
          console.log(`产品信息不完整: ${product.id} - ${product.sku || '无SKU'} - 图片数: ${product.images.length}`);
        } else {
          console.log(`爬取失败: ${link}`);
        }
      } catch (e) {
        console.error(`处理产品失败: ${link}`, e);
      }

      // 随机延迟，避免请求过于频繁
      await new Promise(r => setTimeout(r, Math.random() * 1500 + 1000));
    }

  } catch (e) {
    console.error(`处理第 ${pageNum} 页失败`, e);
  }

  // 最终保存
  fs.writeFileSync(DATA_FILE, JSON.stringify(allProducts, null, 2));
  console.log(`\n完成！共 ${allProducts.length} 个商品，新增 ${saved} 个`);
}

main();
