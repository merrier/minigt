#!/usr/bin/env node
/**
 * MINI GT Scraper - 已修复版
 * 1. 全量爬取并下载图片
 * 2. 保存完整信息
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

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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

// 获取所有商品 ID
async function getAllProductIds() {
    const allIds = [];
    for (let page = 0; page < 84; page++) {
        console.log(`获取第 ${page + 1} 页...`);
        try {
            const html = await httpGet(`${LIST_URL}&p=${page}`);
            const regex = /action=product-detail&id=(\d+)/g;
            const ids = [];
            let match;
            while ((match = regex.exec(html)) !== null) {
                if (!allIds.includes(match[1])) allIds.push(match[1]);
            }
            if (!ids.length) break;
        } catch (e) {
            console.log(`  页 ${page} 失败: ${e.message}`);
        }
    }
    return allIds;
}

// 获取商品详情
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
            product.images.push(`${BASE_URL}/pic.php?${hashMatch[1]}`);
        }
        
        return product;
    } catch (e) {
        console.log(`  商品 ${productId} 获取失败: ${e.message}`);
        return null;
    }
}

// 下载图片
async function downloadImage(url, filepath) {
    if (!url || fs.existsSync(filepath)) return;
    
    return new Promise(resolve => {
        https.get(url, res => {
            const ws = fs.createWriteStream(filepath);
            res.pipe(ws);
            ws.on('finish', () => resolve());
        }).on('error', () => resolve());
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("🚀 MINI GT Scraper 开始...\n");
    
    // 1. 获取所有商品 ID
    const productIds = await getAllProductIds();
    console.log(`\n共 ${productIds.length} 个商品\n`);
    
    const products = [];
    
    // 2. 爬取每个商品
    for (let i = 0; i < productIds.length; i++) {
        const pid = productIds[i];
        console.log(`[${i + 1}/${productIds.length}] 爬取 ${pid}...`);
        
        const product = await getProductDetail(pid);
        
        if (product) {
            // 3. 下载图片
            for (let j = 0; j < Math.min(product.images.length, 5); j++) {
                const ext = product.images[j].includes('.png') ? '.png' : '.jpg';
                const filepath = path.join(IMAGES_DIR, `${pid}_${j}.${ext}`);
                await downloadImage(product.images[j], filepath);
            }
            
            products.push(product);
            console.log(`  -> ${product.name} (${product.sku})`);
        }
        
        await delay(500);
    }
    
    // 4. 保存 JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(products, null, 2), 'utf8');
    
    console.log(`\n✅ 完成！共 ${products.length} 个商品`);
    console.log(`📄 保存至: ${OUTPUT_FILE}`);
    console.log(`🖼️  图片保存至: ${IMAGES_DIR}`);
}

main().catch(console.error);