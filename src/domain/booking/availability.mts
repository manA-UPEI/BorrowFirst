/**
 * Booking rules for a date-ranged loan.
 *
 * Everything here is pure: it takes the lender's declared windows, the ranges
 * already spoken for, and a requested range, and decides whether the request is
 * allowed. No IO, no clock -- `today` is passed in -- so every rule is directly
 * testable and the same logic can run on either side of the request boundary.
 */

/** A calendar day as `YYYY-MM-DD`. Lexicographic order is chronological order. */
export type DateOnly = string;

export type AvailabilityKind = 'available' | 'blackout';

export interface DateRange {
  readonly startDate: DateOnly;
  readonly endDate: DateOnly;
}

export interface AvailabilityWindow extends DateRange {
  readonly kind: AvailabilityKind;
}

export interface BookingCheck {
  readonly ok: boolean;
  readonly reason: string;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  // Rejects the calendar-shaped-but-nonexistent, e.g. 2026-02-30.
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/**
 * Normalizes a database date column to `YYYY-MM-DD`.
 *
 * Real Postgres returns DATE as a string via the parser registered in
 * server/db/connection.js, but pg-mem -- the in-memory fallback the test suite
 * runs on -- hands back a JavaScript Date at UTC midnight instead. Accepting both
 * keeps these rules behaving identically in tests and in production.
 */
export function toDateOnly(value: unknown): DateOnly {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return '';
}

/** Inclusive on both ends: returning on the day another loan starts is a clash. */
export function rangesOverlap(left: DateRange, right: DateRange): boolean {
  return left.startDate <= right.endDate && right.startDate <= left.endDate;
}

function contains(outer: DateRange, inner: DateRange): boolean {
  return outer.startDate <= inner.startDate && outer.endDate >= inner.endDate;
}

export function normalizeWindow(row: {
  kind?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}): AvailabilityWindow | null {
  const startDate = toDateOnly(row.start_date ?? row.startDate);
  const endDate = toDateOnly(row.end_date ?? row.endDate);
  const kind = row.kind === 'blackout' ? 'blackout' : 'available';

  if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate) || endDate < startDate) {
    return null;
  }

  return { kind, startDate, endDate };
}

export interface BookingRequestInput {
  readonly requested: DateRange;
  readonly windows: readonly AvailabilityWindow[];
  readonly bookedRanges: readonly DateRange[];
  readonly today: DateOnly;
  readonly maxLoanDays?: number;
}

export function daysBetween(range: DateRange): number {
  const start = Date.parse(`${range.startDate}T00:00:00Z`);
  const end = Date.parse(`${range.endDate}T00:00:00Z`);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }

  // Inclusive: borrowing for a single day is one day, not zero.
  return Math.round((end - start) / 86400000) + 1;
}

export function checkBooking(input: BookingRequestInput): BookingCheck {
  const { requested, windows, bookedRanges, today, maxLoanDays } = input;

  if (!isValidDateOnly(requested.startDate)) {
    return { ok: false, reason: 'Invalid start date' };
  }

  if (!isValidDateOnly(requested.endDate)) {
    return { ok: false, reason: 'Invalid return date' };
  }

  if (requested.endDate < requested.startDate) {
    return { ok: false, reason: 'Return date must be on or after the start date' };
  }

  if (requested.startDate < today) {
    return { ok: false, reason: 'Start date cannot be in the past' };
  }

  if (maxLoanDays && daysBetween(requested) > maxLoanDays) {
    return { ok: false, reason: `Loans are limited to ${maxLoanDays} days` };
  }

  const availableWindows = windows.filter((window) => window.kind === 'available');

  // No declared windows means the lender never restricted the listing, which is
  // how every listing created before availability existed behaves.
  if (availableWindows.length > 0 && !availableWindows.some((window) => contains(window, requested))) {
    return { ok: false, reason: 'That range falls outside the dates this item is offered' };
  }

  const blackout = windows
    .filter((window) => window.kind === 'blackout')
    .find((window) => rangesOverlap(window, requested));

  if (blackout) {
    return {
      ok: false,
      reason: `The lender is unavailable from ${blackout.startDate} to ${blackout.endDate}`
    };
  }

  const clash = bookedRanges.find((booked) => rangesOverlap(booked, requested));

  if (clash) {
    return {
      ok: false,
      reason: `Already booked from ${clash.startDate} to ${clash.endDate}`
    };
  }

  return { ok: true, reason: '' };
}

/**
 * The ranges a borrower cannot pick, for rendering on a calendar. Blackouts and
 * live bookings are the same thing from the borrower's side: days that are gone.
 */
export function getUnavailableRanges(
  windows: readonly AvailabilityWindow[],
  bookedRanges: readonly DateRange[]
): readonly DateRange[] {
  return [
    ...windows
      .filter((window) => window.kind === 'blackout')
      .map((window) => ({ startDate: window.startDate, endDate: window.endDate })),
    ...bookedRanges
  ].sort((left, right) => (left.startDate < right.startDate ? -1 : 1));
}
