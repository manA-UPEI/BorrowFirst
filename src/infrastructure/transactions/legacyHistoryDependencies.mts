import { createRequire } from 'node:module';
import type { HistoryQuery } from '../../application/ports/historyQuery.mjs';
import type { AlertPresenter } from '../../application/transactions/history.mjs';
import type { TransactionPresenter } from '../../application/transactions/listMyTransactions.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const notificationModel = loadLegacyModule('../../../../server/models/notificationModel') as Record<string, any>;
const lifecycleService = loadLegacyModule('../../../../server/services/transactionLifecycleService') as Record<string, any>;
const loanService = loadLegacyModule('../../../../server/services/loanService') as Record<string, any>;

export function createLegacyHistoryQuery(): HistoryQuery {
  return {
    expireStaleApprovals: lifecycleService.expireStaleApprovals,
    listHistoryForUser: notificationModel.listHistoryForUser,
    listCurrentForUser: notificationModel.listCurrentTransactionsForUser
  };
}

export function createLegacyLoanPresenter(): TransactionPresenter {
  return { present: (entry, userId) => loanService.decorateLoanEntry(entry, userId) };
}

export function createLegacyAlertPresenter(): AlertPresenter {
  return { present: loanService.createLoanAlert };
}