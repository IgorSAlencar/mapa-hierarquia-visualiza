import { pool, poolConnect, sql } from '../db/sqlServer.js';

export async function beginIdempotentCommand({
  userCode,
  scope,
  key,
  method,
  path,
  requestHash,
}) {
  await poolConnect;
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const request = new sql.Request(transaction);
    request.input('userCode', sql.Int, userCode);
    request.input('scope', sql.VarChar(80), scope);
    request.input('key', sql.VarChar(100), key);
    const existingResult = await request.query(`
      SELECT TOP (1) *
      FROM TESTE..TB_COMANDO_IDEMPOTENCIA WITH (UPDLOCK, HOLDLOCK)
      WHERE COD_FUNC_USUARIO = @userCode
        AND ESCOPO = @scope
        AND CHAVE_IDEMPOTENCIA = @key
    `);
    const existing = existingResult.recordset[0];
    if (existing) {
      if (existing.REQUEST_HASH !== requestHash) {
        await transaction.commit();
        return { state: 'HASH_CONFLICT', row: existing };
      }
      if (existing.STATUS === 'CONCLUIDO') {
        await transaction.commit();
        return { state: 'COMPLETED', row: existing };
      }
      const blockedUntil = existing.BLOQUEADO_ATE_EM_UTC
        ? new Date(existing.BLOQUEADO_ATE_EM_UTC)
        : null;
      if (
        existing.STATUS === 'PROCESSANDO' &&
        blockedUntil &&
        blockedUntil.getTime() > Date.now()
      ) {
        await transaction.commit();
        return { state: 'IN_PROGRESS', row: existing };
      }
      const claim = new sql.Request(transaction);
      claim.input('id', sql.BigInt, existing.ID);
      await claim.query(`
        UPDATE TESTE..TB_COMANDO_IDEMPOTENCIA
        SET
          STATUS = 'PROCESSANDO',
          BLOQUEADO_ATE_EM_UTC = DATEADD(MINUTE, 2, SYSUTCDATETIME()),
          ATUALIZADO_EM_UTC = SYSUTCDATETIME(),
          RESPONSE_STATUS = NULL,
          RESPONSE_JSON = NULL,
          ERRO_CODIGO = NULL
        WHERE ID = @id
      `);
      await transaction.commit();
      return { state: 'CLAIMED', id: existing.ID };
    }

    const insert = new sql.Request(transaction);
    insert.input('userCode', sql.Int, userCode);
    insert.input('scope', sql.VarChar(80), scope);
    insert.input('key', sql.VarChar(100), key);
    insert.input('method', sql.VarChar(10), method);
    insert.input('path', sql.NVarChar(500), path);
    insert.input('requestHash', sql.Char(64), requestHash);
    const inserted = await insert.query(`
      INSERT INTO TESTE..TB_COMANDO_IDEMPOTENCIA (
        COD_FUNC_USUARIO,
        ESCOPO,
        CHAVE_IDEMPOTENCIA,
        METODO_HTTP,
        CAMINHO_HTTP,
        REQUEST_HASH,
        STATUS,
        BLOQUEADO_ATE_EM_UTC,
        EXPIRA_EM_UTC
      )
      OUTPUT INSERTED.ID
      VALUES (
        @userCode,
        @scope,
        @key,
        @method,
        @path,
        @requestHash,
        'PROCESSANDO',
        DATEADD(MINUTE, 2, SYSUTCDATETIME()),
        DATEADD(HOUR, 24, SYSUTCDATETIME())
      )
    `);
    await transaction.commit();
    return { state: 'CLAIMED', id: inserted.recordset[0].ID };
  } catch (error) {
    try { await transaction.rollback(); } catch { /* já encerrada */ }
    throw error;
  }
}

export async function completeIdempotentCommand(id, responseStatus, responseBody) {
  const request = pool.request();
  request.input('id', sql.BigInt, id);
  request.input('responseStatus', sql.SmallInt, responseStatus);
  request.input('responseJson', sql.NVarChar(sql.MAX), JSON.stringify(responseBody));
  await request.query(`
    UPDATE TESTE..TB_COMANDO_IDEMPOTENCIA
    SET
      STATUS = 'CONCLUIDO',
      RESPONSE_STATUS = @responseStatus,
      RESPONSE_JSON = @responseJson,
      BLOQUEADO_ATE_EM_UTC = NULL,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME()
    WHERE ID = @id
  `);
}

export async function releaseIdempotentCommand(id, errorCode = null) {
  const request = pool.request();
  request.input('id', sql.BigInt, id);
  request.input('errorCode', sql.VarChar(80), errorCode);
  await request.query(`
    UPDATE TESTE..TB_COMANDO_IDEMPOTENCIA
    SET
      STATUS = 'ERRO',
      ERRO_CODIGO = @errorCode,
      BLOQUEADO_ATE_EM_UTC = NULL,
      ATUALIZADO_EM_UTC = SYSUTCDATETIME()
    WHERE ID = @id
  `);
}
