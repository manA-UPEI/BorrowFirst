import { createAlertsUseCase, createHistoryUseCase } from '../../application/transactions/history.mjs';
import {
  createLegacyAlertPresenter,
  createLegacyHistoryQuery,
  createLegacyLoanPresenter
} from '../../infrastructure/transactions/legacyHistoryDependencies.mjs';

const query = createLegacyHistoryQuery();
const presenter = createLegacyLoanPresenter();
const history = createHistoryUseCase(query, presenter);
const alerts = createAlertsUseCase(query, presenter, createLegacyAlertPresenter());

export async function historyHandler(request: any, response: any): Promise<void> {
  response.json(await history.execute(Number(request.session.userId)));
}

export async function alertsHandler(request: any, response: any): Promise<void> {
  response.json(await alerts.execute(Number(request.session.userId)));
}