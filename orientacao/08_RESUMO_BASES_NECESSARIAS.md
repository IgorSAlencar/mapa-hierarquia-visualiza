# Resumo das bases necessarias

Este documento consolida quais tabelas e scripts da pasta `orientacao/` sao necessarios para o fluxo atual da aplicacao.

## Base alvo

- Banco SQL Server: `TESTE` (ou equivalente no seu ambiente).
- Fontes externas usadas pela API:
  - `TESTE..COORDENADAS_AGENCIAS`
  - `TESTE..COORDENADAS_LOJAS`

## Scripts necessarios (ordem recomendada)

1. `01_DDL_TABELAS.sql`
   - Cria as tabelas-base do projeto:
     - dimensoes (`TB_UF`, `TB_MUNICIPIO`, `TB_PRODUTO`, `TB_PRODUTO_SUB`)
     - hierarquia comercial (`TB_ESCADA_COMERCIAL`)
     - metricas do painel (`TB_METRICA_UF_*`, `TB_METRICA_GEO_PRODUTO_MES`, `TB_SERIE_PRODUTO_PERIODO`)
   - `TB_ESCADA_COMERCIAL` fica focada em relacionamento por `COD_AG` com codigos da escada.

2. `03_SEED_HIERARQUIA_COMERCIAL.sql`
   - Popula `TB_ESCADA_COMERCIAL` com dados da escada comercial.
   - Necessario para o filtro de agencias por hierarquia no backend (`join` por `COD_AG`).

3. `05_SEED_METRICAS_FICTICIAS.sql`
   - Popula metricas de UF/produto/subproduto/serie/geo para telas do Expresso.
   - Inclui campos de lojas ativas por grupo no resumo UF.

4. `07_DDL_MUNICIPIO_STATE_PANEL.sql`
   - Cria e atualiza estruturas municipais para o `ExpressoStatePanel`:
     - `TB_METRICA_MUNICIPIO_PRODUTO_MES`
     - `TB_METRICA_MUNICIPIO_RESUMO_MES`
   - Inclui `COD_IBGE` e lojas ativas por grupo no resumo municipal.

## Scripts de apoio / referencia

- `06_RASTREABILIDADE_NUMERICA.md`
  - Documenta o mapeamento de campos da UI para colunas SQL.

- `04_SEED_MAPA_REGIONAL.sql`
  - **Descontinuado no fluxo atual**.
  - Mantido apenas como referencia historica (nao e necessario executar).

## Regras de funcionamento no fluxo atual

- O mapa de agencias/lojas vem das tabelas de coordenadas (`COORDENADAS_AGENCIAS` e `COORDENADAS_LOJAS`).
- O filtro da estrutura comercial aplica `join` com `TB_ESCADA_COMERCIAL` por `COD_AG`.
- As metricas do painel lateral e bottom sheet usam as tabelas `TB_METRICA_*`.
