export interface RatingQuery {
  listEligibleUsers(userId: number): Promise<readonly Record<string, unknown>[]>;
  getSummary(userId: number): Promise<Record<string, unknown> | null>;
  listRecentRatings(userId: number): Promise<readonly Record<string, unknown>[]>;
}