#!/usr/bin/env node
/**
 * MINI GT Scraper - 优化版：先检测是否有更新，避免无效爬取
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const BASE_URL = "https://minigt.tsm-models.com";
const LIST_URL = `${BASE_URL}/index.php?action=product-list&b_id=13`;
const DATA_DIR = "/root/.openclaw/workspace/data";
const OUTPUT_FILE = path.join(DATA_DIR, "minigt-products.json");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const STATE_FILE = path.join(DATA_DIR, "last-state.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
};

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { headers: HEADERS, timeout: 30000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => reject(new Error('Timeout')));
    });
}

// 获取本地已保存的 SKU 列表
function getLocalSkus() {
    try {
        if (!fs.existsSync(OUTPUT_FILE)) return new Set();
        const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        return new Set(data.map(p => p.sku || p.item_no).filter(Boolean));
    } catch (e) {
        return new Set();
    }
}

// 获取第一页的商品 ID 和最新商品信息（按更新排序）
async function checkForUpdates() {
    console.log("🔍 检查第一页是否有新商品...");
    
    const html = await httpGet(`${LIST_URL}&p=0`);
    
    // 提取第一页所有商品的 ID
    const productIds = [];
    const regex = /action=product-detail&id=(\d+)/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        if (!productIds.includes(match[1])) {
            productIds.push(match[1]);
        }
    }
    
    // 提取第一页商品的详细信息
    const firstPageSkus = [];
    for (const pid of productIds.slice(0, 12)) {
        try {
            const detailHtml = await httpGet(`${BASE_URL}/index.php?action=product-detail&id=${pid}`);
            const itemMatch = detailHtml.match(/Item No\.<span[^>]*>([^<]+)<\/span>/i);
            if (itemMatch) {
                firstPageSkus.push(itemMatch[1].trim());
            }
        } catch (e) {
            // ignore
        }
    }
    
    console.log(`📦 第一页商品: ${firstPageSkus.join(', ')}`);
    
    const localSkus = getLocalSkus();
    const newSkus = firstPageSkus.filter(sku => !localSkus.has(sku));
    
    console.log(`🆕 新商品: ${newSkus.length > 0 ? newSkus.join(', ') : '无'}`);
    console.log(`📁 本地已有: ${localSkus.size} 个 SKU`);
    
    return {
        hasUpdates: newSkus.length > 0,
        newSkus,
        firstPageSkus,
        firstPageIds: productIds.slice(0, 12)
    };
}

async function getProductDetail(productId) {
    const url = `${BASE_URL}/index.php?action=product-detail&id=${productId}`;
    try {
        const html = await httpGet(url);
        
        const product = {
            sku: '',
            name: '',
            scale: '',
            marque: '',
            status: '',
            description: '',
            images: []
        };
        
        const itemNoMatch = html.match(/Item No\.<span[^>]*>([^<]+)<\/span>/i);
        if (itemNoMatch) product.sku = itemNoMatch[1].trim();
        
        const nameMatch = html.match(/<div class="pro-name"[^>]*>[^]*?<p>([^<]+)<\/p>/i);
        if (nameMatch) product.name = nameMatch[1].trim();
        
        const scaleMatch = html.match(/Scale<span[^>]*>([^<]+)<\/span>/i);
        if (scaleMatch) product.scale = scaleMatch[1].trim();
        
        const marqueMatch = html.match(/Marque<span[^>]*>([^<]+)<\/span>/i);
        if (marqueMatch) product.marque = marqueMatch[1].trim();
        
        const statusMatch = html.match(/Status<span[^>]*>([^<]+)<\/span>/i);
        if (statusMatch) product.status = statusMatch[1].trim();
        
        const hashRegex = /data-hash="(d\d+)"/g;
        let hashMatch;
        while ((hashMatch = hashRegex.exec(html)) !== null) {
            product.images.push(`https://minigt.tsm-models.com/pic.php?${hashMatch[1]}`);
        }
        
        return product;
    } catch (e) {
        console.log(`  商品 ${productId} 获取失败: ${e.message}`);
        return null;
    }
}

function downloadImage(url, productId, imageIndex) {
    return new Promise((resolve) => {
        if (!url) {
            resolve(null);
            return;
        }
        
        const client = url.startsWith('https') ? https : http;
        const ext = url.includes('.png') ? 'png' : 'jpg';
        const filepath = path.join(IMAGES_DIR, `${productId}_${imageIndex}.${ext}`);
        
        if (fs.existsSync(filepath)) {
            resolve(filepath);
            return;
        }
        
        const req = client.get(url, { headers: HEADERS, timeout: 30000 }, (res) => {
            const writeStream = fs.createWriteStream(filepath);
            res.pipe(writeStream);
            writeStream.on('finish', () => resolve(filepath));
        });
        
        req.on('error', (e) => {
            console.log(`  图片下载失败: ${e.message}`);
            resolve(null);
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeNewProducts(newProductIds) {
    const allProducts = [];
    const localSkus = getLocalSkus();
    
    for (const pid of newProductIds) {
        console.log(`\n📥 爬取商品 ${pid}...`);
        const product = await getProductDetail(pid);
        
        if (product) {
            if (localSkus.has(product.sku)) {
                console.log(`  -> ${product.sku} 已存在，跳过`);
                continue;
            }
            
            for (let i = 0; i < Math.min(product.images.length, 5); i++) {
                await downloadImage(product.images[i], pid, i);
            }
            
            allProducts.push(product);
            console.log(`  -> ${product.name || 'unknown'} (${product.sku || 'N/A'})`);
        }
        
        await delay(800);
    }
    
    return allProducts;
}

async function main() {
    console.log("🚀 MINI GT Scraper (优化版) 开始运行...\n");
    
    const { hasUpdates, newSkus, firstPageIds } = await checkForUpdates();
    
    if (!hasUpdates) {
        console.log("\n✅ 无新商品，跳过爬取");
        return;
    }
    
    console.log(`\n⚠️  发现 ${newSkus.length} 个新商品，开始爬取...\n`);
    
    const newProducts = await scrapeNewProducts(firstPageIds);
    
    if (newProducts.length === 0) {
        console.log("\n⚠️  没有新商品数据");
        return;
    }
    
    // 合并到现有���据
    let existingData = '[]';
    if (fs.existsSync(OUTPUT_FILE)) {
        existingData = fs.readFileSync(OUTPUT_FILE, 'utf8');
    }
    let existingProducts = JSON.parse(existingData);
    
    if (existingProducts.length > 0 && !existingProducts[0].sku) {
        existingProducts = existingProducts.map(p => ({
            sku: p.item_no || '',
            name: p.name || '',
            scale: p.scale || '',
            marque: p.marque || '',
            status: p.status || '',
            description: p.description || '',
            images: p.images || []
        }));
    }
    
    const existingSkus = new Set(existingProducts.map(p => p.sku).filter(Boolean));
    for (const p of newProducts) {
        if (!existingSkus.has(p.sku)) {
            existingProducts.push(p);
        }
    }
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existingProducts, null, 2), 'utf8');
    
    fs.writeFileSync(STATE_FILE, JSON.stringify({
        lastUpdate: new Date().toISOString(),
        totalProducts: existingProducts.length,
        newProducts: newProducts.length
    }), 'utf8');
    
    console.log(`\n✅ 完成！共 ${existingProducts.length} 个商品，新增 ${newProducts.length} 个`);
}

main().catch(console.error);