import { createRequire } from 'node:module';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { applyAuthResponseHeaders, auth, otpRequired } from '../../infrastructure/auth/betterAuth.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const validation = loadLegacyModule('../../../../server/services/validationService') as {
  normalizeEmail: (value: unknown) => string;
  normalizeCollapsedText: (value: unknown) => string;
  validateRegistrationFields: (input: { username: string; fullName: string; email: string; password: string }) => string;
  getValidatedContactFields: (input: { address: unknown; phone: unknown; country: unknown }) => {
    message?: string;
    address?: string;
    phone?: string;
    country?: string;
  };
};

interface RegistrationRequest {
  body?: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}

interface RegistrationResponse {
  status: (code: number) => RegistrationResponse;
  setHeader: (name: string, value: string | string[]) => void;
  json: (payload: unknown) => void;
}

export async function registerConfigHandler(_request: unknown, response: RegistrationResponse): Promise<void> {
  response.json({ otpRequired });
}

export async function requestRegistrationHandler(
  request: RegistrationRequest,
  response: RegistrationResponse
): Promise<void> {
  const email = validation.normalizeEmail(request.body?.email);
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  const username = validation.normalizeCollapsedText(request.body?.username);
  const fullName = validation.normalizeCollapsedText(request.body?.fullName);

  const validationMessage = validation.validateRegistrationFields({ username, fullName, email, password });

  if (validationMessage) {
    response.status(400).json({ message: validationMessage });
    return;
  }

  const contact = validation.getValidatedContactFields({
    address: request.body?.address,
    phone: request.body?.phone,
    country: request.body?.country
  });

  if (contact.message) {
    response.status(400).json({ message: contact.message });
    return;
  }

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: fullName,
        username,
        address: contact.address,
        phone: contact.phone,
        country: contact.country
      },
      headers: fromNodeHeaders(request.headers),
      returnHeaders: true
    });

    if (otpRequired) {
      // Deliberately generic, whether this email is new or already registered --
      // matches the legacy flow's anti-enumeration response for this case.
      response.json({
        success: true,
        requiresVerification: true,
        message: 'If the email is eligible, a verification code has been sent.',
        deliveryMode: 'email'
      });
      return;
    }

    applyAuthResponseHeaders(result.headers, response);
    response.json({ success: true, requiresVerification: false, message: 'Account created.' });
  } catch (error) {
    if (error instanceof APIError) {
      response.status(error.statusCode).json({ message: error.body?.message || 'Unable to register.' });
      return;
    }

    throw error;
  }
}

export async function verifyRegistrationHandler(
  request: RegistrationRequest,
  response: RegistrationResponse
): Promise<void> {
  const email = validation.normalizeEmail(request.body?.email);
  const otp = typeof request.body?.otp === 'string' ? request.body.otp.trim() : '';

  if (!/^\d{6}$/.test(otp)) {
    response.status(400).json({ message: 'Verification code must be 6 digits' });
    return;
  }

  try {
    const result = await auth.api.verifyEmailOTP({
      body: { email, otp },
      headers: fromNodeHeaders(request.headers),
      returnHeaders: true
    });

    applyAuthResponseHeaders(result.headers, response);
    response.json({ success: true });
  } catch (error) {
    if (error instanceof APIError) {
      response.status(error.statusCode).json({ message: error.body?.message || 'Unable to verify registration.' });
      return;
    }

    throw error;
  }
}
