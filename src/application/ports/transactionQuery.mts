export interface TransactionQuery {
  expireStaleApprovals(): Promise<number>;
  ensureBorrowerPickupCodes(userId: number): Promise<number>;
  listCurrentForUser(userId: number): Promise<readonly Record<string, unknown>[]>;
}