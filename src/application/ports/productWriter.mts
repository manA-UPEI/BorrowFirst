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
  replacePickupOptions(productId: number, windows: readonly PickupWindow[]): Promise<void>;
  replaceAvailability(productId: number, windows: readonly AvailabilityInput[]): Promise<void>;
}

export interface PickupWindow {
  readonly location: string;
  readonly startTime: string;
  readonly endTime: string;
}

export interface AvailabilityInput {
  readonly kind: 'available' | 'blackout';
  readonly startDate: string;
  readonly endDate: string;
}