export type ProductId = number;

export interface Product {
  readonly id: ProductId;
  readonly name: string;
  readonly lenderId: number;
  readonly borrowerId: number | null;
  readonly isActive: boolean;
  readonly description: string;
  readonly condition: string;
  readonly imageUrl: string;
  readonly lendingCharge: number;
  readonly imageCount: number;
  readonly currentTransactionStatus: string;
}

export function isAvailableProduct(product: Product): boolean {
  return product.isActive && product.borrowerId === null;
}