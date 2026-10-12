import type { Brand, CarModel, SyncInfo } from "./types/index.ts";

export async function loadCatalog(baseUrl: string, signal: AbortSignal) {
  async function loadFile(file: string, label: string) {
    try {
      const response = await fetch(`${baseUrl}${file}`, {
        cache: "no-cache",
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch {
      throw new Error(`${label}加载失败，请检查网络后重试。`);
    }
  }

  const [products, brands]: [CarModel[], Brand[]] = await Promise.all([
    loadFile("products.json", "车型数据"),
    loadFile("product-brands.json", "分类数据"),
  ]);
  if (
    !Array.isArray(products) ||
    !products.every(
      (product) =>
        product &&
        ["id", "sku", "name", "scale", "marque", "status"].every(
          (field) => typeof product[field as keyof CarModel] === "string",
        ) &&
        Array.isArray(product.images) &&
        product.images.every((image) => typeof image === "string") &&
        (product.firstSeenAt === undefined ||
          (typeof product.firstSeenAt === "string" &&
            Number.isFinite(Date.parse(product.firstSeenAt)))) &&
        (product.sourceUrl === undefined ||
          product.sourceUrl ===
            `https://minigt.tsm-models.com/index.php?action=product-detail&id=${product.id}`),
    )
  ) {
    throw new Error("车型数据格式异常，请稍后重试。");
  }
  if (
    !Array.isArray(brands) ||
    !brands.every(
      (brand) =>
        brand &&
        typeof brand.id === "string" &&
        typeof brand.name === "string" &&
        Array.isArray(brand.productKeys) &&
        brand.productKeys.every((key) => typeof key === "string"),
    )
  ) {
    throw new Error("分类数据格式异常，请稍后重试。");
  }
  return { products, brands };
}

// 更新日志是附加信息；失败时不阻止车型浏览，也不显示过期的成功时间。
export async function loadSyncInfo(
  baseUrl: string,
  signal: AbortSignal,
): Promise<SyncInfo | null> {
  try {
    const response = await fetch(`${baseUrl}sync-info.json`, {
      cache: "no-cache",
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!response.ok) return null;
    const info = await response.json();
    if (
      !info ||
      !Number.isFinite(Date.parse(info.lastSuccessfulSync)) ||
      !Array.isArray(info.addedKeys) ||
      !info.addedKeys.every((key: unknown) => typeof key === "string") ||
      !Array.isArray(info.imageCountChanges) ||
      !info.imageCountChanges.every(
        (item: SyncInfo["imageCountChanges"][number]) =>
          item &&
          typeof item.key === "string" &&
          Number.isInteger(item.from) &&
          item.from >= 0 &&
          Number.isInteger(item.to) &&
          item.to > 0,
      )
    )
      return null;
    return info;
  } catch {
    return null;
  }
}
