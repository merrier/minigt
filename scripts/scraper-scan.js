#!/usr/bin/env node
/**
 * MINI GT Scraper - 从产品列表页爬取所有车模信息
 */

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://minigt.tsm-models.com';
const PRODUCT_URL = `${BASE_URL}/index.php?action=product`;
const DEFAULT_CATEGORY_ID = '13';
const REPO_ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(REPO_ROOT, 'products.json');
const IMAGES_DIR = path.join(REPO_ROOT, 'images');
const SCRAPE_ALL_PAGES = process.env.SCRAPE_ALL_PAGES === '1';
const SCRAPE_DRY_RUN = process.env.SCRAPE_DRY_RUN === '1';
const SCRAPE_MAX_PRODUCTS = Number.parseInt(process.env.SCRAPE_MAX_PRODUCTS || '', 10) || 0;
const REQUESTED_CATEGORY_IDS = (process.env.SCRAPE_CATEGORY_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// 读取已有数据
let allProducts = [];
if (fs.existsSync(DATA_FILE)) {
  allProducts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}
console.log(`已有 ${allProducts.length} 个商品`);

const productsBySku = new Map();
const productsById = new Map();

function normalizeSku(sku) {
  return String(sku || '').trim().toUpperCase();
}

function skuKey(sku) {
  return normalizeSku(sku);
}

function idKey(id) {
  return String(id || '').trim();
}

function rebuildProductIndexes() {
  productsBySku.clear();
  productsById.clear();

  for (const product of allProducts) {
    const sku = skuKey(product.sku);
    const id = idKey(product.id);
    if (sku && !productsBySku.has(sku)) productsBySku.set(sku, product);
    if (id && !productsById.has(id)) productsById.set(id, product);
  }
}

rebuildProductIndexes();
console.log(`已有 SKU: ${productsBySku.size} 个`);

function normalizeLocalImageRef(imagePath) {
  return imagePath.replace(/^data\/images\//, 'images/');
}

function canReuseExistingImages(existingProduct, scrapedImageCount) {
  return (
    existingProduct &&
    Array.isArray(existingProduct.images) &&
    existingProduct.images.length === scrapedImageCount &&
    existingProduct.images.every(Boolean)
  );
}

function buildCategoryUrl(categoryId, page = 1) {
  const pageParam = page > 1 ? `&p=${page}` : '';
  return `${BASE_URL}/index.php?action=product-list&b_id=${categoryId}${pageParam}`;
}

function normalizeProductUrl(href) {
  if (!href) return null;
  const idMatch = href.match(/id=(\d+)/);
  if (idMatch) {
    return {
      id: idMatch[1],
      url: `${BASE_URL}/index.php?action=product-detail&id=${idMatch[1]}`
    };
  }

  const url = href.startsWith('http') ? href : `${BASE_URL}/${href.replace(/^\//, '')}`;
  return { id: url, url };
}

function collectProductLinks($, productLinksById) {
  let added = 0;

  $('a[href*="product-detail"]').each((i, el) => {
    const normalized = normalizeProductUrl($(el).attr('href'));
    if (!normalized || productLinksById.has(normalized.id)) return;
    productLinksById.set(normalized.id, normalized.url);
    added++;
  });

  return added;
}

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

function findExistingProduct(product) {
  const id = idKey(product.id);
  const sku = skuKey(product.sku);
  return (id && productsById.get(id)) || (sku && productsBySku.get(sku)) || null;
}

function getIdentityConflict(product) {
  const id = idKey(product.id);
  const sku = skuKey(product.sku);
  const existingById = id ? productsById.get(id) : null;
  const existingBySku = sku ? productsBySku.get(sku) : null;

  if (existingById && existingBySku && existingById !== existingBySku) {
    return `ID ${id} 已属于 ${existingById.sku}，SKU ${sku} 已属于 ID ${existingBySku.id}`;
  }

  if (existingBySku && id && idKey(existingBySku.id) && idKey(existingBySku.id) !== id) {
    return `SKU ${sku} 已属于 ID ${existingBySku.id}，当前产品 ID 为 ${id}`;
  }

  return '';
}

function upsertProduct(product) {
  const sku = skuKey(product.sku);
  const id = idKey(product.id);
  product.sku = sku;

  const conflict = getIdentityConflict(product);
  if (conflict) {
    console.warn(`  [跳过冲突] ${conflict}`);
    return 'conflict';
  }

  const existingProduct = findExistingProduct(product);
  if (!existingProduct) {
    allProducts.push(product);
    productsBySku.set(sku, product);
    if (id) productsById.set(id, product);
    return 'added';
  }

  const index = allProducts.indexOf(existingProduct);
  if (index === -1) {
    allProducts.push(product);
    productsBySku.set(sku, product);
    if (id) productsById.set(id, product);
    return 'added';
  }

  allProducts[index] = product;
  productsBySku.set(sku, product);
  if (id) productsById.set(id, product);
  return 'updated';
}

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

    const fields = extractInfoFields($);

    if (fields['item no.']) result.sku = normalizeSku(fields['item no.']);
    if (fields.scale) result.scale = fields.scale;
    if (fields.marque) result.marque = fields.marque;
    if (fields.status) result.status = fields.status;

    // 提取页面文本
    const pageText = $('body').text();

    // 提取 SKU。优先使用结构化 Item No.，避免套装页描述里的子 SKU 抢先命中。
    const skuMatch = pageText.match(/\b(MGTS?\d+(?:-[A-Z])?)\b/i);
    if (!result.sku && skuMatch) result.sku = skuMatch[1];

    // 提取比例
    const scaleMatch = pageText.match(/Scale[:\s]*(\d+:\d+)/i);
    if (!result.scale && scaleMatch) result.scale = scaleMatch[1];

    // 提取品牌
    const marqueMatch = pageText.match(/Marque[:\s]*([A-Za-z]+)/i);
    if (!result.marque && marqueMatch) result.marque = marqueMatch[1];

    // 提取状态
    const statusMatch = pageText.match(/Status[:\s]*(Pre-Order|In Stock|Sold Out|Released)/i);
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
    result.sku = normalizeSku(result.sku);

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

async function getCategoryTargets() {
  if (REQUESTED_CATEGORY_IDS.length > 0) {
    return REQUESTED_CATEGORY_IDS.map(id => ({ id, name: `b_id=${id}` }));
  }

  const html = await fetchPage(PRODUCT_URL);
  if (!html) {
    return [{ id: DEFAULT_CATEGORY_ID, name: 'Full Collection' }];
  }

  const $ = cheerio.load(html);
  const categoriesById = new Map();

  $('a[href*="product-list"][href*="b_id="]').each((i, el) => {
    const href = $(el).attr('href') || '';
    const idMatch = href.match(/b_id=(\d+)/);
    if (!idMatch) return;

    const id = idMatch[1];
    const name = $(el).text().trim().replace(/\s+/g, ' ') || `b_id=${id}`;
    if (!categoriesById.has(id)) categoriesById.set(id, { id, name });
  });

  if (!categoriesById.has(DEFAULT_CATEGORY_ID)) {
    categoriesById.set(DEFAULT_CATEGORY_ID, { id: DEFAULT_CATEGORY_ID, name: 'Full Collection' });
  }

  return Array.from(categoriesById.values());
}

function getPaginationPages($) {
  const pages = new Set([1]);

  $('.content_detail__pagination a[href*="p="]').each((i, el) => {
    const href = $(el).attr('href') || '';
    const pageMatch = href.match(/[?&]p=(\d+)/);
    if (!pageMatch) return;

    const page = Number.parseInt(pageMatch[1], 10);
    if (Number.isFinite(page) && page > 0) pages.add(page);
  });

  return Array.from(pages).sort((a, b) => a - b);
}

async function collectCategoryProductLinks(category, productLinksById) {
  const firstPageUrl = buildCategoryUrl(category.id);
  const firstPageHtml = await fetchPage(firstPageUrl);
  if (!firstPageHtml) {
    console.log(`[${category.name}] 获取列表失败`);
    return;
  }

  let $ = cheerio.load(firstPageHtml);
  const pages = SCRAPE_ALL_PAGES ? getPaginationPages($) : [1];
  let added = collectProductLinks($, productLinksById);

  for (const page of pages) {
    if (page === 1) continue;

    const pageHtml = await fetchPage(buildCategoryUrl(category.id, page));
    if (!pageHtml) continue;

    $ = cheerio.load(pageHtml);
    added += collectProductLinks($, productLinksById);
  }

  const pageInfo = SCRAPE_ALL_PAGES ? `，${pages.length} 页` : '';
  console.log(`[${category.name}] 新发现 ${added} 个产品链接${pageInfo}`);
}

async function main() {
  let saved = 0;
  let updated = 0;
  let skipped = 0;

  console.log(`\n开始从产品列表页爬取...\n`);

  try {
    const categories = await getCategoryTargets();
    const productLinksById = new Map();
    console.log(`将扫描 ${categories.length} 个分类${SCRAPE_ALL_PAGES ? '的所有分页' : '的第一页'}`);

    for (const category of categories) {
      await collectCategoryProductLinks(category, productLinksById);
    }

    let uniqueLinks = Array.from(productLinksById.values());
    if (SCRAPE_MAX_PRODUCTS > 0) {
      uniqueLinks = uniqueLinks.slice(0, SCRAPE_MAX_PRODUCTS);
      console.log(`已按 SCRAPE_MAX_PRODUCTS 限制为 ${uniqueLinks.length} 个产品`);
    }

    if (uniqueLinks.length === 0) {
      console.log('没有找到产品，结束爬取');
      return;
    }

    console.log(`去重后找到 ${uniqueLinks.length} 个产品`);

    for (const link of uniqueLinks) {
      try {
        console.log(`处理产品链接: ${link}`);
        const product = await scrapeProductDetail(link);

        if (product && product.sku && product.images.length > 0) {
          console.log(`[${product.id}] ${product.sku} - ${product.name} (${product.images.length} 图)`);

          const conflict = getIdentityConflict(product);
          if (conflict) {
            console.warn(`  [跳过冲突] ${conflict}`);
            skipped++;
            continue;
          }

          const existingProduct = findExistingProduct(product);
          if (canReuseExistingImages(existingProduct, product.images.length)) {
            product.images = existingProduct.images.map(normalizeLocalImageRef);
          } else if (SCRAPE_DRY_RUN) {
            console.log('  [dry-run] 跳过图片下载');
          } else {
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
                  localImages.push(`images/${product.sku}/${filename}`);
                }
              } catch (e) {
                console.error(`下载图片失败: ${product.images[j]}`, e);
              }
            }
            product.images = localImages;
          }

          const upsertResult = upsertProduct(product);
          if (upsertResult === 'added') {
            saved++;
          } else if (upsertResult === 'updated') {
            updated++;
            console.log(`  [更新产品信息] ${product.sku}`);
          } else {
            skipped++;
          }

          // 定期保存
          if (!SCRAPE_DRY_RUN && saved > 0 && saved % 10 === 0) {
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
    console.error('处理产品列表失败', e);
  }

  // 最终保存
  if (!SCRAPE_DRY_RUN) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(allProducts, null, 2));
  }
  console.log(`\n完成！共 ${allProducts.length} 个商品，新增 ${saved} 个，更新 ${updated} 个，跳过 ${skipped} 个`);
}

main();
