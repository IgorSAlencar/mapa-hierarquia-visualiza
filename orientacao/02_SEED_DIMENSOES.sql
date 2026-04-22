/*
  ORIENTACAO — dimensões: TB_UF, TB_MUNICIPIO (amostra), TB_PRODUTO, TB_PRODUTO_SUB
  Execute após 01_DDL_TABELAS.sql
*/

-- USE [TESTE];
-- GO

SET NOCOUNT ON;

INSERT INTO dbo.TB_UF (UF_SIGLA, UF_NOME) VALUES
(N'SP', N'São Paulo'),
(N'RJ', N'Rio de Janeiro'),
(N'BA', N'Bahia'),
(N'MG', N'Minas Gerais');

INSERT INTO dbo.TB_MUNICIPIO (IBGE_CODIGO, NOME, UF_SIGLA) VALUES
(3550308, N'São Paulo', N'SP'),
(3509502, N'Campinas', N'SP'),
(3304557, N'Rio de Janeiro', N'RJ'),
(2927408, N'Salvador', N'BA'),
(3106200, N'Belo Horizonte', N'MG');

INSERT INTO dbo.TB_PRODUTO (PRODUTO_ID, NOME_EXIBICAO) VALUES
(N'consignado', N'Consignado'),
(N'lime', N'Lime'),
(N'contas', N'Contas'),
(N'seguros', N'Seguros');

INSERT INTO dbo.TB_PRODUTO_SUB (SUBPRODUTO_ID, PRODUTO_ID, NOME, VALOR_LEGENDA) VALUES
(N'consignado-priv', N'consignado', N'Consignado privado', N'Vlr. Contrato'),
(N'consignado-cartao', N'consignado', N'Cartão benefício', N'Vlr. Averbado'),
(N'seguros-sub-0', N'seguros', N'Vida', NULL),
(N'seguros-sub-1', N'seguros', N'Residencial', NULL),
(N'seguros-sub-2', N'seguros', N'Acidentes pessoais', NULL);

PRINT N'Seed dimensões: TB_UF, TB_MUNICIPIO, TB_PRODUTO, TB_PRODUTO_SUB.';
GO
