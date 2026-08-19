import { createRequire } from 'node:module';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../infrastructure/auth/betterAuth.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const validation = loadLegacyModule('../../../../server/services/validationService') as {
  normalizeEmail: (value: unknown) => string;
  isValidUpeiEmail: (email: string) => boolean;
  validatePassword: (password: string) => string;
};

interface PasswordResetRequest {
  body?: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}

interface PasswordResetResponse {
  status: (code: number) => PasswordResetResponse;
  json: (payload: unknown) => void;
}

const GENERIC_REQUEST_MESSAGE = 'If the email is eligible, a password reset code has been sent.';

export async function requestPasswordResetHandler(
  request: PasswordResetRequest,
  response: PasswordResetResponse
): Promise<void> {
  const email = validation.normalizeEmail(request.body?.email);

  // Same shape regardless of whether the email is UPEI, registered, or verified --
  // matches the anti-enumeration behavior of the registration OTP flow.
  if (!validation.isValidUpeiEmail(email)) {
    response.json({ success: true, message: GENERIC_REQUEST_MESSAGE });
    return;
  }

  await auth.api.requestPasswordResetEmailOTP({
    body: { email },
    headers: fromNodeHeaders(request.headers),
    asResponse: false
  });

  response.json({ success: true, message: GENERIC_REQUEST_MESSAGE });
}

export async function resetPasswordHandler(
  request: PasswordResetRequest,
  response: PasswordResetResponse
): Promise<void> {
  const email = validation.normalizeEmail(request.body?.email);
  const otp = typeof request.body?.otp === 'string' ? request.body.otp.trim() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';

  if (!/^\d{6}$/.test(otp)) {
    response.status(400).json({ message: 'Verification code must be 6 digits' });
    return;
  }

  const passwordMessage = validation.validatePassword(password);

  if (passwordMessage) {
    response.status(400).json({ message: passwordMessage });
    return;
  }

  try {
    await auth.api.resetPasswordEmailOTP({
      body: { email, otp, password },
      headers: fromNodeHeaders(request.headers),
      asResponse: false
    });

    response.json({ success: true });
  } catch (error) {
    if (error instanceof APIError) {
      response.status(error.statusCode).json({ message: error.body?.message || 'Unable to reset password.' });
      return;
    }

    throw error;
  }
}
