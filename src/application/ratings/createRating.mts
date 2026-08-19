import type { RatingWriter } from '../ports/ratingWriter.mjs';

export class RatingError extends Error {
  constructor(public readonly statusCode: 400 | 403, message: string) {
    super(message);
    this.name = 'RatingError';
  }
}

export function createRatingUseCase(ratings: RatingWriter) {
  return {
    async execute(raterId: number, targetInput: unknown, ratingInput: unknown): Promise<void> {
      const targetUserId = Number(targetInput);
      const rating = Number(ratingInput);

      if (!Number.isInteger(targetUserId) || targetUserId === raterId) {
        throw new RatingError(400, 'Invalid user to rate');
      }

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new RatingError(400, 'Rating must be between 1 and 5');
      }

      const target = await ratings.findApprovedCounterparty(raterId, targetUserId);

      if (!target) {
        throw new RatingError(403, 'User is not eligible for rating');
      }

      await ratings.upsertRating({
        userId: targetUserId,
        userEmail: target.email,
        raterId,
        rating
      });

      const summary = await ratings.getSummary(targetUserId);
      await ratings.updateRatingStats(
        targetUserId,
        summary ? Number(summary.count) || 0 : 0,
        summary ? Number(summary.average) || 0 : 0
      );
    }
  };
}