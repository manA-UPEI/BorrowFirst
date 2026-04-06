const { buildTransactionCode } = require('./transactionCodeService');

const LATE_FEE_RATE = Number(process.env.LATE_FEE_RATE || 0.2);

function getTodayDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDatePart(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.slice(0, 10);
}

function isExpired(value, referenceDate = new Date()) {
  if (typeof value !== 'string' || !value) {
    return false;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  return parsedDate.getTime() <= referenceDate.getTime();
}

function calculateOverdueDays(dueDate, referenceDate = getTodayDateValue()) {
  const dueDatePart = getDatePart(dueDate);
  const referenceDatePart = getDatePart(referenceDate);

  if (!dueDatePart || !referenceDatePart || referenceDatePart <= dueDatePart) {
    return 0;
  }

  const start = new Date(`${dueDatePart}T00:00:00`);
  const end = new Date(`${referenceDatePart}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function calculateLateFee(dailyPrice, overdueDays) {
  const normalizedPrice = Number(dailyPrice);

  if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0 || overdueDays <= 0) {
    return 0;
  }

  return Math.round(normalizedPrice * overdueDays * LATE_FEE_RATE);
}

function getViewerRole(entry, currentUserId) {
  if (entry && entry.role) {
    return entry.role;
  }

  const numericUserId = Number(currentUserId);

  if (Number(entry?.borrower_id) === numericUserId) {
    return 'borrower';
  }

  return 'lender';
}

function getTransactionStage(entry, referenceDate = new Date()) {
  if (!entry) {
    return 'pending';
  }

  if (entry.status === 'pending' || entry.status === 'rejected' || entry.status === 'cancelled') {
    return entry.status;
  }

  if (entry.returned_at || entry.status === 'returned') {
    return 'returned';
  }

  if (entry.status === 'approved') {
    return 'awaiting_pickup';
  }

  if (entry.status !== 'active') {
    return entry.status || 'pending';
  }

  if (entry.return_code_hash && !isExpired(entry.return_code_expires_at, referenceDate)) {
    return 'awaiting_return_confirmation';
  }

  const dueDate = getDatePart(entry.due_date);
  const today = getTodayDateValue(referenceDate);

  if (!dueDate) {
    return 'active';
  }

  if (dueDate < today) {
    return 'overdue';
  }

  if (dueDate === today) {
    return 'due_today';
  }

  return 'active';
}

function getDisplayStatus(transactionStage) {
  switch (transactionStage) {
    case 'awaiting_pickup':
      return 'Awaiting pickup';
    case 'active':
      return 'On loan';
    case 'due_today':
      return 'Due today';
    case 'overdue':
      return 'Overdue';
    case 'awaiting_return_confirmation':
      return 'Awaiting return confirmation';
    case 'returned':
      return 'Returned';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Pending';
  }
}

function getAllowedActions(entry, currentUserId, transactionStage) {
  const viewerRole = getViewerRole(entry, currentUserId);
  const hasReturnCode = Boolean(entry.return_code_hash);

  if (entry.status === 'pending' && viewerRole === 'lender') {
    return ['approve', 'reject'];
  }

  if (transactionStage === 'awaiting_pickup' && viewerRole === 'lender') {
    return ['confirm_pickup', 'cancel'];
  }

  if (
    ['active', 'due_today', 'overdue', 'awaiting_return_confirmation'].includes(transactionStage)
    && viewerRole === 'borrower'
  ) {
    const actions = [];

    if (!hasReturnCode) {
      actions.push('schedule_return_meetup');
    }

    actions.push('issue_return_code');
    return actions;
  }

  if (
    ['active', 'due_today', 'overdue', 'awaiting_return_confirmation'].includes(transactionStage)
    && viewerRole === 'lender'
  ) {
    const actions = ['schedule_return_meetup'];

    if (transactionStage === 'awaiting_return_confirmation') {
      actions.push('confirm_return');
    }

    return actions;
  }

  return [];
}

function getBorrowRequestBlockMessage(entry) {
  if (!entry) {
    return 'You cannot request another item right now.';
  }

  if (entry.transaction_stage === 'awaiting_pickup') {
    return `Complete pickup verification for "${entry.product_name}" before requesting another item.`;
  }

  if (entry.transaction_stage === 'awaiting_return_confirmation') {
    return `Complete return verification for "${entry.product_name}" before requesting another item.`;
  }

  if (entry.has_pending_return_verification) {
    return `Complete the return handoff for "${entry.product_name}" before requesting another item.`;
  }

  if (entry.is_overdue) {
    return `Resolve the overdue loan for "${entry.product_name}" before requesting another item.`;
  }

  return `You cannot request another item while "${entry.product_name}" is unresolved.`;
}

function getUserLabel(fullName, username, fallback) {
  return fullName || username || fallback;
}

function decorateLoanEntry(entry, currentUserId, options = {}) {
  const transactionStage = getTransactionStage(entry);
  const referenceDate = transactionStage === 'returned' ? entry.returned_at : getTodayDateValue();
  const overdueDays = calculateOverdueDays(entry.due_date, referenceDate);
  const lateFee = calculateLateFee(entry.daily_price, overdueDays);
  const viewerRole = getViewerRole(entry, currentUserId);
  const numericUserId = Number(currentUserId);
  const isBorrowerView = Number(entry.borrower_id) === numericUserId;
  const hasPendingReturnCode = entry.status === 'active' && Boolean(entry.return_code_hash);
  const hasActiveReturnCode = hasPendingReturnCode && !isExpired(entry.return_code_expires_at);
  const isDueToday = entry.status === 'active' && getDatePart(entry.due_date) === getTodayDateValue();
  const isOverdue = entry.status === 'active' && calculateOverdueDays(entry.due_date) > 0;
  const blocksNewRequests = viewerRole === 'borrower' && (
    entry.status === 'approved'
    || hasPendingReturnCode
    || isOverdue
  );
  const allowedActions = getAllowedActions(entry, currentUserId, transactionStage);
  const pickupCode = options.includeRawCodes && isBorrowerView && entry.status === 'approved'
    ? buildTransactionCode(entry.id, 'pickup', entry.pickup_code_expires_at)
    : '';
  const returnCode = options.includeRawCodes && isBorrowerView && hasActiveReturnCode
    ? buildTransactionCode(entry.id, 'return', entry.return_code_expires_at)
    : '';

  return {
    ...entry,
    role: viewerRole,
    transaction_stage: transactionStage,
    loan_state: transactionStage,
    display_status: getDisplayStatus(transactionStage),
    overdue_days: overdueDays,
    late_fee: lateFee,
    allowed_actions: allowedActions,
    can_mark_return: false,
    is_due_today: isDueToday,
    is_overdue: isOverdue,
    is_active_loan: entry.status === 'active',
    has_pending_return_verification: hasPendingReturnCode,
    blocks_new_requests: blocksNewRequests,
    ...(options.includeRawCodes && isBorrowerView && pickupCode
      ? { pickup_code: pickupCode }
      : {}),
    ...(options.includeRawCodes && isBorrowerView && returnCode
      ? { return_code: returnCode }
      : {})
  };
}

function createLoanAlert(entry) {
  if (!entry) {
    return null;
  }

  const shouldAlert = entry.transaction_stage === 'awaiting_pickup'
    || entry.transaction_stage === 'awaiting_return_confirmation'
    || entry.is_due_today
    || entry.is_overdue;

  if (!shouldAlert) {
    return null;
  }

  const counterpartName = entry.role === 'lender'
    ? getUserLabel(entry.borrower_full_name, entry.borrower_username, 'Borrower')
    : getUserLabel(entry.lender_full_name, entry.lender_username, 'Lender');
  const counterpartRole = entry.role === 'lender' ? 'Borrower' : 'Lender';

  return {
    id: entry.id,
    product_name: entry.product_name,
    pickup_meetup_at: entry.pickup_meetup_at,
    return_meetup_at: entry.return_meetup_at,
    due_date: entry.due_date,
    role: entry.role,
    counterpart_name: counterpartName,
    counterpart_role: counterpartRole,
    transaction_stage: entry.transaction_stage,
    loan_state: entry.loan_state,
    display_status: entry.display_status,
    overdue_days: entry.overdue_days,
    late_fee: entry.late_fee,
    approval_expires_at: entry.approval_expires_at,
    pickup_code_expires_at: entry.pickup_code_expires_at,
    return_code_expires_at: entry.return_code_expires_at
  };
}

module.exports = {
  LATE_FEE_RATE,
  getTodayDateValue,
  isExpired,
  calculateOverdueDays,
  calculateLateFee,
  getTransactionStage,
  getDisplayStatus,
  getBorrowRequestBlockMessage,
  decorateLoanEntry,
  createLoanAlert
};
