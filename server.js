require('dotenv').config();

const createApp = require('./server/app');
const { getAppOrigin } = require('./server/services/originService');

function hasEmailConfig() {
  return Boolean(
    process.env.RESEND_API_KEY
    || (
      process.env.SMTP_HOST
      && process.env.SMTP_PORT
      && process.env.SMTP_USER
      && process.env.SMTP_PASS
      && process.env.OTP_FROM_EMAIL
    )
  );
}

function hasCloudinaryConfig() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME
    && process.env.CLOUDINARY_API_KEY
    && process.env.CLOUDINARY_API_SECRET
  );
}

function validateEnvironment() {
  const isProduction = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT || 3000);
  const appOrigin = getAppOrigin();
  const databaseUrl = typeof process.env.DATABASE_URL === 'string'
    ? process.env.DATABASE_URL.trim()
    : '';
  const sessionSecret = typeof process.env.SESSION_SECRET === 'string'
    ? process.env.SESSION_SECRET.trim()
    : '';
  const rawTrustProxy = typeof process.env.TRUST_PROXY === 'string'
    ? process.env.TRUST_PROXY.trim()
    : '';

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer.');
  }

  if (!sessionSecret || sessionSecret === 'replace-with-a-long-random-secret') {
    throw new Error('SESSION_SECRET must be configured before starting BorrowFirst.');
  }

  if (!appOrigin) {
    throw new Error('APP_ORIGIN must be configured to the public app origin, or Render must provide RENDER_EXTERNAL_URL.');
  }

  if (isProduction && !databaseUrl) {
    throw new Error('DATABASE_URL must be configured before starting BorrowFirst in production.');
  }

  if (rawTrustProxy && rawTrustProxy !== 'true' && rawTrustProxy !== 'false') {
    const trustProxyValue = Number(rawTrustProxy);

    if (!Number.isInteger(trustProxyValue) || trustProxyValue < 0) {
      throw new Error('TRUST_PROXY must be 0, a positive integer, true, or false.');
    }
  }

  if (isProduction && !hasEmailConfig()) {
    throw new Error('OTP email delivery must be configured in production.');
  }

  if (isProduction && !hasCloudinaryConfig()) {
    throw new Error('Cloudinary image storage must be configured in production.');
  }

  return port;
}

async function startServer() {
  const port = validateEnvironment();
  const app = await createApp();

  app.listen(port, () => {
    console.log(`BorrowFirst running at http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start BorrowFirst.', error);
    process.exit(1);
  });
}

module.exports = {
  hasEmailConfig,
  hasCloudinaryConfig,
  validateEnvironment,
  startServer
};
