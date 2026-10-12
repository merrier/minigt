export interface CarModel {
  id: string;
  sku: string;
  name: string;
  scale: string;
  marque: string;
  status: string;
  images: string[];
  firstSeenAt?: string;
  sourceUrl?: string;
}

export interface SyncInfo {
  lastSuccessfulSync: string;
  startedAt: string;
  total: number;
  addedKeys: string[];
  imageCountChanges: { key: string; from: number; to: number }[];
}

export interface Brand {
  id: string;
  name: string;
  logo: string;
  productKeys: string[];
}
