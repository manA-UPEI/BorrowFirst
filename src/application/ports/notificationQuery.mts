export interface NotificationQuery {
  expireStaleApprovals(): Promise<number>;
  listForLender(userId: number): Promise<readonly Record<string, unknown>[]>;
}