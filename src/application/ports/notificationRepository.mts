export interface NotificationRepository {
  rejectPendingForProduct(productId: number): Promise<void>;
}