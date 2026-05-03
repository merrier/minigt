#!/usr/bin/env node
/**
 * 上传图片到付费图床并更新products.json文件
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '..', 'data', 'products.json');
const IMAGES_DIR = path.join(__dirname, '..', 'data', 'images');

// 配置
const CONFIG = {
  // 付费图床配置
  superbed: {
    token: process.env.SUPERBED_TOKEN || 'YOUR_TOKEN_HERE' // 从环境变量读取token
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
    // 检查token是否设置
    if (CONFIG.superbed.token === 'YOUR_TOKEN_HERE') {
      console.error('请设置环境变量 SUPERBED_TOKEN 来存储你的token');
      console.error('设置方法:');
      console.error('  在终端中运行: export SUPERBED_TOKEN=YOUR_TOKEN_HERE');
      console.error('  或在 ~/.bashrc 或 ~/.zshrc 中添加该环境变量');
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

// 处理单个产品的图片上传
async function processProduct(product) {
  console.log(`处理产品: ${product.sku} - ${product.name}`);

  const updatedImages = [];

  for (let i = 0;i < product.images.length;i++) {
    const imagePath = product.images[i];

    // 检查是否已经是远程URL
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      console.log(`图片已上传，跳过: ${imagePath}`);
      updatedImages.push(imagePath);
      continue;
    }

    // 转换为绝对路径
    const absoluteImagePath = path.resolve(__dirname, '..', imagePath);

    if (fs.existsSync(absoluteImagePath)) {
      console.log(`上传图片: ${absoluteImagePath}`);
      const uploadedUrl = await uploadImage(absoluteImagePath);

      if (uploadedUrl) {
        updatedImages.push(uploadedUrl);
        console.log(`上传成功: ${uploadedUrl}`);
      } else {
        // 如果上传失败，保留原路径
        updatedImages.push(imagePath);
        console.log(`上传失败，保留原路径: ${imagePath}`);
      }

      // 随机延迟，避免请求过于频繁
      await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
    } else {
      console.log(`图片不存在: ${absoluteImagePath}`);
      updatedImages.push(imagePath);
    }
  }

  product.images = updatedImages;
  return product;
}

// 主函数
async function main() {
  console.log('=== 图片上传工具 ===');
  console.log('此工具将图片上传到付费图床并更新products.json文件');
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
