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

// 上传图片到付费图床
export async function uploadImage(imagePath) {
  const token = (process.env.SUPERBED_TOKEN || '').trim();
  if (!token || token === 'YOUR_TOKEN_HERE') {
    throw new Error('请设置环境变量 SUPERBED_TOKEN');
  }

  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));
    formData.append('token', token); // 兼容接口实测仅表单认证可用，Header 方式返回 Missing API key。
    formData.append('categories', 'minigt'); // 指定相册为minigt

    const response = await axios.post('https://api.superbed.cn/upload', formData, {
      timeout: 60000,
      headers: {
        ...formData.getHeaders()
      }
    });

    if (response.data?.err === 0 && /^https?:\/\//.test(response.data.url || '')) {
      return response.data.url;
    } else {
      throw new Error(response.data?.msg || '响应缺少有效图片 URL');
    }
  } catch (error) {
    const status = error.response?.status;
    const reason = error.response?.data?.detail || error.response?.data?.msg || error.message;
    const message = (typeof reason === 'string' ? reason : error.message).replaceAll(token, '[REDACTED]');
    throw new Error(`上传失败${status ? `（HTTP ${status}）` : ''}: ${message}`);
  }
}

// 处理单个产品的图片上传
async function processProduct(product) {
  console.log(`处理产品: ${product.sku} - ${product.name}`);

  for (let i = 0;i < product.images.length;i++) {
    const imagePath = product.images[i];

    // 检查是否已经是远程URL
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      console.log(`图片已上传，跳过: ${imagePath}`);
      continue;
    }

    // 转换为绝对路径
    const absoluteImagePath = path.resolve(__dirname, '..', imagePath);

    if (fs.existsSync(absoluteImagePath)) {
      console.log(`上传图片: ${absoluteImagePath}`);
      const uploadedUrl = await uploadImage(absoluteImagePath);

      product.images[i] = uploadedUrl;
      console.log(`上传成功: ${uploadedUrl}`);

      // 随机延迟，避免请求过于频繁
      await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
    } else {
      throw new Error(`图片不存在: ${absoluteImagePath}`);
    }
  }

  return product;
}

// 主函数
async function main() {
  const products = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`读取到 ${products.length} 个产品`);
  console.log('=== 图片上传工具 ===');
  console.log('此工具将图片上传到付费图床并更新products.json文件');
  console.log('==================');

  // 处理所有产品
  const testProducts = products;
  console.log(`\n处理所有 ${testProducts.length} 个产品`);

  try {
    for (let i = 0;i < testProducts.length;i++) {
      await processProduct(testProducts[i]);
    }
  } finally {
    // 失败时仍保存已成功上传的链接，未上传图片保留原路径，便于重跑。
    fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
  }

  console.log('数据保存成功！');
  console.log('\n数据更新完成');

  // 验证保存是否成功
  console.log('验证保存是否成功...');
  const updatedProducts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log('第一个产品的图片链接：', updatedProducts[0].images);
  console.log('\n提示：');
  console.log('1. Token 从环境变量 SUPERBED_TOKEN 读取');
  console.log('2. 上传速度取决于网络状况和付费图床限制');
  console.log('3. 付费图床支持JPG、PNG、GIF、WebP、PDF等格式的图片');
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && __filename === fs.realpathSync(process.argv[1])) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
