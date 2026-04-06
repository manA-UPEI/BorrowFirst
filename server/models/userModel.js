const { run, get, all } = require('../db/connection');

async function createUser({ username, fullName, email, password, address = '', phone = '', country = '' }) {
  const result = await run(
    `INSERT INTO users (username, full_name, email, password, address, phone, country)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id AS "lastID"`,
    [username, fullName || username, email, password, address, phone, country]
  );

  return result.lastID;
}

function findByEmail(email) {
  return get('SELECT * FROM users WHERE email = ?', [email]);
}

function findById(id) {
  return get(
    `SELECT id,
            username,
            full_name,
            email,
            address,
            phone,
            country,
            points,
            rating_count,
            rating_avg
     FROM users
     WHERE id = ?`,
    [id]
  );
}

function findPublicById(id) {
  return get(
    `SELECT id,
            username,
            full_name,
            points,
            rating_count,
            rating_avg
     FROM users
     WHERE id = ?`,
    [id]
  );
}

function findRateableUsers(userId) {
  return all(
    `SELECT DISTINCT u.id, u.username, u.email
     FROM users u
     JOIN products p ON (
       (p."Product_Lender_ID" = ? AND p."Product_Borrower_ID" = u.id) OR
       (p."Product_Borrower_ID" = ? AND p."Product_Lender_ID" = u.id)
     )
     WHERE u.id != ?
     ORDER BY u.username, u.email`,
    [userId, userId, userId]
  );
}

function findRatingTarget(raterId, targetUserId) {
  return get(
    `SELECT u.id, u.email, u.username
     FROM users u
     JOIN products p ON (
       (p."Product_Lender_ID" = ? AND p."Product_Borrower_ID" = u.id) OR
       (p."Product_Borrower_ID" = ? AND p."Product_Lender_ID" = u.id)
     )
     WHERE u.id = ?
     LIMIT 1`,
    [raterId, raterId, targetUserId]
  );
}

async function updateRatingStats(userId, ratingCount, ratingAverage) {
  await run(
    'UPDATE users SET rating_count = ?, rating_avg = ? WHERE id = ?',
    [ratingCount, ratingAverage, userId]
  );
}

async function updateProfile(userId, { username, fullName, email, address, phone, country }) {
  await run(
    `UPDATE users
     SET username = ?,
         full_name = ?,
         email = ?,
         address = ?,
         phone = ?,
         country = ?
     WHERE id = ?`,
    [username, fullName, email, address, phone, country, userId]
  );
}

async function updatePassword(userId, passwordHash) {
  await run('UPDATE users SET password = ? WHERE id = ?', [passwordHash, userId]);
}

async function upsertPendingRegistration({
  username,
  fullName,
  email,
  passwordHash,
  address,
  phone,
  country,
  otpHash,
  expiresAt
}) {
  await run(
    `INSERT INTO pending_registrations (
      email,
      username,
      full_name,
      password_hash,
      address,
      phone,
      country,
      otp_hash,
      expires_at,
      otp_attempts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      username = excluded.username,
      full_name = excluded.full_name,
      password_hash = excluded.password_hash,
      address = excluded.address,
      phone = excluded.phone,
      country = excluded.country,
      otp_hash = excluded.otp_hash,
      expires_at = excluded.expires_at,
      otp_attempts = 0,
      created_at = NOW()`,
    [email, username, fullName, passwordHash, address, phone, country, otpHash, expiresAt, 0]
  );
}

function findPendingRegistrationByEmail(email) {
  return get('SELECT * FROM pending_registrations WHERE email = ?', [email]);
}

async function incrementPendingRegistrationOtpAttempts(email) {
  await run(
    'UPDATE pending_registrations SET otp_attempts = COALESCE(otp_attempts, 0) + 1 WHERE email = ?',
    [email]
  );

  const row = await get(
    'SELECT otp_attempts FROM pending_registrations WHERE email = ?',
    [email]
  );

  return row ? Number(row.otp_attempts) || 0 : 0;
}

async function deletePendingRegistration(email) {
  await run('DELETE FROM pending_registrations WHERE email = ?', [email]);
}

module.exports = {
  createUser,
  findByEmail,
  findById,
  findPublicById,
  findRateableUsers,
  findRatingTarget,
  updateRatingStats,
  updateProfile,
  updatePassword,
  upsertPendingRegistration,
  findPendingRegistrationByEmail,
  incrementPendingRegistrationOtpAttempts,
  deletePendingRegistration
};
