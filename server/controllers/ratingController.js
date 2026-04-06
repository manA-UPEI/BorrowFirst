const ratingModel = require('../models/ratingModel');
const notificationModel = require('../models/notificationModel');
const userModel = require('../models/userModel');

async function eligible(req, res) {
  const users = await notificationModel.listApprovedCounterpartiesForUser(req.session.userId);
  res.json(
    users.map((user) => ({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      current_rating: user.current_rating,
      rated_at: user.rated_at,
      last_interaction_at: user.last_interaction_at
    }))
  );
}

async function create(req, res) {
  const targetUserId = Number(req.body.userId);
  const rating = Number(req.body.rating);
  const raterId = req.session.userId;

  if (!Number.isInteger(targetUserId) || targetUserId === raterId) {
    res.status(400).json({ message: 'Invalid user to rate' });
    return;
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ message: 'Rating must be between 1 and 5' });
    return;
  }

  const targetUser = await notificationModel.findApprovedCounterparty(raterId, targetUserId);

  if (!targetUser) {
    res.status(403).json({ message: 'User is not eligible for rating' });
    return;
  }

  await ratingModel.upsertRating({
    userId: targetUserId,
    userEmail: targetUser.email,
    raterId,
    rating
  });

  const summary = await ratingModel.getSummary(targetUserId);

  await userModel.updateRatingStats(
    targetUserId,
    summary ? summary.count || 0 : 0,
    summary ? summary.average || 0 : 0
  );

  res.json({ success: true });
}

async function mine(req, res) {
  const [summary, ratings] = await Promise.all([
    ratingModel.getSummary(req.session.userId),
    ratingModel.listRecentRatings(req.session.userId)
  ]);

  res.json({
    count: summary ? summary.count || 0 : 0,
    average: summary && summary.average ? Number(summary.average) : 0,
    ratings
  });
}

module.exports = {
  eligible,
  create,
  mine
};
