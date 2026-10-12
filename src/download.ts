import type { CarModel } from "./types/index.ts";

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
export function modelFilename(model: Pick<CarModel, "sku" | "id">): string {
  return (model.sku || `id-${model.id}`).replace(/[^a-z0-9_-]/gi, "_");
}

export function imageFilename(
  model: Pick<CarModel, "sku" | "id">,
  index: number,
  type: string,
): string {
  const extension =
    (
      {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif",
        "image/svg+xml": "svg",
      } as Record<string, string>
    )[type.split(";")[0]] || "img";
  return `${modelFilename(model)}_${String(index + 1).padStart(2, "0")}.${extension}`;
}

export async function createModelZip(
  model: CarModel,
  onProgress: (current: number) => void,
): Promise<Blob> {
  const { zipSync } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  for (const [index, url] of model.images.entries()) {
    const blob = await fetchImageBlob(url);
    files[imageFilename(model, index, blob.type)] = new Uint8Array(
      await blob.arrayBuffer(),
    );
    onProgress(index + 1);
  }
  // 图片已经压缩，ZIP 只打包，避免再压缩阻塞页面。
  return new Blob([new Uint8Array(zipSync(files, { level: 0 }))], {
    type: "application/zip",
  });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
