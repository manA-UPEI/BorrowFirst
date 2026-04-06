const notificationModel = require('../models/notificationModel');
const { createLoanAlert, decorateLoanEntry } = require('../services/loanService');
const { expireStaleApprovals } = require('../services/transactionLifecycleService');

async function mine(req, res) {
  await expireStaleApprovals();
  const history = await notificationModel.listHistoryForUser(req.session.userId);
  res.json(history.map((entry) => decorateLoanEntry(entry, req.session.userId)));
}

async function alerts(req, res) {
  await expireStaleApprovals();
  const currentTransactions = await notificationModel.listCurrentTransactionsForUser(req.session.userId);
  const alerts = currentTransactions
    .map((entry) => decorateLoanEntry(entry, req.session.userId))
    .map(createLoanAlert)
    .filter(Boolean);

  res.json(alerts);
}

module.exports = {
  mine,
  alerts
};
