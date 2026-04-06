const notificationModel = require('../models/notificationModel');
const productModel = require('../models/productModel');
const { withTransaction } = require('../db/connection');
const { hashOtp } = require('../services/otpService');
const {
  decorateLoanEntry,
  getBorrowRequestBlockMessage,
  isExpired
} = require('../services/loanService');
const {
  createPickupCodeRecord,
  createReturnCodeRecord,
  getApprovalExpiry
} = require('../services/transactionCodeService');
const { expireStaleApprovals } = require('../services/transactionLifecycleService');

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getTodayDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsedDate = new Date(year, month - 1, day);

  return parsedDate.getFullYear() === year
    && parsedDate.getMonth() === month - 1
    && parsedDate.getDate() === day;
}

function isValidVerificationCode(value) {
  return /^\d{6}$/.test(value);
}

function getDatePart(value) {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function isValidDateTimeLocal(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  const parsedDate = new Date(year, month - 1, day, hours, minutes);

  return parsedDate.getFullYear() === year
    && parsedDate.getMonth() === month - 1
    && parsedDate.getDate() === day
    && parsedDate.getHours() === hours
    && parsedDate.getMinutes() === minutes;
}

function isFutureDateTimeLocal(value, referenceDate = new Date()) {
  if (!isValidDateTimeLocal(value)) {
    return false;
  }

  return new Date(value).getTime() > referenceDate.getTime();
}

function parsePickupOptionMinutes(label) {
  if (typeof label !== 'string') {
    return Number.NaN;
  }

  const match = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return Number.NaN;
  }

  let hours = Number(match[1]) % 12;
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();

  if (meridiem === 'PM') {
    hours += 12;
  }

  return (hours * 60) + minutes;
}

function getDateTimeMinutes(value) {
  if (!isValidDateTimeLocal(value)) {
    return Number.NaN;
  }

  const timePart = value.slice(11, 16);
  const [hours, minutes] = timePart.split(':').map(Number);
  return (hours * 60) + minutes;
}

function validatePickupMeetupAt(pickupMeetupAt, pickupOption, dueDate) {
  if (!isValidDateTimeLocal(pickupMeetupAt)) {
    return 'Invalid pickup meetup date and time';
  }

  if (!isFutureDateTimeLocal(pickupMeetupAt)) {
    return 'Pickup meetup must be in the future';
  }

  const startMinutes = parsePickupOptionMinutes(pickupOption?.start_time);
  const endMinutes = parsePickupOptionMinutes(pickupOption?.end_time);
  const meetupMinutes = getDateTimeMinutes(pickupMeetupAt);

  if (
    Number.isNaN(startMinutes)
    || Number.isNaN(endMinutes)
    || Number.isNaN(meetupMinutes)
  ) {
    return 'Pickup option availability is invalid';
  }

  if (meetupMinutes < startMinutes || meetupMinutes > endMinutes) {
    return `Pickup meetup must be between ${pickupOption.start_time} and ${pickupOption.end_time}`;
  }

  if (isValidDateOnly(dueDate) && dueDate < getDatePart(pickupMeetupAt)) {
    return 'Due date must be on or after the pickup meetup date';
  }

  return '';
}

function validateReturnMeetupAt(returnMeetupAt) {
  if (!isValidDateTimeLocal(returnMeetupAt)) {
    return 'Invalid return meetup date and time';
  }

  if (!isFutureDateTimeLocal(returnMeetupAt)) {
    return 'Return meetup must be in the future';
  }

  return '';
}

async function create(req, res) {
  await expireStaleApprovals();

  const productId = Number(req.body.productId);
  const pickupOption = Number(req.body.pickupOption);
  const pickupMeetupAt = typeof req.body.pickupMeetupAt === 'string'
    ? req.body.pickupMeetupAt.trim()
    : '';
  const dueDate = typeof req.body.dueDate === 'string' ? req.body.dueDate.trim() : '';
  const borrowerId = Number(req.session.userId);

  if (!Number.isInteger(productId) || productId <= 0) {
    res.status(400).json({ message: 'Invalid product' });
    return;
  }

  if (!Number.isInteger(pickupOption) || pickupOption <= 0) {
    res.status(400).json({ message: 'Invalid request' });
    return;
  }

  if (!isValidDateOnly(dueDate)) {
    res.status(400).json({ message: 'Invalid due date' });
    return;
  }

  if (!isValidDateTimeLocal(pickupMeetupAt)) {
    res.status(400).json({ message: 'Invalid pickup meetup date and time' });
    return;
  }

  if (dueDate < getTodayDateValue()) {
    res.status(400).json({ message: 'Due date cannot be in the past' });
    return;
  }

  const currentTransactions = await notificationModel.listCurrentTransactionsForUser(borrowerId);
  const borrowerBlocker = currentTransactions
    .map((entry) => decorateLoanEntry(entry, borrowerId))
    .find((entry) => entry.role === 'borrower' && entry.blocks_new_requests);

  if (borrowerBlocker) {
    res.status(400).json({ message: getBorrowRequestBlockMessage(borrowerBlocker) });
    return;
  }

  const product = await productModel.findById(productId);

  if (!product) {
    res.status(404).json({ message: 'Product not found' });
    return;
  }

  if (Number(product.Product_Is_Active) !== 1) {
    res.status(400).json({ message: 'Listing is no longer available' });
    return;
  }

  if (Number(product.Product_Lender_ID) === borrowerId) {
    res.status(400).json({ message: 'Cannot request your own item' });
    return;
  }

  if (product.Product_Borrower_ID) {
    res.status(400).json({ message: 'Item is already unavailable' });
    return;
  }

  await productModel.ensurePickupOptions(productId);
  const pickupOptions = await productModel.listPickupOptions(productId);
  const selectedOption = pickupOptions.find((option) => option.option_index === pickupOption);

  if (!selectedOption) {
    res.status(400).json({ message: 'Invalid pickup option' });
    return;
  }

  const pickupMeetupMessage = validatePickupMeetupAt(pickupMeetupAt, selectedOption, dueDate);

  if (pickupMeetupMessage) {
    res.status(400).json({ message: pickupMeetupMessage });
    return;
  }

  const existingPendingRequest = await notificationModel.findPendingForBorrower(productId, borrowerId);

  if (existingPendingRequest) {
    res.status(400).json({ message: 'You already requested this item' });
    return;
  }

  const notificationId = await notificationModel.createNotification({
    productId,
    lenderId: product.Product_Lender_ID,
    borrowerId,
    pickupOption,
    pickupMeetupAt,
    dueDate
  });

  res.json({ success: true, id: notificationId });
}

async function list(req, res) {
  await expireStaleApprovals();
  const notifications = await notificationModel.listForLender(req.session.userId);
  res.json(notifications.map((notification) => decorateLoanEntry(notification, req.session.userId)));
}

async function update(req, res) {
  await expireStaleApprovals();

  const notificationId = Number(req.params.id);
  const action = typeof req.body.action === 'string' ? req.body.action.toLowerCase() : '';
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
  const pickupMeetupAt = typeof req.body.pickupMeetupAt === 'string'
    ? req.body.pickupMeetupAt.trim()
    : '';
  const returnMeetupAt = typeof req.body.returnMeetupAt === 'string'
    ? req.body.returnMeetupAt.trim()
    : '';
  const allowedActions = new Set([
    'approve',
    'reject',
    'cancel',
    'confirm_pickup',
    'schedule_return_meetup',
    'issue_return_code',
    'confirm_return'
  ]);

  if (!Number.isInteger(notificationId) || !allowedActions.has(action)) {
    res.status(400).json({ message: 'Invalid action' });
    return;
  }

  if (['confirm_pickup', 'confirm_return'].includes(action) && !isValidVerificationCode(code)) {
    res.status(400).json({ message: 'Verification code must be 6 digits.' });
    return;
  }

  try {
    const result = await withTransaction(async () => {
      const notification = await notificationModel.findById(notificationId);

      if (!notification) {
        throw createHttpError(404, 'Notification not found');
      }

      const isLender = Number(notification.lender_id) === Number(req.session.userId);
      const isBorrower = Number(notification.borrower_id) === Number(req.session.userId);

      if (
        action === 'approve'
        || action === 'reject'
        || action === 'cancel'
        || action === 'confirm_pickup'
        || action === 'confirm_return'
      ) {
        if (!isLender) {
          throw createHttpError(403, 'Not allowed');
        }
      }

      if (action === 'issue_return_code' && !isBorrower) {
        throw createHttpError(403, 'Not allowed');
      }

      if (action === 'schedule_return_meetup' && !isBorrower && !isLender) {
        throw createHttpError(403, 'Not allowed');
      }

      if (action === 'approve') {
        if (notification.status !== 'pending') {
          throw createHttpError(400, 'Only pending requests can be approved.');
        }

        const product = await productModel.findById(notification.product_id);

        if (!product || Number(product.Product_Is_Active) !== 1) {
          throw createHttpError(400, 'Listing is no longer available');
        }

        if (product.Product_Borrower_ID) {
          throw createHttpError(400, 'Item is already unavailable');
        }

        await productModel.ensurePickupOptions(notification.product_id);
        const pickupOptions = await productModel.listPickupOptions(notification.product_id);
        const selectedOption = pickupOptions.find(
          (option) => option.option_index === notification.pickup_option
        );

        if (!selectedOption) {
          throw createHttpError(400, 'Invalid pickup option');
        }

        const finalPickupMeetupAt = pickupMeetupAt || notification.pickup_meetup_at;
        const pickupMeetupMessage = validatePickupMeetupAt(
          finalPickupMeetupAt,
          selectedOption,
          notification.due_date
        );

        if (pickupMeetupMessage) {
          throw createHttpError(400, pickupMeetupMessage);
        }

        const pickupCode = createPickupCodeRecord(notification.id);

        await notificationModel.setApprovedReservation(notification.id, {
          approvedAt: new Date().toISOString(),
          approvalExpiresAt: getApprovalExpiry(),
          pickupMeetupAt: finalPickupMeetupAt,
          pickupCodeHash: pickupCode.hash,
          pickupCodeExpiresAt: pickupCode.expiresAt
        });
        await productModel.assignBorrower(notification.product_id, notification.borrower_id);
        await notificationModel.rejectOtherPending(notification.product_id, notification.id);

        return { approved: true };
      }

      if (action === 'reject') {
        if (notification.status !== 'pending') {
          throw createHttpError(400, 'Only pending requests can be rejected.');
        }

        await notificationModel.updateStatus(notification.id, 'rejected');
        return { rejected: true };
      }

      if (action === 'cancel') {
        if (notification.status === 'cancelled') {
          return { alreadyCancelled: true };
        }

        if (notification.status !== 'approved') {
          throw createHttpError(400, 'Only awaiting-pickup reservations can be cancelled.');
        }

        await notificationModel.cancelReservation(notification.id);
        await productModel.releaseBorrowerIfMatch(notification.product_id, notification.borrower_id);
        return { cancelled: true };
      }

      if (action === 'confirm_pickup') {
        if (notification.status !== 'approved') {
          throw createHttpError(400, 'Only awaiting-pickup reservations can be confirmed.');
        }

        if (isExpired(notification.approval_expires_at)) {
          await notificationModel.cancelReservation(notification.id);
          await productModel.releaseBorrowerIfMatch(notification.product_id, notification.borrower_id);
          return {
            errorStatus: 400,
            errorMessage: 'Pickup reservation expired.'
          };
        }

        if (!notification.pickup_code_hash || !notification.pickup_code_expires_at) {
          throw createHttpError(400, 'Pickup code is not available yet.');
        }

        if (isExpired(notification.pickup_code_expires_at)) {
          throw createHttpError(400, 'Pickup code expired. Ask the borrower to refresh it from My Transactions.');
        }

        if (hashOtp(code) !== notification.pickup_code_hash) {
          throw createHttpError(400, 'Invalid pickup code.');
        }

        await notificationModel.setPickupVerified(
          notification.id,
          new Date().toISOString(),
          req.session.userId
        );
        return { pickedUp: true };
      }

      if (action === 'schedule_return_meetup') {
        if (notification.status !== 'active') {
          throw createHttpError(400, 'Only active loans can schedule a return meetup.');
        }

        const returnMeetupMessage = validateReturnMeetupAt(returnMeetupAt);

        if (returnMeetupMessage) {
          throw createHttpError(400, returnMeetupMessage);
        }

        if (isBorrower && notification.return_code_hash) {
          throw createHttpError(400, 'Return meetup cannot be changed after a return code has been issued.');
        }

        await notificationModel.setReturnMeetup(notification.id, returnMeetupAt);
        return { returnMeetupScheduled: true, returnMeetupAt };
      }

      if (action === 'issue_return_code') {
        if (notification.status !== 'active') {
          throw createHttpError(400, 'Only active loans can generate a return code.');
        }

        const returnMeetupMessage = validateReturnMeetupAt(notification.return_meetup_at);

        if (returnMeetupMessage) {
          throw createHttpError(400, 'Set a valid return meetup before generating a return code.');
        }

        const returnCode = createReturnCodeRecord(notification.id);
        await notificationModel.issueReturnCode(
          notification.id,
          returnCode.hash,
          returnCode.expiresAt
        );
        return { returnCodeIssued: true, returnCodeExpiresAt: returnCode.expiresAt };
      }

      if (notification.status === 'returned') {
        return { alreadyReturned: true };
      }

      if (notification.status !== 'active') {
        throw createHttpError(400, 'Only active loans can be returned.');
      }

      if (!notification.return_code_hash || !notification.return_code_expires_at) {
        throw createHttpError(400, 'Borrower has not generated a return code yet.');
      }

      if (isExpired(notification.return_code_expires_at)) {
        await notificationModel.clearReturnCode(notification.id);
        return {
          errorStatus: 400,
          errorMessage: 'Return code expired. Ask the borrower to generate a new one.'
        };
      }

      if (hashOtp(code) !== notification.return_code_hash) {
        throw createHttpError(400, 'Invalid return code.');
      }

      await notificationModel.markReturned(notification.id, req.session.userId);
      await productModel.releaseBorrowerIfMatch(notification.product_id, notification.borrower_id);
      return { returned: true };
    });

    if (result.errorStatus) {
      res.status(result.errorStatus).json({ message: result.errorMessage });
      return;
    }

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Unable to update request.' });
  }
}

module.exports = {
  create,
  list,
  update
};
