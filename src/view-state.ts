import type { CarModel } from "./types/index.ts";

export interface ViewState {
  q: string;
  category: string;
  sort: "sku" | "name" | "recent";
  order: "asc" | "desc";
  page: number;
}

export function readView(search: string): ViewState {
  const params = new URLSearchParams(search);
  const sort = params.get("sort");
  const page = Number(params.get("page"));
  return {
    q: params.get("q") || "",
    category: params.get("category") || "",
    sort: sort === "name" || sort === "recent" ? sort : "sku",
    order: params.get("order") === "desc" ? "desc" : "asc",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function viewUrl(href: string, view: ViewState): string {
  const url = new URL(href);
  for (const field of ["q", "category", "sort", "order", "page"] as const) {
    url.searchParams.delete(field);
    const value = view[field];
    if (
      value !== "" &&
      !(field === "sort" && value === "sku") &&
      !(field === "order" && value === "asc") &&
      !(field === "page" && value === 1)
    ) {
      url.searchParams.set(field, String(value));
    }
  }
  return url.href;
}

export function sortModels(
  models: CarModel[],
  sort: ViewState["sort"],
  order: ViewState["order"],
) {
  return [...models].sort((a, b) => {
    if (sort === "recent") {
      // 历史目录没有可靠收录日期，始终排在有记录的车型之后。
      if (!a.firstSeenAt !== !b.firstSeenAt) return a.firstSeenAt ? -1 : 1;
      const difference = (a.firstSeenAt || "").localeCompare(
        b.firstSeenAt || "",
      );
      if (difference) return order === "asc" ? difference : -difference;
    }
    const difference = (sort === "name" ? a.name : a.sku).localeCompare(
      sort === "name" ? b.name : b.sku,
    );
    return order === "asc" ? difference : -difference;
  });
}
