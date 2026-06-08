/**
 * Lazy-loader e cache do GeoJSON com a área de atuação geográfica de cada supervisão.
 *
 * O arquivo é servido estaticamente em `/geo/areas_atuacao_supervisoes.geojson` e
 * só é baixado/parseado quando algum consumidor pedir a primeira supervisão.
 * Chamadas concorrentes compartilham a mesma Promise para evitar fetches duplicados.
 */

const SUPERVISION_AREAS_URL = '/geo/areas_atuacao_supervisoes.geojson';

export interface SupervisionAreasIndex {
  /**
   * Retorna a feature (polígono/multipolígono) da supervisão pela `chave_supervisao`.
   * Aceita number ou string; normaliza removendo zeros à esquerda para casar com a
   * chave numérica vinda dos markers (`properties.chave_entidade`).
   */
  getByChave: (chave: string | number | null | undefined) => GeoJSON.Feature | null;
  /**
   * Variante em lote: devolve apenas as features encontradas, preservando a ordem
   * das chaves recebidas. Chaves sem match são silenciosamente ignoradas.
   */
  getManyByChaves: (
    chaves: Array<string | number | null | undefined>
  ) => GeoJSON.Feature[];
  /** Quantidade total de supervisões carregadas (útil para diagnóstico). */
  size: number;
}

let cachedIndexPromise: Promise<SupervisionAreasIndex> | null = null;

function normalizeChaveSupervisao(value: string | number | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(Math.trunc(value));
  }
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return String(Math.trunc(numeric));
  return trimmed;
}

function buildIndex(fc: GeoJSON.FeatureCollection): SupervisionAreasIndex {
  const map = new Map<string, GeoJSON.Feature>();
  for (const feature of fc.features) {
    if (!feature?.properties) continue;
    const raw = (feature.properties as { chave_supervisao?: string | number })
      .chave_supervisao;
    const key = normalizeChaveSupervisao(raw);
    if (!key) continue;
    map.set(key, feature);
  }

  return {
    size: map.size,
    getByChave(chave) {
      const key = normalizeChaveSupervisao(chave);
      if (!key) return null;
      return map.get(key) ?? null;
    },
    getManyByChaves(chaves) {
      const out: GeoJSON.Feature[] = [];
      for (const chave of chaves) {
        const key = normalizeChaveSupervisao(chave);
        if (!key) continue;
        const feature = map.get(key);
        if (feature) out.push(feature);
      }
      return out;
    },
  };
}

/**
 * Carrega o GeoJSON (uma única vez, cache em memória) e devolve um índice
 * pronto para lookup por `chave_supervisao`. Em caso de falha de rede ou parse,
 * o cache é invalidado para permitir uma nova tentativa em um clique futuro.
 */
export function loadSupervisionAreas(): Promise<SupervisionAreasIndex> {
  if (cachedIndexPromise) return cachedIndexPromise;

  cachedIndexPromise = (async () => {
    const response = await fetch(SUPERVISION_AREAS_URL, { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(
        `Falha ao carregar ${SUPERVISION_AREAS_URL}: HTTP ${response.status}`
      );
    }
    const fc = (await response.json()) as GeoJSON.FeatureCollection;
    if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
      throw new Error('GeoJSON de áreas de supervisão inválido');
    }
    return buildIndex(fc);
  })().catch((err) => {
    cachedIndexPromise = null;
    throw err;
  });

  return cachedIndexPromise;
}
