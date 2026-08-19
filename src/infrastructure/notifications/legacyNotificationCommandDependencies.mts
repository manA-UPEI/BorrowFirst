import { createRequire } from 'node:module';
import type { NotificationCommandRepository, NotificationCommandServices } from '../../application/ports/notificationCommand.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const notificationModel = loadLegacyModule('../../../../server/models/notificationModel') as Record<string, any>;
const productModel = loadLegacyModule('../../../../server/models/productModel') as Record<string, any>;
const connection = loadLegacyModule('../../../../server/db/connection') as Record<string, any>;
const otpService = loadLegacyModule('../../../../server/services/otpService') as Record<string, any>;
const codeService = loadLegacyModule('../../../../server/services/transactionCodeService') as Record<string, any>;
const loanService = loadLegacyModule('../../../../server/services/loanService') as Record<string, any>;

export function createLegacyNotificationCommandRepository(): NotificationCommandRepository {
  return {
    findById: notificationModel.findById,
    findProduct: productModel.findById,
    ensurePickupOptions: productModel.ensurePickupOptions,
    listPickupOptions: productModel.listPickupOptions,
    setApprovedReservation: notificationModel.setApprovedReservation,
    assignBorrower: productModel.assignBorrower,
    rejectOtherPending: notificationModel.rejectOtherPending,
    updateStatus: notificationModel.updateStatus,
    cancelReservation: notificationModel.cancelReservation,
    releaseBorrowerIfMatch: productModel.releaseBorrowerIfMatch,
    setPickupVerified: notificationModel.setPickupVerified,
    setReturnMeetup: notificationModel.setReturnMeetup,
    issueReturnCode: notificationModel.issueReturnCode,
    clearReturnCode: notificationModel.clearReturnCode,
    markReturned: notificationModel.markReturned
  };
}

export function createLegacyNotificationCommandServices(): NotificationCommandServices {
  return {
    run: connection.withTransaction,
    hashCode: otpService.hashOtp,
    isExpired: loanService.isExpired,
    createPickupCode: codeService.createPickupCodeRecord,
    createReturnCode: codeService.createReturnCodeRecord,
    getApprovalExpiry: codeService.getApprovalExpiry
  };
}