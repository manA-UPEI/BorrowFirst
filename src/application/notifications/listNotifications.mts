import type { NotificationQuery } from '../ports/notificationQuery.mjs';
import type { TransactionPresenter } from '../transactions/listMyTransactions.mjs';

export function createListNotificationsUseCase(
  query: NotificationQuery,
  presenter: TransactionPresenter
) {
  return {
    async execute(userId: number): Promise<readonly Record<string, unknown>[]> {
      await query.expireStaleApprovals();
      const notifications = await query.listForLender(userId);
      return notifications.map((entry) => presenter.present(entry, userId));
    }
  };
}