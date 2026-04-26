import { pool } from '../db/sqlServer.js';

async function fetchLatestRefByUf(ufSigla) {
  const request = pool.request();
  request.input('ufSigla', ufSigla);
  const result = await request.query(`
    SELECT TOP (1)
      ANO_REF AS anoRef,
      MES_REF AS mesRef
    FROM dbo.TB_METRICA_UF_RESUMO_MES
    WHERE UF_SIGLA = @ufSigla
    ORDER BY ANO_REF DESC, MES_REF DESC
  `);
  return result.recordset[0] ?? null;
}

async function fetchStateSummary(ufSigla, anoRef, mesRef) {
  const request = pool.request();
  request.input('ufSigla', ufSigla);
  request.input('anoRef', anoRef);
  request.input('mesRef', mesRef);
  const result = await request.query(`
    SELECT
      QTD_AGENCIAS AS agencias,
      QTD_PAS AS pas,
      QTD_PRACAS_PRESENCAS AS pracasPresencas,
      QTD_LOJAS AS lojas,
      QTD_LOJAS_ATIVAS AS lojasAtivas
    FROM dbo.TB_METRICA_UF_RESUMO_MES
    WHERE UF_SIGLA = @ufSigla
      AND ANO_REF = @anoRef
      AND MES_REF = @mesRef
  `);
  return result.recordset[0] ?? null;
}

async function fetchStateProducts(ufSigla, anoRef, mesRef) {
  const request = pool.request();
  request.input('ufSigla', ufSigla);
  request.input('anoRef', anoRef);
  request.input('mesRef', mesRef);
  const result = await request.query(`
    SELECT
      p.PRODUTO_ID AS id,
      p.NOME_EXIBICAO AS nome,
      m.VARIACAO_PCT AS variacaoPct,
      m.QTD_LOJAS AS lojas,
      m.QTD_LOJAS_ATIVAS AS lojasAtivas,
      m.PRODUCAO_VALOR AS producaoMes,
      m.PARTICIPACAO_PCT AS participacaoPct,
      LOWER(m.STATUS_SEMANTICO) AS statusSemantico,
      m.INSIGHT_DESTAQUE AS insightDestaque
    FROM dbo.TB_METRICA_UF_PRODUTO_MES AS m
    INNER JOIN dbo.TB_PRODUTO AS p
      ON p.PRODUTO_ID = m.PRODUTO_ID
    WHERE m.UF_SIGLA = @ufSigla
      AND m.ANO_REF = @anoRef
      AND m.MES_REF = @mesRef
  `);
  return result.recordset;
}

async function fetchMunicipalitySummary(codIbge, anoRef, mesRef) {
  const request = pool.request();
  request.input('codIbge', codIbge);
  request.input('anoRef', anoRef);
  request.input('mesRef', mesRef);
  const result = await request.query(`
    SELECT
      QTD_AGENCIAS AS agencias,
      QTD_PAS AS pas,
      QTD_PRACAS_PRESENCAS AS pracasPresencas,
      QTD_LOJAS AS lojas,
      QTD_LOJAS_ATIVAS AS lojasAtivas
    FROM dbo.TB_METRICA_MUNICIPIO_RESUMO_MES
    WHERE COD_IBGE = @codIbge
      AND ANO_REF = @anoRef
      AND MES_REF = @mesRef
  `);
  return result.recordset[0] ?? null;
}

async function fetchMunicipalityProducts(codIbge, anoRef, mesRef) {
  const request = pool.request();
  request.input('codIbge', codIbge);
  request.input('anoRef', anoRef);
  request.input('mesRef', mesRef);
  const result = await request.query(`
    SELECT
      p.PRODUTO_ID AS id,
      p.NOME_EXIBICAO AS nome,
      m.VARIACAO_PCT AS variacaoPct,
      m.QTD_LOJAS AS lojas,
      m.QTD_LOJAS_ATIVAS AS lojasAtivas,
      m.PRODUCAO_VALOR AS producaoMes,
      m.PARTICIPACAO_PCT AS participacaoPct,
      LOWER(m.STATUS_SEMANTICO) AS statusSemantico,
      m.INSIGHT_DESTAQUE AS insightDestaque
    FROM dbo.TB_METRICA_MUNICIPIO_PRODUTO_MES AS m
    INNER JOIN dbo.TB_PRODUTO AS p
      ON p.PRODUTO_ID = m.PRODUTO_ID
    WHERE m.COD_IBGE = @codIbge
      AND m.ANO_REF = @anoRef
      AND m.MES_REF = @mesRef
  `);
  return result.recordset;
}

async function fetchLatestRefByMunicipality(codIbge) {
  const request = pool.request();
  request.input('codIbge', codIbge);
  const result = await request.query(`
    SELECT TOP (1)
      ANO_REF AS anoRef,
      MES_REF AS mesRef
    FROM dbo.TB_METRICA_MUNICIPIO_RESUMO_MES
    WHERE COD_IBGE = @codIbge
    ORDER BY ANO_REF DESC, MES_REF DESC
  `);
  return result.recordset[0] ?? null;
}

async function fetchStateSubproducts(ufSigla, anoRef, mesRef) {
  const request = pool.request();
  request.input('ufSigla', ufSigla);
  request.input('anoRef', anoRef);
  request.input('mesRef', mesRef);
  const result = await request.query(`
    SELECT
      m.PRODUTO_ID AS produtoId,
      m.SUBPRODUTO_ID AS id,
      s.NOME AS nome,
      m.QTD_LOJAS AS lojas,
      m.PRODUCAO_VALOR AS producaoMes,
      s.VALOR_LEGENDA AS valorLegenda,
      CASE
        WHEN s.VALOR_LEGENDA LIKE N'Vlr. Contrato%' THEN N'Qtd. Contrato'
        WHEN s.VALOR_LEGENDA LIKE N'Vlr. Averbado%' THEN N'Qtd. Averbada'
        ELSE NULL
      END AS quantidadeLegenda,
      m.QTD_PRODUCAO AS quantidade
    FROM dbo.TB_METRICA_UF_PRODUTO_SUB_MES AS m
    INNER JOIN dbo.TB_PRODUTO_SUB AS s
      ON s.SUBPRODUTO_ID = m.SUBPRODUTO_ID
    WHERE m.UF_SIGLA = @ufSigla
      AND m.ANO_REF = @anoRef
      AND m.MES_REF = @mesRef
  `);
  return result.recordset;
}

async function fetchStateSeries(ufSigla) {
  const request = pool.request();
  request.input('ufSigla', ufSigla);
  const result = await request.query(`
    WITH latest_ref AS (
      SELECT
        UF_SIGLA,
        PRODUTO_ID,
        PERIODO_TIPO,
        MAX(REFERENCIA_FIM) AS REFERENCIA_FIM
      FROM dbo.TB_SERIE_PRODUTO_PERIODO
      WHERE UF_SIGLA = @ufSigla
      GROUP BY UF_SIGLA, PRODUTO_ID, PERIODO_TIPO
    )
    SELECT
      s.PRODUTO_ID AS produtoId,
      LOWER(s.PERIODO_TIPO) AS periodoTipo,
      s.ORDEM AS ordem,
      s.LABEL AS label,
      s.VALOR_ATUAL_MIL AS atualMil,
      s.VALOR_ANTERIOR_MIL AS anteriorMil
    FROM dbo.TB_SERIE_PRODUTO_PERIODO AS s
    INNER JOIN latest_ref AS r
      ON r.UF_SIGLA = s.UF_SIGLA
      AND r.PRODUTO_ID = s.PRODUTO_ID
      AND r.PERIODO_TIPO = s.PERIODO_TIPO
      AND r.REFERENCIA_FIM = s.REFERENCIA_FIM
    WHERE s.UF_SIGLA = @ufSigla
    ORDER BY s.PRODUTO_ID, s.PERIODO_TIPO, s.ORDEM
  `);
  return result.recordset;
}

async function fetchLatestGeoRef(produtoId, tipoGeo, ufSigla = null) {
  const request = pool.request();
  request.input('produtoId', produtoId);
  request.input('tipoGeo', tipoGeo);
  let ufFilterSql = '';
  if (ufSigla) {
    request.input('ufSigla', ufSigla);
    ufFilterSql = 'AND UF_SIGLA = @ufSigla';
  }
  const result = await request.query(`
    SELECT TOP (1)
      ANO_REF AS anoRef,
      MES_REF AS mesRef
    FROM dbo.TB_METRICA_GEO_PRODUTO_MES
    WHERE PRODUTO_ID = @produtoId
      AND TIPO_GEO = @tipoGeo
      ${ufFilterSql}
    ORDER BY ANO_REF DESC, MES_REF DESC
  `);
  return result.recordset[0] ?? null;
}

async function fetchProductivityRows(produtoId, tipoGeo, anoRef, mesRef, ufSigla = null) {
  const request = pool.request();
  request.input('produtoId', produtoId);
  request.input('tipoGeo', tipoGeo);
  request.input('anoRef', anoRef);
  request.input('mesRef', mesRef);
  let ufFilterSql = '';
  if (ufSigla) {
    request.input('ufSigla', ufSigla);
    ufFilterSql = 'AND UF_SIGLA = @ufSigla';
  }

  const result = await request.query(`
    SELECT
      NOME_MATCH AS municipio,
      QTD_LOJAS AS lojas,
      PRODUCAO_VALOR AS producaoMes,
      VARIACAO_PCT AS variacaoPct
    FROM dbo.TB_METRICA_GEO_PRODUTO_MES
    WHERE PRODUTO_ID = @produtoId
      AND TIPO_GEO = @tipoGeo
      AND ANO_REF = @anoRef
      AND MES_REF = @mesRef
      ${ufFilterSql}
    ORDER BY PRODUCAO_VALOR DESC
  `);
  return result.recordset;
}

export {
  fetchLatestRefByUf,
  fetchLatestRefByMunicipality,
  fetchStateSummary,
  fetchStateProducts,
  fetchMunicipalitySummary,
  fetchMunicipalityProducts,
  fetchStateSubproducts,
  fetchStateSeries,
  fetchLatestGeoRef,
  fetchProductivityRows,
};
