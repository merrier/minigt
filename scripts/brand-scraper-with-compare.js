import cheerio from 'cheerio';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const url = 'https://minigt.tsm-models.com/index.php?action=product';
const dataDir = path.join(__dirname, '..', 'data');
const brandsDir = path.join(dataDir, 'brands');
const brandsJsonPath = path.join(dataDir, 'product-brands.json');

// 创建 data 和 brands 目录
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(brandsDir)) {
  fs.mkdirSync(brandsDir, { recursive: true });
}

async function scrapeBrands() {
  try {
    // 获取网页内容
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    // 提取品牌信息
    const newBrands = [];
    
    // 直接从 pd-list-a 中提取品牌信息
    $('.pd-list-a > a').each((index, element) => {
      // 获取链接和图片
      const brandLink = $(element).attr('href');
      const logoUrl = $(element).find('img').attr('src');
      
      if (brandLink && logoUrl) {
        // 从链接中提取 b_id
        const bIdMatch = brandLink.match(/b_id=(\d+)/);
        if (bIdMatch) {
          const bId = bIdMatch[1];
          
          // 从左侧菜单中查找对应的品牌名称
          let brandName = '';
          $('.cat-wrap .sec-open-arrow a').each((i, el) => {
            const link = $(el).attr('href');
            if (link && link.includes(`b_id=${bId}`)) {
              brandName = $(el).text().trim();
            }
          });
          
          if (brandName) {
            // 确保 logoUrl 是完整的 URL
            const fullLogoUrl = logoUrl.startsWith('http') ? logoUrl : `https://minigt.tsm-models.com/${logoUrl.replace(/^\//, '')}`;
            newBrands.push({
              name: brandName,
              logo: fullLogoUrl
            });
          }
        }
      }
    });
    
    // 读取现有品牌信息
    let existingBrands = [];
    if (fs.existsSync(brandsJsonPath)) {
      try {
        existingBrands = JSON.parse(fs.readFileSync(brandsJsonPath, 'utf8'));
      } catch (error) {
        console.error('Error reading existing brands:', error);
      }
    }
    
    // 提取现有品牌名称列表
    const existingBrandNames = new Set(existingBrands.map(brand => brand.name));
    
    // 找出新增的品牌
    const addedBrands = newBrands.filter(brand => !existingBrandNames.has(brand.name));
    
    if (addedBrands.length === 0) {
      console.log('No new brands found');
      return;
    }
    
    console.log(`Found ${addedBrands.length} new brands`);
    
    // 下载新增品牌的 logo 图片
    for (const brand of addedBrands) {
      try {
        // 生成 logo 文件名
        const logoFileName = `${brand.name.replace(/\s+/g, '-').toLowerCase()}.png`;
        const logoPath = path.join(brandsDir, logoFileName);
        
        // 下载真实的 logo 图片
        const logoResponse = await axios.get(brand.logo, { responseType: 'arraybuffer' });
        fs.writeFileSync(logoPath, logoResponse.data);
        console.log(`Downloaded logo for ${brand.name} to ${logoPath}`);
        
        // 更新品牌信息中的 logo 路径为本地路径
        brand.logo = `./brands/${logoFileName}`;
      } catch (error) {
        console.error(`Failed to download logo for ${brand.name}:`, error.message);
        // 如果下载失败，使用占位符路径
        const logoFileName = `${brand.name.replace(/\s+/g, '-').toLowerCase()}.png`;
        brand.logo = `./brands/${logoFileName}`;
      }
    }
    
    // 合并现有品牌和新增品牌
    const allBrands = [...existingBrands, ...addedBrands];
    
    // 保存品牌信息到 JSON 文件
    fs.writeFileSync(brandsJsonPath, JSON.stringify(allBrands, null, 2));
    console.log(`Updated brand information saved to ${brandsJsonPath}`);
    console.log(`Total brands: ${allBrands.length}`);
    
  } catch (error) {
    console.error('Error scraping brands:', error);
  }
}

scrapeBrands();
