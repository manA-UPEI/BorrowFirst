const notificationModel = require('../models/notificationModel');
const productModel = require('../models/productModel');
const { withTransaction } = require('../db/connection');
const { createPickupCodeRecord } = require('./transactionCodeService');

function getNowIso() {
  return new Date().toISOString();
}

async function expireStaleApprovals() {
  const nowIso = getNowIso();

  return withTransaction(async () => {
    const expiredApprovals = await notificationModel.findExpiredApprovals(nowIso);

    for (const approval of expiredApprovals) {
      await notificationModel.cancelReservation(approval.id);
      await productModel.releaseBorrowerIfMatch(approval.product_id, approval.borrower_id);
    }

    return expiredApprovals.length;
  });
}

async function ensureBorrowerPickupCodes(borrowerId) {
  const nowIso = getNowIso();

  return withTransaction(async () => {
    const approvals = await notificationModel.findBorrowerApprovedTransactionsNeedingPickupCode(
      borrowerId,
      nowIso
    );

    for (const approval of approvals) {
      const pickupCode = createPickupCodeRecord(approval.id);
      await notificationModel.refreshPickupCode(
        approval.id,
        pickupCode.hash,
        pickupCode.expiresAt
      );
    }

    return approvals.length;
  });
}

module.exports = {
  expireStaleApprovals,
  ensureBorrowerPickupCodes
};
