export interface NotificationCommandRepository {
  findById(id: number): Promise<any | null>;
  findProduct(id: number): Promise<any | null>;
  ensurePickupOptions(id: number): Promise<void>;
  listPickupOptions(id: number): Promise<readonly any[]>;
  setApprovedReservation(id: number, input: any): Promise<void>;
  assignBorrower(productId: number, borrowerId: number): Promise<void>;
  rejectOtherPending(productId: number, notificationId: number): Promise<void>;
  updateStatus(id: number, status: string): Promise<void>;
  cancelReservation(id: number): Promise<void>;
  releaseBorrowerIfMatch(productId: number, borrowerId: number): Promise<void>;
  setPickupVerified(id: number, at: string, userId: number): Promise<void>;
  setReturnMeetup(id: number, at: string): Promise<void>;
  issueReturnCode(id: number, hash: string, expiresAt: string): Promise<void>;
  clearReturnCode(id: number): Promise<void>;
  markReturned(id: number, userId: number): Promise<void>;
}

export interface NotificationCommandServices {
  run<T>(operation: () => Promise<T>): Promise<T>;
  hashCode(code: string): string;
  isExpired(value: unknown): boolean;
  createPickupCode(id: number): { hash: string; expiresAt: string };
  createReturnCode(id: number): { hash: string; expiresAt: string };
  getApprovalExpiry(): string;
}