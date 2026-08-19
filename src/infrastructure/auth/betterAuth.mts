import { createRequire } from 'node:module';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins/email-otp';

const loadLegacyModule = createRequire(import.meta.url);

const { db } = loadLegacyModule('../../../../server/db/connection') as { db: unknown };
const passwordService = loadLegacyModule('../../../../server/services/passwordService') as {
  hashPassword: (password: string) => string;
  verifyPassword: (password: string, hash: string) => boolean;
};
const otpService = loadLegacyModule('../../../../server/services/otpService') as {
  sendOtpEmail: (email: string, code: string) => Promise<{ deliveryMode: string }>;
};
const authModeService = loadLegacyModule('../../../../server/services/authModeService') as {
  isRegistrationOtpEnabled: () => boolean;
};

function isUpeiEmail(email: unknown): boolean {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith('@upei.ca');
}

export const otpRequired = authModeService.isRegistrationOtpEnabled();
const appOrigin = process.env.APP_ORIGIN || 'http://localhost:3000';
const authSecret = process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET;

interface NodeStyleResponse {
  setHeader: (name: string, value: string | string[]) => void;
}

// Controllers call auth.api.* directly (not through the /api/auth/* mounted
// handler) so they can keep this app's existing request/response contract. That
// means the Set-Cookie header Better Auth wants to send has to be copied onto our
// own Express response by hand -- this is that copy, mirroring what
// better-call's own Node adapter does for the mounted handler.
export function applyAuthResponseHeaders(headers: Headers, response: NodeStyleResponse): void {
  const setCookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];

  if (setCookies.length > 0) {
    response.setHeader('set-cookie', setCookies);
  }
}

export const auth = betterAuth({
  database: db as never,
  baseURL: appOrigin,
  basePath: '/api/auth',
  secret: authSecret,
  trustedOrigins: [appOrigin],

  advanced: {
    database: {
      // The existing `users` table (and every table that references it) uses a
      // SERIAL integer primary key. This tells Better Auth to let Postgres assign
      // ids instead of generating its own string ids, so no foreign key across
      // products/notifications/ratings needs to change.
      generateId: 'serial'
    },
    cookiePrefix: 'borrowfirst',
    defaultCookieAttributes: {
      // Better Auth defaults new cookies to SameSite=Lax; this app's origin-check
      // CSRF defense (requireSameOrigin.js) is built around Strict.
      sameSite: 'strict',
      httpOnly: true
    }
  },

  user: {
    modelName: 'users',
    fields: {
      name: 'full_name',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      emailVerified: 'email_verified'
    },
    additionalFields: {
      username: { type: 'string', required: true, fieldName: 'username', input: true },
      address: { type: 'string', required: false, fieldName: 'address', input: true },
      phone: { type: 'string', required: false, fieldName: 'phone', input: true },
      country: { type: 'string', required: false, fieldName: 'country', input: true },
      points: { type: 'number', required: false, fieldName: 'points', defaultValue: 0, input: false },
      ratingCount: { type: 'number', required: false, fieldName: 'rating_count', defaultValue: 0, input: false },
      ratingAvg: { type: 'number', required: false, fieldName: 'rating_avg', defaultValue: 0, input: false }
    }
  },

  emailAndPassword: {
    enabled: true,
    // Gated by the same REGISTRATION_OTP_ENABLED flag the legacy flow used, so the
    // bypass-for-local-dev behavior is unchanged.
    requireEmailVerification: otpRequired,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    // A password reset is a reasonable signal the old session(s) may not be
    // trustworthy (shared device, compromised password); sign everywhere else out.
    revokeSessionsOnPasswordReset: true,
    password: {
      hash: async (password: string) => passwordService.hashPassword(password),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        passwordService.verifyPassword(password, hash)
    }
  },

  emailVerification: {
    // Matches the legacy flow: confirming the OTP logs the new account straight
    // in, rather than requiring a separate login step right after registering.
    autoSignInAfterVerification: true
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user: { email?: string }) => {
          if (!isUpeiEmail(user.email)) {
            throw new APIError('BAD_REQUEST', { message: 'Email must end with @upei.ca' });
          }

          return { data: user };
        }
      }
    }
  },

  plugins: [
    emailOTP({
      // Routes the core sign-up email-verification step through this plugin's OTP
      // flow instead of a link-based email.
      overrideDefaultEmailVerification: true,
      // Only "email-verification" (registration) and "forget-password" (password
      // reset) are used by this app; passwordless OTP sign-in/sign-up is not.
      disableSignUp: true,
      storeOTP: 'hashed',
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      sendVerificationOTP: async ({ email, otp }) => {
        await otpService.sendOtpEmail(email, otp);
      }
    })
  ]
});
