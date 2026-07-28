import crypto from 'node:crypto';
import { pool, poolConnect, sql } from '../db/sqlServer.js';

export async function claimDueJob(workerId, leaseSeconds = 120) {
  await poolConnect;
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const request = new sql.Request(transaction);
    request.input('workerId', sql.VarChar(100), workerId);
    request.input('leaseSeconds', sql.Int, leaseSeconds);
    const result = await request.query(`
      ;WITH due AS (
        SELECT TOP (1) *
        FROM TESTE..TB_JOB_CONTROLE WITH (UPDLOCK, READPAST, ROWLOCK)
        WHERE ATIVO = 1
          AND PROXIMA_EXECUCAO_EM_UTC <= SYSUTCDATETIME()
          AND (
            BLOQUEADO_ATE_EM_UTC IS NULL
            OR BLOQUEADO_ATE_EM_UTC < SYSUTCDATETIME()
          )
        ORDER BY PROXIMA_EXECUCAO_EM_UTC, CODIGO
      )
      UPDATE due
      SET
        BLOQUEADO_ATE_EM_UTC = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
        BLOQUEADO_POR_WORKER = @workerId,
        ULTIMO_INICIO_EM_UTC = SYSUTCDATETIME(),
        ULTIMO_STATUS = 'EXECUTANDO',
        ULTIMO_ERRO = NULL,
        ATUALIZADO_EM_UTC = SYSUTCDATETIME()
      OUTPUT INSERTED.*;
    `);
    const job = result.recordset[0];
    if (!job) {
      await transaction.commit();
      return null;
    }
    const executionId = crypto.randomUUID();
    const correlationId = crypto.randomUUID();
    const execution = new sql.Request(transaction);
    execution.input('executionId', sql.UniqueIdentifier, executionId);
    execution.input('jobCode', sql.VarChar(80), job.CODIGO);
    execution.input('workerId', sql.VarChar(100), workerId);
    execution.input('correlationId', sql.UniqueIdentifier, correlationId);
    await execution.query(`
      INSERT INTO TESTE..TB_JOB_EXECUCAO (
        EXECUCAO_ID,
        JOB_CODIGO,
        WORKER_ID,
        STATUS,
        INICIADO_EM_UTC,
        CORRELATION_ID
      )
      VALUES (
        @executionId,
        @jobCode,
        @workerId,
        'EXECUTANDO',
        SYSUTCDATETIME(),
        @correlationId
      )
    `);
    await transaction.commit();
    return { ...job, executionId, correlationId };
  } catch (error) {
    try { await transaction.rollback(); } catch { /* transação já encerrada */ }
    throw error;
  }
}

export async function finishJob(job, workerId, result, error = null) {
  const request = pool.request();
  request.input('jobCode', sql.VarChar(80), job.CODIGO);
  request.input('workerId', sql.VarChar(100), workerId);
  request.input('executionId', sql.UniqueIdentifier, job.executionId);
  request.input('status', sql.VarChar(15), error ? 'ERRO' : 'SUCESSO');
  request.input('read', sql.Int, Number(result?.read ?? 0));
  request.input('processed', sql.Int, Number(result?.processed ?? 0));
  request.input('errors', sql.Int, Number(result?.errors ?? (error ? 1 : 0)));
  request.input('error', sql.NVarChar(2000), error ? String(error.stack ?? error).slice(0, 2000) : null);
  await request.query(`
    UPDATE TESTE..TB_JOB_EXECUCAO
    SET
      STATUS = @status,
      FINALIZADO_EM_UTC = SYSUTCDATETIME(),
      ITENS_LIDOS = @read,
      ITENS_PROCESSADOS = @processed,
      ITENS_ERRO = @errors,
      ERRO = @error
    WHERE EXECUCAO_ID = @executionId;

    UPDATE TESTE..TB_JOB_CONTROLE
    SET
      PROXIMA_EXECUCAO_EM_UTC = DATEADD(SECOND, INTERVALO_SEGUNDOS, SYSUTCDATETIME()),
      BLOQUEADO_ATE_EM_UTC = NULL,
      BLOQUEADO_POR_WORKER = NULL,
      ULTIMO_FIM_EM_UTC = SYSUTCDATETIME(),
      ULTIMO_STATUS = @status,
      ULTIMO_ERRO = @error,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME()
    WHERE CODIGO = @jobCode
      AND BLOQUEADO_POR_WORKER = @workerId;
  `);
}

export async function claimOutboxBatch(workerId, limit = 50, leaseSeconds = 120) {
  const request = pool.request();
  request.input('workerId', sql.VarChar(100), workerId);
  request.input('limit', sql.Int, limit);
  request.input('leaseSeconds', sql.Int, leaseSeconds);
  const result = await request.query(`
    ;WITH batch AS (
      SELECT TOP (@limit) *
      FROM TESTE..TB_EVENTO_OUTBOX WITH (UPDLOCK, READPAST, ROWLOCK)
      WHERE STATUS IN ('PENDENTE', 'ERRO')
        AND DISPONIVEL_EM_UTC <= SYSUTCDATETIME()
        AND (
          BLOQUEADO_ATE_EM_UTC IS NULL
          OR BLOQUEADO_ATE_EM_UTC < SYSUTCDATETIME()
        )
        AND TENTATIVAS < 10
      ORDER BY ID
    )
    UPDATE batch
    SET
      STATUS = 'PROCESSANDO',
      TENTATIVAS = TENTATIVAS + 1,
      BLOQUEADO_ATE_EM_UTC = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
      BLOQUEADO_POR_WORKER = @workerId,
      ULTIMO_ERRO = NULL
    OUTPUT INSERTED.*;
  `);
  return result.recordset;
}

export async function fetchActiveNotificationRule(code) {
  const request = pool.request();
  request.input('code', sql.VarChar(60), code);
  const result = await request.query(`
    SELECT TOP (1) *
    FROM TESTE..TB_NOTIFICACAO_REGRA
    WHERE CODIGO = @code
      AND ATIVO = 1
      AND VIGENCIA_INICIO <= CONVERT(date, SYSUTCDATETIME())
      AND (VIGENCIA_FIM IS NULL OR VIGENCIA_FIM >= CONVERT(date, SYSUTCDATETIME()))
    ORDER BY VERSAO_REGRA DESC
  `);
  return result.recordset[0] ?? null;
}

export async function materializeNotification(event, rule, payload, rendered) {
  await poolConnect;
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const find = new sql.Request(transaction);
    find.input('dedupeKey', sql.NVarChar(250), payload.dedupeKey);
    const existing = await find.query(`
      SELECT TOP (1) ID, STATUS
      FROM TESTE..TB_NOTIFICACAO WITH (UPDLOCK, HOLDLOCK)
      WHERE CHAVE_DEDUPLICACAO = @dedupeKey
    `);
    let notificationId = existing.recordset[0]?.ID ?? null;
    let created = false;
    if (!notificationId) {
      const insert = new sql.Request(transaction);
      insert.input('ruleId', sql.BigInt, rule.ID);
      insert.input('type', sql.VarChar(60), rule.TIPO_NOTIFICACAO);
      insert.input('title', sql.NVarChar(200), rendered.title);
      insert.input('message', sql.NVarChar(1000), rendered.message);
      insert.input('priority', sql.VarChar(10), payload.priority ?? rule.PRIORIDADE_PADRAO);
      insert.input('entityType', sql.VarChar(30), payload.entityType);
      insert.input('entityId', sql.NVarChar(100), String(payload.entityId));
      insert.input('routeId', sql.UniqueIdentifier, payload.routeId ?? null);
      insert.input('visitId', sql.BigInt, payload.visitId ?? null);
      insert.input('productId', sql.BigInt, payload.visitProductId ?? null);
      insert.input('storeKey', sql.NVarChar(100), payload.storeKey ?? null);
      insert.input('dedupeKey', sql.NVarChar(250), payload.dedupeKey);
      insert.input('destinationAction', sql.VarChar(80), payload.destinationAction ?? 'ABRIR_DESTINO');
      insert.input('destination', sql.NVarChar(sql.MAX), JSON.stringify(payload.destination ?? {}));
      insert.input('actions', sql.NVarChar(sql.MAX), rule.ACOES_JSON);
      insert.input('originatorCode', sql.Int, payload.originatorCode ?? null);
      insert.input('eventId', sql.UniqueIdentifier, event.EVENTO_ID);
      insert.input('correlationId', sql.UniqueIdentifier, event.CORRELATION_ID);
      insert.input('delayMinutes', sql.Int, Number(rule.ATRASO_INICIAL_MINUTOS ?? 0));
      insert.input('expirationMinutes', sql.Int, rule.EXPIRACAO_MINUTOS);
      const inserted = await insert.query(`
        INSERT INTO TESTE..TB_NOTIFICACAO (
          REGRA_ID,
          TIPO,
          TITULO,
          MENSAGEM,
          PRIORIDADE,
          ENTIDADE_TIPO,
          ENTIDADE_ID,
          ROTEIRO_ID,
          VISITA_ID,
          VISITA_PRODUTO_ID,
          CHAVE_LOJA,
          CHAVE_DEDUPLICACAO,
          ACAO_DESTINO,
          DESTINO_JSON,
          ACOES_JSON,
          COD_FUNC_ORIGEM,
          EVENTO_ORIGEM_ID,
          CORRELATION_ID,
          DISPONIVEL_EM_UTC,
          EXPIRA_EM_UTC
        )
        OUTPUT INSERTED.ID
        VALUES (
          @ruleId,
          @type,
          @title,
          @message,
          @priority,
          @entityType,
          @entityId,
          @routeId,
          @visitId,
          @productId,
          @storeKey,
          @dedupeKey,
          @destinationAction,
          @destination,
          @actions,
          @originatorCode,
          @eventId,
          @correlationId,
          DATEADD(MINUTE, @delayMinutes, SYSUTCDATETIME()),
          CASE
            WHEN @expirationMinutes IS NULL THEN NULL
            ELSE DATEADD(MINUTE, @expirationMinutes, SYSUTCDATETIME())
          END
        )
      `);
      notificationId = inserted.recordset[0].ID;
      created = true;
    }

    const recipients = [...new Set(
      (Array.isArray(payload.recipients) ? payload.recipients : [])
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0)
    )];
    for (const recipient of recipients) {
      const delivery = new sql.Request(transaction);
      delivery.input('notificationId', sql.BigInt, notificationId);
      delivery.input('recipient', sql.Int, recipient);
      await delivery.query(`
        IF EXISTS (
          SELECT 1
          FROM TESTE..TB_NOTIFICACAO_USUARIO WITH (UPDLOCK, HOLDLOCK)
          WHERE NOTIFICACAO_ID = @notificationId
            AND COD_FUNC_DESTINATARIO = @recipient
        )
        BEGIN
          UPDATE TESTE..TB_NOTIFICACAO_USUARIO
          SET
            STATUS = CASE
              WHEN STATUS IN ('RESOLVIDA', 'CANCELADA', 'ARQUIVADA') THEN STATUS
              ELSE 'NOVA'
            END,
            ULTIMA_ENTREGA_EM_UTC = SYSUTCDATETIME(),
            QTD_ENTREGAS = QTD_ENTREGAS + 1,
            ADIADA_ATE_EM_UTC = NULL,
            ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
            ATUALIZADO_POR = @recipient
          WHERE NOTIFICACAO_ID = @notificationId
            AND COD_FUNC_DESTINATARIO = @recipient;
        END
        ELSE
        BEGIN
          INSERT INTO TESTE..TB_NOTIFICACAO_USUARIO (
            NOTIFICACAO_ID,
            COD_FUNC_DESTINATARIO,
            ATUALIZADO_POR
          )
          VALUES (@notificationId, @recipient, @recipient);
        END
      `);
    }
    if (created && payload.visitId) {
      const history = new sql.Request(transaction);
      history.input('visitId', sql.BigInt, payload.visitId);
      history.input('productId', sql.BigInt, payload.visitProductId ?? null);
      history.input('notificationId', sql.BigInt, notificationId);
      history.input('correlationId', sql.UniqueIdentifier, event.CORRELATION_ID);
      history.input(
        'data',
        sql.NVarChar(sql.MAX),
        JSON.stringify({
          notificationType: rule.TIPO_NOTIFICACAO,
          recipients,
          dedupeKey: payload.dedupeKey,
        })
      );
      await history.query(`
        INSERT INTO TESTE..TB_HISTORICO_VISITA (
          VISITA_ID,
          VISITA_PRODUTO_ID,
          NOTIFICACAO_ID,
          TIPO_EVENTO,
          DADOS_NOVOS_JSON,
          ORIGEM,
          CORRELATION_ID
        )
        VALUES (
          @visitId,
          @productId,
          @notificationId,
          'NOTIFICACAO_GERADA',
          @data,
          'JOB',
          @correlationId
        )
      `);
    }
    await transaction.commit();
    return notificationId;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* transação já encerrada */ }
    throw error;
  }
}

export async function completeOutboxEvent(eventId) {
  const request = pool.request();
  request.input('eventId', sql.UniqueIdentifier, eventId);
  await request.query(`
    UPDATE TESTE..TB_EVENTO_OUTBOX
    SET
      STATUS = 'PROCESSADO',
      PROCESSADO_EM_UTC = SYSUTCDATETIME(),
      BLOQUEADO_ATE_EM_UTC = NULL,
      BLOQUEADO_POR_WORKER = NULL,
      ULTIMO_ERRO = NULL
    WHERE EVENTO_ID = @eventId
  `);
}

export async function failOutboxEvent(eventId, error) {
  const request = pool.request();
  request.input('eventId', sql.UniqueIdentifier, eventId);
  request.input('error', sql.NVarChar(2000), String(error.stack ?? error).slice(0, 2000));
  await request.query(`
    UPDATE TESTE..TB_EVENTO_OUTBOX
    SET
      STATUS = 'ERRO',
      DISPONIVEL_EM_UTC = DATEADD(
        SECOND,
        CASE WHEN TENTATIVAS > 8 THEN 3600 ELSE POWER(2, TENTATIVAS) * 5 END,
        SYSUTCDATETIME()
      ),
      BLOQUEADO_ATE_EM_UTC = NULL,
      BLOQUEADO_POR_WORKER = NULL,
      ULTIMO_ERRO = @error
    WHERE EVENTO_ID = @eventId
  `);
}

export async function enqueueUpcomingVisitEvents() {
  const request = pool.request();
  const result = await request.query(`
    DECLARE @AgoraLocal datetime2(0) = CONVERT(
      datetime2(0),
      SYSDATETIMEOFFSET() AT TIME ZONE 'E. South America Standard Time'
    );
    DECLARE @HojeLocal date = CONVERT(date, @AgoraLocal);
    DECLARE @HoraLocal time(0) = CONVERT(time(0), @AgoraLocal);
    DECLARE @Amanha date = DATEADD(DAY, 1, @HojeLocal);

    ;WITH routes AS (
      SELECT
        v.ROTEIRO_ID,
        v.COD_FUNC_RESPONSAVEL,
        COUNT_BIG(*) AS VISIT_COUNT,
        MIN(v.HORARIO_PLANEJADO) AS FIRST_TIME,
        MAX(v.CHAVE_LOJA) AS ANY_STORE
      FROM TESTE..TB_VISITA_TRATATIVA AS v
      INNER JOIN TESTE..ROTEIRO_PARADAS_MAPA AS p ON p.ID = v.PARADA_ROTEIRO_ID
      WHERE v.EH_ATUAL = 1
        AND v.STATUS = 'PENDENTE'
        AND p.ATIVO = 1
        AND v.DATA_PLANEJADA = @Amanha
      GROUP BY v.ROTEIRO_ID, v.COD_FUNC_RESPONSAVEL
    )
    INSERT INTO TESTE..TB_EVENTO_OUTBOX (
      EVENTO_ID,
      TIPO_EVENTO,
      AGREGADO_TIPO,
      AGREGADO_ID,
      PAYLOAD_JSON,
      CHAVE_DEDUPLICACAO,
      CORRELATION_ID,
      OCORRIDO_EM_UTC
    )
    OUTPUT INSERTED.EVENTO_ID
    SELECT
      NEWID(),
      'VISITA_ENTROU_JANELA_LEMBRETE',
      'ROTEIRO',
      CONVERT(nvarchar(100), r.ROTEIRO_ID),
      (
        SELECT
          'VISITA_PROXIMA' AS ruleCode,
          CONCAT('VISITA_PROXIMA:ROTEIRO:', r.ROTEIRO_ID, ':', CONVERT(char(8), @Amanha, 112)) AS dedupeKey,
          JSON_QUERY(CONCAT('[', r.COD_FUNC_RESPONSAVEL, ']')) AS recipients,
          'ROTEIRO' AS entityType,
          CONVERT(nvarchar(100), r.ROTEIRO_ID) AS entityId,
          r.ROTEIRO_ID AS routeId,
          JSON_QUERY((
            SELECT
              'visitas' AS section,
              r.ROTEIRO_ID AS routeId,
              CAST(1 AS bit) AS mapFocus
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
          )) AS destination,
          JSON_QUERY((
            SELECT
              'amanhã' AS relativeDay,
              r.VISIT_COUNT AS visitCount,
              COALESCE(CONVERT(varchar(5), r.FIRST_TIME, 108), 'sem horário') AS firstTime
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
          )) AS variables
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
      ),
      CONCAT('VISITA_PROXIMA:', r.ROTEIRO_ID, ':', CONVERT(char(8), @Amanha, 112)),
      NEWID(),
      SYSUTCDATETIME()
    FROM routes AS r
    WHERE NOT EXISTS (
      SELECT 1
      FROM TESTE..TB_EVENTO_OUTBOX AS o
      WHERE o.CHAVE_DEDUPLICACAO =
        CONCAT('VISITA_PROXIMA:', r.ROTEIRO_ID, ':', CONVERT(char(8), @Amanha, 112))
    );
  `);
  return result.recordset.length;
}

export async function enqueueOverdueVisitEvents() {
  const request = pool.request();
  const result = await request.query(`
    DECLARE @AgoraLocal datetime2(0) = CONVERT(
      datetime2(0),
      SYSDATETIMEOFFSET() AT TIME ZONE 'E. South America Standard Time'
    );
    DECLARE @HojeLocal date = CONVERT(date, @AgoraLocal);
    DECLARE @HoraLocal time(0) = CONVERT(time(0), @AgoraLocal);

    ;WITH overdue AS (
      SELECT
        v.ID,
        v.ROTEIRO_ID,
        v.CHAVE_LOJA,
        v.NOME_LOJA,
        v.COD_FUNC_RESPONSAVEL,
        v.NOME_RESPONSAVEL,
        v.CHAVE_SUPERVISAO,
        v.DATA_PLANEJADA,
        DATEDIFF(DAY, v.DATA_PLANEJADA, @HojeLocal) AS DELAY_DAYS
      FROM TESTE..TB_VISITA_TRATATIVA AS v
      INNER JOIN TESTE..ROTEIRO_PARADAS_MAPA AS p ON p.ID = v.PARADA_ROTEIRO_ID
      WHERE v.EH_ATUAL = 1
        AND v.STATUS = 'PENDENTE'
        AND p.ATIVO = 1
        AND (
          v.DATA_PLANEJADA < @HojeLocal
          OR (v.DATA_PLANEJADA = @HojeLocal AND @HoraLocal >= '18:00:00')
        )
    ),
    events AS (
      SELECT
        o.*,
        CASE WHEN o.DELAY_DAYS >= 2 THEN 'ATRASO_TRATATIVA_EQUIPE' ELSE 'TRATATIVA_PENDENTE' END AS RULE_CODE,
        CASE WHEN o.DELAY_DAYS >= 2 THEN 'VISITA_ATRASO_ESCALADO' ELSE 'VISITA_JANELA_ENCERRADA' END AS EVENT_TYPE,
        CASE WHEN o.DELAY_DAYS >= 2 THEN CONCAT('ESCALADA:', o.ID) ELSE CONCAT('PENDENTE:', o.ID) END AS OCCURRENCE_KEY,
        CASE
          WHEN o.DELAY_DAYS >= 2 THEN COALESCE(
            (
              SELECT TOP (1) c.COD_FUNC
              FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS e
              INNER JOIN TESTE..TB_COORD_COORDENADOR AS c
                ON c.CHAVE_COORDENACAO = e.CHAVE_COORDENACAO
              WHERE e.CHAVE_SUPERVISAO = o.CHAVE_SUPERVISAO
                AND c.COD_FUNC IS NOT NULL
              ORDER BY c.COD_FUNC
            ),
            o.COD_FUNC_RESPONSAVEL
          )
          ELSE o.COD_FUNC_RESPONSAVEL
        END AS RECIPIENT,
        CASE
          WHEN o.DELAY_DAYS >= 2 THEN 3
          WHEN o.DELAY_DAYS = 1 THEN 2
          ELSE 1
        END AS DELIVERY_STAGE
      FROM overdue AS o
      WHERE o.DELAY_DAYS >= 0
    )
    INSERT INTO TESTE..TB_EVENTO_OUTBOX (
      EVENTO_ID,
      TIPO_EVENTO,
      AGREGADO_TIPO,
      AGREGADO_ID,
      PAYLOAD_JSON,
      CHAVE_DEDUPLICACAO,
      CORRELATION_ID,
      OCORRIDO_EM_UTC
    )
    OUTPUT INSERTED.EVENTO_ID
    SELECT
      NEWID(),
      e.EVENT_TYPE,
      'VISITA',
      CONVERT(nvarchar(100), e.ID),
      (
        SELECT
          e.RULE_CODE AS ruleCode,
          e.OCCURRENCE_KEY AS dedupeKey,
          JSON_QUERY(CONCAT('[', e.RECIPIENT, ']')) AS recipients,
          'VISITA' AS entityType,
          CONVERT(nvarchar(100), e.ID) AS entityId,
          e.ROTEIRO_ID AS routeId,
          e.ID AS visitId,
          e.CHAVE_LOJA AS storeKey,
          JSON_QUERY((
            SELECT
              'visitas' AS section,
              e.ROTEIRO_ID AS routeId,
              e.ID AS visitId,
              CAST(1 AS bit) AS openTreatment,
              CAST(1 AS bit) AS mapFocus
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
          )) AS destination,
          JSON_QUERY((
            SELECT
              CONCAT(e.CHAVE_LOJA, ' - ', e.NOME_LOJA) AS storeLabel,
              CONVERT(char(10), e.DATA_PLANEJADA, 103) AS plannedLabel,
              CONVERT(char(10), e.DATA_PLANEJADA, 103) AS plannedDate,
              e.NOME_RESPONSAVEL AS ownerName
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
          )) AS variables
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
      ),
      CONCAT('VISIT_OVERDUE:', e.ID, ':S', e.DELIVERY_STAGE),
      NEWID(),
      SYSUTCDATETIME()
    FROM events AS e
    WHERE NOT EXISTS (
      SELECT 1
      FROM TESTE..TB_EVENTO_OUTBOX AS outbox
      WHERE outbox.CHAVE_DEDUPLICACAO = CONCAT('VISIT_OVERDUE:', e.ID, ':S', e.DELIVERY_STAGE)
    );
  `);
  return result.recordset.length;
}

export async function claimProductsForEvaluation(workerId, limit = 25, leaseSeconds = 180) {
  const request = pool.request();
  request.input('workerId', sql.VarChar(100), workerId);
  request.input('limit', sql.Int, limit);
  request.input('leaseSeconds', sql.Int, leaseSeconds);
  const result = await request.query(`
    ;WITH due AS (
      SELECT TOP (@limit) vp.*
      FROM TESTE..TB_VISITA_PRODUTO AS vp WITH (UPDLOCK, READPAST, ROWLOCK)
      INNER JOIN TESTE..TB_VISITA_TRATATIVA AS v ON v.ID = vp.VISITA_ID
      WHERE vp.ATIVO = 1
        AND v.STATUS = 'REALIZADA'
        AND vp.STATUS_ACOMPANHAMENTO = 'AGUARDANDO_EVOLUCAO'
        AND vp.PROXIMA_VERIFICACAO_EM_UTC <= SYSUTCDATETIME()
        AND (
          vp.BLOQUEADO_ATE_EM_UTC IS NULL
          OR vp.BLOQUEADO_ATE_EM_UTC < SYSUTCDATETIME()
        )
      ORDER BY vp.PROXIMA_VERIFICACAO_EM_UTC, vp.ID
    )
    UPDATE due
    SET
      BLOQUEADO_ATE_EM_UTC = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
      BLOQUEADO_POR_WORKER = @workerId,
      TENTATIVAS_TECNICAS = TENTATIVAS_TECNICAS + 1,
      ULTIMO_ERRO_TECNICO = NULL
    OUTPUT INSERTED.*;
  `);
  return result.recordset;
}

export async function fetchVisitForProductEvaluation(visitId) {
  const request = pool.request();
  request.input('visitId', sql.BigInt, visitId);
  const result = await request.query(`
    SELECT TOP (1) *
    FROM TESTE..TB_VISITA_TRATATIVA
    WHERE ID = @visitId
  `);
  return result.recordset[0] ?? null;
}

export async function completeProductEvaluation(product, visit, snapshot, evolved) {
  await poolConnect;
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const request = new sql.Request(transaction);
    request.input('productId', sql.BigInt, product.ID);
    request.input('snapshot', sql.NVarChar(sql.MAX), JSON.stringify(snapshot));
    request.input('evolved', sql.Bit, evolved);
    const correlationId = crypto.randomUUID();
    request.input(
      'summary',
      sql.NVarChar(1000),
      evolved ? 'Evolução comercial detectada automaticamente.' : 'Sem evolução após o prazo configurado.'
    );
    await request.query(`
      UPDATE TESTE..TB_VISITA_PRODUTO
      SET
        EVIDENCIA_ATUAL_JSON = @snapshot,
        ULTIMA_VERIFICACAO_EM_UTC = SYSUTCDATETIME(),
        PROXIMA_VERIFICACAO_EM_UTC = NULL,
        STATUS_ACOMPANHAMENTO = CASE
          WHEN @evolved = 1 THEN 'EVOLUCAO_CONFIRMADA'
          ELSE 'SEM_EVOLUCAO'
        END,
        EVOLUCAO_DETECTADA_EM_UTC = CASE
          WHEN @evolved = 1 THEN SYSUTCDATETIME()
          ELSE NULL
        END,
        RESUMO_EVIDENCIA = @summary,
        BLOQUEADO_ATE_EM_UTC = NULL,
        BLOQUEADO_POR_WORKER = NULL,
        ULTIMO_ERRO_TECNICO = NULL,
        ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
        ATUALIZADO_POR = 0
      WHERE ID = @productId
    `);
    const history = new sql.Request(transaction);
    history.input('visitId', sql.BigInt, product.VISITA_ID);
    history.input('productId', sql.BigInt, product.ID);
    history.input('correlationId', sql.UniqueIdentifier, correlationId);
    history.input('evolved', sql.Bit, evolved);
    history.input('snapshot', sql.NVarChar(sql.MAX), JSON.stringify(snapshot));
    await history.query(`
      INSERT INTO TESTE..TB_HISTORICO_VISITA (
        VISITA_ID,
        VISITA_PRODUTO_ID,
        TIPO_EVENTO,
        DADOS_NOVOS_JSON,
        ORIGEM,
        CORRELATION_ID
      )
      VALUES (
        @visitId,
        @productId,
        CASE WHEN @evolved = 1
          THEN 'EVOLUCAO_PRODUTO_DETECTADA'
          ELSE 'PRODUTO_SEM_EVOLUCAO'
        END,
        @snapshot,
        'JOB',
        @correlationId
      )
    `);
    if (evolved) {
      const resolve = new sql.Request(transaction);
      resolve.input('productId', sql.BigInt, product.ID);
      await resolve.query(`
        UPDATE TESTE..TB_NOTIFICACAO
        SET
          STATUS = 'RESOLVIDA',
          RESOLVIDA_EM_UTC = SYSUTCDATETIME(),
          RESOLVIDA_POR = 0,
          MOTIVO_RESOLUCAO = 'EVOLUCAO_AUTOMATICA'
        WHERE VISITA_PRODUTO_ID = @productId
          AND STATUS = 'ATIVA';

        UPDATE nu
        SET
          STATUS = 'RESOLVIDA',
          RESOLVIDA_EM_UTC = SYSUTCDATETIME(),
          ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
          ATUALIZADO_POR = 0
        FROM TESTE..TB_NOTIFICACAO_USUARIO AS nu
        INNER JOIN TESTE..TB_NOTIFICACAO AS n ON n.ID = nu.NOTIFICACAO_ID
        WHERE n.VISITA_PRODUTO_ID = @productId
          AND nu.STATUS NOT IN ('RESOLVIDA', 'CANCELADA');
      `);
    } else {
      const outbox = new sql.Request(transaction);
      outbox.input('eventId', sql.UniqueIdentifier, crypto.randomUUID());
      outbox.input('productId', sql.BigInt, product.ID);
      outbox.input('visitId', sql.BigInt, product.VISITA_ID);
      outbox.input('routeId', sql.UniqueIdentifier, visit.ROTEIRO_ID);
      outbox.input('storeKey', sql.NVarChar(100), visit.CHAVE_LOJA);
      outbox.input('storeName', sql.NVarChar(250), visit.NOME_LOJA);
      outbox.input('ownerCode', sql.Int, visit.COD_FUNC_RESPONSAVEL);
      outbox.input('productName', sql.NVarChar(100), product.NOME_PRODUTO_SNAPSHOT);
      outbox.input('visitDate', sql.Date, visit.DATA_VISITA);
      outbox.input('correlationId', sql.UniqueIdentifier, correlationId);
      outbox.input('dedupeKey', sql.NVarChar(250), `PRODUCT_NO_EVOLUTION:${product.ID}`);
      await outbox.query(`
        IF NOT EXISTS (
          SELECT 1
          FROM TESTE..TB_EVENTO_OUTBOX WITH (UPDLOCK, HOLDLOCK)
          WHERE CHAVE_DEDUPLICACAO = @dedupeKey
        )
        BEGIN
          INSERT INTO TESTE..TB_EVENTO_OUTBOX (
            EVENTO_ID,
            TIPO_EVENTO,
            AGREGADO_TIPO,
            AGREGADO_ID,
            PAYLOAD_JSON,
            CHAVE_DEDUPLICACAO,
            CORRELATION_ID,
            OCORRIDO_EM_UTC
          )
          VALUES (
            @eventId,
            'VISITA_PRODUTO_SEM_EVOLUCAO',
            'VISITA_PRODUTO',
            CONVERT(nvarchar(100), @productId),
            (
              SELECT
                'PRODUTO_SEM_EVOLUCAO' AS ruleCode,
                CONCAT('PRODUTO_SEM_EVOLUCAO:', @productId) AS dedupeKey,
                JSON_QUERY(CONCAT('[', @ownerCode, ']')) AS recipients,
                'VISITA_PRODUTO' AS entityType,
                CONVERT(nvarchar(100), @productId) AS entityId,
                @routeId AS routeId,
                @visitId AS visitId,
                @productId AS visitProductId,
                @storeKey AS storeKey,
                JSON_QUERY((
                  SELECT
                    'visitas' AS section,
                    @routeId AS routeId,
                    @visitId AS visitId,
                    @productId AS visitProductId,
                    CAST(1 AS bit) AS openTreatment
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                )) AS destination,
                JSON_QUERY((
                  SELECT
                    @productName AS productName,
                    CONCAT(@storeKey, ' - ', @storeName) AS storeLabel,
                    CONVERT(char(10), @visitDate, 103) AS visitDate
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                )) AS variables
              FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ),
            @dedupeKey,
            @correlationId,
            SYSUTCDATETIME()
          )
        END
      `);
    }
    await transaction.commit();
  } catch (error) {
    try { await transaction.rollback(); } catch { /* transação já encerrada */ }
    throw error;
  }
}

export async function failProductEvaluation(productId, error) {
  const request = pool.request();
  request.input('productId', sql.BigInt, productId);
  request.input('error', sql.NVarChar(2000), String(error.stack ?? error).slice(0, 2000));
  await request.query(`
    UPDATE TESTE..TB_VISITA_PRODUTO
    SET
      BLOQUEADO_ATE_EM_UTC = NULL,
      BLOQUEADO_POR_WORKER = NULL,
      ULTIMO_ERRO_TECNICO = @error,
      PROXIMA_VERIFICACAO_EM_UTC = DATEADD(
        MINUTE,
        CASE WHEN TENTATIVAS_TECNICAS > 5 THEN 360 ELSE 15 END,
        SYSUTCDATETIME()
      ),
      ATUALIZADO_EM_UTC = SYSUTCDATETIME()
    WHERE ID = @productId
  `);
}

export async function resurfaceSnoozedNotifications() {
  const request = pool.request();
  const result = await request.query(`
    DECLARE @Updated TABLE (ID bigint PRIMARY KEY);

    UPDATE TESTE..TB_NOTIFICACAO_USUARIO
    SET
      STATUS = 'NOVA',
      ADIADA_ATE_EM_UTC = NULL,
      ULTIMA_ENTREGA_EM_UTC = SYSUTCDATETIME(),
      QTD_ENTREGAS = QTD_ENTREGAS + 1,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = COD_FUNC_DESTINATARIO
    OUTPUT INSERTED.ID INTO @Updated(ID)
    WHERE STATUS = 'ADIADA'
      AND ADIADA_ATE_EM_UTC <= SYSUTCDATETIME();

    ;WITH repeatDue AS (
      SELECT
        nu.ID,
        TRY_CONVERT(
          int,
          JSON_VALUE(
            r.POLITICA_REPETICAO_JSON,
            CONCAT('$.intervalHours[', nu.QTD_ENTREGAS - 1, ']')
          )
        ) AS NEXT_AFTER_HOURS,
        TRY_CONVERT(int, JSON_VALUE(r.POLITICA_REPETICAO_JSON, '$.maxDeliveries'))
          AS MAX_DELIVERIES,
        TRY_CONVERT(bit, JSON_VALUE(r.POLITICA_REPETICAO_JSON, '$.stopOnAcknowledgement'))
          AS STOP_ON_ACKNOWLEDGEMENT
      FROM TESTE..TB_NOTIFICACAO_USUARIO AS nu
      INNER JOIN TESTE..TB_NOTIFICACAO AS n ON n.ID = nu.NOTIFICACAO_ID
      INNER JOIN TESTE..TB_NOTIFICACAO_REGRA AS r ON r.ID = n.REGRA_ID
      WHERE n.STATUS = 'ATIVA'
        AND nu.STATUS IN ('NOVA', 'VISUALIZADA', 'LIDA')
        AND (n.EXPIRA_EM_UTC IS NULL OR n.EXPIRA_EM_UTC > SYSUTCDATETIME())
        AND NOT EXISTS (
          SELECT 1 FROM @Updated AS u WHERE u.ID = nu.ID
        )
    ),
    ready AS (
      SELECT nu.*
      FROM TESTE..TB_NOTIFICACAO_USUARIO AS nu
      INNER JOIN repeatDue AS due ON due.ID = nu.ID
      WHERE due.NEXT_AFTER_HOURS IS NOT NULL
        AND nu.QTD_ENTREGAS < due.MAX_DELIVERIES
        AND (due.STOP_ON_ACKNOWLEDGEMENT = 0 OR nu.CIENCIA_EM_UTC IS NULL)
        AND DATEADD(HOUR, due.NEXT_AFTER_HOURS, nu.PRIMEIRA_ENTREGA_EM_UTC)
          <= SYSUTCDATETIME()
    )
    UPDATE ready
    SET
      STATUS = 'NOVA',
      ULTIMA_ENTREGA_EM_UTC = SYSUTCDATETIME(),
      QTD_ENTREGAS = QTD_ENTREGAS + 1,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = COD_FUNC_DESTINATARIO
    OUTPUT INSERTED.ID INTO @Updated(ID);

    SELECT COUNT_BIG(*) AS TOTAL FROM @Updated;
  `);
  return Number(result.recordset[0]?.TOTAL ?? 0);
}

export async function expireNotifications() {
  const request = pool.request();
  const result = await request.query(`
    DECLARE @Expired TABLE (ID bigint PRIMARY KEY);
    UPDATE TESTE..TB_NOTIFICACAO
    SET
      STATUS = 'EXPIRADA',
      RESOLVIDA_EM_UTC = SYSUTCDATETIME(),
      MOTIVO_RESOLUCAO = 'EXPIRADA'
    OUTPUT INSERTED.ID INTO @Expired(ID)
    WHERE STATUS = 'ATIVA'
      AND EXPIRA_EM_UTC <= SYSUTCDATETIME();

    UPDATE nu
    SET
      STATUS = 'CANCELADA',
      RESOLVIDA_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = COD_FUNC_DESTINATARIO
    FROM TESTE..TB_NOTIFICACAO_USUARIO AS nu
    INNER JOIN @Expired AS e ON e.ID = nu.NOTIFICACAO_ID
    WHERE nu.STATUS NOT IN ('RESOLVIDA', 'CANCELADA');

    SELECT COUNT_BIG(*) AS TOTAL FROM @Expired;
  `);
  return Number(result.recordset[0]?.TOTAL ?? 0);
}

export async function reconcileNotifications() {
  const request = pool.request();
  const result = await request.query(`
    DECLARE @Resolved TABLE (ID bigint PRIMARY KEY);
    UPDATE n
    SET
      STATUS = 'RESOLVIDA',
      RESOLVIDA_EM_UTC = SYSUTCDATETIME(),
      RESOLVIDA_POR = 0,
      MOTIVO_RESOLUCAO = 'RECONCILIACAO'
    OUTPUT INSERTED.ID INTO @Resolved(ID)
    FROM TESTE..TB_NOTIFICACAO AS n
    LEFT JOIN TESTE..TB_VISITA_TRATATIVA AS v ON v.ID = n.VISITA_ID
    LEFT JOIN TESTE..TB_VISITA_PRODUTO AS vp ON vp.ID = n.VISITA_PRODUTO_ID
    WHERE n.STATUS = 'ATIVA'
      AND (
        (n.VISITA_ID IS NOT NULL AND v.STATUS IN (
          'REALIZADA', 'NAO_REALIZADA', 'REAGENDADA', 'CANCELADA'
        ) AND n.TIPO IN ('TRATATIVA_PENDENTE', 'ATRASO_TRATATIVA_EQUIPE'))
        OR
        (n.VISITA_PRODUTO_ID IS NOT NULL AND vp.STATUS_ACOMPANHAMENTO IN (
          'EVOLUCAO_CONFIRMADA', 'ENCERRADO'
        ))
      );

    UPDATE nu
    SET
      STATUS = 'RESOLVIDA',
      RESOLVIDA_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
      ATUALIZADO_POR = 0
    FROM TESTE..TB_NOTIFICACAO_USUARIO AS nu
    INNER JOIN @Resolved AS r ON r.ID = nu.NOTIFICACAO_ID
    WHERE nu.STATUS NOT IN ('RESOLVIDA', 'CANCELADA');

    SELECT COUNT_BIG(*) AS TOTAL FROM @Resolved;
  `);
  return Number(result.recordset[0]?.TOTAL ?? 0);
}
