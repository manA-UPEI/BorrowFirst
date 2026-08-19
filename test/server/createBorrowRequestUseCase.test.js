const assert = require('node:assert/strict');
const test = require('node:test');

test('borrow request use case rejects requests for the lender own product', async () => {
  const { createBorrowRequestUseCase } = await import('../../dist/src/application/notifications/createBorrowRequest.mjs');
  const useCase = createBorrowRequestUseCase({
    expireStaleApprovals: async () => {},
    listCurrentTransactions: async () => [],
    findProduct: async () => ({ lenderId: 4, borrowerId: null, isActive: true })
  }, {});

  await assert.rejects(() => useCase.execute({
    borrowerId: 4,
    productId: 2,
    pickupOption: 1,
    pickupMeetupAt: '2099-01-01T10:00',
    dueDate: '2099-01-01'
  }), {
    message: 'Cannot request your own item',
    statusCode: 400
  });
});