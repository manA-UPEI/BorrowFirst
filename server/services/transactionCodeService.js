const crypto = require('crypto');
const { hashOtp } = require('./otpService');

const PICKUP_CODE_TTL_MINUTES = 15;
const RETURN_CODE_TTL_MINUTES = 15;
const APPROVAL_RESERVATION_HOURS = 48;

function getTransactionCodeSecret() {
  if (process.env.TRANSACTION_CODE_SECRET) {
    return process.env.TRANSACTION_CODE_SECRET;
  }

  return crypto
    .createHash('sha256')
    .update(`${process.env.SESSION_SECRET}:borrowfirst:transaction-codes:v1`)
    .digest();
}

function getIsoOffset({ minutes = 0, hours = 0 }, referenceDate = new Date()) {
  const nextDate = new Date(referenceDate.getTime() + (minutes * 60000) + (hours * 3600000));
  return nextDate.toISOString();
}

function createDeterministicOtp(notificationId, purpose, expiresAt) {
  const digest = crypto
    .createHmac('sha256', getTransactionCodeSecret())
    .update(`${purpose}:${notificationId}:${expiresAt}`)
    .digest();
  const numericCode = digest.readUInt32BE(0) % 1000000;

  return String(numericCode).padStart(6, '0');
}

function buildTransactionCode(notificationId, purpose, expiresAt) {
  if (!Number.isInteger(Number(notificationId)) || !expiresAt) {
    return '';
  }

  return createDeterministicOtp(Number(notificationId), purpose, String(expiresAt));
}

function createTransactionCodeRecord(notificationId, purpose, ttlMinutes) {
  const expiresAt = getIsoOffset({ minutes: ttlMinutes });
  const code = buildTransactionCode(notificationId, purpose, expiresAt);

  return {
    code,
    hash: hashOtp(code),
    expiresAt
  };
}

function createPickupCodeRecord(notificationId) {
  return createTransactionCodeRecord(notificationId, 'pickup', PICKUP_CODE_TTL_MINUTES);
}

function createReturnCodeRecord(notificationId) {
  return createTransactionCodeRecord(notificationId, 'return', RETURN_CODE_TTL_MINUTES);
}

function getApprovalExpiry() {
  return getIsoOffset({ hours: APPROVAL_RESERVATION_HOURS });
}

module.exports = {
  PICKUP_CODE_TTL_MINUTES,
  RETURN_CODE_TTL_MINUTES,
  APPROVAL_RESERVATION_HOURS,
  buildTransactionCode,
  createPickupCodeRecord,
  createReturnCodeRecord,
  getApprovalExpiry
};
