import { createRequire } from 'node:module';
import type { RatingWriter } from '../../application/ports/ratingWriter.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const ratingModel = loadLegacyModule('../../../../server/models/ratingModel') as Record<string, any>;
const notificationModel = loadLegacyModule('../../../../server/models/notificationModel') as Record<string, any>;
const userModel = loadLegacyModule('../../../../server/models/userModel') as Record<string, any>;

export function createLegacyRatingWriter(): RatingWriter {
  return {
    async findApprovedCounterparty(raterId, targetUserId) {
      const target = await notificationModel.findApprovedCounterparty(raterId, targetUserId);
      return target ? { id: Number(target.id), email: String(target.email || '') } : null;
    },
    async upsertRating(input) {
      await ratingModel.upsertRating(input);
    },
    getSummary: ratingModel.getSummary,
    updateRatingStats: userModel.updateRatingStats
  };
}