import { createBorrowRequestUseCase } from '../../application/notifications/createBorrowRequest.mjs';
import {
  createLegacyBorrowRequestPolicy,
  createLegacyBorrowRequestRepository
} from '../../infrastructure/notifications/legacyBorrowRequestDependencies.mjs';

const createBorrowRequest = createBorrowRequestUseCase(
  createLegacyBorrowRequestRepository(),
  createLegacyBorrowRequestPolicy()
);

export async function createBorrowRequestHandler(request: any, response: any): Promise<void> {
  try {
    const id = await createBorrowRequest.execute({
      borrowerId: Number(request.session.userId),
      productId: request.body.productId,
      pickupOption: request.body.pickupOption,
      pickupMeetupAt: request.body.pickupMeetupAt,
      startDate: request.body.startDate,
      dueDate: request.body.dueDate
    });
    response.json({ success: true, id });
  } catch (error: any) {
    response.status(error.statusCode || 500).json({ message: error.message || 'Unable to create request.' });
  }
}