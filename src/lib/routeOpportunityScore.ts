import { OPPORTUNITY_DEFINITIONS, type OpportunitySnapshot } from '@/data/opportunities';

/**
 * Ranking inteligente de oportunidades do roteiro.
 *
 * Ordena as lojas em dois níveis:
 * 1. Tier (regra dura): Alerta/Atenção sempre antes de Ótimo.
 * 2. Score contínuo (0-100) dentro de cada tier, combinando classificação,
 *    proximidade da rota, potencial de reativação e foco estratégico do canal.
 */

export type OpportunityPriorityBand = 'alta' | 'media' | 'baixa';

/** Velocidade média assumida para converter desvio em km para minutos. */
const AVERAGE_SPEED_KMH = 40;

/** Desvio (km) a partir do qual a pontuação de proximidade zera. */
const MAX_DETOUR_KM = 15;

const WEIGHT_BAND = 30;
const WEIGHT_PROXIMITY = 35;
const WEIGHT_REACTIVATION = 20;
const WEIGHT_STRATEGIC = 15;

const REACTIVATION_POINTS = { cielo: 8, credito: 8, negocio: 4 } as const;

/** Janela máxima do histórico de reativação (meses anteriores ao M0). */
export const HISTORY_WINDOW_MONTHS = 12;

export interface RouteOpportunityScoreInput extends OpportunitySnapshot {
  /** Desvio adicional (em km) que a loja acrescenta ao trajeto. */
  detourKm: number;
  cieloM0?: boolean | null;
  cieloHistorico?: boolean | null;
  /** Meses desde a última produção Cielo no histórico (1 = mês anterior). */
  cieloHistoricoMeses?: number | null;
  creditoM0?: boolean | null;
  creditoHistorico?: boolean | null;
  creditoHistoricoMeses?: number | null;
  negocioM0?: boolean | null;
  negocioHistorico?: boolean | null;
  negocioHistoricoMeses?: number | null;
}

export interface RouteOpportunityScore {
  /** 0 = Alerta/Atenção (prioritário), 1 = Ótimo (só se sobrar). */
  tier: 0 | 1;
  /** Pontuação contínua 0-100 dentro do tier. */
  score: number;
  band: OpportunityPriorityBand;
  /** Rótulos curtos explicando a sugestão, para exibição nos cards. */
  reasons: string[];
}

export function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Desvio adicional (km) que a visita à loja acrescenta ao trajeto
 * origem -> destino: dist(origem, loja) + dist(loja, destino) - dist(origem, destino).
 * Sem destino (ex.: território por raio), usa apenas a distância da origem.
 */
export function computeRouteDetourKm(
  storeLngLat: [number, number],
  origin: [number, number] | null,
  destination: [number, number] | null
): number {
  if (!origin && !destination) return 0;
  if (origin && destination) {
    const detour = distanceKm(origin, storeLngLat) +
      distanceKm(storeLngLat, destination) -
      distanceKm(origin, destination);
    return Math.max(0, detour);
  }
  const anchor = (origin ?? destination) as [number, number];
  return distanceKm(anchor, storeLngLat);
}

/** Converte o desvio em km para minutos estimados de deslocamento extra. */
export function detourKmToMinutes(detourKm: number): number {
  return Math.max(0, Math.round((detourKm / AVERAGE_SPEED_KMH) * 60));
}

export function completedPillarCount(snapshot: OpportunitySnapshot): number {
  return OPPORTUNITY_DEFINITIONS.filter((item) => snapshot[item.field]).length;
}

export function opportunityPriorityBand(snapshot: OpportunitySnapshot): OpportunityPriorityBand {
  const completed = completedPillarCount(snapshot);
  if (completed <= 2) return 'alta';
  if (completed <= 4) return 'media';
  return 'baixa';
}

/**
 * Peso de recência do histórico (linear agressivo).
 * m = 1 (mês anterior) → 1; m = 6 → ≈0,545; m = 12 → 0.
 * Usa só o mês da última produção na janela de 12 meses.
 */
export function historyRecencyWeight(monthsAgo: number | null | undefined): number {
  if (monthsAgo == null || !Number.isFinite(monthsAgo)) return 0;
  const m = Math.trunc(monthsAgo);
  if (m < 1 || m > HISTORY_WINDOW_MONTHS) return 0;
  return (HISTORY_WINDOW_MONTHS - m) / (HISTORY_WINDOW_MONTHS - 1);
}

/**
 * Resolve o peso de um pilar: prefere meses informados; se só houver flag
 * booleana de histórico (cache antigo), assume peso cheio.
 */
function reactivationWeight(
  monthsAgo: number | null | undefined,
  historico: boolean | null | undefined
): number {
  if (monthsAgo != null && Number.isFinite(monthsAgo)) {
    return historyRecencyWeight(monthsAgo);
  }
  return historico === true ? 1 : 0;
}

export function scoreRouteOpportunity(input: RouteOpportunityScoreInput): RouteOpportunityScore {
  const band = opportunityPriorityBand(input);
  const reasons: string[] = [];

  // 1. Classificação (peso 30): quanto menos pilares cumpridos, mais pontos.
  const bandScore = band === 'alta' ? WEIGHT_BAND : band === 'media' ? 18 : 0;

  // 2. Proximidade da rota (peso 35): decai linearmente com o desvio em km.
  const detourKm = Math.max(0, input.detourKm);
  const proximityScore = WEIGHT_PROXIMITY * Math.max(0, 1 - detourKm / MAX_DETOUR_KM);
  if (detourKm <= 2) reasons.push('No caminho');
  else if (detourKm <= 6) reasons.push('Desvio curto');

  // 3. Reativação (peso 20): produziu no passado, não no M0; pontos × recência.
  let reactivationScore = 0;
  if (input.cieloM0 === false) {
    const w = reactivationWeight(input.cieloHistoricoMeses, input.cieloHistorico);
    if (w > 0) {
      reactivationScore += REACTIVATION_POINTS.cielo * w;
      reasons.push('Reativar Cielo');
    }
  }
  if (input.creditoM0 === false) {
    const w = reactivationWeight(input.creditoHistoricoMeses, input.creditoHistorico);
    if (w > 0) {
      reactivationScore += REACTIVATION_POINTS.credito * w;
      reasons.push('Reativar Crédito');
    }
  }
  if (input.negocioM0 === false) {
    const w = reactivationWeight(input.negocioHistoricoMeses, input.negocioHistorico);
    if (w > 0) {
      reactivationScore += REACTIVATION_POINTS.negocio * w;
      reasons.push('Reativar Negócio');
    }
  }
  reactivationScore = Math.min(WEIGHT_REACTIVATION, reactivationScore);

  // 4. Foco estratégico do canal (peso 15): impulsionar crédito em lojas com Cielo.
  const hasCieloPresence = input.cieloM0 === true || input.cieloHistorico === true;
  const strategicScore = input.creditoM0 === false && hasCieloPresence ? WEIGHT_STRATEGIC : 0;
  if (strategicScore > 0) reasons.push('Crédito + Cielo');

  const score = Math.round(bandScore + proximityScore + reactivationScore + strategicScore);
  return {
    tier: band === 'baixa' ? 1 : 0,
    score: Math.max(0, Math.min(100, score)),
    band,
    reasons,
  };
}

/** Comparador para ordenar: tier primeiro (Alerta/Atenção antes de Ótimo), depois score decrescente. */
export function compareRouteOpportunityScores(
  a: RouteOpportunityScore,
  b: RouteOpportunityScore
): number {
  return a.tier - b.tier || b.score - a.score;
}
