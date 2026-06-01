const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface CommercialStructureItem {
  chave: number;
  descricao: string;
}

async function fetchList(path: string): Promise<CommercialStructureItem[]> {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha na API de estrutura comercial (${response.status})`);
  }
  const data = (await response.json()) as { items?: CommercialStructureItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

export function fetchGerenciasArea() {
  return fetchList('/api/estrutura/gerencias-area');
}

export function fetchCoordenacoes(chaveGerenciaArea: number) {
  return fetchList(`/api/estrutura/coordenacoes?chaveGerenciaArea=${Math.round(chaveGerenciaArea)}`);
}

export function fetchSupervisoes(chaveCoordenacao: number) {
  return fetchList(`/api/estrutura/supervisoes?chaveCoordenacao=${Math.round(chaveCoordenacao)}`);
}
