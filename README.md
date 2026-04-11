# MINI GT Scraper

MINI GT 产品数据爬虫，支持从 minigt.tsm-models.com 抓取商品信息和图片。

## 功能

- 爬取商品详情（名称、SKU、比例、品牌、状态）
- 自动下载商品图片到本地
- 增量更新（跳过已存在的商品）
- 定时任务支持

## 安装

```bash
npm install
```

或使用 Python：

```bash
pip install -r requirements.txt
```

## 使用方法

### Node.js 版本

```bash
# 扫描 ID 范围（默认 9000-9400）
node scraper-scan.js

# 或指定范围
node scraper-scan.js 9000 10000
```

### Python 版本

```bash
python minigt-scraper.py
```

## 定时任务

编辑 crontab：

```bash
crontab -e
```

添加定时任务（每天早上 9 点运行）：

```
0 9 * * * cd /path/to/minigt && node scraper-scan.js >> scraper.log 2>&1
```

## 数据说明

- `data/minigt-products.json` - 商品数据（JSON 格式）
- `data/images/` - 下载的图片

## 商品数据字段

```json
{
  "id": "9350",
  "sku": "MGT01227",
  "name": "Mazda AZ-1 Liberty Walk",
  "scale": "1:64",
  "marque": "Mazda",
  "status": "In Stock",
  "images": [
    "data/images/9350_0.jpg",
    "data/images/9350_1.jpg"
  ]
}
```

## 注意事项

- 网站有 WAF 防护，建议在本地网络环境运行
- 爬取频率不要太高，避免被封禁
- 图片已缓存，不会重复下载
