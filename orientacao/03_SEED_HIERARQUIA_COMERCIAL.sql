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
  COD_SUPERVISAO, DESC_SUPERVISAO, COD_AG, NOME_AG,
  LONGITUDE_SUP, LATITUDE_SUP, LONGITUDE_AG, LATITUDE_AG, UF_SIGLA
) VALUES
/* Agências Alice — Centro SP / Lapa */
(1001, N'Diretoria Regional Sudeste', 2001, N'Gerente Regional — São Paulo',
 3001, N'Gerente de Área — Centro SP', 4002, N'Coordenador — Lapa / Perdizes',
 5001, N'Supervisor — Alice Mendes', 910101, N'Agência Paulista',
 -46.7043, -23.5267, -46.6586, -23.5614, N'SP'),
(1001, N'Diretoria Regional Sudeste', 2001, N'Gerente Regional — São Paulo',
 3001, N'Gerente de Área — Centro SP', 4002, N'Coordenador — Lapa / Perdizes',
 5001, N'Supervisor — Alice Mendes', 910102, N'Agência Consolação',
 -46.7043, -23.5267, -46.6612, -23.5558, N'SP'),
/* Bruno — mesma coordenação */
(1001, N'Diretoria Regional Sudeste', 2001, N'Gerente Regional — São Paulo',
 3001, N'Gerente de Área — Centro SP', 4002, N'Coordenador — Lapa / Perdizes',
 5002, N'Supervisor — Bruno Carvalho', 910103, N'Agência Sumaré',
 -46.6681, -23.5448, -46.6755, -23.5412, N'SP'),
/* Camila — Pinheiros */
(1001, N'Diretoria Regional Sudeste', 2001, N'Gerente Regional — São Paulo',
 3001, N'Gerente de Área — Centro SP', 4003, N'Coordenador — Pinheiros',
 5003, N'Supervisor — Camila Rocha', 910104, N'Agência Faria Lima',
 -46.6912, -23.5614, -46.6897, -23.5859, N'SP'),
/* Daniel — Campinas / Oeste */
(1001, N'Diretoria Regional Sudeste', 2001, N'Gerente Regional — São Paulo',
 3002, N'Gerente de Área — Oeste SP', 4004, N'Coordenador — Campinas',
 5004, N'Supervisor — Daniel Souza', 910105, N'Agência Cambuí',
 -47.0588, -22.8923, -47.0423, -22.8978, N'SP'),
/* Elisa — Rio */
(1001, N'Diretoria Regional Sudeste', 2002, N'Gerente Regional — Rio',
 3003, N'Gerente de Área — Rio Metropolitano', 4001, N'Coordenador — Rio Zona Norte',
 5005, N'Supervisor — Elisa Nunes', 910106, N'Agência Tijuca',
 -43.1961, -22.9519, -43.2332, -22.9245, N'RJ');

PRINT N'Seed TB_ESCADA_COMERCIAL: 6 agências (mock commercialStructure).';
GO
