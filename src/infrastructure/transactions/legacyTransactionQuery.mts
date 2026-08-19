import { createRequire } from 'node:module';
import type { TransactionQuery } from '../../application/ports/transactionQuery.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const notificationModel = loadLegacyModule('../../../../server/models/notificationModel') as Record<string, any>;
const lifecycleService = loadLegacyModule('../../../../server/services/transactionLifecycleService') as Record<string, any>;

export function createLegacyTransactionQuery(): TransactionQuery {
  return {
    expireStaleApprovals: lifecycleService.expireStaleApprovals,
    ensureBorrowerPickupCodes: lifecycleService.ensureBorrowerPickupCodes,
    listCurrentForUser: notificationModel.listCurrentTransactionsForUser
  };
}