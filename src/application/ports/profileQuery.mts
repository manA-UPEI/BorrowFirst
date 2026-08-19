export interface ProfileQuery {
  findById(id: number): Promise<Record<string, unknown> | null>;
  findPublicById(id: number): Promise<Record<string, unknown> | null>;
  findInteractionBetweenUsers(userId: number, targetUserId: number): Promise<Record<string, unknown> | null>;
  findInteractionByIdForUser(userId: number, interactionId: number): Promise<Record<string, unknown> | null>;
  getRatingSummary(id: number): Promise<Record<string, unknown> | null>;
  listRecentRatings(id: number): Promise<readonly Record<string, unknown>[]>;
}