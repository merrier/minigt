#!/usr/bin/env node
/**
 * MINI GT Scraper - 爬取单个商品的信息和图片
 */

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://minigt.tsm-models.com';
const IMAGES_DIR = path.join(__dirname, 'data', 'images');

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

async function fetchPage(url, retry = 3) {
  for (let i = 0;i < retry;i++) {
    try {
      // 随机延迟，避免请求过于频繁
      await new Promise(r => setTimeout(r, Math.random() * 500 + 500));

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
      await new Promise(r => setTimeout(r, Math.random() * 1000 + 1000));
    }
  }
  return null;
}

async function scrapeProductDetail(productUrl) {
  try {
    const html = await fetchPage(productUrl);
    if (!html) return null;

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
    let imageCount = 0;
    const maxImages = 4; // 限制最多提取4张图片
    $('.owl-carousel-5 .pro_wrap-d .product_hover img').each((i, el) => {
      if (imageCount >= maxImages) return false; // 达到最大数量，停止提取
      const src = $(el).attr('src');
      if (src && src.includes('upload')) {
        // 确保 URL 是完整的
        const fullUrl = src.startsWith('http') ? src : `${BASE_URL}/${src}`;
        images.add(fullUrl);
        imageCount++;
      }
    });

    // 如果轮播图中没有找到图片，尝试从小图轮播中提取
    if (images.size === 0) {
      imageCount = 0;
      $('.owl-carousel-1.carousel-item-7 .product_box img').each((i, el) => {
        if (imageCount >= maxImages) return false; // 达到最大数量，停止提取
        const src = $(el).attr('src');
        if (src && src.includes('upload')) {
          // 确保 URL 是完整的
          const fullUrl = src.startsWith('http') ? src : `${BASE_URL}/${src}`;
          images.add(fullUrl);
          imageCount++;
        }
      });
    }

    // 如果仍然没有找到图片，尝试从HTML注释中提取
    if (images.size === 0) {
      // 尝试从整个页面中提取被注释的图片链接
      const commentRegex = /src="(upload[^"\s]+)"/g;
      let match;
      while ((match = commentRegex.exec(html)) !== null) {
        const src = match[1];
        if (src && src.includes('upload')) {
          const fullUrl = src.startsWith('http') ? src : `${BASE_URL}/${src}`;
          images.add(fullUrl);
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
  // MGT00086 商品的详情页链接
  const productUrl = 'https://minigt.tsm-models.com/index.php?action=product-detail&id=103';
  
  console.log(`开始爬取商品: ${productUrl}`);
  
  const product = await scrapeProductDetail(productUrl);
  
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
          console.log(`下载图片: ${url}`);
          await downloadImage(url, filepath);
          // 随机延迟，避免请求过于频繁
          await new Promise(r => setTimeout(r, Math.random() * 200 + 100));
        }

        if (fs.existsSync(filepath)) {
          localImages.push(`data/images/${product.sku}/${filename}`);
        }
      } catch (e) {
        console.error(`下载图片失败: ${product.images[j]}`, e);
      }
    }
    product.images = localImages;

    console.log(`
完成！${product.sku} 商品已爬取，共 ${product.images.length} 张图片`);
  } else if (product) {
    console.log(`产品信息不完整: ${product.id} - ${product.sku || '无SKU'} - 图片数: ${product.images.length}`);
  } else {
    console.log(`爬取失败: ${productUrl}`);
  }
}

main();
