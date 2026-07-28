import os from 'node:os';
import process from 'node:process';
import { FEATURES } from '../config/features.js';
import { fetchStoreEvolutionSnapshot } from '../repositories/visitsRepository.js';
import {
  claimDueJob,
  claimProductsForEvaluation,
  completeProductEvaluation,
  enqueueOverdueVisitEvents,
  enqueueUpcomingVisitEvents,
  expireNotifications,
  failProductEvaluation,
  fetchVisitForProductEvaluation,
  finishJob,
  reconcileNotifications,
  resurfaceSnoozedNotifications,
} from '../repositories/workerRepository.js';
import { flushNotificationOutbox } from '../services/outboxDispatcher.js';
import { poolConnect } from '../db/sqlServer.js';
import { hasProductEvolved } from '../domain/visitEvolution.js';

const workerId = `${os.hostname()}:${process.pid}`;
let stopping = false;

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

async function evaluateProducts() {
  const products = await claimProductsForEvaluation(workerId);
  let processed = 0;
  let errors = 0;
  for (const product of products) {
    try {
      const visit = await fetchVisitForProductEvaluation(product.VISITA_ID);
      if (!visit) throw new Error(`Visita ${product.VISITA_ID} não encontrada.`);
      const baseline = parseJson(product.BASELINE_JSON, {});
      const snapshot = await fetchStoreEvolutionSnapshot(visit.CHAVE_LOJA);
      await completeProductEvaluation(
        product,
        visit,
        snapshot,
        hasProductEvolved(String(product.CODIGO_PRODUTO_SNAPSHOT), baseline, snapshot)
      );
      processed += 1;
    } catch (error) {
      errors += 1;
      await failProductEvaluation(product.ID, error);
    }
  }
  return { read: products.length, processed, errors };
}

const handlers = new Map([
  ['OUTBOX_DISPATCHER', () => flushNotificationOutbox(workerId)],
  ['VISIT_UPCOMING', async () => {
    const count = await enqueueUpcomingVisitEvents();
    return { read: count, processed: count, errors: 0 };
  }],
  ['VISIT_OVERDUE', async () => {
    const count = await enqueueOverdueVisitEvents();
    return { read: count, processed: count, errors: 0 };
  }],
  ['PRODUCT_EVOLUTION', evaluateProducts],
  ['NOTIFICATION_RESURFACE', async () => {
    const count = await resurfaceSnoozedNotifications();
    return { read: count, processed: count, errors: 0 };
  }],
  ['NOTIFICATION_EXPIRATION', async () => {
    const count = await expireNotifications();
    return { read: count, processed: count, errors: 0 };
  }],
  ['CONSISTENCY_RECONCILER', async () => {
    const count = await reconcileNotifications();
    return { read: count, processed: count, errors: 0 };
  }],
]);

async function tick() {
  // Sempre drena o outbox quando notificações estão ligadas — não depende do job ATIVO.
  if (FEATURES.notifications) {
    try {
      await flushNotificationOutbox(workerId);
    } catch (error) {
      console.error('[worker:outbox]', error);
    }
  }

  const job = await claimDueJob(workerId);
  if (!job) return;
  const handler = handlers.get(String(job.CODIGO));
  if (!handler) {
    await finishJob(job, workerId, { read: 0, processed: 0, errors: 0 });
    return;
  }
  try {
    const result = await handler();
    await finishJob(job, workerId, result);
  } catch (error) {
    console.error(`[worker:${job.CODIGO}]`, error);
    await finishJob(job, workerId, { read: 0, processed: 0, errors: 1 }, error);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  if (!FEATURES.worker) {
    console.error('Worker não iniciado: VISITS_WORKER_ENABLED está desligada.');
    process.exitCode = 2;
    return;
  }
  await poolConnect;
  console.log(`Worker de visitas iniciado: ${workerId}`);
  console.log(
    `Flags: notifications=${FEATURES.notifications} visits=${FEATURES.visits}`
  );
  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      console.error('[worker:loop]', error);
    }
    await delay(1000);
  }
}

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

run().catch((error) => {
  console.error('Falha fatal no worker de visitas:', error);
  process.exitCode = 1;
});
