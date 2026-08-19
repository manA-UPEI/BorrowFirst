import { createRequire } from 'node:module';
import type { NotificationQuery } from '../../application/ports/notificationQuery.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const notificationModel = loadLegacyModule('../../../../server/models/notificationModel') as Record<string, any>;
const lifecycleService = loadLegacyModule('../../../../server/services/transactionLifecycleService') as Record<string, any>;

export function createLegacyNotificationQuery(): NotificationQuery {
  return {
    expireStaleApprovals: lifecycleService.expireStaleApprovals,
    listForLender: notificationModel.listForLender
  };
}