export interface BorrowRequestPolicy {
  decorate(entry: Record<string, unknown>, userId: number): Record<string, unknown>;
  getBlockMessage(entry: Record<string, unknown>): string;
}