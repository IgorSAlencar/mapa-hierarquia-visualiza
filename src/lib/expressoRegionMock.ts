import type { MarcadorMapa } from '@/data/commercialStructureMock';

type GeoJSONPosition = [number, number];

export type ProdutoExpressoId = 'consignado' | 'lime' | 'contas' | 'seguros';

export interface SubprodutoExpresso {
  id: string;
  nome: string;
  lojas: number;
  producaoMes: number;
  /** Ex.: "Vlr. Contrato" — coluna de valor no Consignado */
  valorLegenda?: string;
}

export interface ProdutoExpressoResumo {
  id: ProdutoExpressoId;
  nome: string;
  variacaoPct: number;
  lojas: number;
  producaoMes: number;
  subprodutos: SubprodutoExpresso[];
}

export interface ExpressoRegionMetrics {
  agencias: number;
  lojas: number;
  produtos: ProdutoExpressoResumo[];
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

const SEGUROS_SUBNOMES = ['Vida', 'Residencial', 'Acidentes pessoais'] as const;

function buildProdutos(seed: string, lojas: number, producaoRegional: number): ProdutoExpressoResumo[] {
  const ids: ProdutoExpressoId[] = ['consignado', 'lime', 'contas', 'seguros'];
  const weights = ids.map((_, i) => 18 + seededRange(seed, 10 + i, 0, 24));
  const totalW = weights.reduce((a, b) => a + b, 0);

  let remLojas = lojas;
  let remProd = producaoRegional;

  return ids.map((id, i) => {
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
      subprodutos = [
        {
          id: 'consignado-priv',
          nome: 'Consignado privado',
          lojas: lojasA,
          producaoMes: prodA,
          valorLegenda: 'Vlr. Contrato',
        },
        {
          id: 'consignado-cartao',
          nome: 'Cartão benefício',
          lojas: lojasB,
          producaoMes: prodB,
          valorLegenda: 'Vlr. Averbado',
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

    return {
      id,
      nome,
      variacaoPct: Math.round(variacaoPct * 10) / 10,
      lojas: lojasP,
      producaoMes: prodP,
      subprodutos,
    };
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
  const lojas = agencias;
  const base = Math.max(1, agencias * 42 + inState.filter((m) => m.kind === 'pessoa').length * 18);
  const producaoRegional = base * (800 + seededRange(sigla, 1, 0, 400));

  return {
    agencias,
    lojas,
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
