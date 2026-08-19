export interface ProductDetailsRecord {
  readonly id: number;
  readonly name: string;
  readonly lenderId: number;
  readonly borrowerId: number | null;
  readonly isActive: boolean;
  readonly currentTransactionStatus: string;
  readonly description: string;
  readonly condition: string;
  readonly imageUrl: string;
  readonly lendingCharge: number;
}

export interface ProductDetailsImage {
  readonly id: number;
  readonly url: string;
  readonly sortOrder: number;
  readonly isCover: boolean;
}

export interface ProductDetailsRepository {
  findById(productId: number): Promise<ProductDetailsRecord | null>;
  listImages(productId: number): Promise<readonly ProductDetailsImage[]>;
}