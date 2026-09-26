export async function fetchImageBlob(imageUrl: string): Promise<Blob> {
  const response = await fetch(imageUrl, {
    mode: "cors",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`图片请求失败（HTTP ${response.status}）`);
  }
  if (!response.headers.get("content-type")?.startsWith("image/")) {
    throw new Error("下载服务未返回图片");
  }
  return response.blob();
}
