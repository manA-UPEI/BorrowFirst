export interface BorrowRequestProduct {
  readonly lenderId: number;
  readonly borrowerId: number | null;
  readonly isActive: boolean;
}

export interface PickupOption {
  readonly optionIndex: number;
  readonly startTime: string;
  readonly endTime: string;
}

export interface BorrowRequestRepository {
  expireStaleApprovals(): Promise<number>;
  listCurrentTransactions(userId: number): Promise<readonly Record<string, unknown>[]>;
  findProduct(productId: number): Promise<BorrowRequestProduct | null>;
  ensurePickupOptions(productId: number): Promise<void>;
  listPickupOptions(productId: number): Promise<readonly PickupOption[]>;
  findPendingRequest(productId: number, borrowerId: number): Promise<boolean>;
  createRequest(input: {
    productId: number;
    lenderId: number;
    borrowerId: number;
    pickupOption: number;
    pickupMeetupAt: string;
    dueDate: string;
  }): Promise<number>;
}