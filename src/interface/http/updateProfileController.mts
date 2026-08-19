import { createUpdateProfileUseCase } from '../../application/auth/updateProfile.mjs';
import {
  createLegacyProfileValidator,
  createLegacyProfileWriter
} from '../../infrastructure/auth/legacyProfileWriter.mjs';

const updateProfile = createUpdateProfileUseCase(createLegacyProfileWriter(), createLegacyProfileValidator());

export async function updateProfileHandler(request: any, response: any): Promise<void> {
  try {
    response.json(await updateProfile.execute(Number(request.session.userId), request.body));
  } catch (error: any) {
    response.status(error.statusCode || 500).json({ message: error.message || 'Unable to update profile.' });
  }
}