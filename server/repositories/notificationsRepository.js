import { pool, poolConnect, sql } from '../db/sqlServer.js';

export async function fetchNotificationsForUser(userCode, {
  status = null,
  offset = 0,
  limit = 30,
} = {}) {
  const request = pool.request();
  request.input('userCode', sql.Int, userCode);
  request.input('status', sql.VarChar(15), status);
  request.input('offset', sql.Int, offset);
  request.input('limit', sql.Int, limit);
  const result = await request.query(`
    SELECT
      nu.ID AS USUARIO_NOTIFICACAO_ID,
      nu.STATUS AS USUARIO_STATUS,
      nu.PRIMEIRA_ENTREGA_EM_UTC,
      nu.ULTIMA_ENTREGA_EM_UTC,
      nu.QTD_ENTREGAS,
      nu.VISUALIZADA_EM_UTC,
      nu.LIDA_EM_UTC,
      nu.CIENCIA_EM_UTC,
      nu.ADIADA_ATE_EM_UTC,
      nu.QTD_ADIAMENTOS,
      nu.ACAO_EXECUTADA,
      nu.ACAO_EXECUTADA_EM_UTC,
      nu.VERSAO_LINHA AS USUARIO_VERSAO_LINHA,
      n.*
    FROM TESTE..TB_NOTIFICACAO_USUARIO AS nu
    INNER JOIN TESTE..TB_NOTIFICACAO AS n
      ON n.ID = nu.NOTIFICACAO_ID
    WHERE nu.COD_FUNC_DESTINATARIO = @userCode
      AND n.STATUS = 'ATIVA'
      AND n.DISPONIVEL_EM_UTC <= SYSUTCDATETIME()
      AND (n.EXPIRA_EM_UTC IS NULL OR n.EXPIRA_EM_UTC > SYSUTCDATETIME())
      AND (
        nu.STATUS <> 'ADIADA'
        OR nu.ADIADA_ATE_EM_UTC <= SYSUTCDATETIME()
      )
      AND (@status IS NULL OR nu.STATUS = @status)
      AND nu.STATUS NOT IN ('RESOLVIDA', 'ARQUIVADA', 'CANCELADA')
    ORDER BY
      nu.ULTIMA_ENTREGA_EM_UTC DESC,
      nu.PRIMEIRA_ENTREGA_EM_UTC DESC,
      nu.ID DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);
  return result.recordset;
}

export async function fetchUnreadNotificationCount(userCode) {
  const request = pool.request();
  request.input('userCode', sql.Int, userCode);
  const result = await request.query(`
    SELECT COUNT_BIG(*) AS TOTAL
    FROM TESTE..TB_NOTIFICACAO_USUARIO AS nu
    INNER JOIN TESTE..TB_NOTIFICACAO AS n
      ON n.ID = nu.NOTIFICACAO_ID
    WHERE nu.COD_FUNC_DESTINATARIO = @userCode
      AND nu.LIDA_EM_UTC IS NULL
      AND nu.STATUS NOT IN ('RESOLVIDA', 'ARQUIVADA', 'CANCELADA', 'ADIADA')
      AND n.STATUS = 'ATIVA'
      AND n.DISPONIVEL_EM_UTC <= SYSUTCDATETIME()
      AND (n.EXPIRA_EM_UTC IS NULL OR n.EXPIRA_EM_UTC > SYSUTCDATETIME())
  `);
  return Number(result.recordset[0]?.TOTAL ?? 0);
}

export async function withLockedUserNotification(notificationId, userCode, callback) {
  await poolConnect;
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const request = new sql.Request(transaction);
    request.input('notificationId', sql.BigInt, notificationId);
    request.input('userCode', sql.Int, userCode);
    const result = await request.query(`
      SELECT
        nu.ID AS USUARIO_NOTIFICACAO_ID,
        nu.NOTIFICACAO_ID,
        nu.COD_FUNC_DESTINATARIO,
        nu.STATUS AS USUARIO_STATUS,
        nu.LIDA_EM_UTC,
        nu.CIENCIA_EM_UTC,
        nu.ADIADA_ATE_EM_UTC,
        nu.QTD_ADIAMENTOS,
        nu.VERSAO_LINHA AS USUARIO_VERSAO_LINHA,
        n.*
      FROM TESTE..TB_NOTIFICACAO_USUARIO AS nu WITH (UPDLOCK, HOLDLOCK)
      INNER JOIN TESTE..TB_NOTIFICACAO AS n WITH (UPDLOCK, HOLDLOCK)
        ON n.ID = nu.NOTIFICACAO_ID
      WHERE nu.NOTIFICACAO_ID = @notificationId
        AND nu.COD_FUNC_DESTINATARIO = @userCode
    `);
    const row = result.recordset[0];
    if (!row) {
      await transaction.rollback();
      return null;
    }
    const value = await callback(transaction, row);
    await transaction.commit();
    return value;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* transação já encerrada */ }
    throw error;
  }
}

export async function markNotificationReadRow(transaction, notificationId, userCode, actorCode) {
  const request = new sql.Request(transaction);
  request.input('notificationId', sql.BigInt, notificationId);
  request.input('userCode', sql.Int, userCode);
  request.input('actorCode', sql.Int, actorCode);
  await request.query(`
    UPDATE TESTE..TB_NOTIFICACAO_USUARIO
    SET
      STATUS = CASE
        WHEN STATUS IN ('NOVA', 'VISUALIZADA', 'ADIADA') THEN 'LIDA'
        ELSE STATUS
      END,
      LIDA_EM_UTC = COALESCE(LIDA_EM_UTC, SYSUTCDATETIME()),
      ADIADA_ATE_EM_UTC = CASE WHEN STATUS = 'ADIADA' THEN NULL ELSE ADIADA_ATE_EM_UTC END,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    WHERE NOTIFICACAO_ID = @notificationId
      AND COD_FUNC_DESTINATARIO = @userCode
      AND STATUS NOT IN ('RESOLVIDA', 'ARQUIVADA', 'CANCELADA')
  `);
}

export async function markAllNotificationsRead(userCode) {
  const request = pool.request();
  request.input('userCode', sql.Int, userCode);
  const result = await request.query(`
    UPDATE nu
    SET
      STATUS = CASE
        WHEN nu.STATUS IN ('NOVA', 'VISUALIZADA') THEN 'LIDA'
        ELSE nu.STATUS
      END,
      LIDA_EM_UTC = COALESCE(nu.LIDA_EM_UTC, SYSUTCDATETIME()),
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @userCode
    OUTPUT INSERTED.ID
    FROM TESTE..TB_NOTIFICACAO_USUARIO AS nu
    INNER JOIN TESTE..TB_NOTIFICACAO AS n
      ON n.ID = nu.NOTIFICACAO_ID
    WHERE nu.COD_FUNC_DESTINATARIO = @userCode
      AND nu.LIDA_EM_UTC IS NULL
      AND nu.STATUS IN ('NOVA', 'VISUALIZADA')
      AND n.STATUS = 'ATIVA'
  `);
  return result.recordset.length;
}

export async function snoozeNotificationRow(
  transaction,
  notificationId,
  userCode,
  until,
  actorCode
) {
  const request = new sql.Request(transaction);
  request.input('notificationId', sql.BigInt, notificationId);
  request.input('userCode', sql.Int, userCode);
  request.input('until', sql.DateTime2(3), until);
  request.input('actorCode', sql.Int, actorCode);
  await request.query(`
    UPDATE TESTE..TB_NOTIFICACAO_USUARIO
    SET
      STATUS = 'ADIADA',
      ADIADA_ATE_EM_UTC = @until,
      QTD_ADIAMENTOS = QTD_ADIAMENTOS + 1,
      LIDA_EM_UTC = COALESCE(LIDA_EM_UTC, SYSUTCDATETIME()),
      ACAO_EXECUTADA = 'ADIAR_LEMBRETE',
      ACAO_EXECUTADA_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    WHERE NOTIFICACAO_ID = @notificationId
      AND COD_FUNC_DESTINATARIO = @userCode
  `);
}

export async function acknowledgeNotificationRow(
  transaction,
  notificationId,
  userCode,
  actorCode
) {
  const request = new sql.Request(transaction);
  request.input('notificationId', sql.BigInt, notificationId);
  request.input('userCode', sql.Int, userCode);
  request.input('actorCode', sql.Int, actorCode);
  await request.query(`
    UPDATE TESTE..TB_NOTIFICACAO_USUARIO
    SET
      STATUS = 'LIDA',
      LIDA_EM_UTC = COALESCE(LIDA_EM_UTC, SYSUTCDATETIME()),
      CIENCIA_EM_UTC = COALESCE(CIENCIA_EM_UTC, SYSUTCDATETIME()),
      ACAO_EXECUTADA = 'CONFIRMAR_CIENCIA',
      ACAO_EXECUTADA_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    WHERE NOTIFICACAO_ID = @notificationId
      AND COD_FUNC_DESTINATARIO = @userCode
  `);
}

export async function createFollowUpRow(transaction, notification, values, actorCode) {
  const request = new sql.Request(transaction);
  request.input('visitId', sql.BigInt, notification.VISITA_ID);
  request.input('productId', sql.BigInt, notification.VISITA_PRODUTO_ID);
  request.input('notificationId', sql.BigInt, notification.ID);
  request.input('type', sql.VarChar(30), values.type);
  request.input('action', sql.VarChar(50), values.action);
  request.input('status', sql.VarChar(20), values.status);
  request.input('notes', sql.NVarChar(2000), values.notes);
  request.input('nextAt', sql.DateTime2(3), values.nextAt);
  request.input('actorCode', sql.Int, actorCode);
  const result = await request.query(`
    INSERT INTO TESTE..TB_VISITA_ACOMPANHAMENTO (
      VISITA_ID,
      VISITA_PRODUTO_ID,
      NOTIFICACAO_ORIGEM_ID,
      TIPO,
      ACAO,
      STATUS,
      OBSERVACAO,
      PROXIMA_ACAO_EM_UTC,
      COD_FUNC_RESPONSAVEL,
      CRIADO_POR,
      ATUALIZADO_POR
    )
    OUTPUT INSERTED.ID
    VALUES (
      @visitId,
      @productId,
      @notificationId,
      @type,
      @action,
      @status,
      @notes,
      @nextAt,
      @actorCode,
      @actorCode,
      @actorCode
    )
  `);
  return result.recordset[0].ID;
}

export async function completeNotificationActionRow(
  transaction,
  notification,
  userCode,
  action,
  actorCode,
  { resolveOccurrence = false } = {}
) {
  const request = new sql.Request(transaction);
  request.input('notificationId', sql.BigInt, notification.ID);
  request.input('userCode', sql.Int, userCode);
  request.input('action', sql.VarChar(80), action);
  request.input('actorCode', sql.Int, actorCode);
  await request.query(`
    UPDATE TESTE..TB_NOTIFICACAO_USUARIO
    SET
      STATUS = 'RESOLVIDA',
      LIDA_EM_UTC = COALESCE(LIDA_EM_UTC, SYSUTCDATETIME()),
      RESOLVIDA_EM_UTC = SYSUTCDATETIME(),
      ACAO_EXECUTADA = @action,
      ACAO_EXECUTADA_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    WHERE NOTIFICACAO_ID = @notificationId
      AND COD_FUNC_DESTINATARIO = @userCode
  `);
  if (resolveOccurrence) {
    const occurrence = new sql.Request(transaction);
    occurrence.input('notificationId', sql.BigInt, notification.ID);
    occurrence.input('actorCode', sql.Int, actorCode);
    occurrence.input('action', sql.VarChar(80), action);
    await occurrence.query(`
      UPDATE TESTE..TB_NOTIFICACAO
      SET
        STATUS = 'RESOLVIDA',
        RESOLVIDA_EM_UTC = SYSUTCDATETIME(),
        RESOLVIDA_POR = @actorCode,
        MOTIVO_RESOLUCAO = @action
      WHERE ID = @notificationId
        AND STATUS = 'ATIVA'
    `);
  }
}

export async function closeProductWithoutContinuityRow(
  transaction,
  productId,
  notes,
  actorCode
) {
  const request = new sql.Request(transaction);
  request.input('productId', sql.BigInt, productId);
  request.input('notes', sql.NVarChar(1000), notes);
  request.input('actorCode', sql.Int, actorCode);
  await request.query(`
    UPDATE TESTE..TB_VISITA_PRODUTO
    SET
      STATUS_ACOMPANHAMENTO = 'ENCERRADO',
      RESUMO_EVIDENCIA = @notes,
      PROXIMA_VERIFICACAO_EM_UTC = NULL,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = @actorCode
    WHERE ID = @productId
      AND ATIVO = 1
  `);
}

export async function fetchNotificationForUser(notificationId, userCode) {
  const request = pool.request();
  request.input('notificationId', sql.BigInt, notificationId);
  request.input('userCode', sql.Int, userCode);
  const result = await request.query(`
    SELECT
      nu.ID AS USUARIO_NOTIFICACAO_ID,
      nu.STATUS AS USUARIO_STATUS,
      nu.PRIMEIRA_ENTREGA_EM_UTC,
      nu.ULTIMA_ENTREGA_EM_UTC,
      nu.QTD_ENTREGAS,
      nu.VISUALIZADA_EM_UTC,
      nu.LIDA_EM_UTC,
      nu.CIENCIA_EM_UTC,
      nu.ADIADA_ATE_EM_UTC,
      nu.QTD_ADIAMENTOS,
      nu.ACAO_EXECUTADA,
      nu.ACAO_EXECUTADA_EM_UTC,
      nu.VERSAO_LINHA AS USUARIO_VERSAO_LINHA,
      n.*
    FROM TESTE..TB_NOTIFICACAO_USUARIO AS nu
    INNER JOIN TESTE..TB_NOTIFICACAO AS n
      ON n.ID = nu.NOTIFICACAO_ID
    WHERE nu.NOTIFICACAO_ID = @notificationId
      AND nu.COD_FUNC_DESTINATARIO = @userCode
  `);
  return result.recordset[0] ?? null;
}
