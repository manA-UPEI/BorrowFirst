export interface HistoryQuery {
  expireStaleApprovals(): Promise<number>;
  listHistoryForUser(userId: number): Promise<readonly Record<string, unknown>[]>;
  listCurrentForUser(userId: number): Promise<readonly Record<string, unknown>[]>;
}