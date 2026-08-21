import {
  getUnavailableRanges,
  isValidDateOnly,
  normalizeWindow,
  toDateOnly,
  type AvailabilityWindow,
  type DateRange
} from '../../domain/booking/availability.mjs';
import { MAX_LOAN_DAYS } from '../notifications/createBorrowRequest.mjs';

export class AvailabilityError extends Error {
  constructor(public readonly statusCode: 400 | 404, message: string) {
    super(message);
    this.name = 'AvailabilityError';
  }
}

export interface AvailabilityRepository {
  existsActive(productId: number): Promise<boolean | null>;
  listWindows(productId: number): Promise<readonly Record<string, unknown>[]>;
  listBookedRanges(productId: number): Promise<readonly Record<string, unknown>[]>;
}

export interface AvailabilityView {
  readonly windows: readonly AvailabilityWindow[];
  /** Blackouts and live bookings merged: the days a borrower cannot pick. */
  readonly unavailableRanges: readonly DateRange[];
  readonly maxLoanDays: number;
}

export function createGetAvailabilityUseCase(repository: AvailabilityRepository) {
  return {
    async execute(productId: number): Promise<AvailabilityView> {
      if (!Number.isInteger(productId) || productId <= 0) {
        throw new AvailabilityError(400, 'Invalid product');
      }

      const isActive = await repository.existsActive(productId);

      if (isActive === null) {
        throw new AvailabilityError(404, 'Product not found');
      }

      if (!isActive) {
        throw new AvailabilityError(400, 'Listing is no longer available');
      }

      const [windowRows, bookedRows] = await Promise.all([
        repository.listWindows(productId),
        repository.listBookedRanges(productId)
      ]);

      const windows = windowRows
        .map((row) => normalizeWindow(row))
        .filter((window): window is AvailabilityWindow => window !== null);

      const bookedRanges = bookedRows
        .map((row) => ({
          startDate: toDateOnly(row.start_date),
          endDate: toDateOnly(row.due_date)
        }))
        .filter((range) => isValidDateOnly(range.startDate) && isValidDateOnly(range.endDate));

      return {
        windows,
        unavailableRanges: getUnavailableRanges(windows, bookedRanges),
        maxLoanDays: MAX_LOAN_DAYS
      };
    }
  };
}
