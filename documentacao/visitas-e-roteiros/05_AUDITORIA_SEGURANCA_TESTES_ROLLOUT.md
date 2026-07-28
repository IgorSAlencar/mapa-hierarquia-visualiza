# Permissões, auditoria, erros, rollout e critérios de aceite

## 1. Perfis

Mapeamento da linguagem de negócio para os papéis atuais:

| Negócio | Papel técnico |
|---|---|
| Gerente Comercial | `supervisor` |
| Gerente Comercial III | `coordenador` |
| Gerente de Gestão | `gerente_area` |
| Administração técnica | `admin` |

### Matriz de autorização

| Ação | Gerente Comercial | GC III | Gerente de Gestão | Admin |
|---|:---:|:---:|:---:|:---:|
| Ver próprios roteiros/visitas | sim | sim | sim | sim |
| Ver subordinados no próprio escopo | não | sim | sim | sim |
| Criar roteiro próprio | sim | sim | sim | sim |
| Atribuir roteiro a subordinado | não | sim | sim | sim |
| Atribuir fora do escopo | não | não | não | somente política explícita |
| Registrar visita própria | sim | não | não | exceção auditada |
| Check-in da própria visita | sim | não | não | exceção auditada |
| Reagendar visita própria | sim | não | não | exceção auditada |
| Alterar data/prioridade/responsável | próprio antes do início | sim, no escopo | sim, no escopo | sim |
| Consultar tratativa da equipe | não | sim | sim | sim |
| Comentar/solicitar acompanhamento | não | sim | sim | sim |
| Validar check-in excepcional | não | sim | sim | sim |
| Reabrir estado terminal | não | sim, com motivo | sim, com motivo | sim, com motivo |
| Ver indicadores da equipe | próprios | equipe | estrutura | todos |
| Configurar regras | não | não | leitura opcional | sim |

Regras adicionais:

- superior não registra check-in no lugar do gerente;
- reatribuição exige responsável novo elegível e dentro do escopo;
- usuário não escolhe `COD_FUNC_DESTINATARIO` de notificação;
- a rota de leitura retorna `404` em vez de revelar entidade fora do escopo;
- admin não recebe automaticamente alertas pessoais da organização;
- toda exceção de admin/superior exige motivo e aparece na timeline.

As consultas devem reutilizar a política `applyAccessScope` e a regra de
atribuição já existentes no backend.

## 2. Auditoria

### 2.1 Eventos de visita

Catálogo mínimo de `TIPO_EVENTO`:

- `VISITA_CRIADA`;
- `VISITA_ATRIBUIDA`;
- `RESPONSAVEL_ALTERADO`;
- `DATA_PLANEJADA_ALTERADA`;
- `HORARIO_PLANEJADO_ALTERADO`;
- `PRIORIDADE_ALTERADA`;
- `ORIENTACAO_ALTERADA`;
- `RASCUNHO_SALVO`;
- `CHECKIN_REGISTRADO`;
- `CHECKIN_VALIDADO`;
- `CHECKIN_REJEITADO`;
- `VISITA_INICIADA`;
- `CONFIRMACAO_REALIZACAO_RESPONDIDA`;
- `PRODUTO_TRATADO`;
- `PRODUTO_NAO_ABORDADO`;
- `VISITA_REALIZADA`;
- `VISITA_NAO_REALIZADA`;
- `VISITA_REAGENDADA`;
- `VISITA_SUCESSORA_CRIADA`;
- `VISITA_REABERTA`;
- `BASELINE_CAPTURADO`;
- `EVOLUCAO_VERIFICADA`;
- `EVOLUCAO_DETECTADA`;
- `OPORTUNIDADE_SEM_EVOLUCAO`;
- `ACOMPANHAMENTO_REGISTRADO`;
- `ACOMPANHAMENTO_ADIADO`;
- `ACOMPANHAMENTO_SEM_CONTINUIDADE`;
- `NOTIFICACAO_GERADA`;
- `NOTIFICACAO_RESOLVIDA`.

### 2.2 Eventos de roteiro

- `ROTEIRO_CRIADO`;
- `ROTEIRO_ATRIBUIDO`;
- `ROTEIRO_VERSIONADO`;
- `ROTEIRO_CANCELADO`;
- `RESPONSAVEL_ALTERADO`;
- `DATA_ALTERADA`;
- `PRIORIDADE_ALTERADA`;
- `ORIENTACAO_ALTERADA`;
- `LOJA_INCLUIDA`;
- `LOJA_REMOVIDA`;
- `ORDEM_LOJAS_ALTERADA`;
- `HORARIO_LOJA_ALTERADO`;
- `PRODUTO_FOCO_INCLUIDO`;
- `PRODUTO_FOCO_REMOVIDO`.

Vários campos alterados na mesma requisição podem gerar uma linha por campo e
uma notificação agregada. Todos compartilham `CORRELATION_ID`.

### 2.3 Conteúdo

Cada evento registra:

- entidade e subentidade;
- antes/depois em JSON, apenas campos relevantes;
- estado anterior/novo;
- ator funcional ou origem de sistema;
- instante do servidor;
- origem (`USUARIO`, `SISTEMA`, `JOB`, `INTEGRACAO`, `ADMIN`);
- request/correlation ID;
- motivo;
- IP e user agent quando aplicável.

Segredos, cookie, senha, token LDAP e payload bruto de fonte externa não entram
na auditoria.

### 2.4 Garantia de não sobrescrita

- histórico/auditoria só recebem `INSERT`;
- triggers rejeitam `UPDATE` e `DELETE`;
- correção gera novo evento compensatório;
- exclusão de roteiro com atividade vira cancelamento;
- aplicação recebe apenas permissão de `SELECT`/`INSERT` nessas tabelas;
- retenção usa procedimento administrativo separado e auditado;
- backup e restauração fazem parte da política corporativa, não do job comum.

Triggers não substituem eventos de negócio: o serviço sabe o significado da
mudança e deve gravar descrição, ator e correlação na mesma transação.

## 3. Tratamento de erros na experiência

### Rascunho

- falha transitória: mantém dados na tela, mostra “não sincronizado” e permite
  tentar novamente;
- sessão expirada: preserva rascunho local até novo login, sem enviar a outro
  usuário;
- conflito de versão: bloqueia conclusão e oferece recarregar/mesclar campos,
  mostrando quem alterou e quando.

### Check-in

- geolocalização negada: oferece exceção justificada;
- baixa precisão: informa que ficará pendente de validação;
- fora do raio: mostra distância calculada e exige justificativa;
- duplicado/retry: retorna o check-in original;
- relógio do aparelho divergente: usa servidor como referência e sinaliza.

### Conclusão

- etapa com erro recebe foco e mensagem por campo;
- produtos pendentes são listados pelo nome;
- falha ao capturar baseline não perde a tratativa: mantém visita pronta para
  conclusão ou aplica política explícita de baseline pendente;
- duplo clique é neutralizado por botão em estado de envio e idempotência.

### Notificação

- entidade resolvida: abre histórico, informa “pendência já resolvida” e
  atualiza item;
- ação não mais válida: `409/410`, sem repetir efeito;
- SSE indisponível: polling assume sem aviso intrusivo;
- contador divergente: resposta das mutações devolve contador canônico.

## 4. Estratégia de testes

### Unitários

- transições da visita;
- regra de conclusão por produtos;
- data/hora e offset;
- dedupe key;
- templates e schemas de destino/ação;
- política de repetição, adiamento e escalada;
- cálculo de quatro dias corridos e regras por dias úteis;
- avaliadores com `EVOLUIU`, `SEM_EVOLUCAO`, `INCONCLUSIVO` e `ERRO_FONTE`;
- resolução de destinatários por alçada.

### Integração com SQL Server

- constraints e FKs;
- uma visita atual por parada;
- uma tratativa por produto;
- `ROWVERSION` concorrente;
- idempotência após timeout;
- transação de reagendamento;
- outbox na mesma transação;
- dois workers com `READPAST`/lease;
- chave de deduplicação sob concorrência;
- triggers append-only;
- índices usados nas consultas principais.

### E2E

- superior cria roteiro e gerente recebe o sino;
- deep link abre roteiro, parada, mapa e drawer;
- check-in, produtos, conclusão e próxima loja;
- não realização com todos os motivos;
- “Outro” sem justificativa;
- reagendamento e lembretes recalculados;
- quatro dias sem evolução;
- acompanhamento, adiamento, sem continuidade e evolução automática;
- marcar uma/todas como lida;
- escalonamento para GC III/Gestão;
- tentativa de acesso fora do escopo.

### Tempo e concorrência

Usar relógio injetável, não esperar dias reais. Cobrir:

- virada de dia no fuso da visita;
- 23:59:59 e meia-noite;
- ano bissexto;
- timestamp com `-03:00` convertido para UTC;
- timestamp sem offset rejeitado;
- duas abas alterando a mesma visita;
- retry com a mesma chave e payload diferente.

### Resiliência

- indisponibilidade da fonte Cielo/Crédito;
- reinício do worker durante lease;
- deadlock e timeout;
- SSE desconectado;
- evento fora de ordem;
- notificação criada no instante do “marcar todas”.

## 5. Rollout seguro

### Etapa 0 — homologar decisões

- fontes e critérios de evidência por produto;
- raio e política de exceção do check-in;
- calendário corrido/útil;
- horários e fusos;
- limiares de repetição/escalada;
- retenção;
- responsáveis por regras.

### Etapa 1 — banco

1. backup;
2. executar scripts de `create_table` em homologação;
3. executar validação pós-deploy;
4. testar permissões do login da aplicação;
5. repetir em produção em janela controlada.

### Etapa 2 — backend em dual mode

- escrever visita/produtos/outbox ao salvar novos roteiros;
- ler novo estado quando existir;
- projetar `status` legado para consumidores antigos;
- manter jobs desligados;
- comparar contagens e timelines.

### Etapa 3 — frontend

- liberar drawer e status ampliado por feature flag;
- liberar sino com dados internos de teste;
- monitorar erros de versão, autosave e deep links.

### Etapa 4 — jobs

- ativar outbox;
- ativar visita próxima e pendente;
- ativar um produto piloto;
- reconciliar alertas ativos;
- expandir produto a produto.

### Backfill

- criar `PENDENTE` apenas para paradas futuras/ativas ainda sem visita;
- não declarar roteiro histórico `concluida` como visita `REALIZADA` sem
  evidências;
- manter histórico antigo em leitura legada ou migrá-lo após saneamento;
- mapear nomes de produto conhecidos para o catálogo;
- itens desconhecidos entram em relatório de exceção, não em produto inventado;
- validar `HORARIO NVARCHAR(20)` com parser estrito antes de gravar `TIME(0)`;
- guardar relatório de cada linha rejeitada.

## 6. Critérios de aceite

### Jornada

- [ ] Toda parada nova possui visita atual e produtos normalizados.
- [ ] A ação “Registrar visita” abre drawer amplo sem desmontar o mapa.
- [ ] O resumo da loja permanece visível nas seis etapas.
- [ ] Rascunho sobrevive a fechar/reabrir e exibe estado de sincronização.
- [ ] Check-in registra usuário, dispositivo e servidor.
- [ ] Término é opcional e, quando informado, não pode preceder o início.
- [ ] “Não realizada” exige motivo; “Outro” exige justificativa.
- [ ] Reagendar mantém episódio anterior e cria sucessor ligado.
- [ ] Conclusão é bloqueada com produto pendente.
- [ ] “Não abordado” exige justificativa.
- [ ] “Salvar e próxima” respeita a ordem e atualiza progresso/marcador.

### Estado e dados

- [ ] Os cinco estados operacionais seguem a máquina de estados.
- [ ] Resultado comercial não altera automaticamente status operacional.
- [ ] Acompanhamento por produto é independente.
- [ ] Datas não ISO e timestamps sem offset são rejeitados.
- [ ] Instantes persistidos usam UTC em `DATETIME2(3)`.
- [ ] Coordenadas/distâncias novas usam `DECIMAL`.
- [ ] Toda FK e check está confiável após deploy.
- [ ] Concorrência obsoleta retorna `409`, sem sobrescrever.
- [ ] Retry com mesma idempotency key não duplica efeito.

### Pós-visita

- [ ] Prazo padrão de quatro dias vem da regra, não de constante.
- [ ] Regra aplicada fica registrada no produto da visita.
- [ ] Evolução grava evidência e resolve alertas ativos.
- [ ] Sem evolução cria um único alerta por produto/ciclo.
- [ ] Fonte indisponível gera retry técnico, não falso alerta comercial.
- [ ] Acompanhamento, reagendamento, adiamento e sem continuidade são
  auditados.

### Notificações

- [ ] Sino fica junto ao logout e mostra contador canônico.
- [ ] Painel filtra não lidas/prioridade e abre central completa.
- [ ] Marcar uma/todas como lida não resolve a pendência de negócio.
- [ ] “Marcar todas” usa corte temporal.
- [ ] Reentrega não cria outro item nem aumenta o contador.
- [ ] Dois workers/retries não criam duplicata.
- [ ] Deep link abre a visita e etapa corretas, dentro do escopo.
- [ ] Adiamento reapresenta a mesma ocorrência no prazo.
- [ ] Visita tratada cancela/resvolve lembretes pendentes.
- [ ] Escalada cria ocorrência própria para o superior correto.
- [ ] SSE reconecta e polling mantém contingência.
- [ ] Notificações expiradas não aceitam ação obsoleta.

### Permissões e auditoria

- [ ] Gerente só trata as próprias visitas.
- [ ] Superior vê/comenta apenas dentro da hierarquia.
- [ ] Reatribuição fora do escopo é recusada.
- [ ] Reabertura exige motivo e alçada.
- [ ] Atribuição guarda criador, recebedor, instante, prioridade e orientação.
- [ ] Cada mutação relevante gera histórico/auditoria e correlation ID.
- [ ] `UPDATE`/`DELETE` de histórico e auditoria são rejeitados.
- [ ] Roteiro com atividade não é apagado fisicamente.

### Operação

- [ ] Outbox mais antiga, latência e erros de adaptador são monitorados.
- [ ] Jobs são idempotentes, em lote e reprocessáveis.
- [ ] Reconciliação não deixa alerta ativo para entidade terminal.
- [ ] Runbook cobre retry, reprocessamento, desativação de regra e rollback de
  aplicação.
- [ ] Fontes de evidência e parâmetros foram homologados antes de produção.

## 7. Metas não funcionais propostas

Validar em ambiente representativo:

- contador do sino: p95 abaixo de 500 ms;
- primeira página: p95 abaixo de 1 s;
- abertura do drawer: p95 abaixo de 2 s;
- evento materializado: até 2 minutos em operação normal;
- lembrete agendado: tolerância de uma janela do job;
- zero efeito duplicado em teste concorrente de idempotência;
- navegação por teclado, foco preso no drawer e rótulos acessíveis;
- layout utilizável em desktop e tela estreita sem cobrir controles essenciais.
