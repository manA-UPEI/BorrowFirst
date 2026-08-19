import { createCurrentUserUseCase, createUserProfileUseCase } from '../../application/auth/profileQueries.mjs';
import { createLegacyProfileQuery } from '../../infrastructure/auth/legacyProfileQuery.mjs';

const query = createLegacyProfileQuery();
const currentUser = createCurrentUserUseCase(query);
const userProfile = createUserProfileUseCase(query);

export async function currentUserHandler(request: any, response: any): Promise<void> {
  try { response.json(await currentUser.execute(Number(request.session.userId))); }
  catch (error: any) { response.status(error.statusCode || 500).json({ message: error.message || 'Unable to load user.' }); }
}

export async function userProfileHandler(request: any, response: any): Promise<void> {
  try {
    response.json(await userProfile.execute(Number(request.session.userId), request.params.id, request.query.interaction));
  } catch (error: any) {
    response.status(error.statusCode || 500).json({ message: error.message || 'Unable to load profile.' });
  }
}