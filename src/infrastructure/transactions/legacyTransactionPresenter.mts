import { createRequire } from 'node:module';
import type { TransactionPresenter } from '../../application/transactions/listMyTransactions.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const loanService = loadLegacyModule('../../../../server/services/loanService') as Record<string, any>;

export function createLegacyTransactionPresenter(): TransactionPresenter {
  return {
    present: (entry, userId) => loanService.decorateLoanEntry(entry, userId, { includeRawCodes: true })
  };
}