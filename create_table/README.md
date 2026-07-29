# Scripts SQL Server — visitas e notificações

## Ordem de execução

1. `00_ajustes_roteiros_existentes.sql`
2. `01_create_visitas_notificacoes.sql`
3. `02_seed_regras_produtos_notificacoes.sql`
4. `03_backfill_visitas_futuras.sql`
5. `04_validacao_pos_deploy.sql`
6. publicar backend/frontend com as feature flags;
7. `06_habilitar_jobs.sql`

Rollback operacional, sem apagar dados:

- `05_desativar_processamento.sql`

Manutenção idempotente para remover do feed notificações de roteiros cancelados:

- `07_remover_notificacoes_roteiros_cancelados.sql`

O script `01` faz `DROP` + `CREATE` das tabelas de visitas/notificações.
Reexecutá-lo apaga os dados dessas tabelas; depois rode o `02` (seed) de novo.

Notificações de atribuição de roteiro:
- o save/patch grava evento em `TB_EVENTO_OUTBOX` e a API faz flush imediato;
- o worker também drena o outbox a cada segundo (mesmo se o job estiver off);
- o seed ativa `OUTBOX_DISPATCHER`; rode também o `06` para os demais jobs.

Os scripts foram preparados para `TESTE.dbo` e para o nome real encontrado na
instância: `ROTEIRO_PARADAS_MAPA` (singular).

## Antes de executar

- fazer backup e testar em ambiente isolado;
- executar com login de implantação, não com o login cotidiano da aplicação;
- confirmar que nenhuma tabela homônima foi criada manualmente;
- homologar os códigos funcionais e o fuso dos territórios;
- revisar os seeds de regras com as áreas de negócio;
- confirmar as fontes de evidência de cada produto;
- planejar a atualização do backend antes de ativar os jobs.

Os scripts `00` a `04` não ativam jobs nem executam validadores de produto.
O script `06` é a ativação explícita pós-publicação. Eles também não
migram o campo legado `ROTEIRO_PARADAS_MAPA.HORARIO`, que é `NVARCHAR(20)`;
novas visitas normalizam esse valor em `TIME(0)` após validação no serviço.

## Política de data/hora

- `DATE`: data comercial local.
- `TIME(0)`: horário comercial local.
- `DATETIME2(3)` com sufixo `_EM_UTC`: instante UTC.
- default de instante: `SYSUTCDATETIME()`.
- API: data ISO e timestamp RFC 3339 com offset.
- proibido concatenar datas em SQL ou enviar `dd/MM/yyyy`.

O campo legado `ROTEIROS_MAPA.CRIADO_EM` usa `SYSDATETIME()` e não deve ser
renomeado como UTC sem antes confirmar o fuso histórico.

## Rollback

O `01` recria as tabelas com `DROP` + `CREATE` (apaga dados de visitas/notificações
deste módulo). Rollback operacional sem apagar dados: desative os jobs com o `05`
e volte a leitura para o modelo legado. Remoção física fora do `01` exige plano
específico, backup e autorização.

## Observação sobre usuários

Não foi criada FK de código funcional para `users_map`: essa tabela contém
apenas administradores e usa `NVARCHAR(20)`, enquanto usuários operacionais vêm
das tabelas hierárquicas. Os códigos funcionais são armazenados como `INT` e
validados pelo mesmo resolvedor de identidade/escopo usado na autenticação.
