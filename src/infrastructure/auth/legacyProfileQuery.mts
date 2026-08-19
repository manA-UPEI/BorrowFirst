import { createRequire } from 'node:module';
import type { ProfileQuery } from '../../application/ports/profileQuery.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const userModel = loadLegacyModule('../../../../server/models/userModel') as Record<string, any>;
const notificationModel = loadLegacyModule('../../../../server/models/notificationModel') as Record<string, any>;
const ratingModel = loadLegacyModule('../../../../server/models/ratingModel') as Record<string, any>;

export function createLegacyProfileQuery(): ProfileQuery {
  return {
    findById: userModel.findById,
    findPublicById: userModel.findPublicById,
    findInteractionBetweenUsers: notificationModel.findInteractionBetweenUsers,
    findInteractionByIdForUser: notificationModel.findInteractionByIdForUser,
    getRatingSummary: ratingModel.getSummary,
    listRecentRatings: ratingModel.listRecentRatings
  };
}