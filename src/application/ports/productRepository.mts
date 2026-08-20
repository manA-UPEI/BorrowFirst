import type { Product } from '../../domain/products/product.mjs';

export type ProductSort = 'newest' | 'price_asc' | 'price_desc';

export interface ProductListQuery {
  readonly limit?: number;
  readonly cursor?: string | null;
  readonly search?: string;
  readonly condition?: string;
  readonly maxPrice?: number | null;
  readonly sort?: ProductSort;
}

export interface ProductPage {
  readonly items: readonly Product[];
  /** Opaque; pass back as `cursor` to fetch the next page. Null on the last page. */
  readonly nextCursor: string | null;
}

export interface ProductRepository {
  listActive(query?: ProductListQuery): Promise<ProductPage>;
}
