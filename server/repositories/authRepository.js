import { pool } from '../db/sqlServer.js';
import { applyAccessScope } from '../auth/scopeSql.js';

function uniqueSortedNumbers(values) {
  return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0))]
    .map(Math.trunc)
    .sort((a, b) => a - b);
}

export async function findEligibleUser(funcional) {
  const codFunc = Number(funcional);

  const adminRequest = pool.request();
  adminRequest.input('codFunc', codFunc);
  const adminResult = await adminRequest.query(`
    SELECT TOP (1)
      LTRIM(RTRIM(CAST(COD_FUNC AS NVARCHAR(20)))) AS funcional,
      LTRIM(RTRIM(CAST(NOME_FUNC AS NVARCHAR(150)))) AS nome,
      NULLIF(LTRIM(RTRIM(CAST(EMAIL_FUNC AS NVARCHAR(150)))), '') AS email,
      LOWER(LTRIM(RTRIM(CAST(ROLE AS VARCHAR(20))))) AS role
    FROM TESTE..users_map
    WHERE TRY_CONVERT(INT, COD_FUNC) = @codFunc
      AND LOWER(LTRIM(RTRIM(CAST(ROLE AS VARCHAR(20))))) = 'admin'
  `);

  const admin = adminResult.recordset[0];
  if (admin) {
    return {
      funcional,
      nome: admin.nome || `Administrador ${funcional}`,
      email: admin.email || null,
      role: 'admin',
      isAdmin: true,
      scope: null,
    };
  }

  const assignmentRequest = pool.request();
  assignmentRequest.input('codFunc', codFunc);
  const assignmentResult = await assignmentRequest.query(`
    SELECT role, prioridade, nome, email
    FROM (
      SELECT
        CAST('gerente_area' AS VARCHAR(30)) AS role,
        3 AS prioridade,
        LTRIM(RTRIM(CAST(NOME_FUNC AS NVARCHAR(150)))) AS nome,
        NULLIF(LTRIM(RTRIM(CAST(EMAIL_FUNC AS NVARCHAR(150)))), '') AS email
      FROM TESTE..TB_COORD_GA
      WHERE COD_FUNC = @codFunc

      UNION ALL

      SELECT
        CAST('coordenador' AS VARCHAR(30)),
        2,
        LTRIM(RTRIM(CAST(NOME_FUNC AS NVARCHAR(150)))),
        NULLIF(LTRIM(RTRIM(CAST(EMAIL_FUNC AS NVARCHAR(150)))), '')
      FROM TESTE..TB_COORD_COORDENADOR
      WHERE COD_FUNC = @codFunc

      UNION ALL

      SELECT
        CAST('supervisor' AS VARCHAR(30)),
        1,
        LTRIM(RTRIM(CAST(NOME_FUNC AS NVARCHAR(150)))),
        NULLIF(LTRIM(RTRIM(CAST(EMAIL_FUNC AS NVARCHAR(150)))), '')
      FROM TESTE..TB_COORD_SUP
      WHERE COD_FUNC = @codFunc
    ) AS assignments
    ORDER BY prioridade DESC
  `);

  const assignments = assignmentResult.recordset;
  if (assignments.length === 0) return null;

  const scopeRequest = pool.request();
  const scopeSql = applyAccessScope(
    scopeRequest,
    { funcional, isAdmin: false },
    'ent',
    'authCodFunc'
  );
  const scopeResult = await scopeRequest.query(`
    SELECT DISTINCT
      ent.CHAVE_GERENCIA_AREA,
      ent.CHAVE_COORDENACAO,
      ent.CHAVE_SUPERVISAO
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
    WHERE 1 = 1
      ${scopeSql}
  `);

  const primary = assignments[0];
  const scopeRows = scopeResult.recordset;
  return {
    funcional,
    nome: primary.nome || `Funcionário ${funcional}`,
    email: primary.email || null,
    role: primary.role,
    isAdmin: false,
    scope: {
      gerenciasArea: uniqueSortedNumbers(scopeRows.map((row) => row.CHAVE_GERENCIA_AREA)),
      coordenacoes: uniqueSortedNumbers(scopeRows.map((row) => row.CHAVE_COORDENACAO)),
      supervisoes: uniqueSortedNumbers(scopeRows.map((row) => row.CHAVE_SUPERVISAO)),
    },
  };
}

export async function writeAuthLog({
  funcional = null,
  action,
  method = null,
  status,
  ipAddress = null,
  userAgent = null,
  details = null,
}) {
  const request = pool.request();
  request.input('funcional', funcional);
  request.input('action', action);
  request.input('method', method);
  request.input('status', status);
  request.input('ipAddress', ipAddress);
  request.input('userAgent', userAgent ? String(userAgent).slice(0, 500) : null);
  request.input('details', details == null ? null : JSON.stringify(details));
  await request.query(`
    INSERT INTO TESTE..AUTH_LOGS_MAPA (
      COD_FUNC,
      ACAO,
      METODO,
      STATUS,
      IP_ADDRESS,
      USER_AGENT,
      DETALHES
    )
    VALUES (
      @funcional,
      @action,
      @method,
      @status,
      @ipAddress,
      @userAgent,
      @details
    )
  `);
}
