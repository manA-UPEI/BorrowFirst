export interface RatingTarget {
  readonly id: number;
  readonly email: string;
}

export interface RatingWriter {
  findApprovedCounterparty(raterId: number, targetUserId: number): Promise<RatingTarget | null>;
  upsertRating(input: {
    userId: number;
    userEmail: string;
    raterId: number;
    rating: number;
  }): Promise<void>;
  getSummary(userId: number): Promise<Record<string, unknown> | null>;
  updateRatingStats(userId: number, count: number, average: number): Promise<void>;
}