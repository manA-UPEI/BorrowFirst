const userModel = require('../models/userModel');
const ratingModel = require('../models/ratingModel');
const notificationModel = require('../models/notificationModel');
const { hashPassword, verifyPassword } = require('../services/passwordService');
const {
  generateOtpCode,
  getOtpExpiry,
  hashOtp,
  sendOtpEmail
} = require('../services/otpService');
const {
  normalizeEmail,
  normalizeCollapsedText,
  isValidUpeiEmail,
  validateDisplayName,
  validateFullName,
  validateRegistrationFields,
  getValidatedContactFields
} = require('../services/validationService');

const OTP_MAX_ATTEMPTS = 5;
const INVALID_OTP_MESSAGE = 'Invalid or expired verification code.';
const GENERIC_OTP_RESPONSE = {
  success: true,
  requiresVerification: true,
  message: 'If the email is eligible, a verification code has been sent.',
  deliveryMode: 'email'
};

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function sendGenericOtpResponse(res) {
  res.json(GENERIC_OTP_RESPONSE);
}

async function requestRegisterOtp(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const username = normalizeCollapsedText(req.body.username);
  const fullName = normalizeCollapsedText(req.body.fullName);
  const validationMessage = validateRegistrationFields({ username, fullName, email, password });
  const contactFields = getValidatedContactFields({
    address: req.body.address,
    phone: req.body.phone,
    country: req.body.country
  });

  if (validationMessage) {
    res.status(400).json({ message: validationMessage });
    return;
  }

  if (contactFields.message) {
    res.status(400).json({ message: contactFields.message });
    return;
  }

  const existingUser = await userModel.findByEmail(email);

  if (existingUser) {
    sendGenericOtpResponse(res);
    return;
  }

  const otpCode = generateOtpCode();
  await userModel.upsertPendingRegistration({
    username,
    fullName,
    email,
    passwordHash: hashPassword(password),
    address: contactFields.address,
    phone: contactFields.phone,
    country: contactFields.country,
    otpHash: hashOtp(otpCode),
    expiresAt: getOtpExpiry()
  });

  try {
    await sendOtpEmail(email, otpCode);
  } catch (error) {
    await userModel.deletePendingRegistration(email);
    res.status(500).json({ message: error.message || 'Unable to send verification email' });
    return;
  }

  sendGenericOtpResponse(res);
}

async function verifyRegisterOtp(req, res) {
  const email = normalizeEmail(req.body.email);
  const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';

  if (!isValidUpeiEmail(email)) {
    res.status(400).json({ message: 'Email must end with @upei.ca' });
    return;
  }

  if (!/^\d{6}$/.test(otp)) {
    res.status(400).json({ message: 'Verification code must be 6 digits' });
    return;
  }

  const pendingRegistration = await userModel.findPendingRegistrationByEmail(email);

  if (!pendingRegistration) {
    res.status(400).json({ message: INVALID_OTP_MESSAGE });
    return;
  }

  if (
    new Date(pendingRegistration.expires_at).getTime() < Date.now()
    || Number(pendingRegistration.otp_attempts) >= OTP_MAX_ATTEMPTS
  ) {
    await userModel.deletePendingRegistration(email);
    res.status(400).json({ message: INVALID_OTP_MESSAGE });
    return;
  }

  if (pendingRegistration.otp_hash !== hashOtp(otp)) {
    const attempts = await userModel.incrementPendingRegistrationOtpAttempts(email);

    if (attempts >= OTP_MAX_ATTEMPTS) {
      await userModel.deletePendingRegistration(email);
    }

    res.status(400).json({ message: INVALID_OTP_MESSAGE });
    return;
  }

  const contactFields = getValidatedContactFields({
    address: pendingRegistration.address,
    phone: pendingRegistration.phone,
    country: pendingRegistration.country
  });

  if (contactFields.message) {
    await userModel.deletePendingRegistration(email);
    res.status(400).json({ message: 'Registration details are invalid. Please start again.' });
    return;
  }

  try {
    const userId = await userModel.createUser({
      username: pendingRegistration.username,
      fullName: pendingRegistration.full_name,
      email: pendingRegistration.email,
      password: pendingRegistration.password_hash,
      address: contactFields.address,
      phone: contactFields.phone,
      country: contactFields.country
    });

    await userModel.deletePendingRegistration(email);
    await regenerateSession(req);
    req.session.userId = userId;
    res.json({ success: true });
  } catch (error) {
    await userModel.deletePendingRegistration(email);
    res.status(400).json({ message: 'Account already exists' });
  }
}

async function login(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!isValidUpeiEmail(email)) {
    res.status(400).json({ message: 'Email must end with @upei.ca' });
    return;
  }

  if (!password) {
    res.status(400).json({ message: 'Password is required' });
    return;
  }

  const user = await userModel.findByEmail(email);

  if (!user || !verifyPassword(password, user.password)) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  if (!user.password.startsWith('scrypt$')) {
    await userModel.updatePassword(user.id, hashPassword(password));
  }

  await regenerateSession(req);
  req.session.userId = user.id;
  res.json({ success: true });
}

async function logout(req, res) {
  await new Promise((resolve) => {
    req.session.destroy(resolve);
  });

  res.clearCookie(process.env.SESSION_NAME || 'borrowfirst.sid', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
  res.json({ success: true });
}

async function me(req, res) {
  const user = await userModel.findById(req.session.userId);

  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  res.json(user);
}

async function userProfile(req, res) {
  const sessionUserId = Number(req.session.userId);
  const requestedTargetUserId = Number(req.params.id);
  const interactionId = Number(req.query.interaction);

  if (!Number.isInteger(requestedTargetUserId) || requestedTargetUserId <= 0) {
    res.status(400).json({ message: 'Invalid user' });
    return;
  }

  let targetUserId = requestedTargetUserId;
  let relationship = null;

  if (targetUserId !== sessionUserId) {
    if (Number.isInteger(interactionId) && interactionId > 0) {
      relationship = await notificationModel.findInteractionByIdForUser(sessionUserId, interactionId);

      if (relationship) {
        targetUserId = relationship.counterpart_id;
      }
    }

    if (!relationship) {
      relationship = await notificationModel.findInteractionBetweenUsers(
        sessionUserId,
        targetUserId
      );
    }

    if (!relationship) {
      res.status(403).json({ message: 'You can only view profiles of users you have interacted with.' });
      return;
    }
  }

  const isSelf = targetUserId === sessionUserId;
  const user = isSelf
    ? await userModel.findById(targetUserId)
    : await userModel.findPublicById(targetUserId);

  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  const [summary, ratings] = await Promise.all([
    ratingModel.getSummary(targetUserId),
    ratingModel.listRecentRatings(targetUserId)
  ]);

  res.json({
    user,
    ratings: {
      count: summary ? summary.count || 0 : 0,
      average: summary && summary.average ? Number(summary.average) : 0,
      ratings
    },
    relationship,
    isSelf
  });
}

async function updateMe(req, res) {
  const username = normalizeCollapsedText(req.body.username);
  const fullName = normalizeCollapsedText(req.body.fullName);
  const email = normalizeEmail(req.body.email);
  const contactFields = getValidatedContactFields({
    address: req.body.address,
    phone: req.body.phone,
    country: req.body.country
  });
  const displayNameMessage = validateDisplayName(username);
  const fullNameMessage = validateFullName(fullName);

  if (displayNameMessage) {
    res.status(400).json({ message: displayNameMessage });
    return;
  }

  if (fullNameMessage) {
    res.status(400).json({ message: fullNameMessage });
    return;
  }

  if (!isValidUpeiEmail(email)) {
    res.status(400).json({ message: 'Email must end with @upei.ca' });
    return;
  }

  if (contactFields.message) {
    res.status(400).json({ message: contactFields.message });
    return;
  }

  try {
    await userModel.updateProfile(req.session.userId, {
      username,
      fullName,
      email,
      address: contactFields.address,
      phone: contactFields.phone,
      country: contactFields.country
    });
  } catch (error) {
    res.status(400).json({ message: 'That email is already in use' });
    return;
  }

  const user = await userModel.findById(req.session.userId);
  res.json({ success: true, user });
}

module.exports = {
  requestRegisterOtp,
  verifyRegisterOtp,
  login,
  logout,
  me,
  userProfile,
  updateMe
};
