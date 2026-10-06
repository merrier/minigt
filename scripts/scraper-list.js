import * as cheerio from 'cheerio';

// 跟随官网分页链接，按产品 ID 去重（同一产品的链接可能带有不同 b_id）。
export async function* crawlProductLists(listUrl, fetchPage) {
  const pages = new Set([listUrl]);
  const root = new URL(listUrl);
  // 总列表深页会触发官网数据库错误；空关键词搜索覆盖同一完整目录，且分页正常。
  const searchUrl = new URL('/index.php?action=product-search&keywords=', root).href;
  const useSearch = root.searchParams.get('action') === 'product-list' && !root.searchParams.get('b_id');
  if (useSearch) pages.add(searchUrl);
  const seenProducts = new Set();
  for (const pageUrl of pages) {
    const html = await fetchPage(pageUrl);
    if (!html) throw new Error(`获取列表失败: ${pageUrl}`);
    const $ = cheerio.load(html);
    const links = $('.pd-list a[href*="product-detail"]');
    if (!links.length) throw new Error(`列表没有产品链接: ${pageUrl}`);
    const productLinks = [];
    links.each((i, el) => {
      const url = new URL($(el).attr('href'), pageUrl);
      const id = url.searchParams.get('id');
      if (id && !seenProducts.has(id)) {
        seenProducts.add(id);
        productLinks.push(`${url.origin}/index.php?action=product-detail&id=${id}`);
      }
    });
    // 官网末页仍会生成 next 链接，只遍历明确列出的页码。
    const navigation = useSearch && pageUrl === listUrl
      ? $([])
      : $('.cdp a[href]').filter((i, el) => /^\d+$/.test($(el).text().trim()));
    navigation.each((i, el) => {
      const url = new URL($(el).attr('href'), pageUrl);
      // 官网会生成 b_id= 空值链接，但实际请求会返回空列表；无分类时必须省略它。
      if (url.searchParams.get('b_id') === '') url.searchParams.delete('b_id');
      if (url.origin === root.origin &&
          url.searchParams.get('action') === new URL(pageUrl).searchParams.get('action') &&
          Number(url.searchParams.get('p')) > 1) {
        pages.add(url.href);
      }
    });
    yield { pageUrl, productLinks };
  }
}
