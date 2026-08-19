import type { Product } from '../../domain/products/product.mjs';
import type { ProductRepository } from '../ports/productRepository.mjs';

export interface ListProducts {
  execute(): Promise<readonly Product[]>;
}

export function createListProducts(productRepository: ProductRepository): ListProducts {
  return {
    execute: () => productRepository.listActive()
  };
}