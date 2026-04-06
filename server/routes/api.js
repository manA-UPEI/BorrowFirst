const express = require('express');

const authController = require('../controllers/authController');
const historyController = require('../controllers/historyController');
const notificationController = require('../controllers/notificationController');
const productController = require('../controllers/productController');
const ratingController = require('../controllers/ratingController');
const transactionController = require('../controllers/transactionController');
const createRateLimit = require('../middleware/rateLimit');
const parseProductImages = require('../middleware/parseProductImages');
const { normalizeEmail } = require('../services/validationService');

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function createApiRoutes() {
  const router = express.Router();
  const authRateLimitKey = (req) => `${req.ip || 'unknown'}:${normalizeEmail(req.body?.email) || 'unknown'}`;
  const loginLimiter = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    prefix: 'login',
    key: authRateLimitKey
  });
  const registerLimiter = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    prefix: 'register-otp',
    key: authRateLimitKey
  });
  const verifyLimiter = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    prefix: 'verify-otp',
    key: authRateLimitKey
  });
  const ratingLimiter = createRateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    prefix: 'ratings',
    key: (req) => `${req.ip || 'unknown'}:${req.session?.userId || 'anonymous'}`
  });

  router.post('/register/request-otp', registerLimiter, asyncHandler(authController.requestRegisterOtp));
  router.post('/register/verify-otp', verifyLimiter, asyncHandler(authController.verifyRegisterOtp));
  router.post('/login', loginLimiter, asyncHandler(authController.login));
  router.post('/logout', asyncHandler(authController.logout));
  router.get('/me', asyncHandler(authController.me));
  router.post('/me', asyncHandler(authController.updateMe));
  router.get('/users/:id/profile', asyncHandler(authController.userProfile));

  router.get('/products', asyncHandler(productController.list));
  router.post('/products', parseProductImages, asyncHandler(productController.create));
  router.get('/products/:id', asyncHandler(productController.details));
  router.post('/products/:id/remove', asyncHandler(productController.remove));
  router.get('/pickup-options/:productId', asyncHandler(productController.pickupOptions));

  router.get('/ratings/eligible', asyncHandler(ratingController.eligible));
  router.post('/ratings', ratingLimiter, asyncHandler(ratingController.create));
  router.get('/ratings/me', asyncHandler(ratingController.mine));

  router.post('/notifications', asyncHandler(notificationController.create));
  router.get('/notifications', asyncHandler(notificationController.list));
  router.post('/notifications/:id', asyncHandler(notificationController.update));
  router.get('/transactions/me', asyncHandler(transactionController.mine));

  router.get('/history/me', asyncHandler(historyController.mine));
  router.get('/alerts/me', asyncHandler(historyController.alerts));

  return router;
}

module.exports = createApiRoutes;
