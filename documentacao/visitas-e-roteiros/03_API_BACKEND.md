# API, payloads, agendamentos e tratamento de erros

## 1. Convenções

- Base: `/api`.
- JSON UTF-8.
- Datas: `YYYY-MM-DD`.
- Horas locais: `HH:mm:ss`.
- Instantes: RFC 3339 com offset, por exemplo
  `2026-07-28T09:04:12-03:00`.
- Respostas de instante: UTC com `Z`, por exemplo
  `2026-07-28T12:04:12.321Z`.
- A API rejeita `28/07/2026`, timestamp sem offset e data impossível.
- Escrita no SQL Server é parametrizada com tipos `sql.Date`,
  `sql.Time` e `sql.DateTime2`; nunca concatena texto de data.
- Comandos usam `Idempotency-Key`.
- Edição de rascunho usa `If-Match` com a versão opaca derivada de
  `ROWVERSION`.
- Paginação por cursor opaco.
- Respostas incluem `correlationId`.

## 2. Visitas

### Consultas

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/visitas` | lista por período, usuário, roteiro, loja, status e equipe |
| `GET` | `/visitas/:visitaId` | dados completos do drawer |
| `GET` | `/visitas/:visitaId/historico` | timeline append-only |
| `GET` | `/roteiros/:roteiroId/progresso` | contadores do roteiro |
| `GET` | `/roteiros/:roteiroId/paradas` | paradas já enriquecidas com visita atual |

Filtros de `GET /visitas`:

```text
from, to, status, resultadoComercial, acompanhamentoStatus,
responsavel, chaveLoja, roteiroId, chaveSupervisao, cursor, limit
```

O backend ignora qualquer tentativa de ampliar o escopo do usuário.

### Comandos

| Método | Rota | Regra |
|---|---|---|
| `PATCH` | `/visitas/:id/rascunho` | salva campos parciais sem concluir |
| `POST` | `/visitas/:id/checkins` | registra check-in/check-out idempotente |
| `PUT` | `/visitas/:id/produtos/:visitaProdutoId` | trata um produto foco |
| `POST` | `/visitas/:id/concluir` | conclui como realizada |
| `POST` | `/visitas/:id/nao-realizar` | conclui como não realizada |
| `POST` | `/visitas/:id/reagendamentos` | encerra episódio e cria sucessor |
| `POST` | `/visitas/:id/reabrir` | exceção de superior/admin com motivo |
| `POST` | `/visitas/:id/acompanhamentos` | comentário/retorno geral |
| `POST` | `/visitas/:id/produtos/:produtoId/acompanhamentos` | ação pós-visita por produto |
| `POST` | `/visitas/:id/produtos/:produtoId/sem-continuidade` | encerramento motivado |

## 3. Exemplo de leitura do drawer

`GET /api/visitas/4501`

```json
{
  "visit": {
    "id": 4501,
    "routeId": "7ddc7fd2-a8bd-4b93-94a1-0b1e35f783ab",
    "stopId": 321,
    "sequence": 1,
    "current": true,
    "status": "EM_ANDAMENTO",
    "commercialResult": "SEM_RESULTADO",
    "planned": {
      "date": "2026-07-28",
      "time": "09:00:00",
      "timezone": "America/Sao_Paulo"
    },
    "store": {
      "key": "17648",
      "name": "Mercado Central",
      "agencyCode": "025",
      "territoryKey": 120,
      "address": "Rua Exemplo, 10 - Centro"
    },
    "route": {
      "name": "025-120",
      "priority": "ALTA",
      "orientation": "Apresentar simulação de Crédito"
    },
    "owner": {
      "functionalCode": "1234567",
      "name": "Gerente Comercial"
    },
    "createdBy": {
      "functionalCode": "7654321",
      "name": "Carolina Rodrigues"
    },
    "checkin": {
      "id": 7001,
      "occurredAt": "2026-07-28T12:04:12.321Z",
      "validationStatus": "VALIDADO",
      "distanceMeters": 42.8
    },
    "answers": {
      "wasVisited": "SIM",
      "visitDate": "2026-07-28",
      "startedAt": "2026-07-28T12:04:12.321Z",
      "endedAt": null,
      "generalNotes": "Contato com a proprietária.",
      "needsReturn": true,
      "expectedReturnDate": "2026-08-04"
    },
    "products": [
      {
        "id": 889,
        "code": "CREDITO",
        "name": "Crédito",
        "treatmentStatus": "TRATADO",
        "visitResult": "APRESENTADO",
        "notes": "Cliente pediu simulação.",
        "needsFollowUp": true,
        "followUpStatus": "AGUARDANDO_EVOLUCAO",
        "nextVerificationAt": "2026-08-01T12:00:00.000Z"
      },
      {
        "id": 890,
        "code": "CIELO",
        "name": "Cielo",
        "treatmentStatus": "PENDENTE",
        "needsFollowUp": false,
        "followUpStatus": "NAO_APLICAVEL"
      }
    ],
    "progress": {
      "treatedProducts": 1,
      "totalProducts": 2,
      "canComplete": false,
      "blockingReasons": ["PRODUCT_890_PENDING"]
    },
    "version": "AAAAAAAAB9E="
  },
  "correlationId": "2c2b0bc5-efc3-495c-8a19-84f6d112a080"
}
```

## 4. Payloads de escrita

### 4.1 Salvar rascunho

```http
PATCH /api/visitas/4501/rascunho
If-Match: "AAAAAAAAB9E="
Idempotency-Key: 8df33fa4-8e73-49e1-9d07-931c8e01b30c
```

```json
{
  "wasVisited": "SIM",
  "visitDate": "2026-07-28",
  "startedAt": "2026-07-28T09:04:12-03:00",
  "generalNotes": "Contato com a proprietária.",
  "needsReturn": true,
  "expectedReturnDate": "2026-08-04"
}
```

Resposta `200` com a versão nova e progresso. Campos ausentes não são apagados;
para limpar campo anulável, enviar `null`.

### 4.2 Check-in

```http
POST /api/visitas/4501/checkins
Idempotency-Key: 3bf45229-5139-4405-8807-1e6b802e7b65
```

```json
{
  "type": "CHECKIN",
  "deviceOccurredAt": "2026-07-28T09:04:12-03:00",
  "coordinates": {
    "latitude": -23.550520,
    "longitude": -46.633308,
    "accuracyMeters": 18.4
  },
  "source": "GPS",
  "deviceEventId": "ios-b5cda894-e8ae-4adc-a374-75f881c6bf29"
}
```

Resposta:

```json
{
  "checkin": {
    "id": 7001,
    "serverReceivedAt": "2026-07-28T12:04:13.018Z",
    "deviceOccurredAt": "2026-07-28T12:04:12.000Z",
    "distanceMeters": 42.8,
    "allowedRadiusMeters": 300,
    "validationStatus": "VALIDADO"
  },
  "visitStatus": "EM_ANDAMENTO",
  "version": "AAAAAAAAB9I="
}
```

Sem geolocalização:

```json
{
  "type": "CHECKIN",
  "deviceOccurredAt": "2026-07-28T09:04:12-03:00",
  "coordinates": null,
  "source": "MANUAL",
  "exceptionReason": "Permissão de localização bloqueada no aparelho",
  "deviceEventId": "web-9dcc80ca-a6df-4b38-9a80-f3e0be4909ca"
}
```

### 4.3 Tratativa do produto

```http
PUT /api/visitas/4501/produtos/889
If-Match: "AAAAAAAAB9I="
Idempotency-Key: 22c97129-1239-4821-8208-cd669d7ae2f1
```

```json
{
  "treatmentStatus": "TRATADO",
  "visitResult": "APRESENTADO",
  "notes": "Cliente pediu simulação para capital de giro.",
  "needsFollowUp": true
}
```

Produto não abordado:

```json
{
  "treatmentStatus": "NAO_ABORDADO",
  "visitResult": "NAO_ABORDADO",
  "notAddressedReason": "Responsável financeiro não estava presente.",
  "needsFollowUp": true
}
```

### 4.4 Concluir visita realizada

```http
POST /api/visitas/4501/concluir
If-Match: "AAAAAAAAB9M="
Idempotency-Key: 64bfd343-ca0d-44b4-85f0-f48f647954a6
```

```json
{
  "endedAt": "2026-07-28T10:02:00-03:00",
  "commercialResult": "APRESENTADO",
  "generalNotes": "Visita concluída com os dois focos tratados.",
  "needsReturn": true,
  "expectedReturnDate": "2026-08-04"
}
```

O backend relê todos os produtos dentro da transação. Não confia em
`canComplete` enviado pelo cliente.

### 4.5 Não realizar

```http
POST /api/visitas/4501/nao-realizar
If-Match: "AAAAAAAAB9E="
Idempotency-Key: 845c0d50-26f4-4b9d-bd37-22159ce8ff59
```

```json
{
  "reason": "RESPONSAVEL_AUSENTE",
  "justification": "Retorno combinado por telefone para a próxima semana.",
  "occurredAt": "2026-07-28T09:15:00-03:00"
}
```

`justification` é obrigatória somente para `OUTRO`, mas é aceita nos demais.

### 4.6 Reagendar

```http
POST /api/visitas/4501/reagendamentos
If-Match: "AAAAAAAAB9E="
Idempotency-Key: e41b0067-dc79-4e60-b27a-30ebd250ab51
```

```json
{
  "newDate": "2026-08-03",
  "newTime": "14:30:00",
  "reason": "REAGENDADA_COM_CLIENTE",
  "orientation": "Falar com Ana, responsável financeira.",
  "priority": "ALTA"
}
```

Resposta:

```json
{
  "previousVisit": {
    "id": 4501,
    "status": "REAGENDADA",
    "current": false
  },
  "newVisit": {
    "id": 4512,
    "sequence": 2,
    "status": "PENDENTE",
    "current": true,
    "plannedDate": "2026-08-03",
    "plannedTime": "14:30:00"
  }
}
```

### 4.7 Acompanhamento do produto

```http
POST /api/visitas/4501/produtos/889/acompanhamentos
Idempotency-Key: bb661d76-0e0b-4982-b3fc-3eb78922d77f
```

```json
{
  "type": "CONTATO",
  "action": "CLIENTE_CONTATADO",
  "notes": "Cliente aguarda documentos do contador.",
  "nextActionAt": "2026-08-05T10:00:00-03:00",
  "notificationId": 9912
}
```

## 5. Notificações

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/notificacoes` | painel/central paginada |
| `GET` | `/notificacoes/contador` | contador leve |
| `GET` | `/notificacoes/stream` | SSE |
| `POST` | `/notificacoes/:id/visualizar` | primeira visualização |
| `POST` | `/notificacoes/:id/ler` | marcar como lida |
| `POST` | `/notificacoes/ler-todas` | lidas até um corte |
| `POST` | `/notificacoes/:id/adiar` | adiar até instante válido |
| `POST` | `/notificacoes/:id/acoes/:acao` | executar comando permitido |
| `POST` | `/notificacoes/:id/arquivar` | organização pessoal |

Filtros:

```text
status, unreadOnly, priority, type, from, to, cursor, limit
```

### Lista

```json
{
  "items": [
    {
      "id": 9912,
      "type": "PRODUTO_SEM_EVOLUCAO",
      "title": "Oportunidade sem evolução",
      "message": "A oportunidade de Cielo da Loja 17366 continua pendente após a visita realizada em 22/07/2026.",
      "priority": "ALTA",
      "createdAt": "2026-07-26T12:00:00.000Z",
      "expiresAt": null,
      "recipientState": {
        "status": "NOVA",
        "readAt": null,
        "deliveryCount": 1
      },
      "entity": {
        "type": "VISITA_PRODUTO",
        "id": "889",
        "visitId": 4501,
        "routeId": "7ddc7fd2-a8bd-4b93-94a1-0b1e35f783ab",
        "storeKey": "17366"
      },
      "destination": {
        "section": "visitas",
        "routeId": "7ddc7fd2-a8bd-4b93-94a1-0b1e35f783ab",
        "stopId": 321,
        "visitId": 4501,
        "visitProductId": 889,
        "openTreatment": true,
        "step": "products",
        "mapFocus": true
      },
      "actions": [
        "REGISTRAR_ACOMPANHAMENTO",
        "VER_VISITA",
        "REAGENDAR_CONTATO",
        "MARCAR_SEM_CONTINUIDADE",
        "ADIAR_LEMBRETE"
      ]
    }
  ],
  "unreadCount": 3,
  "nextCursor": "OTkxMg"
}
```

### Marcar todas como lidas

O cliente envia o corte que estava visível, impedindo que uma notificação criada
durante a requisição seja marcada por engano:

```json
{
  "createdUntil": "2026-07-26T12:30:00.000Z"
}
```

### Adiar

```json
{
  "until": "2026-07-29T09:00:00-03:00",
  "reason": "Aguardando retorno do cliente"
}
```

O servidor limita data e quantidade segundo a regra.

### Executar ação

```http
POST /api/notificacoes/9912/acoes/REGISTRAR_ACOMPANHAMENTO
Idempotency-Key: 3f509c37-3760-4e77-9670-e47237630615
```

```json
{
  "notes": "Cliente enviará documentos até sexta.",
  "nextActionAt": "2026-07-31T10:00:00-03:00"
}
```

O backend verifica se a ação pertence à notificação e se ainda é aplicável.

## 6. Administração de regras

Restrito a admin/perfil explicitamente autorizado:

| Método | Rota |
|---|---|
| `GET` | `/configuracoes/produtos` |
| `GET` | `/configuracoes/produtos/:codigo/regras-acompanhamento` |
| `POST` | `/configuracoes/produtos/:codigo/regras-acompanhamento` |
| `GET` | `/configuracoes/notificacoes/regras` |
| `POST` | `/configuracoes/notificacoes/regras/:codigo/versoes` |
| `POST` | `/configuracoes/notificacoes/regras/:codigo/desativar` |

Regra publicada é imutável. Alterar cria nova versão e encerra a vigência
anterior. Visitas já concluídas preservam a regra que lhes foi aplicada.

## 7. Jobs

| Job | Frequência proposta | Responsabilidade |
|---|---:|---|
| `outbox-dispatcher` | 1 minuto | materializar eventos em notificações |
| `visit-upcoming` | 10 minutos | janelas de visita próxima |
| `visit-overdue` | 10 minutos | pendência, repetição e escalada |
| `product-evolution` | 15 minutos | avaliar produtos vencidos |
| `notification-resurface` | 5 minutos | reativar adiadas |
| `notification-expiration` | 1 hora | expirar/cancelar ocorrências |
| `consistency-reconciler` | diário | corrigir alerta ativo para entidade terminal |
| `retention` | diário | política de arquivamento/expurgo |

Todos os jobs:

- usam relógio UTC;
- trabalham em lotes;
- usam lease e `READPAST`;
- são idempotentes;
- aceitam reprocessamento por faixa;
- registram duração, quantidade, correlação e erro;
- não mantêm transação aberta enquanto consultam fontes externas.

## 8. Cálculo de quatro dias

Algoritmo:

```text
para cada produto da visita concluída:
  regra = regra vigente(produto, tipoOportunidade, finalizadaEm)
  se não necessita acompanhamento:
    status = NAO_APLICAVEL
  senão:
    baseline = adaptador.capturarBaseline(loja, finalizadaEm)
    proximaVerificacao = adicionarPrazo(
      finalizadaEm,
      regra.prazoDias,
      regra.diasUteis,
      fusoDaVisita
    )
    status = AGUARDANDO_EVOLUCAO
```

O seed usa `prazoDias = 4` e `diasUteis = 0`. Se uma regra usar dias úteis, o
serviço deve consultar calendário corporativo homologado; não basta ignorar
sábado e domingo se feriados fazem parte da política.

No job:

```text
selecionar produtos vencidos e não terminais
marcar lote com lease curto
para cada item, fora da transação:
  resultado = adaptador.avaliar(baseline, loja, agora)
  abrir transação curta:
    reler estado/versão
    se já terminal: encerrar
    se EVOLUIU: atualizar + histórico + outbox de resolução
    se SEM_EVOLUCAO: atualizar + acompanhamento + outbox de alerta
    se INCONCLUSIVO/ERRO: reagendar com backoff
  commit
```

## 9. Contrato dos adaptadores

```ts
interface ProductEvolutionEvaluator {
  captureBaseline(input: {
    storeKey: string;
    completedAtUtc: string;
    ruleParameters: unknown;
  }): Promise<EvidenceSnapshot>;

  evaluate(input: {
    storeKey: string;
    completedAtUtc: string;
    baseline: EvidenceSnapshot;
    evaluatedAtUtc: string;
    ruleParameters: unknown;
  }): Promise<
    | { status: 'EVOLUIU'; evidence: EvidenceSnapshot; summary: string }
    | { status: 'SEM_EVOLUCAO'; evidence: EvidenceSnapshot; summary: string }
    | { status: 'INCONCLUSIVO'; reason: string; retryAtUtc: string }
    | { status: 'ERRO_FONTE'; reason: string; retryAtUtc: string }
  >;
}
```

Parâmetros de regra ficam em JSON validado, mas o resultado normalizado e o
estado permanecem em colunas pesquisáveis.

## 10. Erros

Formato:

```json
{
  "type": "https://mapa.interno/errors/visit-incomplete",
  "title": "Visita incompleta",
  "status": 422,
  "code": "VISIT_PRODUCTS_INCOMPLETE",
  "detail": "Todos os produtos foco precisam de tratativa ou justificativa.",
  "instance": "/api/visitas/4501/concluir",
  "correlationId": "2c2b0bc5-efc3-495c-8a19-84f6d112a080",
  "errors": [
    {
      "field": "products[890]",
      "code": "PRODUCT_TREATMENT_REQUIRED",
      "message": "Informe a tratativa de Cielo."
    }
  ]
}
```

| HTTP | Uso |
|---:|---|
| `400` | JSON, data, hora ou parâmetro malformado |
| `401` | sessão ausente/expirada |
| `403` | fora do escopo ou sem alçada |
| `404` | entidade inexistente ou invisível ao usuário |
| `409` | versão concorrente, transição inválida, sucessora já criada |
| `410` | notificação expirada sem ação aplicável |
| `422` | regra de negócio não atendida |
| `429` | limite de ação/requisição |
| `503` | dependência temporariamente indisponível |

Códigos importantes:

- `INVALID_DATE_FORMAT`;
- `TIMESTAMP_OFFSET_REQUIRED`;
- `VISIT_INVALID_TRANSITION`;
- `VISIT_VERSION_CONFLICT`;
- `VISIT_PRODUCTS_INCOMPLETE`;
- `CHECKIN_ALREADY_EXISTS`;
- `CHECKIN_EXCEPTION_REASON_REQUIRED`;
- `RESCHEDULE_DATE_INVALID`;
- `PRODUCT_NOT_IN_VISIT`;
- `PRODUCT_EVIDENCE_UNAVAILABLE`;
- `NOTIFICATION_ACTION_NOT_ALLOWED`;
- `NOTIFICATION_ALREADY_RESOLVED`;
- `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`.

## 11. Transações e concorrência

- check-in: visita + check-in + histórico + outbox;
- conclusão: visita + produtos + baseline/agendamento + histórico + outbox;
- reagendamento: episódio antigo + novo + produtos + vínculo + histórico +
  cancelamento lógico de notificações + outbox;
- ação de notificação: estado de negócio + acompanhamento + estado do
  destinatário + histórico + outbox.

O repositório deve reler as linhas com `UPDLOCK` dentro da transação e comparar
`ROWVERSION`. Timeout do cliente não autoriza retry sem a mesma
`Idempotency-Key`.

## 12. Integração com as rotas atuais

Novos routers:

```text
server/routes/visitsRoutes.js
server/routes/notificationsRoutes.js
server/routes/configurationRoutes.js
```

Novas camadas:

```text
server/repositories/visitsRepository.js
server/repositories/notificationsRepository.js
server/repositories/outboxRepository.js
server/services/visitsService.js
server/services/notificationsService.js
server/services/productEvolutionService.js
server/jobs/*
```

`POST /api/roteiros` deve provisionar as visitas na mesma transação do roteiro.
`GET /api/roteiros/:id` passa a devolver `visitStatus`, progresso e
`currentVisitId` por parada.

Durante a migração, o campo legado `status` pode continuar projetando
`concluida`/`pendente`, enquanto o novo campo `visitStatus` usa os cinco estados.
Depois de atualizar todos os consumidores, o frontend deve abandonar
`VisitStopStatus = 'concluida' | 'pendente'`.

Cada comando de transição devolve também `routeProgress` e publica a atualização
para o frontend. O mapa nunca deve inferir estado a partir de campos do
formulário; ele usa a resposta canônica do servidor.

O `DELETE /api/roteiros/:id` atual não deve apagar roteiro que já possua
tratativa, check-in, histórico ou notificação. Nesses casos, deve virar
cancelamento auditado; exclusão física só é permitida para rascunho sem
atividade.
