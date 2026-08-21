import { toDateOnly } from '../../domain/booking/availability.mjs';
import type { NotificationCommandRepository, NotificationCommandServices } from '../ports/notificationCommand.mjs';

const ACTIONS = new Set([
  'approve', 'reject', 'cancel', 'confirm_pickup',
  'schedule_return_meetup', 'issue_return_code', 'confirm_return'
]);

export class NotificationCommandError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'NotificationCommandError';
  }
}

function validCode(value: string): boolean { return /^\d{6}$/.test(value); }
function validDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const parsed = new Date(year, month - 1, day, hours, minutes);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1
    && parsed.getDate() === day && parsed.getHours() === hours && parsed.getMinutes() === minutes;
}
function futureDateTime(value: string): boolean { return validDateTime(value) && new Date(value).getTime() > Date.now(); }
function timeMinutes(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return Number.NaN;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hours += 12;
  return hours * 60 + Number(match[2]);
}
function validatePickup(value: string, option: any, dueDate: string, startDate: string): string {
  if (!validDateTime(value)) return 'Invalid pickup meetup date and time';
  if (!futureDateTime(value)) return 'Pickup meetup must be in the future';
  const meetup = Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
  const start = timeMinutes(option.start_time);
  const end = timeMinutes(option.end_time);
  if ([meetup, start, end].some(Number.isNaN)) return 'Pickup option availability is invalid';
  if (meetup < start || meetup > end) return `Pickup meetup must be between ${option.start_time} and ${option.end_time}`;
  // A lender may move the meetup time while approving. The booked range is what
  // the borrower agreed to and what blocks the calendar, so the handover cannot
  // be rescheduled off the first booked day.
  if (startDate && value.slice(0, 10) !== startDate) {
    return 'Pickup meetup must be on the first day of the booking';
  }
  // Legacy rows predate start_date and are only bounded by the due date.
  if (!startDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate < value.slice(0, 10)) {
    return 'Due date must be on or after the pickup meetup date';
  }
  return '';
}
function validateReturn(value: string): string {
  if (!validDateTime(value)) return 'Invalid return meetup date and time';
  return futureDateTime(value) ? '' : 'Return meetup must be in the future';
}
// Unlike validateReturn, this checks an already-*stored* timestamp rather than a
// freshly submitted form value. A value round-tripped through the TIMESTAMPTZ
// column always comes back as a full ISO string ("...T14:00:00.000Z"), which
// validateReturn's strict "YYYY-MM-DDTHH:MM" regex rejects outright -- so
// checking a stored value with validateReturn would reject a return meetup that
// was itself validated correctly (via validateReturn) at schedule time.
function isFutureTimestamp(value: unknown): boolean {
  if (typeof value !== 'string' && !(value instanceof Date)) return false;
  const time = new Date(value as string | Date).getTime();
  return Number.isFinite(time) && time > Date.now();
}

// Recovers the minute-precision "YYYY-MM-DDTHH:MM" a fresh datetime-local
// submission always has, from a value that has round-tripped through storage.
//
// A stored value shows up in two different shapes depending on the database:
// real Postgres, via the timezone-naive TIMESTAMP parser in connection.js,
// yields a string with seconds ("...T14:00:00"); pg-mem -- the in-memory
// fallback the test suite and DATABASE_URL-less local dev use -- ignores that
// parser and hands back a JS Date instead, one it built by reading the naive
// wall-clock string as if it were UTC. Both cases converge on the same answer:
// the first 16 characters of a string, or of a Date's toISOString() (which is
// UTC-based, matching how pg-mem constructed it), are the original wall-clock
// value either way.
function toMeetupInputValue(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 16);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 16);
  return '';
}

export function createUpdateNotificationUseCase(
  repository: NotificationCommandRepository,
  services: NotificationCommandServices
) {
  return {
    async execute(input: {
      notificationId: unknown;
      userId: number;
      action: unknown;
      code?: unknown;
      pickupMeetupAt?: unknown;
      returnMeetupAt?: unknown;
    }): Promise<Record<string, unknown>> {
      const id = Number(input.notificationId);
      const action = typeof input.action === 'string' ? input.action.toLowerCase() : '';
      const code = typeof input.code === 'string' ? input.code.trim() : '';
      const pickupMeetupAt = typeof input.pickupMeetupAt === 'string' ? input.pickupMeetupAt.trim() : '';
      const returnMeetupAt = typeof input.returnMeetupAt === 'string' ? input.returnMeetupAt.trim() : '';

      if (!Number.isInteger(id) || !ACTIONS.has(action)) throw new NotificationCommandError(400, 'Invalid action');
      if (['confirm_pickup', 'confirm_return'].includes(action) && !validCode(code)) {
        throw new NotificationCommandError(400, 'Verification code must be 6 digits.');
      }

      return services.run(async () => {
        const notification = await repository.findById(id);
        if (!notification) throw new NotificationCommandError(404, 'Notification not found');
        const isLender = Number(notification.lender_id) === input.userId;
        const isBorrower = Number(notification.borrower_id) === input.userId;
        if (['approve', 'reject', 'cancel', 'confirm_pickup', 'confirm_return'].includes(action) && !isLender) {
          throw new NotificationCommandError(403, 'Not allowed');
        }
        if (action === 'issue_return_code' && !isBorrower) throw new NotificationCommandError(403, 'Not allowed');
        if (action === 'schedule_return_meetup' && !isBorrower && !isLender) throw new NotificationCommandError(403, 'Not allowed');

        if (action === 'approve') {
          if (notification.status !== 'pending') throw new NotificationCommandError(400, 'Only pending requests can be approved.');
          const product = await repository.findProduct(notification.product_id);
          if (!product || Number(product.Product_Is_Active) !== 1) throw new NotificationCommandError(400, 'Listing is no longer available');
          if (product.Product_Borrower_ID) throw new NotificationCommandError(400, 'Item is already unavailable');
          await repository.ensurePickupOptions(notification.product_id);
          const option = (await repository.listPickupOptions(notification.product_id)).find((item) => item.option_index === notification.pickup_option);
          if (!option) throw new NotificationCommandError(400, 'Invalid pickup option');
          // A lender approving without changing the meetup time (the only path the
          // Requests UI exercises) falls back to what the borrower originally
          // submitted. That stored value needs the same normalization a fresh
          // submission already has, or it fails the strict HH:MM regex below
          // every single time -- this used to make every such approval fail.
          const finalMeetup = pickupMeetupAt || toMeetupInputValue(notification.pickup_meetup_at);
          const pickupError = validatePickup(
            finalMeetup,
            option,
            toDateOnly(notification.due_date),
            toDateOnly(notification.start_date)
          );
          if (pickupError) throw new NotificationCommandError(400, pickupError);
          const pickupCode = services.createPickupCode(id);
          await repository.setApprovedReservation(id, {
            approvedAt: new Date().toISOString(), approvalExpiresAt: services.getApprovalExpiry(),
            pickupMeetupAt: finalMeetup, pickupCodeHash: pickupCode.hash, pickupCodeExpiresAt: pickupCode.expiresAt
          });
          await repository.assignBorrower(notification.product_id, notification.borrower_id);
          await repository.rejectOtherPending(notification.product_id, id);
          return { approved: true };
        }
        if (action === 'reject') {
          if (notification.status !== 'pending') throw new NotificationCommandError(400, 'Only pending requests can be rejected.');
          await repository.updateStatus(id, 'rejected');
          return { rejected: true };
        }
        if (action === 'cancel') {
          if (notification.status === 'cancelled') return { alreadyCancelled: true };
          if (notification.status !== 'approved') throw new NotificationCommandError(400, 'Only awaiting-pickup reservations can be cancelled.');
          await repository.cancelReservation(id);
          await repository.releaseBorrowerIfMatch(notification.product_id, notification.borrower_id);
          return { cancelled: true };
        }
        if (action === 'confirm_pickup') {
          if (notification.status !== 'approved') throw new NotificationCommandError(400, 'Only awaiting-pickup reservations can be confirmed.');
          if (services.isExpired(notification.approval_expires_at)) {
            await repository.cancelReservation(id);
            await repository.releaseBorrowerIfMatch(notification.product_id, notification.borrower_id);
            return { errorStatus: 400, errorMessage: 'Pickup reservation expired.' };
          }
          if (!notification.pickup_code_hash || !notification.pickup_code_expires_at) throw new NotificationCommandError(400, 'Pickup code is not available yet.');
          if (services.isExpired(notification.pickup_code_expires_at)) throw new NotificationCommandError(400, 'Pickup code expired. Ask the borrower to refresh it from My Transactions.');
          if (services.hashCode(code) !== notification.pickup_code_hash) throw new NotificationCommandError(400, 'Invalid pickup code.');
          await repository.setPickupVerified(id, new Date().toISOString(), input.userId);
          return { pickedUp: true };
        }
        if (action === 'schedule_return_meetup') {
          if (notification.status !== 'active') throw new NotificationCommandError(400, 'Only active loans can schedule a return meetup.');
          const returnError = validateReturn(returnMeetupAt);
          if (returnError) throw new NotificationCommandError(400, returnError);
          if (isBorrower && notification.return_code_hash) throw new NotificationCommandError(400, 'Return meetup cannot be changed after a return code has been issued.');
          await repository.setReturnMeetup(id, returnMeetupAt);
          return { returnMeetupScheduled: true, returnMeetupAt };
        }
        if (action === 'issue_return_code') {
          if (notification.status !== 'active') throw new NotificationCommandError(400, 'Only active loans can generate a return code.');
          if (!isFutureTimestamp(notification.return_meetup_at)) throw new NotificationCommandError(400, 'Set a valid return meetup before generating a return code.');
          const returnCode = services.createReturnCode(id);
          await repository.issueReturnCode(id, returnCode.hash, returnCode.expiresAt);
          return { returnCodeIssued: true, returnCodeExpiresAt: returnCode.expiresAt };
        }
        if (notification.status === 'returned') return { alreadyReturned: true };
        if (notification.status !== 'active') throw new NotificationCommandError(400, 'Only active loans can be returned.');
        if (!notification.return_code_hash || !notification.return_code_expires_at) throw new NotificationCommandError(400, 'Borrower has not generated a return code yet.');
        if (services.isExpired(notification.return_code_expires_at)) {
          await repository.clearReturnCode(id);
          return { errorStatus: 400, errorMessage: 'Return code expired. Ask the borrower to generate a new one.' };
        }
        if (services.hashCode(code) !== notification.return_code_hash) throw new NotificationCommandError(400, 'Invalid return code.');
        await repository.markReturned(id, input.userId);
        await repository.releaseBorrowerIfMatch(notification.product_id, notification.borrower_id);
        return { returned: true };
      });
    }
  };
}