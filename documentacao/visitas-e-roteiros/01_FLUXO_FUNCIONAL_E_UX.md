# Fluxo funcional, regras e experiência do usuário

## 1. Ciclo completo

### 1.1 Criação ou atribuição do roteiro

Ao salvar “Montar meu roteiro”, o backend executa uma única transação:

1. salva a versão imutável do roteiro e suas paradas;
2. cria um episódio `PENDENTE` em `TB_VISITA_TRATATIVA` para cada parada;
3. transforma cada produto foco em uma linha `TB_VISITA_PRODUTO`;
4. grava `VISITA_CRIADA` e, quando aplicável, `VISITA_ATRIBUIDA`;
5. grava evento na outbox;
6. se criador e responsável forem diferentes e a alçada permitir, gera a
   notificação “Novo roteiro atribuído”.

Snapshot de nome da loja, agência, endereço, responsável, criador, oportunidade
e produto é mantido no roteiro/visita. Mudanças futuras nos cadastros mestre não
alteram o que foi planejado naquele momento.

Se o roteiro for alterado, a versão anterior não é apagada. A nova versão
registra diferenças de data, responsável, prioridade, orientação, lojas e
produtos. Visitas já iniciadas ou concluídas não podem ser substituídas
silenciosamente.

### 1.2 Abertura em “Visitas e Roteiros”

Cada parada apresenta:

- código e nome da loja;
- posição no roteiro e horário planejado;
- responsável e origem da atribuição;
- status operacional;
- chips dos produtos foco;
- progresso dos produtos, por exemplo `1/3 tratados`;
- prioridade e pendências;
- ação principal contextual:
  - `Iniciar visita` para `PENDENTE`;
  - `Continuar tratativa` para `EM_ANDAMENTO`;
  - `Ver tratativa` para estado terminal;
  - `Abrir nova data` para a sucessora de uma visita `REAGENDADA`.

O painel pequeno atual pode continuar como resumo. A ação abre um drawer de
tratativa com largura recomendada entre 620 e 720 px em desktop e tela cheia em
dispositivos estreitos. O mapa permanece montado e visível.

### 1.3 Tratativa

O drawer tem seis etapas, rascunho automático e resumo fixo da loja:

1. Dados da visita;
2. Confirmação de realização;
3. Tratativa dos produtos foco;
4. Resultado e observações;
5. Próximos passos;
6. Revisão e conclusão.

O primeiro comando de negócio é a resposta a:
“A loja foi realmente visitada?”

#### Sim, visita realizada

- data local da visita;
- horário de início;
- horário de término opcional;
- check-in;
- observação geral;
- resultado comercial geral;
- necessidade de retorno;
- data prevista de retorno quando marcada.

O check-in muda `PENDENTE` para `EM_ANDAMENTO`. A conclusão muda para
`REALIZADA` apenas depois de validar os produtos foco.

#### Não foi possível realizar

O motivo é obrigatório:

- `ESTABELECIMENTO_FECHADO`;
- `RESPONSAVEL_AUSENTE`;
- `ENDERECO_NAO_LOCALIZADO`;
- `PROBLEMA_DESLOCAMENTO`;
- `REAGENDADA_COM_CLIENTE`;
- `OUTRO`.

`OUTRO` exige justificativa. A conclusão muda o episódio para
`NAO_REALIZADA`; produtos ficam encerrados como não aplicáveis àquele episódio,
sem fingir que foram tratados.

#### Visita reagendada

Exige nova data, horário opcional, motivo e orientação. Na mesma transação:

1. episódio atual recebe `REAGENDADA` e deixa de ser atual;
2. é criada uma visita sucessora `PENDENTE`;
3. produtos foco ainda válidos são copiados para a sucessora;
4. `TB_VISITA_REAGENDAMENTO` liga as duas visitas;
5. histórico, outbox e lembretes antigos são encerrados;
6. novos lembretes são calculados para a nova data.

## 2. Máquinas de estado

### 2.1 Estado operacional da visita

```text
PENDENTE
  |-- check-in/iniciar -----------------> EM_ANDAMENTO
  |-- motivo obrigatório --------------> NAO_REALIZADA
  `-- nova data + motivo --------------> REAGENDADA -> nova visita PENDENTE

EM_ANDAMENTO
  |-- produtos completos + revisão ----> REALIZADA
  |-- exceção justificada -------------> NAO_REALIZADA
  `-- nova data + motivo --------------> REAGENDADA -> nova visita PENDENTE
```

`REALIZADA`, `NAO_REALIZADA` e `REAGENDADA` são terminais no fluxo normal.
Reabertura é comando excepcional de superior/admin, exige motivo e gera
`VISITA_REABERTA`; nunca remove os eventos anteriores.

### 2.1.1 Atualização automática na tela e no roteiro

Toda ação de estado é um comando transacional do backend. Depois do commit, a
resposta já devolve `visitStatus`, progresso da parada e progresso do roteiro;
o frontend atualiza lista, marcador e contador sem recarregar a página.

`TB_VISITA_TRATATIVA.STATUS` é a fonte de verdade. Durante a transição, o
backend mantém duas projeções:

- `visitStatus`: os cinco estados novos;
- `status`: compatibilidade temporária com `pendente`/`concluida`.

Quando todos os consumidores forem migrados, `ROTEIRO_PARADAS_MAPA.STATUS` pode
receber a projeção completa em minúsculas na mesma transação. Não se recomenda
trigger de sincronização, pois histórico, outbox e autorização pertencem ao
serviço.

O estado do roteiro é derivado:

- `PLANEJADO`: nenhuma visita iniciada;
- `EM_ANDAMENTO`: existe atividade e ainda há visita atual não terminal;
- `CONCLUIDO`: todas as visitas atuais estão terminais;
- `ATRASADO`: indicador derivado quando existe visita vencida não terminal.

### 2.2 Resultado comercial

É independente do status operacional e pode ser:

- `SEM_RESULTADO`;
- `APRESENTADO`;
- `INTERESSE`;
- `PROPOSTA`;
- `CONTRATADO`;
- `TRANSACIONOU`;
- `SEM_INTERESSE`;
- `SEM_OPORTUNIDADE`;
- `OUTRO`.

Uma visita pode estar `REALIZADA` e ainda assim ter resultado
`APRESENTADO`; isso não significa evolução posterior.

### 2.3 Tratativa do produto

- `PENDENTE`: ainda não respondido;
- `TRATADO`: resultado e observação registrados;
- `NAO_ABORDADO`: exige justificativa.

Acompanhamento do produto:

- `NAO_APLICAVEL`;
- `AGUARDANDO_EVOLUCAO`;
- `EVOLUIDO`;
- `ACOMPANHAMENTO_PENDENTE`;
- `REAGENDADO`;
- `SEM_CONTINUIDADE`;
- `ENCERRADO`.

### 2.4 Regra de conclusão

`REALIZADA` somente é aceita se:

- existe check-in ou exceção formal autorizada;
- início foi informado;
- quando houver término, ele não é anterior ao início;
- cada produto foco está `TRATADO` ou `NAO_ABORDADO`;
- todo `NAO_ABORDADO` tem justificativa;
- produtos que exigem acompanhamento têm baseline e próxima verificação;
- retorno marcado possui data;
- não há erro de versão concorrente.

## 3. Check-in confiável

O servidor registra:

- instante recebido pelo servidor em UTC;
- instante informado pelo dispositivo com offset explícito;
- usuário autenticado;
- latitude e longitude;
- precisão reportada pelo dispositivo;
- latitude e longitude conhecidas da loja;
- distância calculada pelo servidor;
- raio aceito pela regra vigente;
- estado `VALIDADO`, `FORA_DO_RAIO`, `SEM_GEOLOCALIZACAO` ou
  `PENDENTE_VALIDACAO`;
- origem `GPS`, `REDE`, `MANUAL` ou `OFFLINE`;
- justificativa para exceção.

Regras:

- o cliente nunca determina sozinho que o check-in é válido;
- o backend recalcula a distância;
- latitude e longitude são um par: ambas preenchidas ou ambas nulas;
- check-in fora do raio pode iniciar a tratativa, mas fica sinalizado e exige
  justificativa ou revisão, conforme política;
- recebimento offline guarda os dois instantes e o atraso; atraso acima do
  limite configurado fica pendente de validação;
- não se bloqueia visita por permissão de geolocalização negada sem oferecer
  fluxo de exceção auditado.

## 4. Tratativa por produto foco

Para cada produto:

- produto e oportunidade de origem;
- estado da tratativa;
- resultado da visita;
- observação;
- justificativa de não abordagem;
- “necessita acompanhamento?”;
- baseline capturado;
- regra aplicada e sua versão;
- próxima verificação;
- estado de acompanhamento.

O backend não aceita produtos arbitrários: o código deve existir no catálogo
ativo ou ter sido preservado como snapshot legado. Repetição do mesmo produto na
mesma visita é bloqueada por índice único.

## 5. Acompanhamento pós-visita

Ao concluir uma visita, cada produto com acompanhamento:

1. captura o baseline da oportunidade;
2. resolve a regra vigente por produto e tipo de oportunidade;
3. calcula `PROXIMA_VERIFICACAO_EM_UTC`;
4. deixa o produto em `AGUARDANDO_EVOLUCAO`;
5. publica `VISITA_PRODUTO_AGUARDANDO_EVOLUCAO`.

No prazo, o adaptador do produto compara baseline e estado atual:

| Produto | Evidência esperada |
|---|---|
| Crédito | produção após a visita superior ao baseline/critério |
| Cielo | ativação, adesão ou primeira transação após a visita |
| Proposta de Valor | saída da condição “sem proposta de valor” |
| Fazer Negócio | ação válida registrada após a visita |
| Ativo PADE | atingimento ou evolução do indicador configurado |

Resultado técnico do avaliador:

- `EVOLUIU`: atualiza produto, registra evidência, resolve notificações;
- `SEM_EVOLUCAO`: cria acompanhamento pendente e notificação;
- `INCONCLUSIVO`: agenda nova tentativa sem acusar ausência de evolução;
- `ERRO_FONTE`: aplica backoff e alerta operação após o limite; não notifica o
  gerente como se fosse ausência de resultado.

Os quatro dias são o seed inicial, não uma constante no código.

## 6. Wireframes textuais

### 6.1 Lista/roteiro

```text
┌ Visitas e Roteiros ─────────────────────────────┐
│ 28/07/2026 · Roteiro 025-120 · Alta             │
│ 3 de 10 visitas tratadas  [██████░░░░░░░] 30%   │
├─────────────────────────────────────────────────┤
│ 03  Loja 17648                                  │
│     09:00 · Agência 025 · Crédito · Cielo       │
│     ● Em andamento       Produtos 1/2           │
│     [Continuar tratativa] [Mapa]                │
├─────────────────────────────────────────────────┤
│ 04  Loja 17366                                  │
│     10:10 · Agência 025 · Proposta de Valor     │
│     ○ Pendente           Produtos 0/1           │
│     [Registrar visita]   [Mapa]                 │
└─────────────────────────────────────────────────┘
```

### 6.2 Drawer de tratativa

```text
Mapa ao fundo             ┌ Tratar visita · 3 de 10 ──────────────┐
                          │ Loja 17648 — Mercado Central           │
                          │ Agência 025 · 28/07 · 09:00 · Alta     │
                          │ Rua... · Responsável... · Sugerido por │
                          ├ 1 Dados  2 Realização  3 Produtos ... ┤
                          │ A loja foi realmente visitada?         │
                          │ (•) Sim  ( ) Não  ( ) Reagendada       │
                          │                                       │
                          │ Check-in 09:04 · 42 m · Validado       │
                          │ Início [09:04]  Término [   ]          │
                          │                                       │
                          │ Rascunho salvo 09:12                    │
                          ├───────────────────────────────────────┤
                          │ [Anterior] [Salvar] [Salvar e próxima] │
                          └───────────────────────────────────────┘
```

O resumo superior permanece em todas as etapas. Fechar com rascunho não perde
dados. Trocar de loja com alterações pendentes pede confirmação apenas se a
gravação automática falhou.

### 6.3 Etapa de produtos

```text
Crédito                         1/2 concluídos
● Tratado
Resultado [Apresentado v]
Observação [Cliente pediu simulação...]
Necessita acompanhamento [Sim]

Cielo
○ Pendente
[Registrar tratativa] [Não foi abordado]
```

### 6.4 Sino e painel

```text
                         🔔 3
┌ Notificações ───────────────────────────────────┐
│ [Todas] [Não lidas] [Alta prioridade]           │
│                                                 │
│ ● Oportunidade sem evolução · há 5 min          │
│   Cielo da Loja 17366 continua pendente...      │
│   [Registrar acompanhamento] [Ver visita]       │
│                                                 │
│ ○ Visita programada para amanhã                 │
│   4 lojas a partir das 9h. [Abrir no mapa]      │
│                                                 │
│ [Marcar todas como lidas] [Central completa]    │
└─────────────────────────────────────────────────┘
```

## 7. Salvamento parcial e navegação

- autosave após pausa curta e ao mudar de etapa;
- indicador `salvando`, `salvo às HH:mm` ou `falha ao salvar`;
- rascunho não muda a visita para `REALIZADA`;
- `Salvar e ir para a próxima loja` usa a ordem atual do roteiro;
- se a próxima loja já estiver terminal, o sistema avança para a primeira
  pendente;
- conclusão mostra confirmação, atualiza marcador e progresso sem recarregar o
  mapa;
- falha de rede preserva rascunho local criptograficamente apropriado à sessão,
  mas check-in só é confirmado após aceite do servidor.
