import { pool } from '../db/sqlServer.js';
import { applyAccessScope } from '../auth/scopeSql.js';

function accessSql(request, user) {
  return applyAccessScope(request, user, 'ent');
}

export async function fetchGerenciasArea(user) {
  const request = pool.request();
  const authSql = accessSql(request, user);
  const result = await request.query(`
    SELECT DISTINCT
      ent.CHAVE_GERENCIA_AREA,
      ent.DESC_GERENCIA_AREA
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
    WHERE ent.CHAVE_GERENCIA_AREA IS NOT NULL
      AND ent.DESC_GERENCIA_AREA IS NOT NULL
      ${authSql}
    ORDER BY ent.DESC_GERENCIA_AREA
  `);
  return result.recordset;
}

export async function fetchCoordenacoesByGerenciaArea(chaveGerenciaArea, user) {
  const request = pool.request();
  request.input('chaveGerenciaArea', Number(chaveGerenciaArea));
  const authSql = accessSql(request, user);
  const result = await request.query(`
    SELECT DISTINCT
      ent.CHAVE_COORDENACAO,
      ent.DESC_COORDENACAO
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
    WHERE ent.CHAVE_GERENCIA_AREA = @chaveGerenciaArea
      AND ent.CHAVE_COORDENACAO IS NOT NULL
      AND ent.DESC_COORDENACAO IS NOT NULL
      ${authSql}
    ORDER BY ent.DESC_COORDENACAO
  `);
  return result.recordset;
}

export async function fetchSupervisoesByCoordenacao(chaveCoordenacao, user) {
  const request = pool.request();
  request.input('chaveCoordenacao', Number(chaveCoordenacao));
  const authSql = accessSql(request, user);
  const result = await request.query(`
    SELECT DISTINCT
      ent.CHAVE_SUPERVISAO,
      ent.DESC_SUPERVISAO
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
    WHERE ent.CHAVE_COORDENACAO = @chaveCoordenacao
      AND ent.CHAVE_SUPERVISAO IS NOT NULL
      AND ent.DESC_SUPERVISAO IS NOT NULL
      ${authSql}
    ORDER BY ent.DESC_SUPERVISAO
  `);
  return result.recordset;
}

export async function fetchAllCoordenacoes(user) {
  const request = pool.request();
  const authSql = accessSql(request, user);
  const result = await request.query(`
    SELECT DISTINCT
      ent.CHAVE_COORDENACAO,
      ent.DESC_COORDENACAO,
      ent.CHAVE_GERENCIA_AREA
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
    WHERE ent.CHAVE_COORDENACAO IS NOT NULL
      AND ent.DESC_COORDENACAO IS NOT NULL
      AND ent.CHAVE_GERENCIA_AREA IS NOT NULL
      ${authSql}
    ORDER BY ent.DESC_COORDENACAO
  `);
  return result.recordset;
}

export async function fetchAllSupervisoes(user) {
  const request = pool.request();
  const authSql = accessSql(request, user);
  const result = await request.query(`
    SELECT DISTINCT
      ent.CHAVE_SUPERVISAO,
      ent.DESC_SUPERVISAO,
      ent.CHAVE_COORDENACAO,
      ent.CHAVE_GERENCIA_AREA
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
    WHERE ent.CHAVE_SUPERVISAO IS NOT NULL
      AND ent.DESC_SUPERVISAO IS NOT NULL
      AND ent.CHAVE_COORDENACAO IS NOT NULL
      AND ent.CHAVE_GERENCIA_AREA IS NOT NULL
      ${authSql}
    ORDER BY ent.DESC_SUPERVISAO
  `);
  return result.recordset;
}

export async function fetchAgencias(user) {
  const request = pool.request();
  const authSql = accessSql(request, user);
  const result = await request.query(`
    SELECT DISTINCT
      LTRIM(RTRIM(CAST(ent.COD_AG AS NVARCHAR(50)))) AS COD_AG,
      LTRIM(RTRIM(CAST(ent.NOME_AG AS NVARCHAR(255)))) AS NOME_AG
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ent
    WHERE ent.COD_AG IS NOT NULL
      AND ent.NOME_AG IS NOT NULL
      ${authSql}
    ORDER BY NOME_AG
  `);
  return result.recordset;
}
