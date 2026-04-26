import type {
  ExpressoRegionMetrics,
  MunicipalityProductivityRow,
  ProdutoExpressoId,
} from '@/lib/expressoRegionMock';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

function buildQuery(params: Record<string, string | null | undefined>) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    q.set(key, value);
  }
  const serialized = q.toString();
  return serialized ? `?${serialized}` : '';
}

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const detail = error instanceof Error ? ` Detalhe: ${error.message}` : '';
    throw new Error(`Não foi possível conectar à API Expresso (${url}).${detail}`);
  }
  if (!response.ok) {
    throw new Error(`Falha na API Expresso (${response.status}).`);
  }
  return (await response.json()) as T;
}

export async function fetchExpressoStateMetrics(
  ufSigla: string,
  codIbge?: number | null
): Promise<ExpressoRegionMetrics | null> {
  const query = buildQuery({
    ufSigla: ufSigla.toUpperCase(),
    codIbge: codIbge == null ? null : String(codIbge),
  });
  const data = await fetchJson<{ metrics?: ExpressoRegionMetrics | null }>(`/api/expresso/state-metrics${query}`);
  return data.metrics ?? null;
}

export async function fetchExpressoProductivityRows(options: {
  produtoId: ProdutoExpressoId;
  scope: 'estado' | 'municipio';
  ufSigla?: string | null;
}): Promise<MunicipalityProductivityRow[]> {
  const query = buildQuery({
    produtoId: options.produtoId,
    scope: options.scope,
    ufSigla: options.ufSigla?.toUpperCase() ?? null,
  });
  const data = await fetchJson<{ rows?: MunicipalityProductivityRow[] }>(
    `/api/expresso/productivity-rows${query}`
  );
  return Array.isArray(data.rows) ? data.rows : [];
}
