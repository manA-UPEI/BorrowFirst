import type { Product } from '../../domain/products/product.mjs';

export interface ProductRepository {
  listActive(): Promise<readonly Product[]>;
}