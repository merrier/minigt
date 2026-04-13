#!/usr/bin/env node
/**
 * 测试文件写入功能
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'products.json');

// 读取产品数据
let products = [];
if (fs.existsSync(DATA_FILE)) {
  products = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`读取到 ${products.length} 个产品`);
} else {
  console.error('未找到products.json文件');
  process.exit(1);
}

// 修改第一个产品的图片链接
if (products.length > 0) {
  console.log('修改第一个产品的图片链接为本地路径...');
  products[0].images = [
    'data/images/MGT01227/1.JPG',
    'data/images/MGT01227/2.JPG',
    'data/images/MGT01227/3.JPG'
  ];
  
  // 保存修改后的数据
  console.log('保存修改后的数据...');
  fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
  console.log('数据保存成功！');
  
  // 重新读取文件，验证修改是否生效
  console.log('验证修改是否生效...');
  const updatedProducts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log('第一个产品的图片链接：', updatedProducts[0].images);
} else {
  console.error('没有产品数据');
  process.exit(1);
}
