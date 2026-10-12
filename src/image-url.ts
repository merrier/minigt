// Superbed 的动态缩略图仅用于列表；产品数据和下载仍保留原图 URL。
export function previewImageUrl(source: string, width: number): string {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return source;
  }
  if (
    !["pic1.imgdb.cn", "pic.imgdd.cc"].includes(url.hostname) ||
    !url.pathname.startsWith("/i/") ||
    url.search
  ) {
    return source;
  }
  url.searchParams.set("w", String(width));
  url.searchParams.set("fit", "contain");
  url.searchParams.set("fmt", "webp");
  url.searchParams.set("q", "85");
  return url.href;
}
