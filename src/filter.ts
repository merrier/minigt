import type { CarModel } from "./types/index.ts";

export function matchesBrand(
  model: CarModel,
  selectedBrand: string,
  brands: { name: string }[]
): boolean {
  if (!selectedBrand) return true;

  // KaidoHouse 是合作系列，车型名称通常只包含 Nissan、Datsun 等车厂名称。
  if (selectedBrand === "KAIDOHOUSE x MINI GT") {
    return /^KHMG/i.test(model.sku.trim()) || model.marque === selectedBrand;
  }

  const brandNames = brands.map((brand) => brand.name.toLowerCase());
  const words = model.name.split(" ");
  for (let i = 0; i < words.length; i++) {
    for (let j = i; j < words.length; j++) {
      const potentialBrand = words.slice(i, j + 1).join(" ").toLowerCase();
      if (brandNames.includes(potentialBrand)) {
        return potentialBrand === selectedBrand.toLowerCase();
      }
    }
  }
  return false;
}
