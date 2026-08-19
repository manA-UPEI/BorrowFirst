import type { HistoryQuery } from '../ports/historyQuery.mjs';
import type { TransactionPresenter } from './listMyTransactions.mjs';

export interface AlertPresenter {
  present(entry: Record<string, unknown>): Record<string, unknown> | null;
}

export function createHistoryUseCase(query: HistoryQuery, presenter: TransactionPresenter) {
  return {
    async execute(userId: number): Promise<readonly Record<string, unknown>[]> {
      await query.expireStaleApprovals();
      const entries = await query.listHistoryForUser(userId);
      return entries.map((entry) => presenter.present(entry, userId));
    }
  };
}

export function createAlertsUseCase(
  query: HistoryQuery,
  presenter: TransactionPresenter,
  alertPresenter: AlertPresenter
) {
  return {
    async execute(userId: number): Promise<readonly Record<string, unknown>[]> {
      await query.expireStaleApprovals();
      const entries = await query.listCurrentForUser(userId);
      return entries
        .map((entry) => presenter.present(entry, userId))
        .map((entry) => alertPresenter.present(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null);
    }
  };
}