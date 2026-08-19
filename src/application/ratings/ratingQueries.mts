import type { RatingQuery } from '../ports/ratingQuery.mjs';

export function createEligibleRatingsUseCase(query: RatingQuery) {
  return {
    execute: (userId: number) => query.listEligibleUsers(userId)
  };
}

export function createMyRatingsUseCase(query: RatingQuery) {
  return {
    async execute(userId: number) {
      const [summary, ratings] = await Promise.all([
        query.getSummary(userId),
        query.listRecentRatings(userId)
      ]);

      return {
        count: summary ? Number(summary.count) || 0 : 0,
        average: summary && summary.average ? Number(summary.average) : 0,
        ratings
      };
    }
  };
}