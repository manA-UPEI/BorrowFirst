const notificationModel = require('../models/notificationModel');
const { decorateLoanEntry } = require('../services/loanService');
const {
  ensureBorrowerPickupCodes,
  expireStaleApprovals
} = require('../services/transactionLifecycleService');

async function mine(req, res) {
  const userId = Number(req.session.userId);

  await expireStaleApprovals();
  await ensureBorrowerPickupCodes(userId);

  const transactions = await notificationModel.listCurrentTransactionsForUser(userId);
  res.json(
    transactions.map((entry) => decorateLoanEntry(entry, userId, { includeRawCodes: true }))
  );
}

module.exports = {
  mine
};
