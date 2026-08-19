import type { ProfileQuery } from '../ports/profileQuery.mjs';

export class ProfileQueryError extends Error {
  constructor(public readonly statusCode: 400 | 403 | 404, message: string) {
    super(message);
    this.name = 'ProfileQueryError';
  }
}

export function createCurrentUserUseCase(query: ProfileQuery) {
  return {
    async execute(userId: number) {
      const user = await query.findById(userId);
      if (!user) throw new ProfileQueryError(404, 'User not found');
      return user;
    }
  };
}

export function createUserProfileUseCase(query: ProfileQuery) {
  return {
    async execute(sessionUserId: number, requestedTargetId: unknown, interactionInput: unknown) {
      const requestedTargetIdNumber = Number(requestedTargetId);
      const interactionId = Number(interactionInput);
      if (!Number.isInteger(requestedTargetIdNumber) || requestedTargetIdNumber <= 0) {
        throw new ProfileQueryError(400, 'Invalid user');
      }
      let targetUserId = requestedTargetIdNumber;
      let relationship: Record<string, unknown> | null = null;
      if (targetUserId !== sessionUserId) {
        if (Number.isInteger(interactionId) && interactionId > 0) {
          relationship = await query.findInteractionByIdForUser(sessionUserId, interactionId);
          if (relationship) targetUserId = Number(relationship.counterpart_id);
        }
        if (!relationship) relationship = await query.findInteractionBetweenUsers(sessionUserId, targetUserId);
        if (!relationship) throw new ProfileQueryError(403, 'You can only view profiles of users you have interacted with.');
      }
      const isSelf = targetUserId === sessionUserId;
      const user = isSelf ? await query.findById(targetUserId) : await query.findPublicById(targetUserId);
      if (!user) throw new ProfileQueryError(404, 'User not found');
      const [summary, ratings] = await Promise.all([
        query.getRatingSummary(targetUserId),
        query.listRecentRatings(targetUserId)
      ]);
      return {
        user,
        ratings: {
          count: summary ? Number(summary.count) || 0 : 0,
          average: summary && summary.average ? Number(summary.average) : 0,
          ratings
        },
        relationship,
        isSelf
      };
    }
  };
}