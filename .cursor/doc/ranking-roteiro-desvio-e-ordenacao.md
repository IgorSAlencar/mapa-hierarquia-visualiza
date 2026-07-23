# Ranking inteligente do roteiro: desvio e ordenação

Documento de referência do cálculo geométrico de desvio e da ordenação das oportunidades no planejador de roteiro.

**Código-fonte principal:** [`src/lib/routeOpportunityScore.ts`](../../src/lib/routeOpportunityScore.ts)  
**Integração na UI:** [`src/components/navigator/RoutePlannerPanel.tsx`](../../src/components/navigator/RoutePlannerPanel.tsx)

---

## 1. Visão geral

O sistema sugere lojas ao longo de um trajeto **origem → destino**. A sugestão não é aleatória: cada loja recebe:

1. um **desvio adicional** (quanto a visita “esticaria” o caminho);
2. uma **classificação comercial** (Alerta / Atenção / Ótimo) com base nos 5 pilares;
3. um **score contínuo** (0–100) que combina proximidade, reativação e foco do canal;
4. uma **posição na lista** determinada por um ordenamento em dois níveis (tier + score).

A prioridade padrão do planejamento é `inteligente` (“Sugestão inteligente”). As demais (`potencial`, `sem_visita`, `deslocamento`, `alertas`, `equilibrado`) usam outra função de score e não seguem as regras abaixo.

---

## 2. Distância entre dois pontos (Haversine)

Todas as distâncias em quilômetros usam a fórmula de **Haversine** sobre a esfera terrestre, com raio médio \(R = 6371\) km.

Sejam dois pontos \(A = (\lambda_A, \varphi_A)\) e \(B = (\lambda_B, \varphi_B)\), onde \(\lambda\) é longitude e \(\varphi\) é latitude, ambos em **graus**.

Conversão para radianos:

\[
\varphi' = \varphi \cdot \frac{\pi}{180}, \quad
\lambda' = \lambda \cdot \frac{\pi}{180}
\]

Diferenças:

\[
\Delta\varphi = \varphi'_B - \varphi'_A, \quad
\Delta\lambda = \lambda'_B - \lambda'_A
\]

Haversine intermediário:

\[
h = \sin^2\!\left(\frac{\Delta\varphi}{2}\right)
+ \cos(\varphi'_A)\,\cos(\varphi'_B)\,\sin^2\!\left(\frac{\Delta\lambda}{2}\right)
\]

Distância:

\[
d(A,B) = 2\,R\,\arcsin\!\big(\sqrt{h}\big)
\]

No código: função `distanceKm(a, b)`, com coordenadas no formato Mapbox `[lng, lat]`.

> **Observação:** essa distância é **linha reta geodésica** (grande círculo), não distância rodoviária. O desvio e o tempo estimado são, portanto, aproximações geométricas — suficientes para ranquear “quem está mais no caminho”, sem chamar Directions a cada loja candidata.

---

## 3. Cálculo do desvio (detour)

### 3.1 Ideia geométrica

Considere o trajeto direto:

\[
O \xrightarrow{\text{direto}} D
\]

e o trajeto com parada na loja \(L\):

\[
O \rightarrow L \rightarrow D
\]

O **desvio adicional** (em km) é quanto o caminho via \(L\) é maior que o caminho direto:

\[
\delta(L) = d(O,L) + d(L,D) - d(O,D)
\]

Propriedades:

- \(\delta(L) \ge 0\) (desigualdade triangular na esfera, aproximada; no código aplica-se `Math.max(0, …)`).
- Se \(L\) estiver **sobre o segmento** \(OD\) (no sentido geodésico), \(\delta(L) \approx 0\).
- Quanto mais \(L\) “sai do caminho”, maior \(\delta(L)\).

Interpretação prática: \(\delta\) mede o **custo extra de deslocamento** de incluir a loja no roteiro, não a distância absoluta até a origem.

### 3.2 Casos especiais

| Situação | Fórmula usada |
| --- | --- |
| Origem e destino definidos | \(\delta = d(O,L)+d(L,D)-d(O,D)\) |
| Só origem (ex.: território por raio, sem ponto \(D\)) | \(\delta = d(O,L)\) |
| Só destino | \(\delta = d(D,L)\) |
| Sem origem e sem destino | \(\delta = 0\) |

Implementação: `computeRouteDetourKm(storeLngLat, origin, destination)`.

### 3.3 Conversão para minutos (`deviationMinutes`)

Para exibir “+X min” nos cards, o desvio em km é convertido com velocidade média constante:

\[
v = 40\ \text{km/h}
\]

\[
t_{\text{min}} = \operatorname{round}\!\left(\frac{\delta}{v}\cdot 60\right)
= \operatorname{round}\!\left(\delta \cdot 1{,}5\right)
\]

Exemplos:

| \(\delta\) (km) | Minutos extras |
| ---: | ---: |
| 0 | 0 |
| 2 | 3 |
| 6 | 9 |
| 10 | 15 |
| 15 | 23 |

Função: `detourKmToMinutes`.

> O valor em minutos é **apenas para UI**. O score de proximidade usa \(\delta\) em **quilômetros**.

### 3.4 Diagrama do desvio

```text
        L  (loja fora do caminho)
       / \
      /   \
     /     \
    O───────D   trajeto direto
```

\[
\delta = \underbrace{OL + LD}_{\text{via loja}} - \underbrace{OD}_{\text{direto}}
\]

---

## 4. Classificação por pilares (Alerta / Atenção / Ótimo)

Os cinco pilares comerciais da loja no mês atual (M0) são:

1. Cielo  
2. Crédito  
3. Negócio  
4. Ativo PADE  
5. Proposta de Valor  

Seja \(p\) o número de pilares **cumpridos** (flag verdadeira), \(0 \le p \le 5\).

| \(p\) | Faixa | Label na UI | Código interno (`band`) |
| ---: | --- | --- | --- |
| 0, 1 ou 2 | Alerta | Alerta | `alta` |
| 3 ou 4 | Atenção | Atenção | `media` |
| 5 | Ótimo | Ótimo | `baixa` |

Funções: `completedPillarCount`, `opportunityPriorityBand`.

**Regra de negócio:** a recomendação deve priorizar lojas em Alerta/Atenção. Ótimo só entra “se sobrar”.

---

## 5. Score contínuo (0–100)

O score é a soma de quatro componentes com pesos fixos:

\[
S = S_{\text{band}} + S_{\text{prox}} + S_{\text{reat}} + S_{\text{estrat}}
\]

depois limitado a \([0, 100]\) e arredondado:

\[
S_{\text{final}} = \operatorname{clamp}\!\big(\operatorname{round}(S),\, 0,\, 100\big)
\]

Pesos máximos:

| Componente | Peso máximo | Constante |
| --- | ---: | --- |
| Classificação | 30 | `WEIGHT_BAND` |
| Proximidade da rota | 35 | `WEIGHT_PROXIMITY` |
| Reativação | 20 | `WEIGHT_REACTIVATION` |
| Foco estratégico | 15 | `WEIGHT_STRATEGIC` |
| **Total** | **100** | |

### 5.1 Classificação — \(S_{\text{band}}\)

\[
S_{\text{band}} =
\begin{cases}
30 & \text{se Alerta (band = alta)} \\
18 & \text{se Atenção (band = media)} \\
0  & \text{se Ótimo (band = baixa)}
\end{cases}
\]

Quanto **menos** pilares cumpridos, **mais** pontos. Isso empurra Alerta acima de Atenção dentro do mesmo tier (ver §6).

### 5.2 Proximidade — \(S_{\text{prox}}\)

Decaimento linear com o desvio até um teto \(\delta_{\max} = 15\) km:

\[
S_{\text{prox}} = 35 \cdot \max\!\left(0,\; 1 - \frac{\delta}{15}\right)
\]

Comportamento:

| \(\delta\) (km) | \(S_{\text{prox}}\) |
| ---: | ---: |
| 0 | 35,00 |
| 2 | 30,33 |
| 5 | 23,33 |
| 7,5 | 17,50 |
| 10 | 11,67 |
| 15 | 0 |
| > 15 | 0 |

Motivos (`reasons`) associados:

- \(\delta \le 2\) → `"No caminho"`
- \(2 < \delta \le 6\) → `"Desvio curto"`

### 5.3 Reativação — \(S_{\text{reat}}\)

Uma loja “reativável” em um pilar é aquela que **teve produção em meses anteriores** (histórico = true nos últimos 12 meses, excluindo o mês atual) e **não tem no mês atual** (M0 = false).

Pontos por pilar:

\[
\begin{align*}
\text{Cielo}   &\to +8 \\
\text{Crédito} &\to +8 \\
\text{Negócio} &\to +4
\end{align*}
\]

Soma bruta limitada ao peso máximo:

\[
S_{\text{reat}} = \min\!\big(20,\; 8\cdot\mathbb{1}_{\text{cielo}} + 8\cdot\mathbb{1}_{\text{credito}} + 4\cdot\mathbb{1}_{\text{negocio}}\big)
\]

onde \(\mathbb{1}\) vale 1 se a condição de reativação daquele pilar for verdadeira.

Máximo teórico da soma bruta = \(8+8+4 = 20\), portanto o teto `min(20, …)` em geral não corta — existe como salvaguarda.

Motivos:

- `"Reativar Cielo"`, `"Reativar Crédito"`, `"Reativar Negócio"` conforme o caso.

Históricos no backend: `CIELO_HISTORICO`, `CREDITO_HISTORICO`, `NEGOCIO_HISTORICO` (subqueries sobre `DATAWAREHOUSE..TB_INDICADORES_BE`, janela de 12 meses anteriores ao mês corrente).

### 5.4 Foco estratégico do canal — \(S_{\text{estrat}}\)

Prioridade do canal: **impulsionar Crédito em lojas com presença Cielo**.

Condição:

\[
\text{creditoM0} = \text{false}
\quad\text{e}\quad
\big(\text{cieloM0} = \text{true}\ \vee\ \text{cieloHistorico} = \text{true}\big)
\]

\[
S_{\text{estrat}} =
\begin{cases}
15 & \text{se a condição acima for verdadeira} \\
0  & \text{caso contrário}
\end{cases}
\]

Motivo: `"Crédito + Cielo"`.

### 5.5 Exemplo numérico completo

Loja \(L\):

- pilares cumpridos: 1 → **Alerta** → \(S_{\text{band}} = 30\)
- \(\delta = 3\) km → \(S_{\text{prox}} = 35 \cdot (1 - 3/15) = 35 \cdot 0{,}8 = 28\)
- teve Cielo no passado, sem Cielo M0 → \(+8\)
- teve Crédito no passado, sem Crédito M0 → \(+8\)
- Negócio sem histórico reativável → \(0\)
- \(S_{\text{reat}} = \min(20, 16) = 16\)
- sem Crédito M0 e com histórico Cielo → \(S_{\text{estrat}} = 15\)

\[
S = 30 + 28 + 16 + 15 = 89
\quad\Rightarrow\quad S_{\text{final}} = 89
\]

Reasons: `"Desvio curto"`, `"Reativar Cielo"`, `"Reativar Crédito"`, `"Crédito + Cielo"`.

---

## 6. Ordenação da lista (dois níveis)

### 6.1 Tier (regra dura)

Além do score, cada loja recebe um **tier**:

\[
\text{tier} =
\begin{cases}
0 & \text{se band} \in \{\text{alta},\, \text{media}\} \quad\text{(Alerta ou Atenção)} \\
1 & \text{se band} = \text{baixa} \quad\text{(Ótimo)}
\end{cases}
\]

**Todas** as lojas com `tier = 0` aparecem **antes** de qualquer loja com `tier = 1`, independentemente do score.

Isso formaliza a regra de negócio: *Ótimo só se sobrar*.

### 6.2 Comparador

Para duas lojas \(A\) e \(B\):

1. Comparar `tier` crescente: \(A.\text{tier} - B.\text{tier}\)
2. Se empatar, comparar `score` **decrescente**: \(B.\text{score} - A.\text{score}\)
3. Se ainda empatar, ordenar por nome (`localeCompare` pt-BR)

Implementação: `compareIntelligentSuggestions` no `RoutePlannerPanel` (e `compareRouteOpportunityScores` no módulo de score).

Em notação de ordenação lexicográfica:

\[
(A,B) \prec (A',B')
\quad\text{sse}\quad
(\text{tier},\, -\text{score},\, \text{nome})
\ \text{é lexicograficamente menor}
\]

### 6.3 Exemplo de ordenação

| Loja | Band | Tier | Score | Posição |
| --- | --- | ---: | ---: | ---: |
| L1 | Alerta | 0 | 72 | 1º |
| L2 | Atenção | 0 | 90 | 2º? |
| L3 | Alerta | 0 | 88 | — |
| L4 | Ótimo | 1 | 95 | última faixa |

Ordem correta:

1. L3 (tier 0, score 88)  
2. L1 (tier 0, score 72)  
3. L2 (tier 0, score 90) — **Atenção com score alto ainda perde para Alerta com score maior?** Não: L2 tem 90 > 88, então L2 vem antes de L3 **dentro do mesmo tier**.

Correção:

1. L2 (tier 0, 90)  
2. L3 (tier 0, 88)  
3. L1 (tier 0, 72)  
4. L4 (tier 1, 95) — mesmo com 95, fica depois porque é Ótimo

### 6.4 Fluxo resumido

```text
Pontos SQL (M0 + históricos)
        │
        ▼
toPlannerOpportunity(origem, destino)
        │
        ├─ computeRouteDetourKm  →  δ km  →  minutos (UI)
        │
        └─ scoreRouteOpportunity → { tier, score, band, reasons }
        │
        ▼
rankedSuggestions (priority = inteligente)
        │
        └─ sort por (tier ↑, score ↓, nome ↑)
        │
        ▼
Lista no RouteOpportunitiesSidePanel
  (+ chips de reasons e badges de histórico)
```

---

## 7. O que o desvio **não** é

Para evitar interpretações erradas:

| Conceito | Usado no ranking inteligente? |
| --- | --- |
| Distância ao ponto mais próximo da polilinha rodoviária Mapbox | Não — usa origem/destino como segmento geodésico |
| Tempo real de Directions (trânsito) | Não — velocidade fixa 40 km/h só para exibir minutos |
| Distância até a origem isolada (quando há destino) | Não — usa o detour triangular \(OL+LD-OD\) |
| `daysWithoutVisit` / `alerts` simulados | Não entram no score inteligente |

---

## 8. Constantes de referência (código)

| Constante | Valor | Uso |
| --- | ---: | --- |
| `AVERAGE_SPEED_KMH` | 40 | km → minutos |
| `MAX_DETOUR_KM` | 15 | zera proximidade |
| `WEIGHT_BAND` | 30 | classificação |
| `WEIGHT_PROXIMITY` | 35 | proximidade |
| `WEIGHT_REACTIVATION` | 20 | reativação |
| `WEIGHT_STRATEGIC` | 15 | crédito + cielo |
| Reativação Cielo | 8 | pontos |
| Reativação Crédito | 8 | pontos |
| Reativação Negócio | 4 | pontos |
| Reason “No caminho” | \(\delta \le 2\) | chip |
| Reason “Desvio curto” | \(2 < \delta \le 6\) | chip |

---

## 9. Outras prioridades (fora do ranking inteligente)

Quando a prioridade do planejamento **não** é `inteligente`, a lista usa `priorityScore(store, priority)`:

| Prioridade | Score usado |
| --- | --- |
| `potencial` | `store.potential` (ainda parcialmente derivado de métrica estável/simulada) |
| `sem_visita` | \(\min(100, \text{daysWithoutVisit})\) |
| `alertas` | \(\min(100, \text{alerts}\cdot 30 + 10)\) |
| `deslocamento` | \(\max(0,\, 100 - \text{deviationMinutes}\cdot 3)\) |
| `equilibrado` | \(0{,}35\cdot\text{potential} + 0{,}25\cdot\text{visita} + 0{,}25\cdot\text{alerta} + 0{,}15\cdot\text{distância}\) |

Nesses modos **não** se aplica o tier duro Alerta/Atenção → Ótimo; a ordenação é só pelo score da prioridade escolhida (e nome).

---

*Última atualização alinhada à implementação em `src/lib/routeOpportunityScore.ts`.*
