#!/usr/bin/env node
/**
 * MINI GT Scraper - 爬取 minigt.tsm-models.com 商品数据
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

// 确保目录存在
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

function getProductIdsFromListPage(pageNum) {
    return new Promise(async (resolve) => {
        const url = `${LIST_URL}&p=${pageNum}`;
        try {
            const html = await httpGet(url);
            const productIds = [];
            
            // 找所有 product-detail 链接
            const regex = /action=product-detail&id=(\d+)/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
                const pid = match[1];
                if (!productIds.includes(pid)) {
                    productIds.push(pid);
                }
            }
            resolve(productIds);
        } catch (e) {
            console.log(`  第 ${pageNum} 页获取失败: ${e.message}`);
            resolve([]);
        }
    });
}

function getProductDetail(productId) {
    return new Promise(async (resolve) => {
        const url = `${BASE_URL}/index.php?action=product-detail&id=${productId}`;
        try {
            const html = await httpGet(url);
            
            const product = {
                id: productId,
                detail_url: url,
                name: '',
                item_no: '',
                scale: '',
                marque: '',
                status: '',
                description: '',
                images: []
            };
            
            // 名称 - 格式: <div class="pro-name"><p>NAME</p>
            const nameMatch = html.match(/<div class="pro-name"[^>]*>[^]*?<p>([^<]+)<\/p>/i);
            if (nameMatch) product.name = nameMatch[1].trim();
            
            // Item No - 格式: Item No.<span class="right-column">MGT01227</span>
            const itemNoMatch = html.match(/Item No\.<span[^>]*>([^<]+)<\/span>/i);
            if (itemNoMatch) product.item_no = itemNoMatch[1].trim();
            
            // Scale - 格式: Scale<span class="right-column">1:64</span>
            const scaleMatch = html.match(/Scale<span[^>]*>([^<]+)<\/span>/i);
            if (scaleMatch) product.scale = scaleMatch[1].trim();
            
            // Marque - 格式: Marque<span class="right-column">Mazda</span>
            const marqueMatch = html.match(/Marque<span[^>]*>([^<]+)<\/span>/i);
            if (marqueMatch) product.marque = marqueMatch[1].trim();
            
            // Status - 格式: Status<span class="right-column">Pre-Order</span>
            const statusMatch = html.match(/Status<span[^>]*>([^<]+)<\/span>/i);
            if (statusMatch) product.status = statusMatch[1].trim();
            
            // 图片 data-hash - 格式: data-hash="d9350"
            const hashRegex = /data-hash="(d\d+)"/g;
            const hashes = [];
            let hashMatch;
            while ((hashMatch = hashRegex.exec(html)) !== null) {
                hashes.push(hashMatch[1]);
            }
            // 生成图片 URL
            product.images = hashes.map(h => `https://minigt.tsm-models.com/pic.php?${h}`);
            
            resolve(product);
        } catch (e) {
            console.log(`  商品 ${productId} 获取失败: ${e.message}`);
            resolve(null);
        }
    });
}

function downloadImage(url, productId, imageIndex) {
    return new Promise((resolve) => {
        if (!url) {
            resolve(null);
            return;
        }
        
        const client = url.startsWith('https') ? https : http;
        
        const req = client.get(url, { headers: HEADERS, timeout: 30000 }, (res) => {
            let ext = 'jpg';
            if (url.includes('.png')) ext = 'png';
            else if (url.includes('.gif')) ext = 'gif';
            
            const filename = `${productId}_${imageIndex}.${ext}`;
            const filepath = path.join(IMAGES_DIR, filename);
            
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

async function scrapeAll(maxPages = 84) {
    const allProducts = [];
    
    for (let page = 0; page < maxPages; page++) {
        console.log(`\n=== 第 ${page + 1}/${maxPages} 页 ===`);
        
        const productIds = await getProductIdsFromListPage(page);
        
        if (!productIds || productIds.length === 0) {
            console.log(`  第 ${page} 页无数据，可能已结束`);
            break;
        }
        
        console.log(`  找到 ${productIds.length} 个商品`);
        
        for (const pid of productIds) {
            console.log(`  爬取商品 ${pid}...`);
            const product = await getProductDetail(pid);
            
            if (product) {
                // 下载图片 (最多5张)
                for (let i = 0; i < Math.min(product.images.length, 5); i++) {
                    const filepath = await downloadImage(product.images[i], pid, i);
                    if (filepath) {
                        product.images[i] = filepath;
                    }
                }
                
                allProducts.push(product);
                console.log(`    -> ${product.name || 'unknown'} (${product.item_no || 'N/A'})`);
            }
            
            await delay(800);  // 延迟，避免被封
        }
        
        await delay(1500);  // 页间延迟
    }
    
    return allProducts;
}

async function main() {
    console.log("MINI GT Scraper 开始运行...");
    console.log(`目标: ${LIST_URL}`);
    
    const products = await scrapeAll();
    
    // 保存 JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(products, null, 2), 'utf8');
    
    console.log(`\n完成！共爬取 ${products.length} 个商品`);
    console.log(`数据保存至: ${OUTPUT_FILE}`);
    console.log(`图片保存至: ${IMAGES_DIR}`);
}

main().catch(console.error);