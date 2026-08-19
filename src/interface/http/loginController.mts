import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { applyAuthResponseHeaders, auth } from '../../infrastructure/auth/betterAuth.mjs';

interface LoginRequest {
  body?: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}

interface LoginResponse {
  status: (code: number) => LoginResponse;
  setHeader: (name: string, value: string | string[]) => void;
  json: (payload: unknown) => void;
}

export async function loginHandler(request: LoginRequest, response: LoginResponse): Promise<void> {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';

  if (!email.endsWith('@upei.ca')) {
    response.status(400).json({ message: 'Email must end with @upei.ca' });
    return;
  }

  if (!password) {
    response.status(400).json({ message: 'Password is required' });
    return;
  }

  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: fromNodeHeaders(request.headers),
      returnHeaders: true
    });

    applyAuthResponseHeaders(result.headers, response);
    response.json({ success: true });
  } catch (error) {
    if (error instanceof APIError) {
      response.status(error.statusCode).json({ message: error.body?.message || 'Invalid credentials' });
      return;
    }

    throw error;
  }
}
