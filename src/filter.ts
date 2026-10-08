import type { Brand, CarModel } from "./types/index.ts";

// 同一官网 ID 可有不同地区版本；SKU 为空的未编号产品才使用 ID。
export function productKey(model: CarModel): string {
  return model.sku.trim().toUpperCase() || `id:${model.id}`;
}

export function filterModels(
  models: CarModel[],
  searchTerm: string,
  selectedBrand: string,
  brands: Brand[]
): CarModel[] {
  const query = searchTerm.trim().toLowerCase();
  const selectedKeys = new Set(brands.find(brand => brand.id === selectedBrand)?.productKeys);
  const searchKeys = new Set(brands
    .filter(brand => query && brand.name.toLowerCase().includes(query))
    .flatMap(brand => brand.productKeys));
  const seen = new Set<string>();
  return models.filter(model => {
    const key = productKey(model);
    if (seen.has(key)) return false;
    seen.add(key);
    return (!selectedBrand || selectedKeys.has(key)) &&
      (!query || model.sku.toLowerCase().includes(query) ||
        model.name.toLowerCase().includes(query) || searchKeys.has(key));
  });
}
