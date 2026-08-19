export interface PickupProductRepository {
  existsActive(productId: number): Promise<boolean | null>;
  ensureOptions(productId: number): Promise<void>;
  listOptions(productId: number): Promise<readonly Record<string, unknown>[]>;
}