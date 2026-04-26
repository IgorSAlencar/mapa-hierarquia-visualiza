import {
  fetchLatestGeoRef,
  fetchLatestRefByMunicipality,
  fetchLatestRefByUf,
  fetchMunicipalityProducts,
  fetchMunicipalitySummary,
  fetchProductivityRows,
  fetchStateProducts,
  fetchStateSeries,
  fetchStateSubproducts,
  fetchStateSummary,
} from '../repositories/expressoRepository.js';

const PRODUCT_ORDER = ['consignado', 'lime', 'contas', 'seguros'];
const EMPTY_SERIES = {
  '7d': [],
  '30d': [],
  '3m': [],
  '12m': [],
};

function normalizeStatus(value) {
  if (value === 'critico' || value === 'atencao' || value === 'saudavel') return value;
  return 'saudavel';
}

function normalizePeriodId(value) {
  if (!value) return null;
  const raw = String(value).toLowerCase();
  if (raw === '7d' || raw === '30d' || raw === '3m' || raw === '12m') return raw;
  return null;
}

export async function getExpressoStateMetrics({ ufSigla, codIbge = null }) {
  const uf = String(ufSigla ?? '').trim().toUpperCase();
  if (!uf) return null;

  const ibgeCode =
    codIbge == null || codIbge === '' ? null : Number.parseInt(String(codIbge), 10) || null;
  const isMunicipalityMode = ibgeCode != null;

  const ref = isMunicipalityMode ? await fetchLatestRefByMunicipality(ibgeCode) : await fetchLatestRefByUf(uf);
  if (!ref) return null;

  const [summary, products, subproducts, series] = await Promise.all([
    isMunicipalityMode
      ? fetchMunicipalitySummary(ibgeCode, ref.anoRef, ref.mesRef)
      : fetchStateSummary(uf, ref.anoRef, ref.mesRef),
    isMunicipalityMode
      ? fetchMunicipalityProducts(ibgeCode, ref.anoRef, ref.mesRef)
      : fetchStateProducts(uf, ref.anoRef, ref.mesRef),
    fetchStateSubproducts(uf, ref.anoRef, ref.mesRef),
    fetchStateSeries(uf),
  ]);

  if (!summary || products.length === 0) return null;

  const subByProduct = new Map();
  for (const row of subproducts) {
    const arr = subByProduct.get(row.produtoId) ?? [];
    arr.push({
      id: row.id,
      nome: row.nome,
      lojas: Number(row.lojas) || 0,
      producaoMes: Number(row.producaoMes) || 0,
      valorLegenda: row.valorLegenda ?? undefined,
      quantidadeLegenda: row.quantidadeLegenda ?? undefined,
      quantidade: row.quantidade == null ? undefined : Number(row.quantidade),
    });
    subByProduct.set(row.produtoId, arr);
  }

  const seriesByProduct = new Map();
  for (const row of series) {
    const periodId = normalizePeriodId(row.periodoTipo);
    if (!periodId) continue;
    const productSeries = seriesByProduct.get(row.produtoId) ?? {
      '7d': [],
      '30d': [],
      '3m': [],
      '12m': [],
    };
    productSeries[periodId].push({
      label: row.label,
      atualMil: Number(row.atualMil) || 0,
      anteriorMil: Number(row.anteriorMil) || 0,
    });
    seriesByProduct.set(row.produtoId, productSeries);
  }

  const productMap = new Map(products.map((row) => [row.id, row]));
  const normalizedProducts = PRODUCT_ORDER.map((id) => {
    const row = productMap.get(id);
    if (!row) return null;
    return {
      id,
      nome: row.nome,
      variacaoPct: Number(row.variacaoPct) || 0,
      lojas: Number(row.lojas) || 0,
      lojasAtivas: Number(row.lojasAtivas) || 0,
      producaoMes: Number(row.producaoMes) || 0,
      participacaoPct: Number(row.participacaoPct) || 0,
      statusSemantico: normalizeStatus(row.statusSemantico),
      insightDestaque: row.insightDestaque ?? '',
      evolucaoPorPeriodo: seriesByProduct.get(id) ?? EMPTY_SERIES,
      subprodutos: subByProduct.get(id) ?? [],
    };
  }).filter(Boolean);

  return {
    agencias: Number(summary.agencias) || 0,
    pas: Number(summary.pas) || 0,
    pracasPresencas: Number(summary.pracasPresencas) || 0,
    lojas: Number(summary.lojas) || 0,
    lojasAtivas: Number(summary.lojasAtivas) || 0,
    produtos: normalizedProducts,
  };
}

export async function getExpressoProductivityRows({ produtoId, scope, ufSigla }) {
  const productId = String(produtoId ?? '').trim().toLowerCase();
  const normalizedScope = scope === 'municipio' ? 'municipio' : 'estado';
  const tipoGeo = normalizedScope === 'estado' ? 'UF' : 'MUN';
  const uf = ufSigla ? String(ufSigla).trim().toUpperCase() : null;

  if (!productId) return [];

  const ref = await fetchLatestGeoRef(productId, tipoGeo, normalizedScope === 'municipio' ? uf : null);
  if (!ref) return [];

  const rows = await fetchProductivityRows(
    productId,
    tipoGeo,
    ref.anoRef,
    ref.mesRef,
    normalizedScope === 'municipio' ? uf : null
  );

  return rows.map((row) => ({
    municipio: String(row.municipio ?? ''),
    lojas: Number(row.lojas) || 0,
    producaoMes: Number(row.producaoMes) || 0,
    variacaoPct: Number(row.variacaoPct) || 0,
  }));
}
