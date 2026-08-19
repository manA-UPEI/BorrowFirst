import { createRequire } from 'node:module';
import type { BorrowRequestPolicy } from '../../application/ports/borrowRequestPolicy.mjs';
import type { BorrowRequestRepository } from '../../application/ports/borrowRequestRepository.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const notificationModel = loadLegacyModule('../../../../server/models/notificationModel') as Record<string, any>;
const productModel = loadLegacyModule('../../../../server/models/productModel') as Record<string, any>;
const lifecycleService = loadLegacyModule('../../../../server/services/transactionLifecycleService') as Record<string, any>;
const loanService = loadLegacyModule('../../../../server/services/loanService') as Record<string, any>;

export function createLegacyBorrowRequestRepository(): BorrowRequestRepository {
  return {
    expireStaleApprovals: lifecycleService.expireStaleApprovals,
    listCurrentTransactions: notificationModel.listCurrentTransactionsForUser,
    async findProduct(productId) {
      const product = await productModel.findById(productId);
      return product ? {
        lenderId: Number(product.Product_Lender_ID),
        borrowerId: product.Product_Borrower_ID == null ? null : Number(product.Product_Borrower_ID),
        isActive: Number(product.Product_Is_Active) === 1
      } : null;
    },
    ensurePickupOptions: productModel.ensurePickupOptions,
    async listPickupOptions(productId) {
      const options = await productModel.listPickupOptions(productId);
      return options.map((option: any) => ({
        optionIndex: Number(option.option_index),
        startTime: String(option.start_time || ''),
        endTime: String(option.end_time || '')
      }));
    },
    async findPendingRequest(productId, borrowerId) {
      return Boolean(await notificationModel.findPendingForBorrower(productId, borrowerId));
    },
    createRequest: notificationModel.createNotification
  };
}

export function createLegacyBorrowRequestPolicy(): BorrowRequestPolicy {
  return {
    decorate: loanService.decorateLoanEntry,
    getBlockMessage: loanService.getBorrowRequestBlockMessage
  };
}