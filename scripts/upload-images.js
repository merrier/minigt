#!/usr/bin/env node
/**
 * 上传图片到付费图床并更新products.json文件
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const REPO_ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(REPO_ROOT, 'products.json');

// 配置
const CONFIG = {
  // 付费图床配置
  superbed: {
    token: process.env.SUPERBED_TOKEN || '' // 从环境变量读取token
  },
  // 要测试的产品数量
  testProductCount: 5
};

// 读取产品数据
let products = [];
if (fs.existsSync(DATA_FILE)) {
  products = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`读取到 ${products.length} 个产品`);
} else {
  console.error('未找到products.json文件');
  process.exit(1);
}

// 上传图片到付费图床
async function uploadImage(imagePath) {
  try {
    if (!CONFIG.superbed.token) {
      return null;
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));
    formData.append('token', CONFIG.superbed.token);
    formData.append('categories', 'minigt'); // 指定相册为minigt

    const response = await axios.post('https://api.superbed.cn/upload', formData, {
      headers: {
        ...formData.getHeaders()
      }
    });

    if (response.data && response.data.err === 0) {
      return response.data.url;
    } else {
      console.error('上传失败:', response.data.msg);
      return null;
    }
  } catch (error) {
    console.error('上传图片失败:', error.message);
    return null;
  }
}

function normalizeLocalImageRef(imagePath) {
  return imagePath.replace(/^data\/images\//, 'images/');
}

function resolveLocalImagePath(imagePath) {
  const normalized = normalizeLocalImageRef(imagePath);
  const candidates = [
    path.join(REPO_ROOT, normalized),
    path.join(REPO_ROOT, imagePath)
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

// 处理单个产品的图片上传
async function processProduct(product) {
  const hasLocalImages = product.images.some(imagePath => !/^https?:\/\//.test(imagePath));
  if (!hasLocalImages) {
    return product;
  }

  console.log(`处理产品: ${product.sku} - ${product.name}`);

  const updatedImages = [];

  for (let i = 0;i < product.images.length;i++) {
    const imagePath = product.images[i];

    // 检查是否已经是远程URL
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      updatedImages.push(imagePath);
      continue;
    }

    const normalizedImagePath = normalizeLocalImageRef(imagePath);

    if (!CONFIG.superbed.token) {
      updatedImages.push(normalizedImagePath);
      continue;
    }

    // 转换为绝对路径
    const absoluteImagePath = resolveLocalImagePath(imagePath);

    if (fs.existsSync(absoluteImagePath)) {
      console.log(`上传图片: ${absoluteImagePath}`);
      const uploadedUrl = await uploadImage(absoluteImagePath);

      if (uploadedUrl) {
        updatedImages.push(uploadedUrl);
        console.log(`上传成功: ${uploadedUrl}`);
      } else {
        // 如果上传失败，保留原路径
        updatedImages.push(normalizedImagePath);
        console.log(`上传失败，保留原路径: ${normalizedImagePath}`);
      }

      // 随机延迟，避免请求过于频繁
      await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
    } else {
      console.log(`图片不存在: ${absoluteImagePath}`);
      updatedImages.push(normalizedImagePath);
    }
  }

  product.images = updatedImages;
  return product;
}

// 主函数
async function main() {
  console.log('=== 图片上传工具 ===');
  console.log('此工具将图片上传到付费图床并更新products.json文件');
  if (!CONFIG.superbed.token) {
    console.log('未设置 SUPERBED_TOKEN，将只规范化本地图片路径，跳过上传');
  }
  console.log('==================');

  // 处理所有产品
  const testProducts = products;
  console.log(`\n处理所有 ${testProducts.length} 个产品`);

  for (let i = 0;i < testProducts.length;i++) {
    await processProduct(testProducts[i]);
  }

  // 更新产品数据
  for (let i = 0;i < testProducts.length;i++) {
    const index = products.findIndex(p => p.sku === testProducts[i].sku);
    if (index !== -1) {
      products[index] = testProducts[i];
    }
  }

  // 保存更新后的数据
  console.log('\n开始保存更新后的数据...');
  fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
  console.log('数据保存成功！');
  console.log('\n数据更新完成');

  // 验证保存是否成功
  console.log('验证保存是否成功...');
  const updatedProducts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log('第一个产品的图片链接：', updatedProducts[0].images);
  console.log('\n提示：');
  console.log('1. Token 从环境变量 SUPERBED_TOKEN 读取');
  console.log('2. 上传速度取决于网络状况和付费图床限制');
  console.log('3. 若要上传所有产品图片，请将testProductCount设置为products.length');
  console.log('4. 付费图床支持JPG、PNG、GIF、WebP、PDF等格式的图片');
}

main();
