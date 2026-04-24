import type { MarcadorMapa } from '@/data/commercialStructureMock';
import { format, subDays, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';

type GeoJSONPosition = [number, number];

export type ProdutoExpressoId = 'consignado' | 'lime' | 'contas' | 'seguros';

export type ProdutoStatusSemantico = 'critico' | 'atencao' | 'saudavel';

export type PeriodoEvolucaoId = '7d' | '30d' | '3m' | '12m';

export interface EvolucaoChartPoint {
  label: string;
  atualMil: number;
  anteriorMil: number;
}

export interface SubprodutoExpresso {
  id: string;
  nome: string;
  lojas: number;
  producaoMes: number;
  /** Ex.: "Vlr. Contrato" — coluna de valor no Consignado */
  valorLegenda?: string;
  /** Ex.: "Qtd. Contrato" / "Qtd. Averbada" */
  quantidadeLegenda?: string;
  quantidade?: number;
}

export interface ProdutoExpressoResumo {
  id: ProdutoExpressoId;
  nome: string;
  variacaoPct: number;
  lojas: number;
  lojasAtivas: number;
  producaoMes: number;
  /** Participação na produção total da região (%) */
  participacaoPct: number;
  statusSemantico: ProdutoStatusSemantico;
  insightDestaque: string;
  evolucaoPorPeriodo: Record<PeriodoEvolucaoId, EvolucaoChartPoint[]>;
  subprodutos: SubprodutoExpresso[];
}

export interface ExpressoRegionMetrics {
  agencias: number;
  pas: number;
  pracasPresencas: number;
  lojas: number;
  lojasAtivas: number;
  produtos: ProdutoExpressoResumo[];
}

function zeroEvolucaoSeries(len: number): EvolucaoChartPoint[] {
  return Array.from({ length: len }, () => ({
    label: '—',
    atualMil: 0,
    anteriorMil: 0,
  }));
}

/** Fallback quando ainda não há métricas da região (tipagem alinhada a `ProdutoExpressoResumo`). */
export function emptyProdutoExpressoResumo(id: ProdutoExpressoId, nome: string): ProdutoExpressoResumo {
  return {
    id,
    nome,
    variacaoPct: 0,
    lojas: 0,
    lojasAtivas: 0,
    producaoMes: 0,
    participacaoPct: 0,
    statusSemantico: 'saudavel',
    insightDestaque: 'Selecione um estado no mapa para carregar o desempenho por produto.',
    evolucaoPorPeriodo: {
      '7d': zeroEvolucaoSeries(7),
      '30d': zeroEvolucaoSeries(6),
      '3m': zeroEvolucaoSeries(6),
      '12m': zeroEvolucaoSeries(6),
    },
    subprodutos: [],
  };
}

export interface MunicipalityProductivityRow {
  municipio: string;
  lojas: number;
  producaoMes: number;
  variacaoPct: number;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function seededRange(seed: string, salt: number, min: number, max: number): number {
  const n = hashStr(`${seed}:${salt}`);
  return min + (n % (max - min + 1));
}

function pointInRing(point: GeoJSONPosition, ring: GeoJSONPosition[]): boolean {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: GeoJSONPosition, polygon: GeoJSONPosition[][]): boolean {
  if (polygon.length === 0) return false;
  if (!pointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(point, polygon[i])) return false;
  }
  return true;
}

function pointInGeometry(point: GeoJSONPosition, geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(point, geometry.coordinates as GeoJSONPosition[][]);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) => pointInPolygon(point, poly as GeoJSONPosition[][]));
  }
  return false;
}

function markersInState(markers: MarcadorMapa[], stateFeature: GeoJSON.Feature | null): MarcadorMapa[] {
  if (!stateFeature?.geometry) return [];
  return markers.filter((m) => pointInGeometry(m.lngLat, stateFeature.geometry as GeoJSON.Geometry));
}

/** Linhas de negócio exibidas em “Detalhe — subprodutos” para Seguros. */
const SEGUROS_SUBNOMES = [
  'Microsseguro',
  'Vida Viva',
  'Seguro Residencial',
  'Sorte Expressa',
  'Dental',
  'Seg. Débito',
  'Super Protegido',
] as const;

function deriveStatusSemantico(variacaoPct: number, participacaoPct: number): ProdutoStatusSemantico {
  if (variacaoPct <= -8 || (variacaoPct <= -4 && participacaoPct >= 28)) return 'critico';
  if (variacaoPct < 0) return 'atencao';
  return 'saudavel';
}

function deriveInsightDestaque(p: {
  nome: string;
  variacaoPct: number;
  participacaoPct: number;
  statusSemantico: ProdutoStatusSemantico;
}): string {
  const { nome, variacaoPct, participacaoPct, statusSemantico } = p;
  if (statusSemantico === 'critico' && variacaoPct < 0) {
    const impacto = Math.min(95, Math.max(12, Math.round(participacaoPct * 0.85)));
    return `Queda relevante na produção de ${nome}, impactando cerca de ${impacto}% da retração total da região.`;
  }
  if (statusSemantico === 'atencao' && variacaoPct < 0) {
    return `${nome} recua frente ao mês anterior, mas ainda concentra ${participacaoPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da produção regional — vale monitorar lojas com maior contribuição negativa.`;
  }
  if (variacaoPct > 0) {
    return `${nome} avança ${Math.abs(variacaoPct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs. período anterior, reforçando ${participacaoPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da produção da região.`;
  }
  return `${nome} está estável em relação ao período anterior, com participação de ${participacaoPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% na região.`;
}

function buildEvolucaoPorPeriodo(
  seedKey: string,
  salt: number,
  producaoMes: number,
  variacaoPct: number
): Record<PeriodoEvolucaoId, EvolucaoChartPoint[]> {
  const atualEnd = Math.max(0.05, producaoMes / 1000);
  const ratio = 1 + variacaoPct / 100;
  const anteriorEnd = Math.max(0.05, atualEnd / (Math.abs(ratio) < 0.02 ? 0.02 : ratio));

  const mk = (len: number, labelAt: (idx: number) => string): EvolucaoChartPoint[] => {
    const out: EvolucaoChartPoint[] = [];
    for (let i = 0; i < len; i += 1) {
      const t = len === 1 ? 1 : i / (len - 1);
      const wobble = (seededRange(seedKey, salt * 47 + i * 3, -18, 18) / 100) * 0.12;
      const pathA = atualEnd * (0.78 + 0.22 * t + wobble);
      const pathB = anteriorEnd * (0.82 + 0.18 * t + wobble * 0.65);
      out.push({
        label: labelAt(i),
        atualMil: Math.max(0, Math.round(pathA * 10) / 10),
        anteriorMil: Math.max(0, Math.round(pathB * 10) / 10),
      });
    }
    out[len - 1] = {
      label: out[len - 1].label,
      atualMil: Math.round(atualEnd * 10) / 10,
      anteriorMil: Math.round(anteriorEnd * 10) / 10,
    };
    return out;
  };

  const ref = new Date();

  return {
    '7d': mk(7, (i) => format(subDays(ref, 6 - i), 'dd/MMM', { locale: ptBR })),
    '30d': mk(6, (i) => format(subDays(ref, 30 - i * 6), 'dd/MMM', { locale: ptBR })),
    '3m': mk(6, (i) => format(subDays(ref, 90 - i * 18), 'dd/MMM', { locale: ptBR })),
    '12m': mk(6, (i) => format(subMonths(ref, (5 - i) * 2), "MMM ''yy", { locale: ptBR })),
  };
}

function buildProdutos(seed: string, lojas: number, producaoRegional: number): ProdutoExpressoResumo[] {
  const ids: ProdutoExpressoId[] = ['consignado', 'lime', 'contas', 'seguros'];
  const weights = ids.map((_, i) => 18 + seededRange(seed, 10 + i, 0, 24));
  const totalW = weights.reduce((a, b) => a + b, 0);

  let remLojas = lojas;
  let remProd = producaoRegional;

  const raw = ids.map((id, i) => {
    const isLast = i === ids.length - 1;
    const lojasP = isLast ? remLojas : Math.max(0, Math.round((lojas * weights[i]) / totalW));
    const prodP = isLast ? remProd : Math.max(0, Math.round((producaoRegional * weights[i]) / totalW));
    if (!isLast) {
      remLojas -= lojasP;
      remProd -= prodP;
    }

    const variacaoPct = (seededRange(seed, 40 + i, -140, 180) / 10) - 2;
    const nome =
      id === 'consignado'
        ? 'Consignado'
        : id === 'lime'
          ? 'Lime'
          : id === 'contas'
            ? 'Contas'
            : 'Seguros';

    let subprodutos: SubprodutoExpresso[] = [];

    if (id === 'consignado') {
      const share = (52 + seededRange(seed, 200, 0, 12)) / 100;
      const lojasA = Math.max(0, Math.min(lojasP, Math.round(lojasP * share)));
      const lojasB = lojasP - lojasA;
      const prodA = Math.max(0, Math.round(prodP * share));
      const prodB = prodP - prodA;
      const qtdContrato = Math.max(0, Math.round(prodA / Math.max(250, seededRange(seed, 410, 300, 950))));
      const qtdAverbada = Math.max(0, Math.round(prodB / Math.max(250, seededRange(seed, 420, 300, 950))));
      subprodutos = [
        {
          id: 'consignado-contrato',
          nome: 'Consignado',
          lojas: lojasA,
          producaoMes: prodA,
          valorLegenda: 'Vlr. Contrato',
          quantidadeLegenda: 'Qtd. Contrato',
          quantidade: qtdContrato,
        },
        {
          id: 'consignado-averbado',
          nome: 'Consignado',
          lojas: lojasB,
          producaoMes: prodB,
          valorLegenda: 'Vlr. Averbado',
          quantidadeLegenda: 'Qtd. Averbada',
          quantidade: qtdAverbada,
        },
      ];
    } else if (id === 'lime' || id === 'contas') {
      subprodutos = [];
    } else {
      const subCount = SEGUROS_SUBNOMES.length;
      let remSubL = lojasP;
      let remSubP = prodP;
      subprodutos = SEGUROS_SUBNOMES.map((nome, j) => {
        const last = j === subCount - 1;
        const baseL = Math.floor(lojasP / subCount);
        const sj = last ? remSubL : Math.max(0, baseL + seededRange(seed, 80 + i * 10 + j, 0, 1));
        const baseP = Math.floor(prodP / subCount);
        const pj = last ? remSubP : Math.max(0, baseP + seededRange(seed, 120 + i * 10 + j, -600, 900));
        if (!last) {
          remSubL -= sj;
          remSubP -= pj;
        }
        return {
          id: `seguros-sub-${j}`,
          nome,
          lojas: Math.max(0, sj),
          producaoMes: Math.max(0, pj),
        };
      });
    }

    const lojasAtivasP = Math.max(
      0,
      Math.min(lojasP, Math.round(lojasP * (0.68 + seededRange(seed, 250 + i, 0, 28) / 100)))
    );
    const evolucaoPorPeriodo = buildEvolucaoPorPeriodo(`${seed}:${id}`, i, prodP, Math.round(variacaoPct * 10) / 10);

    return {
      id,
      nome,
      variacaoPct: Math.round(variacaoPct * 10) / 10,
      lojas: lojasP,
      lojasAtivas: lojasAtivasP,
      producaoMes: prodP,
      participacaoPct: 0,
      statusSemantico: 'saudavel',
      insightDestaque: '',
      evolucaoPorPeriodo,
      subprodutos,
    };
  });

  const totalProd = raw.reduce((s, p) => s + p.producaoMes, 0) || 1;

  return raw.map((p) => {
    const participacaoPct = Math.round((p.producaoMes / totalProd) * 1000) / 10;
    const statusSemantico = deriveStatusSemantico(p.variacaoPct, participacaoPct);
    const insightDestaque = deriveInsightDestaque({
      nome: p.nome,
      variacaoPct: p.variacaoPct,
      participacaoPct,
      statusSemantico,
    });
    return { ...p, participacaoPct, statusSemantico, insightDestaque };
  });
}

export function buildExpressoRegionMetrics(
  markers: MarcadorMapa[],
  stateFeature: GeoJSON.Feature | null
): ExpressoRegionMetrics | null {
  if (!stateFeature?.geometry) return null;

  const inState = markersInState(markers, stateFeature);
  const sigla =
    String(
      stateFeature.properties?.sigla ??
        stateFeature.properties?.code_hasc ??
        stateFeature.properties?.id ??
        'UF'
    ).toUpperCase() || 'UF';

  const agencias = inState.filter((m) => m.kind === 'agencia').length;
  const pas = Math.max(0, Math.round(agencias * 0.62));
  const pracasPresencas = Math.max(0, agencias - pas);
  const lojas = agencias;
  const lojasAtivas = Math.max(0, Math.min(lojas, Math.round(lojas * (0.72 + seededRange(sigla, 2, 0, 18) / 100))));
  const base = Math.max(1, agencias * 42 + inState.filter((m) => m.kind === 'pessoa').length * 18);
  const producaoRegional = base * (800 + seededRange(sigla, 1, 0, 400));

  return {
    agencias,
    pas,
    pracasPresencas,
    lojas,
    lojasAtivas,
    produtos: buildProdutos(sigla, lojas, producaoRegional),
  };
}

export function buildMunicipalityProductivityRows(
  productId: ProdutoExpressoId,
  municipalityNames: string[]
): MunicipalityProductivityRow[] {
  const fallback = municipalityNames.length > 0 ? municipalityNames : ['Município foco'];
  const rows = fallback.map((municipio) => {
    const seed = `${productId}:${municipio}`;
    const lojas = seededRange(seed, 1, 0, 12);
    const producaoMes = seededRange(seed, 2, 40_000, 1_100_000);
    const variacaoPct = seededRange(seed, 3, -180, 220) / 10;
    return {
      municipio,
      lojas,
      producaoMes,
      variacaoPct: Math.round(variacaoPct * 10) / 10,
    };
  });

  return rows.sort((a, b) => b.producaoMes - a.producaoMes);
}
