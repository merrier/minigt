#!/usr/bin/env python3
"""
MINI GT Scraper - 爬取 minigt.tsm-models.com 商品数据
"""

import os
import json
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

BASE_URL = "https://minigt.tsm-models.com"
LIST_URL = f"{BASE_URL}/index.php?action=product-list&b_id=13"
DATA_DIR = "/root/.openclaw/workspace/data"
OUTPUT_FILE = os.path.join(DATA_DIR, "minigt-products.json")
IMAGES_DIR = os.path.join(DATA_DIR, "images")

# 确保目录存在
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(IMAGES_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


def get_page(url, retries=3):
    """获取页面内容，带重试"""
    for i in range(retries):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            print(f"  获取失败 (尝试 {i+1}/{retries}): {e}")
            time.sleep(2)
    return None


def get_product_ids_from_list_page(page_num):
    """从列表页获取商品 ID 列表"""
    url = f"{LIST_URL}&p={page_num}"
    html = get_page(url)
    if not html:
        print(f"  第 {page_num} 页获取失败")
        return []
    
    soup = BeautifulSoup(html, 'html.parser')
    product_ids = []
    
    # 找所有商品详情链接
    for link in soup.find_all('a', href=True):
        href = link['href']
        if 'action=product-detail' in href and 'id=' in href:
            # 提取 id 参数
            for param in href.split('&'):
                if param.startswith('id='):
                    pid = param.replace('id=', '')
                    if pid not in product_ids:
                        product_ids.append(pid)
    
    return product_ids


def get_product_detail(product_id):
    """获取商品详情"""
    url = f"{BASE_URL}/index.php?action=product-detail&id={product_id}"
    html = get_page(url)
    if not html:
        return None
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # 提取基本信息
    product = {
        "id": product_id,
        "detail_url": url,
        "images": []
    }
    
    # 商品名称 - 通常在标题或 h1 中
    title = soup.find('h1') or soup.find('h2')
    if title:
        product["name"] = title.get_text(strip=True)
    
    # 尝试提取 Item No, Scale, Marque, Status 等信息
    # 常见的格式: <li>Item No.XXX</li> 或 <span>Item No.XXX</span>
    for li in soup.find_all(['li', 'span', 'div', 'td']):
        text = li.get_text(strip=True)
        if text.startswith("Item No."):
            product["item_no"] = text.replace("Item No.", "").strip()
        elif text.startswith("Scale"):
            product["scale"] = text.replace("Scale", "").strip()
        elif text.startswith("Marque"):
            product["marque"] = text.replace("Marque", "").strip()
        elif text.startswith("Status"):
            product["status"] = text.replace("Status", "").strip()
    
    # 提取图片
    # 图片可能在 img 标签中，或在特定的 div 中
    for img in soup.find_all('img'):
        src = img.get('src') or img.get('data-src')
        if src and ('pic.php' in src or 'product' in src or 'images' in src):
            # 补全完整 URL
            if src.startswith('//'):
                src = 'https:' + src
            elif src.startswith('/'):
                src = BASE_URL + src
            if src not in product["images"]:
                product["images"].append(src)
    
    # 也可能图片在 a 标签链接中
    for a in soup.find_all('a', href=True):
        href = a['href']
        if 'pic.php' in href or 'images' in href:
            if href.startswith('//'):
                href = 'https:' + href
            elif href.startswith('/'):
                href = BASE_URL + href
            if href not in product["images"]:
                product["images"].append(href)
    
    return product


def download_image(url, product_id, image_index):
    """下载图片"""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        
        # 确定文件扩展名
        ext = 'jpg'
        if '.' in url:
            ext = url.rsplit('.', 1)[-1][:4]
            if ext not in ['jpg', 'jpeg', 'png', 'gif']:
                ext = 'jpg'
        
        filename = f"{product_id}_{image_index}.{ext}"
        filepath = os.path.join(IMAGES_DIR, filename)
        
        with open(filepath, 'wb') as f:
            f.write(resp.content)
        
        return filepath
    except Exception as e:
        print(f"  图片下载失败: {e}")
        return None


def scrape_all(max_pages=84):
    """爬取所有商品"""
    all_products = []
    
    for page in range(max_pages):
        print(f"\n=== 第 {page + 1}/{max_pages} 页 ===")
        
        # 获取商品 ID 列表
        product_ids = get_product_ids_from_list_page(page)
        
        if not product_ids:
            print(f"  第 {page} 页无数据，可能已结束")
            break
        
        print(f"  找到 {len(product_ids)} 个商品")
        
        # 获取每个商品详情
        for pid in product_ids:
            print(f"  爬取商品 {pid}...")
            product = get_product_detail(pid)
            
            if product:
                # 下载图片
                for i, img_url in enumerate(product.get("images", [])[:5]):  # 最多5张图
                    filepath = download_image(img_url, pid, i)
                    if filepath:
                        product["images"][i] = filepath
                
                all_products.append(product)
                print(f"    -> {product.get('name', 'unknown')} ({product.get('item_no', 'N/A')})")
            
            # 延迟，避免被封
            time.sleep(1)
        
        # 页间延迟
        time.sleep(2)
    
    return all_products


def main():
    print("MINI GT Scraper 开始运行...")
    print(f"目标: {LIST_URL}")
    
    products = scrape_all()
    
    # 保存 JSON
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
    
    print(f"\n完成！共爬取 {len(products)} 个商品")
    print(f"数据保存至: {OUTPUT_FILE}")
    print(f"图片保存至: {IMAGES_DIR}")


if __name__ == "__main__":
    main()