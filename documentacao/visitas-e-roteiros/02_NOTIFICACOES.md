# Especificação detalhada do sistema de notificações

## 1. Princípios

1. **Notificação nasce de fato de negócio**, não de componente de tela.
2. **Gravação confiável:** a transação que altera roteiro/visita também grava
   uma outbox. Se a transação falhar, nenhum aviso órfão é emitido.
3. **No máximo uma ocorrência lógica:** uma chave de deduplicação única impede
   duplicatas mesmo com retry, dois workers ou reprocessamento.
4. **Leitura não encerra pendência:** marcar como lida altera apenas o estado do
   destinatário. A notificação só é resolvida quando a regra de negócio for
   atendida ou o usuário executar uma ação terminal.
5. **Repetição não infla o contador:** reentregar uma ocorrência incrementa
   contadores e datas; não cria outro item no sino.
6. **Escalonamento é explícito:** quando outro perfil precisa agir, cria-se uma
   ocorrência própria para esse destinatário, ligada à mesma entidade.
7. **Conteúdo e destino são snapshots:** o texto visto deve continuar
   compreensível mesmo que loja, responsável ou roteiro mudem.
8. **Instantes em UTC:** janelas “amanhã” e “fim do dia” são calculadas no fuso
   do território.
9. **Falha da fonte não é ausência de evolução:** validadores inconclusivos não
   geram alerta comercial falso.
10. **Toda ação é autorizada no backend:** um deep link não amplia escopo.

## 2. Separação de responsabilidades

### `TB_EVENTO_OUTBOX`

Fila transacional de fatos como:

- `ROTEIRO_ATRIBUIDO`;
- `ROTEIRO_ALTERADO`;
- `VISITA_CHECKIN_REALIZADO`;
- `VISITA_FINALIZADA`;
- `VISITA_REAGENDADA`;
- `VISITA_PRODUTO_SEM_EVOLUCAO`;
- `VISITA_PRODUTO_EVOLUIDO`.

Não é exibida ao usuário.

### `TB_NOTIFICACAO`

Ocorrência lógica já renderizada:

- regra e versão usadas;
- tipo, título, mensagem e prioridade;
- entidade e FKs conhecidas;
- chave de deduplicação;
- destino e ações;
- origem, criação e expiração;
- estado global `ATIVA`, `RESOLVIDA`, `CANCELADA` ou `EXPIRADA`.

### `TB_NOTIFICACAO_USUARIO`

Estado por destinatário:

- nova, visualizada, lida, adiada, resolvida ou arquivada;
- primeira visualização e leitura;
- ciência;
- adiamento;
- quantidade e data das entregas;
- ação executada;
- escalonamento.

### `TB_NOTIFICACAO_REGRA`

Configuração versionada:

- gatilho;
- atraso inicial;
- janela;
- prioridade;
- template;
- política de repetição;
- política de escalonamento;
- expiração;
- canais.

## 3. Catálogo inicial

| Código | Gatilho | Destinatário | Resolução |
|---|---|---|---|
| `NOVO_ROTEIRO_ATRIBUIDO` | roteiro criado por superior para subordinado | responsável | confirmar ciência, cancelar roteiro ou expirar |
| `ROTEIRO_MARCADO_EQUIPE` | GC marca roteiro/visitas para si | GC III e Gerente de Gestão da supervisão | confirmar ciência ou revisar |
| `ROTEIRO_ATUALIZADO` | mudança relevante por outro usuário | responsável e, conforme regra, criador | confirmar ciência ou revisar |
| `VISITA_PROXIMA` | entrada na janela anterior à visita | responsável | visita iniciada, reagendada, cancelada ou expirada |
| `TRATATIVA_PENDENTE` | janela planejada terminou sem terminal | responsável | visita tratada/reagendada/cancelada |
| `ATRASO_TRATATIVA_EQUIPE` | atraso atingiu limiar de escalonamento | superior no escopo | visita tratada ou comentário/ação registrada |
| `PRODUTO_SEM_EVOLUCAO` | avaliador retornou sem evolução | responsável | evolução, acompanhamento, reagendamento ou sem continuidade |
| `ACOMPANHAMENTO_VENCENDO` | próxima ação entrou na janela | responsável | acompanhamento concluído/reagendado |
| `CHECKIN_IRREGULAR` | fora do raio/atrasado e exige revisão | superior autorizado | validar ou rejeitar check-in |

Novos tipos entram por regra/configuração, sem espalhar `if` de texto pelo
frontend.

## 4. Chave de deduplicação

Formato:

```text
{CODIGO_REGRA}:{ENTIDADE_ESTAVEL}:{CICLO_OU_VERSAO}:{DESTINO_LOGICO}
```

Exemplos:

```text
NOVO_ROTEIRO_ATRIBUIDO:ROTEIRO:7dd...:V3
ROTEIRO_ATUALIZADO:ROTEIRO:7dd...:AUDITORIA:981
VISITA_PROXIMA:VISITA:4501:JANELA:24H
TRATATIVA_PENDENTE:VISITA:4501:CICLO:PLANEJAMENTO-20260728
ATRASO_TRATATIVA_EQUIPE:VISITA:4501:NIVEL:1:GESTOR:1234567
PRODUTO_SEM_EVOLUCAO:VISITA_PRODUTO:889:CICLO:20260801T120000Z
```

Regras:

- a chave é montada no backend, nunca recebida pronta do browser;
- índice único em `TB_NOTIFICACAO.CHAVE_DEDUPLICACAO`;
- violação de unicidade é tratada como sucesso idempotente: o worker lê a
  ocorrência existente e garante os destinatários;
- adiamento não altera a chave;
- novo ciclo de acompanhamento usa nova data-base/versão na chave;
- escalonamento para outro gestor usa nível e destinatário na chave.

## 5. Estados e contador

### Estado global

```text
ATIVA -> RESOLVIDA
ATIVA -> CANCELADA
ATIVA -> EXPIRADA
```

### Estado por destinatário

```text
NOVA -> VISUALIZADA -> LIDA -> ARQUIVADA
  |          |           |
  `----------+----------> ADIADA -> NOVA (ao vencer)
                         |
                         +-------> RESOLVIDA
                         `-------> CANCELADA
```

Definições:

- `NOVA`: entregue e ainda não aberta;
- `VISUALIZADA`: apareceu no painel, mas não foi explicitamente lida;
- `LIDA`: leitura confirmada;
- `ADIADA`: temporariamente fora das interrupções; volta no vencimento;
- `RESOLVIDA`: fato de negócio encerrado;
- `ARQUIVADA`: organização pessoal, sem alterar o fato;
- `CANCELADA`: entidade deixou de exigir ação;
- `EXPIRADA` é estado global e remove a ocorrência dos itens ativos.

Contador de não lidas:

```sql
LIDA_EM_UTC IS NULL
AND STATUS IN ('NOVA', 'VISUALIZADA')
AND notificacao.STATUS = 'ATIVA'
AND (EXPIRA_EM_UTC IS NULL OR EXPIRA_EM_UTC > SYSUTCDATETIME())
```

Itens `ADIADA` não contam até `ADIADA_ATE_EM_UTC`. Ao vencer, o job retorna o
estado para `NOVA` sem criar outra notificação.

## 6. Prioridade e ordenação

Prioridades:

- `BAIXA`: informativa;
- `NORMAL`: ação esperada, sem urgência;
- `ALTA`: prazo vencido ou alteração relevante;
- `CRITICA`: atraso escalado ou problema de integridade que exige gestão.

Ordem do painel:

1. ativa e não adiada;
2. prioridade crítica, alta, normal, baixa;
3. não lida antes de lida;
4. criação mais recente;
5. identificador como desempate estável.

Cor não é o único sinal. Ícone, rótulo e texto comunicam prioridade para
acessibilidade.

## 7. Políticas por tipo

### 7.1 Novo roteiro atribuído

Gatilho:

- criador diferente do responsável;
- criador possui alçada sobre o responsável;
- roteiro ativo e com ao menos uma visita;
- transação de criação confirmada.

Conteúdo:

```text
Novo roteiro atribuído
Carolina Rodrigues cadastrou um roteiro com 10 lojas para você visitar em
28/07/2026.
```

Ações:

- `VER_ROTEIRO`;
- `CONFIRMAR_CIENCIA`.

Deduplicação por roteiro + versão. Não repete depois de ciência. Se a data ou o
conteúdo relevante mudar antes da ciência, a notificação anterior é resolvida
como substituída e nasce `ROTEIRO_ATUALIZADO`.

### 7.1.1 Roteiro marcado pela equipe

Gatilho:

- o próprio Gerente Comercial (responsável) marca/salva o roteiro;
- a supervisão tem GC III (`TB_COORD_COORDENADOR`) e/ou Gerente de Gestão
  (`TB_COORD_GA`) resolvidos via `CONS_DISTRIBUICAO_ENTIDADES`.

Destinatários:

- Gerente Comercial III da coordenação;
- Gerente de Gestão da gerência de área;
- o próprio GC nunca recebe esta ocorrência.

Conteúdo:

```text
Roteiro marcado pela equipe
Igor Alencar marcou um roteiro com 3 lojas em 28/07/2026.
```

Ações: `VER_ROTEIRO`, `CONFIRMAR_CIENCIA`.

### 7.2 Roteiro atualizado

Mudanças relevantes:

- data;
- responsável;
- prioridade;
- orientação;
- inclusão/remoção/reordenação de lojas;
- horário;
- produtos foco.

O texto resume no máximo três mudanças e oferece “ver todas”. Não lista dados
sensíveis no cabeçalho.

```text
Roteiro atualizado
O roteiro 025-120 foi alterado por Carolina Rodrigues. Data e 2 lojas foram
modificadas. Revise as novas informações.
```

Deduplicação por auditoria/versão. Alterações do próprio responsável podem ser
auditadas sem gerar notificação para ele. Se vários campos forem alterados na
mesma transação, geram uma notificação agregada.

### 7.3 Visita próxima

Regra inicial:

- primeira janela: dia anterior no horário configurado;
- segunda janela opcional: duas horas antes do primeiro horário;
- agrupada por roteiro/responsável/janela para não emitir um item por loja.

```text
Visita programada para amanhã
Você possui 4 lojas planejadas para amanhã a partir das 9h.
```

Ações:

- `VER_ROTEIRO`;
- `CONFIRMAR_CIENCIA`.

É cancelada se todas as visitas forem reagendadas/canceladas. Não é criada para
visita já terminal.

### 7.4 Tratativa pendente

A “janela terminou” deve usar o término planejado da parada, quando disponível.
Sem término, usa horário inicial + duração padrão da visita; sem horário válido,
usa o fim do expediente configurado no fuso do território.

Política inicial:

- primeira entrega: fim da janela/dia;
- reentrega: dia seguinte no início do expediente, se ainda pendente;
- escalonamento: após dois dias, ao superior imediato;
- nova escalada: opcional após quatro dias;
- encerramento imediato ao atingir estado terminal.

```text
Tratativa pendente
A visita à Loja 17648 estava programada para hoje e ainda não possui tratativa
registrada.
```

Ações:

- `REGISTRAR_VISITA`;
- `VER_VISITA`;
- `REAGENDAR`;
- `ADIAR_LEMBRETE`.

Reentrega atualiza `QTD_ENTREGAS`, `ULTIMA_ENTREGA_EM_UTC` e a superfície
visual. Não cria outra linha nem outro contador. A escalada ao gestor é outra
ocorrência para não misturar leitura do gerente com ciência do superior.

### 7.5 Produto sem evolução

Gatilho:

- visita `REALIZADA`;
- produto com acompanhamento;
- prazo vigente alcançado;
- avaliador retornou `SEM_EVOLUCAO`;
- produto ainda não terminal.

```text
Oportunidade sem evolução
A oportunidade de Cielo da Loja 17366 continua pendente após a visita realizada
em 22/07/2026.
```

Ações:

- `REGISTRAR_ACOMPANHAMENTO`;
- `VER_VISITA`;
- `REAGENDAR_CONTATO`;
- `MARCAR_SEM_CONTINUIDADE`;
- `ADIAR_LEMBRETE`.

Ao adiar:

- usuário escolhe data/hora dentro do limite da regra;
- grava acompanhamento `LEMBRETE_ADIADO`;
- notificação fica `ADIADA`;
- não altera evidência comercial;
- ao vencer, a mesma ocorrência reaparece;
- número máximo de adiamentos é configurável.

“Sem continuidade” exige motivo e encerra o acompanhamento, não apaga a
oportunidade nem o resultado da visita.

### 7.6 Check-in irregular

Não deve acusar fraude. O texto descreve o fato:

```text
Check-in pendente de validação
O check-in da Loja 17648 foi registrado a 1,4 km do endereço conhecido e
precisa de revisão.
```

Ações do superior:

- validar com justificativa;
- rejeitar e devolver para correção;
- abrir visita e mapa.

## 8. Ações e deep links

`DESTINO_JSON` é validado por schema e pode conter:

```json
{
  "section": "visitas",
  "routeId": "7ddc7fd2-a8bd-4b93-94a1-0b1e35f783ab",
  "stopId": 321,
  "visitId": 4501,
  "visitProductId": 889,
  "storeKey": "17648",
  "openTreatment": true,
  "step": "products",
  "mapFocus": true
}
```

Ao clicar:

1. frontend marca `VISUALIZADA`, sem esperar para navegar;
2. carrega a entidade pelo backend;
3. backend revalida destinatário e escopo;
4. abre “Visitas e Roteiros”;
5. seleciona roteiro e parada;
6. foca o mapa;
7. abre o drawer na etapa indicada;
8. se a entidade foi resolvida, mostra o histórico em modo leitura.

As ações são comandos de API, não URLs livres. Catálogo inicial:

- `VER_ROTEIRO`;
- `CONFIRMAR_CIENCIA`;
- `REGISTRAR_VISITA`;
- `VER_VISITA`;
- `REAGENDAR`;
- `REGISTRAR_ACOMPANHAMENTO`;
- `REAGENDAR_CONTATO`;
- `MARCAR_SEM_CONTINUIDADE`;
- `ADIAR_LEMBRETE`;
- `VALIDAR_CHECKIN`;
- `REJEITAR_CHECKIN`;
- `SOLICITAR_ACOMPANHAMENTO`.

## 9. Geração confiável

### 9.1 Transação de negócio

```text
BEGIN TRANSACTION
  altera entidade
  insere histórico/auditoria
  insere EVENTO_OUTBOX com EVENTO_ID único
COMMIT
```

### 9.2 Worker

1. busca lote com `UPDLOCK`, `READPAST`, `ROWLOCK`;
2. aplica lease curto ao lote;
3. carrega regra ativa e versão;
4. resolve destinatários no escopo atual e no snapshot da atribuição;
5. monta dedupe key, texto e destino;
6. tenta inserir notificação;
7. garante linha por destinatário;
8. marca outbox processada;
9. em erro transitório, incrementa tentativa e aplica backoff;
10. após o limite, marca erro definitivo e alerta operação.

O worker pode ser executado por mais de uma instância. Unicidade, lease e
idempotência garantem consistência.

### 9.3 Backoff proposto

```text
1 min -> 5 min -> 15 min -> 1 h -> 4 h
```

Erros de validação de payload são definitivos. Erros de conexão, timeout e
deadlock são transitórios.

## 10. Entrega em tempo real

Fonte de verdade: API e banco.

Estratégia recomendada para o projeto atual:

- SSE autenticado em `GET /api/notificacoes/stream`;
- evento envia somente `{ unreadCount, changedNotificationIds }`;
- frontend busca conteúdo paginado pela API;
- reconexão com `Last-Event-ID`;
- fallback de polling do contador a cada 60 segundos;
- atualização imediata após ações locais;
- nenhuma mensagem completa sensível no evento SSE.

Se SSE não for implantado na primeira fase, o contrato REST não muda.

## 11. Segurança

- destinatário só lê/altera sua linha em `TB_NOTIFICACAO_USUARIO`;
- superior recebe apenas escaladas dentro do `applyAccessScope`;
- admin não “herda” automaticamente todas as notificações pessoais;
- origem e entidade são revalidadas a cada ação;
- texto é escapado no frontend; templates não aceitam HTML;
- payload e destino passam por schema;
- ações exigem CSRF mitigado pela política de cookie já adotada e
  `Idempotency-Key`;
- endpoints não aceitam `COD_FUNC_DESTINATARIO` do browser para mutações;
- logs não armazenam coordenadas completas ou payload sensível sem necessidade.

## 12. Expiração, retenção e cancelamento

- visita próxima: expira ao final da janela ou ao iniciar a visita;
- atribuição: expira/cancela se o roteiro for cancelado ou substituído;
- tratativa pendente: resolve com estado terminal;
- produto sem evolução: resolve com evolução, sem continuidade ou encerramento;
- notificação lida permanece consultável na central;
- proposta inicial de retenção: 24 meses para notificações e 5 anos para
  auditoria, sujeita à política corporativa;
- limpeza é lógica primeiro; remoção física somente por job autorizado e nunca
  remove histórico obrigatório.

## 13. Observabilidade

Métricas:

- outbox pendente e idade do evento mais antigo;
- latência p50/p95 entre evento e notificação;
- notificações criadas, deduplicadas, reentregues e escaladas;
- erros por regra e adaptador;
- não lidas por idade;
- taxa de abertura e ação;
- tempo entre alerta e resolução;
- notificações canceladas por resolução automática;
- conexões SSE e uso do fallback.

Alertas operacionais:

- outbox mais antiga acima de 10 minutos;
- job sem execução por duas janelas;
- crescimento anormal de duplicatas;
- taxa de erro de adaptador acima do limite;
- notificação ativa para entidade já terminal;
- usuário destinatário inexistente/inativo.

Cada execução registra `correlationId`; histórico, outbox e notificação mantêm o
mesmo identificador quando pertencem ao mesmo fluxo.

## 14. Casos-limite obrigatórios

- duplo clique em concluir/check-in;
- retry após timeout com transação já confirmada;
- dois workers processando o mesmo evento;
- rota alterada enquanto o drawer está aberto;
- troca de responsável depois de notificação entregue;
- visita reagendada depois do lembrete;
- produto evolui entre avaliação e inserção da notificação;
- usuário lê no sino e conclui em outra aba;
- evento chega fora de ordem;
- horário de verão/fuso e virada de data;
- data sem horário planejado;
- fonte comercial indisponível;
- superior sem vínculo atual, mas presente no snapshot;
- notificação expira enquanto o painel está aberto.

Em todos os casos, a entidade de negócio decide o estado final; a notificação se
ajusta a ela, nunca o contrário.
