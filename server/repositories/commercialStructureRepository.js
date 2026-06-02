import { pool } from '../db/sqlServer.js';

export async function fetchGerenciasArea() {
  const request = pool.request();
  const query = `
    SELECT DISTINCT
      CHAVE_GERENCIA_AREA,
      DESC_GERENCIA_AREA
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES
    WHERE CHAVE_GERENCIA_AREA IS NOT NULL
      AND DESC_GERENCIA_AREA IS NOT NULL
    ORDER BY DESC_GERENCIA_AREA
  `;
  const result = await request.query(query);
  return result.recordset;
}

export async function fetchCoordenacoesByGerenciaArea(chaveGerenciaArea) {
  const request = pool.request();
  request.input('chaveGerenciaArea', Number(chaveGerenciaArea));
  const query = `
    SELECT DISTINCT
      CHAVE_COORDENACAO,
      DESC_COORDENACAO
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES
    WHERE CHAVE_GERENCIA_AREA = @chaveGerenciaArea
      AND CHAVE_COORDENACAO IS NOT NULL
      AND DESC_COORDENACAO IS NOT NULL
    ORDER BY DESC_COORDENACAO
  `;
  const result = await request.query(query);
  return result.recordset;
}

export async function fetchSupervisoesByCoordenacao(chaveCoordenacao) {
  const request = pool.request();
  request.input('chaveCoordenacao', Number(chaveCoordenacao));
  const query = `
    SELECT DISTINCT
      CHAVE_SUPERVISAO,
      DESC_SUPERVISAO
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES
    WHERE CHAVE_COORDENACAO = @chaveCoordenacao
      AND CHAVE_SUPERVISAO IS NOT NULL
      AND DESC_SUPERVISAO IS NOT NULL
    ORDER BY DESC_SUPERVISAO
  `;
  const result = await request.query(query);
  return result.recordset;
}

export async function fetchAllCoordenacoes() {
  const request = pool.request();
  const query = `
    SELECT DISTINCT
      CHAVE_COORDENACAO,
      DESC_COORDENACAO,
      CHAVE_GERENCIA_AREA
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES
    WHERE CHAVE_COORDENACAO IS NOT NULL
      AND DESC_COORDENACAO IS NOT NULL
      AND CHAVE_GERENCIA_AREA IS NOT NULL
    ORDER BY DESC_COORDENACAO
  `;
  const result = await request.query(query);
  return result.recordset;
}

export async function fetchAllSupervisoes() {
  const request = pool.request();
  const query = `
    SELECT DISTINCT
      CHAVE_SUPERVISAO,
      DESC_SUPERVISAO,
      CHAVE_COORDENACAO,
      CHAVE_GERENCIA_AREA
    FROM MESU..CONS_DISTRIBUICAO_ENTIDADES
    WHERE CHAVE_SUPERVISAO IS NOT NULL
      AND DESC_SUPERVISAO IS NOT NULL
      AND CHAVE_COORDENACAO IS NOT NULL
      AND CHAVE_GERENCIA_AREA IS NOT NULL
    ORDER BY DESC_SUPERVISAO
  `;
  const result = await request.query(query);
  return result.recordset;
}
