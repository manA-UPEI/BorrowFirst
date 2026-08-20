import type {
  ProductListQuery,
  ProductPage,
  ProductRepository
} from '../ports/productRepository.mjs';

export interface ListProducts {
  execute(query?: ProductListQuery): Promise<ProductPage>;
}

export function createListProducts(productRepository: ProductRepository): ListProducts {
  return {
    execute: (query) => productRepository.listActive(query)
  };
}
