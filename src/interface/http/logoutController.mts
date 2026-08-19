import { fromNodeHeaders } from 'better-auth/node';
import { applyAuthResponseHeaders, auth } from '../../infrastructure/auth/betterAuth.mjs';

interface LogoutRequest {
  headers: Record<string, string | string[] | undefined>;
}

interface LogoutResponse {
  setHeader: (name: string, value: string | string[]) => void;
  json: (payload: unknown) => void;
}

export async function logoutHandler(request: LogoutRequest, response: LogoutResponse): Promise<void> {
  const result = await auth.api.signOut({
    headers: fromNodeHeaders(request.headers),
    returnHeaders: true
  });

  applyAuthResponseHeaders(result.headers, response);
  response.json({ success: true });
}
