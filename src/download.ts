export async function fetchImageBlob(imageUrl: string): Promise<Blob> {
  // 预览图片的非 CORS 缓存可能无法用于跨域下载。
  const response = await fetch(imageUrl, {
    mode: "cors",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`图片请求失败（HTTP ${response.status}）`);
  }
  return response.blob();
}
