/*
================================================================================
ORIENTACAO — ordem de execução e integração com o projeto mapa-hierarquia-visualiza
================================================================================

ORDEM SUGERIDA (SQL Server Management Studio ou sqlcmd):
  1. 01_DDL_TABELAS.sql     — cria todas as TB_* e índices
  2. 02_SEED_DIMENSOES.sql  — UF, municípios amostrais, produto / subproduto
  3. 03_SEED_HIERARQUIA_COMERCIAL.sql — TB_ESCADA_COMERCIAL (mock escada comercial)
  4. 04_SEED_MAPA_REGIONAL.sql       — TB_MAPA_PONTO_REGIONAL (mock camadas regionais)
  5. 05_SEED_METRICAS_FICTICIAS.sql  — métricas UF / produto / GEO / séries

Antes de rodar, descomente e ajuste:
  USE [TESTE];   -- ou o nome do seu database

--------------------------------------------------------------------------------
API Node — server/repositories/mapDataRepository.js
--------------------------------------------------------------------------------
Hoje as rotas /api/map/agencias e /api/map/lojas leem:
  TESTE..COORDENADAS_AGENCIAS (lon, lat, BANCO)
  TESTE..COORDENADAS_LOJAS   (geolocation_lng, geolocation_lat)

Para passar a usar este modelo sem renomear tabelas legadas:
  - Criar VIEW dbo.COORDENADAS_AGENCIAS com SELECT de TB_MAPA_PONTO_REGIONAL
    WHERE KIND = 'agencia' (ou TB_ESCADA_COMERCIAL com LONGITUDE_AG/LATITUDE_AG), OU
  - Alterar mapDataRepository.js para consultar TB_MAPA_PONTO_REGIONAL / TB_ESCADA_COMERCIAL
    e mapear colunas para o formato esperado por mapDataService.getAgencyMapPoints.

--------------------------------------------------------------------------------
DATAWAREHOUSE — TB_ESTR_LOJAS
--------------------------------------------------------------------------------
Relação agência ↔ loja (já existente no seu DW). Exemplo somente leitura:

  SELECT e.COD_AG, e.NOME_AG, l.CHAVE_LOJA, l.COD_AG_RELACIONAMENTO
  FROM dbo.TB_ESCADA_COMERCIAL AS e
  INNER JOIN DATAWAREHOUSE.dbo.TB_ESTR_LOJAS AS l
    ON l.COD_AG_RELACIONAMENTO = e.COD_AG;

Não há FK cross-database no DDL: tipos de COD_AG e COD_AG_RELACIONAMENTO devem ser compatíveis.

--------------------------------------------------------------------------------
Front-end Expresso (métricas)
--------------------------------------------------------------------------------
Os seeds em 05 alimentam estruturas equivalentes a ExpressoRegionMetrics / MunicipalityProductivityRow
documentadas no plano (TB_METRICA_UF_*, TB_METRICA_GEO_PRODUTO_MES, TB_SERIE_PRODUTO_PERIODO).

================================================================================
*/

PRINT N'Leia este arquivo como documentação; não é obrigatório executá-lo.';
GO
