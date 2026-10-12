import type { Brand, CarModel } from "./types/index.ts";

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
  if (!Array.isArray(products) || !products.every(product => product &&
    ["id", "sku", "name", "scale", "marque", "status"].every(field => typeof product[field as keyof CarModel] === "string") &&
    Array.isArray(product.images) && product.images.every(image => typeof image === "string"))) {
    throw new Error("车型数据格式异常，请稍后重试。");
  }
  if (!Array.isArray(brands) || !brands.every(brand => brand &&
    typeof brand.id === "string" && typeof brand.name === "string" &&
    Array.isArray(brand.productKeys) && brand.productKeys.every(key => typeof key === "string"))) {
    throw new Error("分类数据格式异常，请稍后重试。");
  }
  return { products, brands };
}
