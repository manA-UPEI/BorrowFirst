import { createRatingUseCase } from '../../application/ratings/createRating.mjs';
import { createLegacyRatingWriter } from '../../infrastructure/ratings/legacyRatingWriter.mjs';

const createRating = createRatingUseCase(createLegacyRatingWriter());

export async function createRatingHandler(request: any, response: any): Promise<void> {
  try {
    await createRating.execute(
      Number(request.session.userId),
      request.body.userId,
      request.body.rating
    );
    response.json({ success: true });
  } catch (error: any) {
    response.status(error.statusCode || 500).json({ message: error.message || 'Unable to save rating.' });
  }
}