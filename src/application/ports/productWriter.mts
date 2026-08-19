export interface ProductImageAsset {
  readonly publicId: string;
  readonly url: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number;
  readonly mimeType: string;
}

export interface ProductWriter {
  createProduct(input: {
    name: string;
    lenderId: number;
    description: string;
    condition: string;
    price: number;
    imageUrl: string;
  }): Promise<number>;
  addProductImage(input: {
    productId: number;
    asset: ProductImageAsset;
    sortOrder: number;
    isCover: boolean;
  }): Promise<void>;
  updateCoverImage(productId: number, imageUrl: string): Promise<void>;
}