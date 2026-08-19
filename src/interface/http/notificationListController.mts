import { createListNotificationsUseCase } from '../../application/notifications/listNotifications.mjs';
import { createLegacyNotificationQuery } from '../../infrastructure/notifications/legacyNotificationQuery.mjs';
import { createLegacyLoanPresenter } from '../../infrastructure/transactions/legacyHistoryDependencies.mjs';

const listNotifications = createListNotificationsUseCase(
  createLegacyNotificationQuery(),
  createLegacyLoanPresenter()
);

export async function notificationListHandler(request: any, response: any): Promise<void> {
  response.json(await listNotifications.execute(Number(request.session.userId)));
}