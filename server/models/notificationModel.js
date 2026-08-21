const { run, get, all } = require('../db/connection');

const BASE_TRANSACTION_COLUMNS = `
  n.id,
  n.status,
  n.created_at,
  n.product_id,
  n.pickup_option,
  n.pickup_meetup_at,
  n.start_date,
  n.due_date,
  n.approved_at,
  n.approval_expires_at,
  n.pickup_code_hash,
  n.pickup_code_expires_at,
  n.picked_up_at,
  n.pickup_verified_by_user_id,
  n.return_meetup_at,
  n.return_code_hash,
  n.return_code_expires_at,
  n.returned_at,
  n.returned_by_user_id,
  p."Product_Name" AS product_name,
  p."Product_Lending_Charge" AS daily_price,
  lender.id AS lender_id,
  lender.username AS lender_username,
  lender.full_name AS lender_full_name,
  borrower.id AS borrower_id,
  borrower.username AS borrower_username,
  borrower.full_name AS borrower_full_name,
  o.location AS pickup_location,
  o.start_time AS pickup_start_time,
  o.end_time AS pickup_end_time
`;

const BASE_TRANSACTION_FROM = `
  FROM notifications n
  JOIN products p ON p."Product_ID" = n.product_id
  JOIN users lender ON lender.id = n.lender_id
  JOIN users borrower ON borrower.id = n.borrower_id
  LEFT JOIN pickup_options o
    ON o.product_id = n.product_id AND o.option_index = n.pickup_option
`;

async function createNotification({
  productId,
  lenderId,
  borrowerId,
  pickupOption,
  pickupMeetupAt,
  startDate,
  dueDate
}) {
  const result = await run(
    `INSERT INTO notifications (
      product_id,
      lender_id,
      borrower_id,
      pickup_option,
      pickup_meetup_at,
      start_date,
      due_date,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id AS "lastID"`,
    [productId, lenderId, borrowerId, pickupOption, pickupMeetupAt, startDate, dueDate, 'pending']
  );

  return result.lastID;
}

// The date ranges on a product that are already spoken for. Only approvals and
// live loans count: several borrowers may hold overlapping *pending* requests for
// the same days, and it is the lender's choice which one becomes real. The
// exclusion is for re-checking a request at approval time without it clashing
// with itself.
function listBookedRanges(productId, excludeNotificationId = null) {
  if (excludeNotificationId) {
    return all(
      `SELECT id, start_date, due_date
       FROM notifications
       WHERE product_id = ?
         AND status IN ('approved', 'active')
         AND id <> ?
       ORDER BY start_date ASC, id ASC`,
      [productId, excludeNotificationId]
    );
  }

  return all(
    `SELECT id, start_date, due_date
     FROM notifications
     WHERE product_id = ?
       AND status IN ('approved', 'active')
     ORDER BY start_date ASC, id ASC`,
    [productId]
  );
}

function findById(notificationId) {
  return get('SELECT * FROM notifications WHERE id = ?', [notificationId]);
}

function findPendingForBorrower(productId, borrowerId) {
  return get(
    'SELECT id FROM notifications WHERE product_id = ? AND borrower_id = ? AND status = ?',
    [productId, borrowerId, 'pending']
  );
}

function findBorrowerApprovedTransactionsNeedingPickupCode(borrowerId, nowIso) {
  return all(
    `SELECT id
     FROM notifications
     WHERE borrower_id = ?
       AND status = 'approved'
       AND (
         pickup_code_hash IS NULL
         OR pickup_code_expires_at IS NULL
         OR pickup_code_expires_at <= ?
       )
     ORDER BY COALESCE(approved_at, created_at) DESC, id DESC`,
    [borrowerId, nowIso]
  );
}

function findExpiredApprovals(nowIso) {
  return all(
    `SELECT id, product_id, borrower_id
     FROM notifications
     WHERE status = 'approved'
       AND approval_expires_at IS NOT NULL
       AND approval_expires_at <= ?
     ORDER BY approval_expires_at ASC, id ASC`,
    [nowIso]
  );
}

function listForLender(lenderId) {
  return all(
    `SELECT ${BASE_TRANSACTION_COLUMNS},
            'lender' AS role
     ${BASE_TRANSACTION_FROM}
     WHERE n.lender_id = ?
     ORDER BY n.created_at DESC, n.id DESC`,
    [lenderId]
  );
}

function listCurrentTransactionsForUser(userId) {
  return all(
    `SELECT ${BASE_TRANSACTION_COLUMNS},
            CASE
              WHEN n.borrower_id = ? THEN 'borrower'
              ELSE 'lender'
            END AS role
     ${BASE_TRANSACTION_FROM}
     WHERE (n.lender_id = ? OR n.borrower_id = ?)
       AND n.status IN ('pending', 'approved', 'active')
     ORDER BY CASE n.status
                WHEN 'approved' THEN 0
                WHEN 'active' THEN 1
                ELSE 2
              END,
              COALESCE(n.approved_at, n.created_at) DESC,
              n.id DESC`,
    [userId, userId, userId]
  );
}

function listApprovedCounterpartiesForUser(userId) {
  return all(
    `SELECT approved.counterpart_id AS id,
            approved.counterpart_username AS username,
            approved.counterpart_full_name AS full_name,
            existing.rating AS current_rating,
            existing.created_at AS rated_at,
            MAX(approved.interaction_at) AS last_interaction_at
     FROM (
       SELECT COALESCE(n.picked_up_at, n.returned_at, n.created_at) AS interaction_at,
              borrower.id AS counterpart_id,
              borrower.username AS counterpart_username,
              borrower.full_name AS counterpart_full_name
       FROM notifications n
       JOIN users borrower ON borrower.id = n.borrower_id
       WHERE n.lender_id = ? AND n.status IN ('active', 'returned')

       UNION ALL

       SELECT COALESCE(n.picked_up_at, n.returned_at, n.created_at) AS interaction_at,
              lender.id AS counterpart_id,
              lender.username AS counterpart_username,
              lender.full_name AS counterpart_full_name
       FROM notifications n
       JOIN users lender ON lender.id = n.lender_id
       WHERE n.borrower_id = ? AND n.status IN ('active', 'returned')
     ) approved
     LEFT JOIN ratings existing
       ON existing.user_id = approved.counterpart_id
      AND existing.rater_id = ?
     GROUP BY approved.counterpart_id,
              approved.counterpart_username,
              approved.counterpart_full_name,
              existing.rating,
              existing.created_at
     ORDER BY CASE WHEN existing.rating IS NULL THEN 0 ELSE 1 END,
              MAX(approved.interaction_at) DESC,
              approved.counterpart_username,
              approved.counterpart_full_name`,
    [userId, userId, userId]
  );
}

function findApprovedCounterparty(userId, targetUserId) {
  return get(
    `SELECT u.id, u.email, u.username
     FROM users u
     WHERE u.id = ?
       AND EXISTS (
         SELECT 1
         FROM notifications n
         WHERE n.status IN ('active', 'returned')
           AND (
             (n.lender_id = ? AND n.borrower_id = u.id) OR
             (n.borrower_id = ? AND n.lender_id = u.id)
           )
       )
     LIMIT 1`,
    [targetUserId, userId, userId]
  );
}

function findInteractionBetweenUsers(userId, targetUserId) {
  return get(
    `SELECT id,
            status,
            created_at,
            CASE
              WHEN lender_id = ? THEN 'lender'
              ELSE 'borrower'
            END AS viewer_role,
            CASE
              WHEN lender_id = ? THEN 'borrower'
              ELSE 'lender'
            END AS counterpart_role
     FROM notifications
     WHERE (lender_id = ? AND borrower_id = ?)
        OR (borrower_id = ? AND lender_id = ?)
     ORDER BY CASE status
                WHEN 'active' THEN 0
                WHEN 'returned' THEN 1
                WHEN 'approved' THEN 2
                WHEN 'pending' THEN 3
                ELSE 4
              END,
              created_at DESC,
              id DESC
     LIMIT 1`,
    [userId, userId, userId, targetUserId, userId, targetUserId]
  );
}

function findInteractionByIdForUser(userId, interactionId) {
  return get(
    `SELECT id,
            status,
            created_at,
            lender_id,
            borrower_id,
            CASE
              WHEN lender_id = ? THEN 'lender'
              ELSE 'borrower'
            END AS viewer_role,
            CASE
              WHEN lender_id = ? THEN borrower_id
              ELSE lender_id
            END AS counterpart_id,
            CASE
              WHEN lender_id = ? THEN 'borrower'
              ELSE 'lender'
            END AS counterpart_role
     FROM notifications
     WHERE id = ?
       AND (lender_id = ? OR borrower_id = ?)
     LIMIT 1`,
    [userId, userId, userId, interactionId, userId, userId]
  );
}

function listHistoryForUser(userId) {
  return all(
    `SELECT ${BASE_TRANSACTION_COLUMNS},
            CASE
              WHEN n.lender_id = ? THEN 'lender'
              ELSE 'borrower'
            END AS role
     ${BASE_TRANSACTION_FROM}
     WHERE n.lender_id = ? OR n.borrower_id = ?
     ORDER BY COALESCE(n.returned_at, n.picked_up_at, n.approved_at, n.created_at) DESC,
              n.id DESC`,
    [userId, userId, userId]
  );
}

function listActiveLoansForUser(userId) {
  return all(
    `SELECT ${BASE_TRANSACTION_COLUMNS},
            CASE
              WHEN n.lender_id = ? THEN 'lender'
              ELSE 'borrower'
            END AS role
     ${BASE_TRANSACTION_FROM}
     WHERE (n.lender_id = ? OR n.borrower_id = ?)
       AND n.status = 'active'
     ORDER BY n.due_date ASC, COALESCE(n.picked_up_at, n.created_at) DESC, n.id DESC`,
    [userId, userId, userId]
  );
}

async function updateStatus(notificationId, status) {
  await run('UPDATE notifications SET status = ? WHERE id = ?', [status, notificationId]);
}

async function setApprovedReservation(notificationId, {
  approvedAt,
  approvalExpiresAt,
  pickupMeetupAt,
  pickupCodeHash,
  pickupCodeExpiresAt
}) {
  await run(
    `UPDATE notifications
     SET status = 'approved',
         approved_at = ?,
         approval_expires_at = ?,
         pickup_meetup_at = ?,
         pickup_code_hash = ?,
         pickup_code_expires_at = ?,
         picked_up_at = NULL,
         pickup_verified_by_user_id = NULL,
         return_meetup_at = NULL,
         return_code_hash = NULL,
         return_code_expires_at = NULL,
         returned_at = NULL,
         returned_by_user_id = NULL
     WHERE id = ?`,
    [approvedAt, approvalExpiresAt, pickupMeetupAt, pickupCodeHash, pickupCodeExpiresAt, notificationId]
  );
}

async function refreshPickupCode(notificationId, pickupCodeHash, pickupCodeExpiresAt) {
  await run(
    `UPDATE notifications
     SET pickup_code_hash = ?,
         pickup_code_expires_at = ?
     WHERE id = ?`,
    [pickupCodeHash, pickupCodeExpiresAt, notificationId]
  );
}

async function setPickupVerified(notificationId, pickedUpAt, pickupVerifiedByUserId) {
  await run(
    `UPDATE notifications
     SET status = 'active',
         picked_up_at = ?,
         pickup_verified_by_user_id = ?,
         pickup_code_hash = NULL
     WHERE id = ?`,
    [pickedUpAt, pickupVerifiedByUserId, notificationId]
  );
}

async function setReturnMeetup(notificationId, returnMeetupAt) {
  await run(
    `UPDATE notifications
     SET return_meetup_at = ?
     WHERE id = ?`,
    [returnMeetupAt, notificationId]
  );
}

async function issueReturnCode(notificationId, returnCodeHash, returnCodeExpiresAt) {
  await run(
    `UPDATE notifications
     SET return_code_hash = ?,
         return_code_expires_at = ?
     WHERE id = ?`,
    [returnCodeHash, returnCodeExpiresAt, notificationId]
  );
}

async function clearReturnCode(notificationId) {
  await run(
    `UPDATE notifications
     SET return_code_hash = NULL
     WHERE id = ?`,
    [notificationId]
  );
}

async function markReturned(notificationId, returnedByUserId) {
  await run(
    `UPDATE notifications
     SET status = 'returned',
         returned_at = NOW(),
         returned_by_user_id = ?,
         return_code_hash = NULL
     WHERE id = ?`,
    [returnedByUserId, notificationId]
  );
}

async function cancelReservation(notificationId) {
  await run(
    `UPDATE notifications
     SET status = 'cancelled',
         pickup_code_hash = NULL
     WHERE id = ?`,
    [notificationId]
  );
}

async function rejectOtherPending(productId, approvedNotificationId) {
  await run(
    'UPDATE notifications SET status = ? WHERE product_id = ? AND id != ? AND status = ?',
    ['rejected', productId, approvedNotificationId, 'pending']
  );
}

async function rejectPendingForProduct(productId) {
  await run(
    'UPDATE notifications SET status = ? WHERE product_id = ? AND status = ?',
    ['rejected', productId, 'pending']
  );
}

module.exports = {
  createNotification,
  listBookedRanges,
  findById,
  findPendingForBorrower,
  findBorrowerApprovedTransactionsNeedingPickupCode,
  findExpiredApprovals,
  listCurrentTransactionsForUser,
  listApprovedCounterpartiesForUser,
  findApprovedCounterparty,
  findInteractionBetweenUsers,
  findInteractionByIdForUser,
  listForLender,
  listHistoryForUser,
  listActiveLoansForUser,
  updateStatus,
  setApprovedReservation,
  refreshPickupCode,
  setPickupVerified,
  setReturnMeetup,
  issueReturnCode,
  clearReturnCode,
  markReturned,
  cancelReservation,
  rejectOtherPending,
  rejectPendingForProduct
};
