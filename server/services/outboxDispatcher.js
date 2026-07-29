import os from 'node:os';
import process from 'node:process';
import {
  claimOutboxBatch,
  completeOutboxEvent,
  failOutboxEvent,
  fetchActiveNotificationRule,
  materializeNotification,
} from '../repositories/workerRepository.js';

const dispatcherId = `api-outbox:${os.hostname()}:${process.pid}`;

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

/** Converte ISO `YYYY-MM-DD` (ou Date) para `dd/mm/yyyy` nas mensagens. */
function formatTemplateValue(value) {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${d}/${m}/${y}`;
  }
  const raw = String(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

function render(template, variables) {
  return String(template).replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, name) => {
    return formatTemplateValue(variables?.[name]);
  });
}

/**
 * Materializa eventos pendentes do outbox em TB_NOTIFICACAO(_USUARIO).
 * Usado pelo worker e também pela API após atribuir/alterar roteiro,
 * para a notificação aparecer sem depender do job ATIVO.
 */
export async function flushNotificationOutbox(workerId = dispatcherId, { maxBatches = 3 } = {}) {
  let read = 0;
  let processed = 0;
  let errors = 0;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const events = await claimOutboxBatch(workerId);
    if (events.length === 0) break;
    read += events.length;

    for (const event of events) {
      try {
        const payload = parseJson(event.PAYLOAD_JSON, {});
        if (!payload.ruleCode) {
          await completeOutboxEvent(event.EVENTO_ID);
          processed += 1;
          continue;
        }
        const rule = await fetchActiveNotificationRule(payload.ruleCode);
        if (!rule) throw new Error(`Regra ativa não encontrada: ${payload.ruleCode}`);
        await materializeNotification(event, rule, payload, {
          title: render(rule.TEMPLATE_TITULO, payload.variables),
          message: render(rule.TEMPLATE_MENSAGEM, payload.variables),
        });
        await completeOutboxEvent(event.EVENTO_ID);
        processed += 1;
      } catch (error) {
        errors += 1;
        await failOutboxEvent(event.EVENTO_ID, error);
      }
    }
  }

  return { read, processed, errors };
}
