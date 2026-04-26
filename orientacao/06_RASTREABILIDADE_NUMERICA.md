# Rastreabilidade numérica (site inteiro)

Este checklist mapeia os campos numéricos de negócio usados no front para colunas físicas `TB_*` no SQL.

## Matriz UI -> SQL

| Campo lógico (UI) | Unidade | Tabela SQL | Coluna física |
|---|---|---|---|
| `agencias` | QTD | `TB_METRICA_UF_RESUMO_MES` | `QTD_AGENCIAS` |
| `pas` | QTD | `TB_METRICA_UF_RESUMO_MES` | `QTD_PAS` |
| `pracasPresencas` | QTD | `TB_METRICA_UF_RESUMO_MES` | `QTD_PRACAS_PRESENCAS` |
| `lojas` (resumo regional) | QTD | `TB_METRICA_UF_RESUMO_MES` | `QTD_LOJAS` |
| `lojasAtivas` (resumo regional) | QTD | `TB_METRICA_UF_RESUMO_MES` | `QTD_LOJAS_ATIVAS` |
| `producaoMes` (produto) | VLR/QTD | `TB_METRICA_UF_PRODUTO_MES` | `PRODUCAO_VALOR` |
| `lojas` (produto) | QTD | `TB_METRICA_UF_PRODUTO_MES` | `QTD_LOJAS` |
| `lojasAtivas` (produto) | QTD | `TB_METRICA_UF_PRODUTO_MES` | `QTD_LOJAS_ATIVAS` |
| `variacaoPct` (produto) | % | `TB_METRICA_UF_PRODUTO_MES` | `VARIACAO_PCT` |
| `participacaoPct` | % | `TB_METRICA_UF_PRODUTO_MES` | `PARTICIPACAO_PCT` |
| `producaoMes` (subproduto) | VLR/QTD | `TB_METRICA_UF_PRODUTO_SUB_MES` | `PRODUCAO_VALOR` |
| `lojas` (subproduto) | QTD | `TB_METRICA_UF_PRODUTO_SUB_MES` | `QTD_LOJAS` |
| `quantidade` (subproduto) | QTD | `TB_METRICA_UF_PRODUTO_SUB_MES` | `QTD_PRODUCAO` |
| `atualMil` | mil | `TB_SERIE_PRODUTO_PERIODO` | `VALOR_ATUAL_MIL` |
| `anteriorMil` | mil | `TB_SERIE_PRODUTO_PERIODO` | `VALOR_ANTERIOR_MIL` |
| `producaoMes` (geo/coropleto) | VLR/QTD | `TB_METRICA_GEO_PRODUTO_MES` | `PRODUCAO_VALOR` |
| `lojas` (geo/coropleto) | QTD | `TB_METRICA_GEO_PRODUTO_MES` | `QTD_LOJAS` |
| `variacaoPct` (geo/coropleto) | % | `TB_METRICA_GEO_PRODUTO_MES` | `VARIACAO_PCT` |
| `IBGE` do município | código numérico | `TB_MUNICIPIO` / `TB_METRICA_GEO_PRODUTO_MES` | `IBGE_CODIGO` / `IBGE_MUNICIPIO` |
| Códigos hierárquicos comerciais | código numérico | `TB_ESCADA_COMERCIAL` | `DIRE_REG`, `COD_GER_REG`, `COD_GER_AREA`, `COD_COORD`, `COD_SUPERVISAO`, `COD_AG` |
| Coordenadas mapa | decimal | `TB_ESCADA_COMERCIAL` / `TB_MAPA_PONTO_REGIONAL` | `LONGITUDE_*`, `LATITUDE_*`, `LONGITUDE`, `LATITUDE` |

## Resultado da verificação

- Cobertura de campo numérico de negócio: **100% com coluna física explícita**.
- Ponto fechado nesta revisão: inclusão de `QTD_PRODUCAO` no fato de subproduto para suportar `SubprodutoExpresso.quantidade`.
