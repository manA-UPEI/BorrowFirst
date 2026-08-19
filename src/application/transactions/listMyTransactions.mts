import type { TransactionQuery } from '../ports/transactionQuery.mjs';

export interface TransactionPresenter {
  present(entry: Record<string, unknown>, userId: number): Record<string, unknown>;
}

export function createListMyTransactionsUseCase(
  transactions: TransactionQuery,
  presenter: TransactionPresenter
) {
  return {
    async execute(userId: number): Promise<readonly Record<string, unknown>[]> {
      await transactions.expireStaleApprovals();
      await transactions.ensureBorrowerPickupCodes(userId);
      const entries = await transactions.listCurrentForUser(userId);
      return entries.map((entry) => presenter.present(entry, userId));
    }
  };
}