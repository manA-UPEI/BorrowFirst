import type {
  ProductDetailsImage,
  ProductDetailsRecord,
  ProductDetailsRepository
} from '../ports/productDetailsRepository.mjs';

export class ProductDetailsError extends Error {
  constructor(public readonly statusCode: 400 | 404, message: string) {
    super(message);
    this.name = 'ProductDetailsError';
  }
}

export interface ProductDetailsResult extends ProductDetailsRecord {
  readonly images: readonly ProductDetailsImage[];
  readonly viewerIsLender: boolean;
  readonly viewerIsBorrower: boolean;
  readonly viewerCanRequest: boolean;
}

export function createGetProductDetailsUseCase(repository: ProductDetailsRepository) {
  return {
    async execute(productId: number, viewerId: number): Promise<ProductDetailsResult> {
      if (!Number.isInteger(productId) || productId <= 0) {
        throw new ProductDetailsError(400, 'Invalid product');
      }

      const product = await repository.findById(productId);

      if (!product) {
        throw new ProductDetailsError(404, 'Product not found');
      }

      const storedImages = await repository.listImages(productId);
      const images = storedImages.length ? storedImages : [{
        id: 0,
        url: product.imageUrl,
        sortOrder: 0,
        isCover: true
      }];
      const viewerIsLender = product.lenderId === viewerId;
      const viewerIsBorrower = product.borrowerId === viewerId;

      return {
        ...product,
        images,
        viewerIsLender,
        viewerIsBorrower,
        viewerCanRequest: product.isActive && !viewerIsLender && product.borrowerId === null
      };
    }
  };
}