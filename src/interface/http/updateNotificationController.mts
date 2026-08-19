import { createUpdateNotificationUseCase } from '../../application/notifications/updateNotification.mjs';
import {
  createLegacyNotificationCommandRepository,
  createLegacyNotificationCommandServices
} from '../../infrastructure/notifications/legacyNotificationCommandDependencies.mjs';

const updateNotification = createUpdateNotificationUseCase(
  createLegacyNotificationCommandRepository(),
  createLegacyNotificationCommandServices()
);

export async function updateNotificationHandler(request: any, response: any): Promise<void> {
  try {
    const result = await updateNotification.execute({
      notificationId: request.params.id,
      userId: Number(request.session.userId),
      action: request.body.action,
      code: request.body.code,
      pickupMeetupAt: request.body.pickupMeetupAt,
      returnMeetupAt: request.body.returnMeetupAt
    });
    if (result.errorStatus) {
      response.status(result.errorStatus).json({ message: result.errorMessage });
      return;
    }
    response.json({ success: true, ...result });
  } catch (error: any) {
    response.status(error.statusCode || 500).json({ message: error.message || 'Unable to update request.' });
  }
}