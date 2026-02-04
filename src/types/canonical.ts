// fas-sanity/src/types/canonical.ts

export type Dimensions = {
  length: number;
  width: number;
  height: number;
  unit: 'in' | 'cm';
};

export type Weight = {
  value: number;
  unit: 'lb' | 'oz' | 'kg' | 'g';
};

export type CrossRerenceIds = {
  sanityId?: string;
  medusaId?: string;
  externalIds?: { [key: string]: string };
};

export type ProductOption = {
  name: string;
  values: string[];
};

export type ProductVariant = CrossRerenceIds & {
  sku: string;
  title: string;
  price_cents: number;
  inventory_quantity: number;
  allow_backorder: boolean;
  manage_inventory: boolean;
  weight?: Weight;
  dimensions?: Dimensions;
  requires_shipping: boolean;
  options: {
    [key: string]: string;
  };
};

export type Product = CrossRerenceIds & {
  title: string;
  slug: string;
  description: string;
  images: string[];
  options: ProductOption[];
  variants: ProductVariant[];
  status: 'active' | 'draft' | 'archived';
  tags: string[];
  type: 'physical' | 'service' | 'bundle';
};