const { run, get, all } = require('../db/connection');

async function upsertRating({ userId, userEmail, raterId, rating }) {
  const result = await run(
    `INSERT INTO ratings (user_id, user_email, rater_id, rating, created_at)
     VALUES (?, ?, ?, ?, NOW())
     ON CONFLICT(user_id, rater_id) DO UPDATE SET
       user_email = excluded.user_email,
       rating = excluded.rating,
       created_at = NOW()
     RETURNING id AS "lastID"`,
    [userId, userEmail, raterId, rating]
  );

  return result.lastID;
}

function getSummary(userId) {
  return get(
    'SELECT COUNT(*) AS count, AVG(rating) AS average FROM ratings WHERE user_id = ?',
    [userId]
  );
}

function listRecentRatings(userId) {
  return all(
    `SELECT r.rating,
            r.created_at,
            u.full_name AS rater_full_name,
            u.username AS rater_username
     FROM ratings r
     JOIN users u ON u.id = r.rater_id
     WHERE r.user_id = ?
     ORDER BY r.created_at DESC
     LIMIT 5`,
    [userId]
  );
}

module.exports = {
  upsertRating,
  getSummary,
  listRecentRatings
};
