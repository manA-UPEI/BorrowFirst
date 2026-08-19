import type { BorrowRequestPolicy } from '../ports/borrowRequestPolicy.mjs';
import type { BorrowRequestRepository, PickupOption } from '../ports/borrowRequestRepository.mjs';

export class BorrowRequestError extends Error {
  constructor(public readonly statusCode: 400 | 404, message: string) {
    super(message);
    this.name = 'BorrowRequestError';
  }
}

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function getTodayDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidDateTimeLocal(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);
  return date.getFullYear() === year && date.getMonth() === month - 1
    && date.getDate() === day && date.getHours() === hours && date.getMinutes() === minutes;
}

function parseTime(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return Number.NaN;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hours += 12;
  return hours * 60 + Number(match[2]);
}

function validatePickupMeetup(value: string, option: PickupOption, dueDate: string): string {
  if (!isValidDateTimeLocal(value)) return 'Invalid pickup meetup date and time';
  if (new Date(value).getTime() <= Date.now()) return 'Pickup meetup must be in the future';
  const meetupMinutes = Number(value.slice(11, 16).split(':')[0]) * 60 + Number(value.slice(14, 16));
  const start = parseTime(option.startTime);
  const end = parseTime(option.endTime);
  if ([meetupMinutes, start, end].some(Number.isNaN)) return 'Pickup option availability is invalid';
  if (meetupMinutes < start || meetupMinutes > end) {
    return `Pickup meetup must be between ${option.startTime} and ${option.endTime}`;
  }
  if (isValidDateOnly(dueDate) && dueDate < value.slice(0, 10)) {
    return 'Due date must be on or after the pickup meetup date';
  }
  return '';
}

export function createBorrowRequestUseCase(
  repository: BorrowRequestRepository,
  policy: BorrowRequestPolicy
) {
  return {
    async execute(input: {
      borrowerId: number;
      productId: unknown;
      pickupOption: unknown;
      pickupMeetupAt: unknown;
      dueDate: unknown;
    }): Promise<number> {
      await repository.expireStaleApprovals();
      const productId = Number(input.productId);
      const pickupOption = Number(input.pickupOption);
      const pickupMeetupAt = typeof input.pickupMeetupAt === 'string' ? input.pickupMeetupAt.trim() : '';
      const dueDate = typeof input.dueDate === 'string' ? input.dueDate.trim() : '';

      if (!Number.isInteger(productId) || productId <= 0) throw new BorrowRequestError(400, 'Invalid product');
      if (!Number.isInteger(pickupOption) || pickupOption <= 0) throw new BorrowRequestError(400, 'Invalid request');
      if (!isValidDateOnly(dueDate)) throw new BorrowRequestError(400, 'Invalid due date');
      if (!isValidDateTimeLocal(pickupMeetupAt)) throw new BorrowRequestError(400, 'Invalid pickup meetup date and time');
      if (dueDate < getTodayDateValue()) throw new BorrowRequestError(400, 'Due date cannot be in the past');

      const current = await repository.listCurrentTransactions(input.borrowerId);
      const blocker = current.map((entry) => policy.decorate(entry, input.borrowerId))
        .find((entry) => entry.role === 'borrower' && entry.blocks_new_requests);
      if (blocker) throw new BorrowRequestError(400, policy.getBlockMessage(blocker));

      const product = await repository.findProduct(productId);
      if (!product) throw new BorrowRequestError(404, 'Product not found');
      if (!product.isActive) throw new BorrowRequestError(400, 'Listing is no longer available');
      if (product.lenderId === input.borrowerId) throw new BorrowRequestError(400, 'Cannot request your own item');
      if (product.borrowerId !== null) throw new BorrowRequestError(400, 'Item is already unavailable');

      await repository.ensurePickupOptions(productId);
      const option = (await repository.listPickupOptions(productId)).find((item) => item.optionIndex === pickupOption);
      if (!option) throw new BorrowRequestError(400, 'Invalid pickup option');
      const validationMessage = validatePickupMeetup(pickupMeetupAt, option, dueDate);
      if (validationMessage) throw new BorrowRequestError(400, validationMessage);
      if (await repository.findPendingRequest(productId, input.borrowerId)) {
        throw new BorrowRequestError(400, 'You already requested this item');
      }

      return repository.createRequest({
        productId,
        lenderId: product.lenderId,
        borrowerId: input.borrowerId,
        pickupOption,
        pickupMeetupAt,
        dueDate
      });
    }
  };
}