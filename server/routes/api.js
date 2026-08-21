const express = require('express');

const createRateLimit = require('../middleware/rateLimit');
const parseProductImages = require('../middleware/parseProductImages');
const { normalizeEmail } = require('../services/validationService');
const productListControllerModule = import('../../dist/src/interface/http/productListController.mjs');
const loginControllerModule = import('../../dist/src/interface/http/loginController.mjs');
const productCreateControllerModule = import('../../dist/src/interface/http/productCreateController.mjs');
const productRemoveControllerModule = import('../../dist/src/interface/http/productRemoveController.mjs');
const pickupOptionsControllerModule = import('../../dist/src/interface/http/pickupOptionsController.mjs');
const productDetailsControllerModule = import('../../dist/src/interface/http/productDetailsController.mjs');
const availabilityControllerModule = import('../../dist/src/interface/http/availabilityController.mjs');
const myTransactionsControllerModule = import('../../dist/src/interface/http/myTransactionsController.mjs');
const historyControllerModule = import('../../dist/src/interface/http/historyController.mjs');
const ratingQueryControllerModule = import('../../dist/src/interface/http/ratingQueryController.mjs');
const createRatingControllerModule = import('../../dist/src/interface/http/createRatingController.mjs');
const notificationListControllerModule = import('../../dist/src/interface/http/notificationListController.mjs');
const createBorrowRequestControllerModule = import('../../dist/src/interface/http/createBorrowRequestController.mjs');
const updateNotificationControllerModule = import('../../dist/src/interface/http/updateNotificationController.mjs');
const profileQueryControllerModule = import('../../dist/src/interface/http/profileQueryController.mjs');
const updateProfileControllerModule = import('../../dist/src/interface/http/updateProfileController.mjs');
const registrationControllerModule = import('../../dist/src/interface/http/registrationController.mjs');
const logoutControllerModule = import('../../dist/src/interface/http/logoutController.mjs');
const passwordResetControllerModule = import('../../dist/src/interface/http/passwordResetController.mjs');

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
  const requestPasswordResetLimiter = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    prefix: 'password-reset-request',
    key: authRateLimitKey
  });
  const resetPasswordLimiter = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    prefix: 'password-reset-confirm',
    key: authRateLimitKey
  });
  const ratingLimiter = createRateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    prefix: 'ratings',
    key: (req) => `${req.ip || 'unknown'}:${req.session?.userId || 'anonymous'}`
  });

  router.get('/register/config', asyncHandler(async (req, res) => {
    const { registerConfigHandler } = await registrationControllerModule;
    return registerConfigHandler(req, res);
  }));
  router.post('/register/request-otp', registerLimiter, asyncHandler(async (req, res) => {
    const { requestRegistrationHandler } = await registrationControllerModule;
    return requestRegistrationHandler(req, res);
  }));
  router.post('/register/verify-otp', verifyLimiter, asyncHandler(async (req, res) => {
    const { verifyRegistrationHandler } = await registrationControllerModule;
    return verifyRegistrationHandler(req, res);
  }));
  router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    const { loginHandler } = await loginControllerModule;
    return loginHandler(req, res);
  }));
  router.post('/logout', asyncHandler(async (req, res) => {
    const { logoutHandler } = await logoutControllerModule;
    return logoutHandler(req, res);
  }));
  router.post('/password/forgot', requestPasswordResetLimiter, asyncHandler(async (req, res) => {
    const { requestPasswordResetHandler } = await passwordResetControllerModule;
    return requestPasswordResetHandler(req, res);
  }));
  router.post('/password/reset', resetPasswordLimiter, asyncHandler(async (req, res) => {
    const { resetPasswordHandler } = await passwordResetControllerModule;
    return resetPasswordHandler(req, res);
  }));
  router.get('/me', asyncHandler(async (req, res) => {
    const { currentUserHandler } = await profileQueryControllerModule;
    return currentUserHandler(req, res);
  }));
  router.post('/me', asyncHandler(async (req, res) => {
    const { updateProfileHandler } = await updateProfileControllerModule;
    return updateProfileHandler(req, res);
  }));
  router.get('/users/:id/profile', asyncHandler(async (req, res) => {
    const { userProfileHandler } = await profileQueryControllerModule;
    return userProfileHandler(req, res);
  }));

  router.get('/products', asyncHandler(async (req, res) => {
    const { listProductsHandler } = await productListControllerModule;
    return listProductsHandler(req, res);
  }));
  router.post('/products', parseProductImages, asyncHandler(async (req, res) => {
    const { createProductHandler } = await productCreateControllerModule;
    return createProductHandler(req, res);
  }));
  router.get('/products/:id', asyncHandler(async (req, res) => {
    const { productDetailsHandler } = await productDetailsControllerModule;
    return productDetailsHandler(req, res);
  }));
  router.post('/products/:id/remove', asyncHandler(async (req, res) => {
    const { removeProductHandler } = await productRemoveControllerModule;
    return removeProductHandler(req, res);
  }));
  router.get('/products/:id/availability', asyncHandler(async (req, res) => {
    const { availabilityHandler } = await availabilityControllerModule;
    return availabilityHandler(req, res);
  }));
  router.get('/pickup-options/:productId', asyncHandler(async (req, res) => {
    const { pickupOptionsHandler } = await pickupOptionsControllerModule;
    return pickupOptionsHandler(req, res);
  }));

  router.get('/ratings/eligible', asyncHandler(async (req, res) => {
    const { eligibleRatingsHandler } = await ratingQueryControllerModule;
    return eligibleRatingsHandler(req, res);
  }));
  router.post('/ratings', ratingLimiter, asyncHandler(async (req, res) => {
    const { createRatingHandler } = await createRatingControllerModule;
    return createRatingHandler(req, res);
  }));
  router.get('/ratings/me', asyncHandler(async (req, res) => {
    const { myRatingsHandler } = await ratingQueryControllerModule;
    return myRatingsHandler(req, res);
  }));

  router.post('/notifications', asyncHandler(async (req, res) => {
    const { createBorrowRequestHandler } = await createBorrowRequestControllerModule;
    return createBorrowRequestHandler(req, res);
  }));
  router.get('/notifications', asyncHandler(async (req, res) => {
    const { notificationListHandler } = await notificationListControllerModule;
    return notificationListHandler(req, res);
  }));
  router.post('/notifications/:id', asyncHandler(async (req, res) => {
    const { updateNotificationHandler } = await updateNotificationControllerModule;
    return updateNotificationHandler(req, res);
  }));
  router.get('/transactions/me', asyncHandler(async (req, res) => {
    const { myTransactionsHandler } = await myTransactionsControllerModule;
    return myTransactionsHandler(req, res);
  }));

  router.get('/history/me', asyncHandler(async (req, res) => {
    const { historyHandler } = await historyControllerModule;
    return historyHandler(req, res);
  }));
  router.get('/alerts/me', asyncHandler(async (req, res) => {
    const { alertsHandler } = await historyControllerModule;
    return alertsHandler(req, res);
  }));

  return router;
}

module.exports = createApiRoutes;
