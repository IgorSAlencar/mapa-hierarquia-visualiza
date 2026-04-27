/**
 * Dados modelo da escada comercial: Diretoria Regional → … → Supervisor,
 * com agências ligadas a supervisores (cada nível tem coordenadas no Brasil).
 */

export type CargoChave =
  | 'diretoria_regional'
  | 'gerente_regional'
  | 'gerente_area'
  | 'coordenador'
  | 'supervisor';

export interface PessoaEntidade {
  id: string;
  nome: string;
  cargo: CargoChave;
  parentId: string | null;
  /** [lng, lat] */
  lngLat: [number, number];
}

export interface AgenciaEntidade {
  id: string;
  codigo: string;
  nome: string;
  /** Supervisor (correspondente) responsável direto pela agência */
  parentId: string;
  lngLat: [number, number];
}

export const PESSOAS: PessoaEntidade[] = [
  {
    id: 'dr-se',
    nome: 'Diretoria Regional Sudeste',
    cargo: 'diretoria_regional',
    parentId: null,
    lngLat: [-46.6333, -23.5505],
  },
  {
    id: 'dr-ne',
    nome: 'Diretoria Regional Nordeste',
    cargo: 'diretoria_regional',
    parentId: null,
    lngLat: [-38.5014, -12.9714],
  },
  {
    id: 'gr-sp',
    nome: 'Gerente Regional — São Paulo',
    cargo: 'gerente_regional',
    parentId: 'dr-se',
    lngLat: [-46.6544, -23.5612],
  },
  {
    id: 'gr-rj',
    nome: 'Gerente Regional — Rio',
    cargo: 'gerente_regional',
    parentId: 'dr-se',
    lngLat: [-43.1729, -22.9068],
  },
  {
    id: 'gr-ba',
    nome: 'Gerente Regional — Bahia',
    cargo: 'gerente_regional',
    parentId: 'dr-ne',
    lngLat: [-38.4768, -12.9778],
  },
  {
    id: 'ga-sp-centro',
    nome: 'Gerente de Área — Centro SP',
    cargo: 'gerente_area',
    parentId: 'gr-sp',
    lngLat: [-46.6388, -23.5489],
  },
  {
    id: 'ga-sp-oeste',
    nome: 'Gerente de Área — Oeste SP',
    cargo: 'gerente_area',
    parentId: 'gr-sp',
    lngLat: [-46.7202, -23.5329],
  },
  {
    id: 'ga-rj',
    nome: 'Gerente de Área — Rio Metropolitano',
    cargo: 'gerente_area',
    parentId: 'gr-rj',
    lngLat: [-43.2096, -22.9035],
  },
  {
    id: 'coord-rio',
    nome: 'Coordenador — Rio Zona Norte',
    cargo: 'coordenador',
    parentId: 'ga-rj',
    lngLat: [-43.24, -22.92],
  },
  {
    id: 'coord-lapa',
    nome: 'Coordenador — Lapa / Perdizes',
    cargo: 'coordenador',
    parentId: 'ga-sp-centro',
    lngLat: [-46.6902, -23.5351],
  },
  {
    id: 'coord-pinheiros',
    nome: 'Coordenador — Pinheiros',
    cargo: 'coordenador',
    parentId: 'ga-sp-centro',
    lngLat: [-46.6743, -23.5679],
  },
  {
    id: 'coord-campinas',
    nome: 'Coordenador — Campinas',
    cargo: 'coordenador',
    parentId: 'ga-sp-oeste',
    lngLat: [-47.0632, -22.9056],
  },
  {
    id: 'sup-alice',
    nome: 'Supervisor — Alice Mendes',
    cargo: 'supervisor',
    parentId: 'coord-lapa',
    lngLat: [-46.7043, -23.5267],
  },
  {
    id: 'sup-bruno',
    nome: 'Supervisor — Bruno Carvalho',
    cargo: 'supervisor',
    parentId: 'coord-lapa',
    lngLat: [-46.6681, -23.5448],
  },
  {
    id: 'sup-camila',
    nome: 'Supervisor — Camila Rocha',
    cargo: 'supervisor',
    parentId: 'coord-pinheiros',
    lngLat: [-46.6912, -23.5614],
  },
  {
    id: 'sup-daniel',
    nome: 'Supervisor — Daniel Souza',
    cargo: 'supervisor',
    parentId: 'coord-campinas',
    lngLat: [-47.0588, -22.8923],
  },
  {
    id: 'sup-elisa',
    nome: 'Supervisor — Elisa Nunes',
    cargo: 'supervisor',
    parentId: 'coord-rio',
    lngLat: [-43.1961, -22.9519],
  },
];

export const AGENCIAS: AgenciaEntidade[] = [
  {
    id: 'ag-101',
    codigo: 'AG-101',
    nome: 'Agência Paulista',
    parentId: 'sup-alice',
    lngLat: [-46.6586, -23.5614],
  },
  {
    id: 'ag-102',
    codigo: 'AG-102',
    nome: 'Agência Consolação',
    parentId: 'sup-alice',
    lngLat: [-46.6612, -23.5558],
  },
  {
    id: 'ag-103',
    codigo: 'AG-103',
    nome: 'Agência Sumaré',
    parentId: 'sup-bruno',
    lngLat: [-46.6755, -23.5412],
  },
  {
    id: 'ag-104',
    codigo: 'AG-104',
    nome: 'Agência Faria Lima',
    parentId: 'sup-camila',
    lngLat: [-46.6897, -23.5859],
  },
  {
    id: 'ag-105',
    codigo: 'AG-105',
    nome: 'Agência Cambuí',
    parentId: 'sup-daniel',
    lngLat: [-47.0423, -22.8978],
  },
  {
    id: 'ag-106',
    codigo: 'AG-106',
    nome: 'Agência Tijuca',
    parentId: 'sup-elisa',
    lngLat: [-43.2332, -22.9245],
  },
];

export const CARGO_LABEL: Record<CargoChave, string> = {
  diretoria_regional: 'Diretoria Regional',
  gerente_regional: 'Gerente Regional',
  gerente_area: 'Gerente de Área',
  coordenador: 'Coordenador',
  supervisor: 'Supervisor',
};

export interface FiltrosEstrutura {
  diretoriaRegionalId: string;
  gerenteRegionalId: string;
  agenciaId: string;
  gerenteAreaId: string;
  coordenadorId: string;
  supervisorId: string;
}

export interface SqlHierarchyFilter {
  direReg?: number;
  codGerReg?: number;
  codGerArea?: number;
  codCoord?: number;
  codSupervisao?: number;
  codAg?: number;
}

const empty = '';

export const FILTROS_INICIAIS: FiltrosEstrutura = {
  diretoriaRegionalId: empty,
  gerenteRegionalId: empty,
  agenciaId: empty,
  gerenteAreaId: empty,
  coordenadorId: empty,
  supervisorId: empty,
};

function filhosPessoa(id: string): string[] {
  return PESSOAS.filter((p) => p.parentId === id).map((p) => p.id);
}

/** Subárvore de pessoas a partir de um id (inclui a raiz). */
export function coletarIdsPessoasSubarvore(raizPessoaId: string): Set<string> {
  const ids = new Set<string>();
  const pilha = [raizPessoaId];
  while (pilha.length) {
    const id = pilha.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    for (const c of filhosPessoa(id)) pilha.push(c);
  }
  return ids;
}

/**
 * Agências vinculadas a um correspondente: diretamente (supervisor → suas agências)
 * ou agregadas pela subárvore (coordenador, GA, GR, diretoria).
 */
export function agenciasParaCorrespondente(pessoaId: string): AgenciaEntidade[] {
  const p = PESSOAS.find((x) => x.id === pessoaId);
  if (!p) return [];
  if (p.cargo === 'supervisor') {
    return AGENCIAS.filter((a) => a.parentId === pessoaId);
  }
  const idsSubarvore = coletarIdsPessoasSubarvore(pessoaId);
  const idsSupervisores = [...idsSubarvore].filter(
    (id) => PESSOAS.find((x) => x.id === id)?.cargo === 'supervisor'
  );
  return AGENCIAS.filter((a) => idsSupervisores.includes(a.parentId));
}

export interface MarcadorMapa {
  id: string;
  nome: string;
  subtitulo: string;
  kind: 'pessoa' | 'agencia';
  cargo?: CargoChave;
  lngLat: [number, number];
  /** Texto para popup: agências ligadas ao correspondente ou ao ponto da agência */
  detalheAgencias?: string;
}

function marcadorPessoa(p: PessoaEntidade): MarcadorMapa {
  const ags = agenciasParaCorrespondente(p.id);
  const detalheAgencias =
    ags.length > 0
      ? ags.map((a) => `${a.codigo} — ${a.nome}`).join('\n')
      : undefined;
  const subtituloAg =
    ags.length > 0
      ? `${CARGO_LABEL[p.cargo]} · ${ags.length} ag. (${ags.map((a) => a.codigo).join(', ')})`
      : CARGO_LABEL[p.cargo];
  return {
    id: p.id,
    nome: p.nome,
    subtitulo: subtituloAg,
    kind: 'pessoa',
    cargo: p.cargo,
    lngLat: p.lngLat,
    detalheAgencias,
  };
}

function marcadorAgencia(a: AgenciaEntidade): MarcadorMapa {
  const sup = PESSOAS.find((p) => p.id === a.parentId);
  return {
    id: a.id,
    nome: a.nome,
    subtitulo: `${a.codigo}${sup ? ` · Correspondente: ${sup.nome}` : ''}`,
    kind: 'agencia',
    lngLat: a.lngLat,
    detalheAgencias: sup
      ? `Correspondente (supervisor): ${sup.nome}\nAgência vinculada a este correspondente.`
      : undefined,
  };
}

/**
 * Retorna marcadores conforme o filtro mais específico preenchido na escada.
 * Ordem: supervisor → coordenador → gerente de área → gerente regional → agência → diretoria.
 */
export function getMarcadoresParaFiltros(f: FiltrosEstrutura): MarcadorMapa[] {
  const marcadores: MarcadorMapa[] = [];

  if (f.supervisorId) {
    const sup = PESSOAS.find((p) => p.id === f.supervisorId && p.cargo === 'supervisor');
    if (!sup) return [];
    marcadores.push(marcadorPessoa(sup));
    AGENCIAS.filter((a) => a.parentId === sup.id).forEach((a) => marcadores.push(marcadorAgencia(a)));
    return marcadores;
  }

  if (f.coordenadorId) {
    const ids = coletarIdsPessoasSubarvore(f.coordenadorId);
    for (const id of ids) {
      const p = PESSOAS.find((x) => x.id === id);
      if (p) marcadores.push(marcadorPessoa(p));
    }
    for (const id of ids) {
      const p = PESSOAS.find((x) => x.id === id);
      if (p?.cargo === 'supervisor') {
        AGENCIAS.filter((a) => a.parentId === id).forEach((a) => marcadores.push(marcadorAgencia(a)));
      }
    }
    return marcadores;
  }

  if (f.gerenteAreaId) {
    const ids = coletarIdsPessoasSubarvore(f.gerenteAreaId);
    for (const id of ids) {
      const p = PESSOAS.find((x) => x.id === id);
      if (p) marcadores.push(marcadorPessoa(p));
    }
    for (const id of ids) {
      if (PESSOAS.find((x) => x.id === id)?.cargo === 'supervisor') {
        AGENCIAS.filter((a) => a.parentId === id).forEach((a) => marcadores.push(marcadorAgencia(a)));
      }
    }
    return marcadores;
  }

  if (f.gerenteRegionalId) {
    const ids = coletarIdsPessoasSubarvore(f.gerenteRegionalId);
    for (const id of ids) {
      const p = PESSOAS.find((x) => x.id === id);
      if (p) marcadores.push(marcadorPessoa(p));
    }
    for (const id of ids) {
      if (PESSOAS.find((x) => x.id === id)?.cargo === 'supervisor') {
        AGENCIAS.filter((a) => a.parentId === id).forEach((a) => marcadores.push(marcadorAgencia(a)));
      }
    }
    return marcadores;
  }

  if (f.agenciaId) {
    return marcadoresAgenciaESupervisor(f.agenciaId);
  }

  if (f.diretoriaRegionalId) {
    const ids = coletarIdsPessoasSubarvore(f.diretoriaRegionalId);
    for (const id of ids) {
      const p = PESSOAS.find((x) => x.id === id);
      if (p) marcadores.push(marcadorPessoa(p));
    }
    for (const id of ids) {
      if (PESSOAS.find((x) => x.id === id)?.cargo === 'supervisor') {
        AGENCIAS.filter((a) => a.parentId === id).forEach((a) => marcadores.push(marcadorAgencia(a)));
      }
    }
    return marcadores;
  }

  return [];
}

function marcadoresAgenciaESupervisor(agenciaId: string): MarcadorMapa[] {
  const ag = AGENCIAS.find((a) => a.id === agenciaId);
  if (!ag) return [];
  const out: MarcadorMapa[] = [marcadorAgencia(ag)];
  const sup = PESSOAS.find((p) => p.id === ag.parentId);
  if (sup) out.push(marcadorPessoa(sup));
  return out;
}

export function listarDiretorias(): PessoaEntidade[] {
  return PESSOAS.filter((p) => p.cargo === 'diretoria_regional');
}

export function listarGerentesRegionais(diretoriaId: string): PessoaEntidade[] {
  if (!diretoriaId) return [];
  return PESSOAS.filter((p) => p.cargo === 'gerente_regional' && p.parentId === diretoriaId);
}

export function listarGerentesArea(gerenteRegionalId: string): PessoaEntidade[] {
  if (!gerenteRegionalId) return [];
  return PESSOAS.filter((p) => p.cargo === 'gerente_area' && p.parentId === gerenteRegionalId);
}

export function listarCoordenadores(gerenteAreaId: string): PessoaEntidade[] {
  if (!gerenteAreaId) return [];
  return PESSOAS.filter((p) => p.cargo === 'coordenador' && p.parentId === gerenteAreaId);
}

export function listarSupervisores(coordenadorId: string): PessoaEntidade[] {
  if (!coordenadorId) return [];
  return PESSOAS.filter((p) => p.cargo === 'supervisor' && p.parentId === coordenadorId);
}

/** Agências visíveis conforme seleção atual (para popular o combo). */
export function listarAgenciasFiltradas(f: FiltrosEstrutura): AgenciaEntidade[] {
  if (f.supervisorId) {
    return AGENCIAS.filter((a) => a.parentId === f.supervisorId);
  }
  if (f.coordenadorId) {
    const ids = coletarIdsPessoasSubarvore(f.coordenadorId);
    return AGENCIAS.filter((a) => ids.has(a.parentId));
  }
  if (f.gerenteAreaId) {
    const ids = coletarIdsPessoasSubarvore(f.gerenteAreaId);
    return AGENCIAS.filter((a) => ids.has(a.parentId));
  }
  if (f.gerenteRegionalId) {
    const ids = coletarIdsPessoasSubarvore(f.gerenteRegionalId);
    return AGENCIAS.filter((a) => ids.has(a.parentId));
  }
  if (f.diretoriaRegionalId) {
    const ids = coletarIdsPessoasSubarvore(f.diretoriaRegionalId);
    return AGENCIAS.filter((a) => ids.has(a.parentId));
  }
  return [...AGENCIAS];
}

const UI_TO_SQL_HIERARCHY: Record<string, SqlHierarchyFilter> = {
  'dr-se': { direReg: 1001 },
  'dr-ne': { direReg: 1002 },
  'gr-sp': { codGerReg: 2001 },
  'gr-rj': { codGerReg: 2002 },
  'gr-ba': { codGerReg: 2003 },
  'ga-sp-centro': { codGerArea: 3001 },
  'ga-sp-oeste': { codGerArea: 3002 },
  'ga-rj': { codGerArea: 3003 },
  'coord-rio': { codCoord: 4001 },
  'coord-lapa': { codCoord: 4002 },
  'coord-pinheiros': { codCoord: 4003 },
  'coord-campinas': { codCoord: 4004 },
  'sup-alice': { codSupervisao: 5001 },
  'sup-bruno': { codSupervisao: 5002 },
  'sup-camila': { codSupervisao: 5003 },
  'sup-daniel': { codSupervisao: 5004 },
  'sup-elisa': { codSupervisao: 5005 },
  'ag-101': { codAg: 910101 },
  'ag-102': { codAg: 910102 },
  'ag-103': { codAg: 910103 },
  'ag-104': { codAg: 910104 },
  'ag-105': { codAg: 910105 },
  'ag-106': { codAg: 910106 },
};

export function buildSqlHierarchyFilterFromUi(filters: FiltrosEstrutura): SqlHierarchyFilter | null {
  const steps = [
    filters.agenciaId,
    filters.supervisorId,
    filters.coordenadorId,
    filters.gerenteAreaId,
    filters.gerenteRegionalId,
    filters.diretoriaRegionalId,
  ];
  for (const id of steps) {
    if (!id) continue;
    const mapped = UI_TO_SQL_HIERARCHY[id];
    if (mapped) return mapped;
  }
  return null;
}
