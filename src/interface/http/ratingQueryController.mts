import { createEligibleRatingsUseCase, createMyRatingsUseCase } from '../../application/ratings/ratingQueries.mjs';
import { createLegacyRatingQuery } from '../../infrastructure/ratings/legacyRatingQuery.mjs';

const query = createLegacyRatingQuery();
const eligibleRatings = createEligibleRatingsUseCase(query);
const myRatings = createMyRatingsUseCase(query);

export async function eligibleRatingsHandler(request: any, response: any): Promise<void> {
  response.json(await eligibleRatings.execute(Number(request.session.userId)));
}

export async function myRatingsHandler(request: any, response: any): Promise<void> {
  response.json(await myRatings.execute(Number(request.session.userId)));
}