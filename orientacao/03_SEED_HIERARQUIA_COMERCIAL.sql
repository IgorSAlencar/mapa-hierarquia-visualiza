/*
  ORIENTACAO — TB_ESCADA_COMERCIAL (espelho de src/data/commercialStructureMock.ts)
  Uma linha por agência; códigos numéricos fictícios únicos entre níveis.

  Exemplo de join com lojas no warehouse (não executa CREATE na base DATAWAREHOUSE):
    SELECT e.COD_AG, e.NOME_AG, l.CHAVE_LOJA
    FROM dbo.TB_ESCADA_COMERCIAL AS e
    LEFT JOIN DATAWAREHOUSE.dbo.TB_ESTR_LOJAS AS l
      ON l.COD_AG_RELACIONAMENTO = e.COD_AG;
*/

-- USE [TESTE];
-- GO

SET NOCOUNT ON;

INSERT INTO dbo.TB_ESCADA_COMERCIAL (
  DIRE_REG, DIR_REGIONAL, COD_GER_REG, GER_REGIONAL,
  COD_GER_AREA, DESC_GERENCIA_AREA, COD_COORD, DESC_COORDENACAO,
  COD_SUPERVISAO, DESC_SUPERVISAO, COD_AG, NOME_AG
) VALUES
/* Agências Alice — Centro SP / Lapa */
(1001, N'Diretoria Regional Sudeste', 2001, N'Gerente Regional — São Paulo',
 3001, N'Gerente de Área — Centro SP', 4002, N'Coordenador — Lapa / Perdizes',
 5001, N'Supervisor — Alice Mendes', 910101, N'Agência Paulista'),
(1001, N'Diretoria Regional Sudeste', 2001, N'Gerente Regional — São Paulo',
 3001, N'Gerente de Área — Centro SP', 4002, N'Coordenador — Lapa / Perdizes',
 5001, N'Supervisor — Alice Mendes', 910102, N'Agência Consolação'),
/* Bruno — mesma coordenação */
(1001, N'Diretoria Regional Sudeste', 2001, N'Gerente Regional — São Paulo',
 3001, N'Gerente de Área — Centro SP', 4002, N'Coordenador — Lapa / Perdizes',
 5002, N'Supervisor — Bruno Carvalho', 910103, N'Agência Sumaré'),
/* Camila — Pinheiros */
(1001, N'Diretoria Regional Sudeste', 2001, N'Gerente Regional — São Paulo',
 3001, N'Gerente de Área — Centro SP', 4003, N'Coordenador — Pinheiros',
 5003, N'Supervisor — Camila Rocha', 910104, N'Agência Faria Lima'),
/* Daniel — Campinas / Oeste */
(1001, N'Diretoria Regional Sudeste', 2001, N'Gerente Regional — São Paulo',
 3002, N'Gerente de Área — Oeste SP', 4004, N'Coordenador — Campinas',
 5004, N'Supervisor — Daniel Souza', 910105, N'Agência Cambuí'),
/* Elisa — Rio */
(1001, N'Diretoria Regional Sudeste', 2002, N'Gerente Regional — Rio',
 3003, N'Gerente de Área — Rio Metropolitano', 4001, N'Coordenador — Rio Zona Norte',
 5005, N'Supervisor — Elisa Nunes', 910106, N'Agência Tijuca');

PRINT N'Seed TB_ESCADA_COMERCIAL: 6 agências (mock commercialStructure).';
GO
