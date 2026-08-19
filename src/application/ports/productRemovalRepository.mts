export interface RemovableProduct {
  readonly lenderId: number;
  readonly borrowerId: number | null;
  readonly isActive: boolean;
}

export interface ProductImageRecord {
  readonly publicId: string;
}

export interface ProductRemovalRepository {
  findById(productId: number): Promise<RemovableProduct | null>;
  deactivate(productId: number): Promise<void>;
  listImages(productId: number): Promise<readonly ProductImageRecord[]>;
  clearImages(productId: number): Promise<void>;
}