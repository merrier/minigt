export interface CarModel {
  id: string;
  sku: string;
  name: string;
  scale: string;
  marque: string;
  status: string;
  images: string[];
}

export interface Brand {
  id: string;
  name: string;
  logo: string;
  productKeys: string[];
}
