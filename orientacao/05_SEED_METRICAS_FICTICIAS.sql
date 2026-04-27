/*
  ORIENTACAO — métricas fictícias alinhadas à UI Expresso (painel UF, cockpit, bottom sheet, coropleto)
  Execute após 02–04. Competência principal: ANO_REF=2026, MES_REF=4 (abril).
  Competência adicional: MES_REF=3 (março) apenas em TB_METRICA_UF_RESUMO_MES e alguns fatos para simular série.

  Tipos de período em TB_SERIE_PRODUTO_PERIODO: 7D (7 pontos), 30D / 3M / 12M (6 pontos cada).
*/

-- USE [TESTE];
-- GO

SET NOCOUNT ON;

DECLARE @FIM DATE = '2026-04-30';

/* ---------- Resumo UF (ExpressoStatePanel KPIs) ---------- */
INSERT INTO dbo.TB_METRICA_UF_RESUMO_MES (
  UF_SIGLA, ANO_REF, MES_REF, QTD_AGENCIAS, QTD_PAS, QTD_PRACAS_PRESENCAS, QTD_LOJAS, QTD_LOJAS_ATIVAS,
  QTD_LOJAS_ATIVAS_VAREJO, QTD_LOJAS_ATIVAS_GRANDES_REDES, QTD_LOJAS_ATIVAS_EXCLUSIVO, QTD_LOJAS_ATIVAS_CASAS_BAHIA
) VALUES
(N'SP', 2026, 3, 44, 27, 17, 112, 84, 40, 23, 11, 10),
(N'SP', 2026, 4, 48, 30, 18, 120, 91, 44, 25, 12, 10),
(N'RJ', 2026, 4, 22, 14, 8, 56, 42, 20, 12, 5, 5);

/* ---------- Produto x UF x mês ---------- */
INSERT INTO dbo.TB_METRICA_UF_PRODUTO_MES (
  UF_SIGLA, ANO_REF, MES_REF, PRODUTO_ID, PRODUCAO_VALOR, QTD_LOJAS, QTD_LOJAS_ATIVAS,
  VARIACAO_PCT, PARTICIPACAO_PCT, STATUS_SEMANTICO, INSIGHT_DESTAQUE
) VALUES
(N'SP', 2026, 4, N'consignado', 452000.00, 38, 29, 3.2,  48.0, N'SAUDAVEL',
 N'Consignado avança 3,2% vs. período anterior, reforçando 48,0% da produção da região.'),
(N'SP', 2026, 4, N'lime',       218000.00, 22, 17, -1.4, 23.0, N'ATENCAO',
 N'Lime recua frente ao mês anterior, mas ainda concentra 23,0% da produção regional — vale monitorar lojas com maior contribuição negativa.'),
(N'SP', 2026, 4, N'contas',     186500.00, 18, 14, 0.5,  20.0, N'SAUDAVEL',
 N'Contas está estável em relação ao período anterior, com participação de 20,0% na região.'),
(N'SP', 2026, 4, N'seguros',     88500.00, 12,  9, -5.1,  9.0, N'CRITICO',
 N'Queda relevante na produção de Seguros, impactando cerca de 8,0% da retração total da região.'),
(N'RJ', 2026, 4, N'consignado', 198000.00, 16, 12, 1.1,  44.0, N'SAUDAVEL', NULL),
(N'RJ', 2026, 4, N'lime',        92000.00, 10,  8, 2.0,  20.4, N'SAUDAVEL', NULL),
(N'RJ', 2026, 4, N'contas',      88000.00,  9,  7, -0.5, 19.6, N'SAUDAVEL', NULL),
(N'RJ', 2026, 4, N'seguros',     72000.00,  8,  6, 0.8,  16.0, N'SAUDAVEL', NULL);

/* ---------- Subprodutos (detalhe cockpit) — SP abril ---------- */
INSERT INTO dbo.TB_METRICA_UF_PRODUTO_SUB_MES (
  UF_SIGLA, ANO_REF, MES_REF, PRODUTO_ID, SUBPRODUTO_ID, QTD_LOJAS, QTD_PRODUCAO, PRODUCAO_VALOR
) VALUES
(N'SP', 2026, 4, N'consignado', N'consignado-priv',    20, 964, 241000.00),
(N'SP', 2026, 4, N'consignado', N'consignado-cartao',  18, 844, 211000.00),
(N'SP', 2026, 4, N'seguros',     N'seguros-sub-0',      4, NULL,  32000.00),
(N'SP', 2026, 4, N'seguros',     N'seguros-sub-1',      4, NULL,  30000.00),
(N'SP', 2026, 4, N'seguros',     N'seguros-sub-2',      4, NULL,  26500.00);

/* ---------- Séries (ex.: Consignado SP — valores em R$ mil) ---------- */
INSERT INTO dbo.TB_SERIE_PRODUTO_PERIODO (UF_SIGLA, PRODUTO_ID, PERIODO_TIPO, ORDEM, LABEL, VALOR_ATUAL_MIL, VALOR_ANTERIOR_MIL, REFERENCIA_FIM) VALUES
(N'SP', N'consignado', N'7D',  1, N'24/abr', 410.2, 398.0, @FIM),
(N'SP', N'consignado', N'7D',  2, N'25/abr', 412.8, 399.5, @FIM),
(N'SP', N'consignado', N'7D',  3, N'26/abr', 415.0, 401.2, @FIM),
(N'SP', N'consignado', N'7D',  4, N'27/abr', 418.4, 403.0, @FIM),
(N'SP', N'consignado', N'7D',  5, N'28/abr', 420.1, 404.8, @FIM),
(N'SP', N'consignado', N'7D',  6, N'29/abr', 422.0, 406.2, @FIM),
(N'SP', N'consignado', N'7D',  7, N'30/abr', 452.0, 408.0, @FIM),
(N'SP', N'consignado', N'30D', 1, N'01/abr', 380.0, 370.0, @FIM),
(N'SP', N'consignado', N'30D', 2, N'07/abr', 395.0, 382.0, @FIM),
(N'SP', N'consignado', N'30D', 3, N'13/abr', 408.0, 391.0, @FIM),
(N'SP', N'consignado', N'30D', 4, N'19/abr', 418.0, 398.0, @FIM),
(N'SP', N'consignado', N'30D', 5, N'25/abr', 428.0, 402.0, @FIM),
(N'SP', N'consignado', N'30D', 6, N'30/abr', 452.0, 408.0, @FIM),
(N'SP', N'consignado', N'3M',  1, N'01/fev', 360.0, 350.0, @FIM),
(N'SP', N'consignado', N'3M',  2, N'19/mar', 390.0, 372.0, @FIM),
(N'SP', N'consignado', N'3M',  3, N'06/abr', 410.0, 388.0, @FIM),
(N'SP', N'consignado', N'3M',  4, N'13/abr', 425.0, 395.0, @FIM),
(N'SP', N'consignado', N'3M',  5, N'20/abr', 438.0, 400.0, @FIM),
(N'SP', N'consignado', N'3M',  6, N'30/abr', 452.0, 408.0, @FIM),
(N'SP', N'consignado', N'12M', 1, N'jun''25', 310.0, 300.0, @FIM),
(N'SP', N'consignado', N'12M', 2, N'ago''25', 335.0, 318.0, @FIM),
(N'SP', N'consignado', N'12M', 3, N'out''25', 360.0, 335.0, @FIM),
(N'SP', N'consignado', N'12M', 4, N'dez''25', 385.0, 352.0, @FIM),
(N'SP', N'consignado', N'12M', 5, N'fev''26', 410.0, 375.0, @FIM),
(N'SP', N'consignado', N'12M', 6, N'abr''26', 452.0, 408.0, @FIM);

/* Lime SP — série 30D resumida */
INSERT INTO dbo.TB_SERIE_PRODUTO_PERIODO (UF_SIGLA, PRODUTO_ID, PERIODO_TIPO, ORDEM, LABEL, VALOR_ATUAL_MIL, VALOR_ANTERIOR_MIL, REFERENCIA_FIM) VALUES
(N'SP', N'lime', N'30D', 1, N'01/abr', 195.0, 200.0, @FIM),
(N'SP', N'lime', N'30D', 2, N'07/abr', 200.0, 202.0, @FIM),
(N'SP', N'lime', N'30D', 3, N'13/abr', 205.0, 204.0, @FIM),
(N'SP', N'lime', N'30D', 4, N'19/abr', 210.0, 208.0, @FIM),
(N'SP', N'lime', N'30D', 5, N'25/abr', 214.0, 210.0, @FIM),
(N'SP', N'lime', N'30D', 6, N'30/abr', 218.0, 212.0, @FIM);

/* ---------- GEO produto/mês (município + UF para coropleto / tabela bottom sheet) ---------- */
/* Municípios — NOME_MATCH alinhado a nomes usados no GeoJSON típico */
INSERT INTO dbo.TB_METRICA_GEO_PRODUTO_MES (TIPO_GEO, UF_SIGLA, IBGE_MUNICIPIO, NOME_MATCH, PRODUTO_ID, ANO_REF, MES_REF, QTD_LOJAS, PRODUCAO_VALOR, VARIACAO_PCT) VALUES
(N'MUN', N'SP', 3550308, N'São Paulo',     N'consignado', 2026, 4, 22, 285000.00,  2.8),
(N'MUN', N'SP', 3509502, N'Campinas',      N'consignado', 2026, 4,  8,  92000.00, -1.2),
(N'MUN', N'SP', 3550308, N'São Paulo',     N'lime',       2026, 4, 14, 118000.00,  0.4),
(N'MUN', N'SP', 3509502, N'Campinas',      N'lime',       2026, 4,  5,  41000.00, -2.1);

/* UF — rótulo = nome do estado (escopo "Estado" no bottom sheet / coropleto estados) */
INSERT INTO dbo.TB_METRICA_GEO_PRODUTO_MES (TIPO_GEO, UF_SIGLA, IBGE_MUNICIPIO, NOME_MATCH, PRODUTO_ID, ANO_REF, MES_REF, QTD_LOJAS, PRODUCAO_VALOR, VARIACAO_PCT) VALUES
(N'UF', N'SP', NULL, N'São Paulo',      N'consignado', 2026, 4, 38, 452000.00,  3.2),
(N'UF', N'SP', NULL, N'São Paulo',      N'lime',       2026, 4, 22, 218000.00, -1.4),
(N'UF', N'RJ', NULL, N'Rio de Janeiro', N'consignado', 2026, 4, 16, 198000.00,  1.1),
(N'UF', N'BA', NULL, N'Bahia',           N'consignado', 2026, 4, 10,  87500.00,  0.0),
(N'UF', N'MG', NULL, N'Minas Gerais',    N'consignado', 2026, 4, 12, 102000.00,  2.5);

PRINT N'Seed métricas: TB_METRICA_UF_RESUMO_MES, TB_METRICA_UF_PRODUTO_MES, SUB, SERIE, GEO.';
GO
