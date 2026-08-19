import { createListMyTransactionsUseCase } from '../../application/transactions/listMyTransactions.mjs';
import { createLegacyTransactionPresenter } from '../../infrastructure/transactions/legacyTransactionPresenter.mjs';
import { createLegacyTransactionQuery } from '../../infrastructure/transactions/legacyTransactionQuery.mjs';

const listMyTransactions = createListMyTransactionsUseCase(
  createLegacyTransactionQuery(),
  createLegacyTransactionPresenter()
);

export async function myTransactionsHandler(request: any, response: any): Promise<void> {
  const transactions = await listMyTransactions.execute(Number(request.session.userId));
  response.json(transactions);
}