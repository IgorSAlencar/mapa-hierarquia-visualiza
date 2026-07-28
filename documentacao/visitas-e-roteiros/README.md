# Evolução de Visitas, Roteiros e Notificações

## Objetivo

Esta proposta transforma o roteiro salvo em uma jornada operacional rastreável:

```text
Montar roteiro
  -> atribuir e notificar
  -> lembrar a visita
  -> check-in
  -> tratar a visita
  -> tratar cada produto foco
  -> concluir ou reagendar
  -> verificar evolução comercial
  -> acompanhar, escalar e encerrar
```

O desenho foi feito para a arquitetura atual do projeto:

- frontend React, TypeScript e componentes shadcn;
- backend Express com autenticação e escopo hierárquico;
- SQL Server;
- tabelas existentes `TESTE.dbo.ROTEIROS_MAPA` e
  `TESTE.dbo.ROTEIRO_PARADAS_MAPA`;
- perfis técnicos atuais `supervisor`, `coordenador`, `gerente_area` e `admin`.

> Importante: o banco e o script atual usam
> `ROTEIRO_PARADAS_MAPA` no singular. O nome
> `ROTEIROS_PARADAS_MAPA`, citado no pedido, não existe na instância
> inspecionada. Todos os exemplos executáveis usam o nome real.

## Decisões estruturais

1. A parada do roteiro continua sendo a origem da visita.
2. `TB_VISITA_TRATATIVA` passa a ser a fonte de verdade do estado operacional.
3. Um reagendamento encerra o episódio atual como `REAGENDADA` e cria outro
   episódio `PENDENTE`, ligado ao anterior. Nenhuma tentativa é sobrescrita.
4. Status da visita, resultado comercial e acompanhamento do produto são
   dimensões diferentes.
5. Os produtos foco deixam de depender somente de JSON e ganham linhas
   normalizadas em `TB_VISITA_PRODUTO`. O JSON da parada permanece como
   snapshot de origem e compatibilidade.
6. Toda mutação relevante grava histórico ou auditoria e um evento de outbox na
   mesma transação.
7. Notificação é uma ocorrência de negócio; leitura é um estado por
   destinatário. Por isso existem `TB_NOTIFICACAO` e
   `TB_NOTIFICACAO_USUARIO`.
8. Reenvio não cria outro item no sino. A mesma ocorrência é reentregue segundo
   uma política; escalonamentos para outro destinatário são ocorrências próprias.
9. Datas de negócio usam `DATE` e `TIME(0)`. Instantes usam `DATETIME2(3)` em
   UTC, com sufixo `_EM_UTC`. A API nunca aceita data localizada como
   `28/07/2026`.
10. Escritas concorrentes usam `ROWVERSION`, `If-Match` e
    `Idempotency-Key`.

## Entregáveis

- [Fluxo funcional e UX](./01_FLUXO_FUNCIONAL_E_UX.md)
- [Especificação detalhada de notificações](./02_NOTIFICACOES.md)
- [API, payloads, agendamentos e erros](./03_API_BACKEND.md)
- [Modelo de dados SQL Server](./04_MODELO_SQL_SERVER.md)
- [Permissões, auditoria, rollout e critérios de aceite](./05_AUDITORIA_SEGURANCA_TESTES_ROLLOUT.md)
- [Scripts de `create_table`](../../create_table/README.md)

## Escopo de implementação recomendado

### Fase 1 — fundação

- criar tabelas e catálogo de produtos/regras;
- provisionar uma visita por parada ao salvar um roteiro;
- registrar histórico, auditoria e outbox;
- expor leitura agregada de roteiro, visita e produto.

### Fase 2 — jornada da visita

- drawer amplo sobre o mapa;
- rascunho, check-in, não realização, reagendamento e conclusão;
- tratativa individual de produtos;
- bloqueio de conclusão incompleta;
- navegação “salvar e próxima loja”.

### Fase 3 — notificações

- sino, contador, painel e central;
- novo roteiro, roteiro alterado, visita próxima e tratativa pendente;
- deep link abrindo mapa, roteiro, loja e drawer corretos;
- repetição, adiamento, resolução e escalonamento.

### Fase 4 — evolução comercial

- adaptadores de validação para cada produto;
- baseline no encerramento da visita;
- verificação configurável, inicialmente quatro dias corridos;
- acompanhamento, sem continuidade e encerramento.

### Fase 5 — indicadores e robustez

- painéis de equipe;
- métricas operacionais dos jobs;
- polling de contingência para o sino;
- suporte controlado a check-in recebido com atraso/offline;
- política definitiva de retenção.

## Fora do escopo desta entrega

Os arquivos entregues são proposta técnica e scripts versionados. Nenhum
`CREATE TABLE`, `ALTER TABLE`, seed ou mudança de dados foi executado no banco.
As fontes físicas que comprovam evolução de Crédito, Cielo, Proposta de Valor,
Fazer Negócio e Ativo PADE devem ser homologadas com os donos dos dados antes
de ativar os validadores automáticos.
