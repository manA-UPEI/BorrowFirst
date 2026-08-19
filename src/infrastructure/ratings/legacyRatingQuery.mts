import { createRequire } from 'node:module';
import type { RatingQuery } from '../../application/ports/ratingQuery.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const ratingModel = loadLegacyModule('../../../../server/models/ratingModel') as Record<string, any>;
const notificationModel = loadLegacyModule('../../../../server/models/notificationModel') as Record<string, any>;

export function createLegacyRatingQuery(): RatingQuery {
  return {
    async listEligibleUsers(userId) {
      const users = await notificationModel.listApprovedCounterpartiesForUser(userId);
      return users.map((user: any) => ({
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        current_rating: user.current_rating,
        rated_at: user.rated_at,
        last_interaction_at: user.last_interaction_at
      }));
    },
    getSummary: ratingModel.getSummary,
    listRecentRatings: ratingModel.listRecentRatings
  };
}