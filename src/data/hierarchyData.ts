// Dados de exemplo para estrutura comercial
export interface HierarchyData {
  id: string;
  nome: string;
  tipo: string;
  municipios: string[];
  responsavel: string;
  nivel: number;
}

export const hierarchyData: HierarchyData[] = [
  {
    id: '1',
    nome: 'Regional Sudeste',
    tipo: 'Regional',
    municipios: ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte'],
    responsavel: 'Ana Silva',
    nivel: 1
  },
  {
    id: '2',
    nome: 'Filial São Paulo Capital',
    tipo: 'Filial',
    municipios: ['São Paulo'],
    responsavel: 'Carlos Santos',
    nivel: 2
  },
  {
    id: '3',
    nome: 'Regional Nordeste',
    tipo: 'Regional',
    municipios: ['Salvador', 'Fortaleza', 'Recife'],
    responsavel: 'Maria Oliveira',
    nivel: 1
  },
  {
    id: '4',
    nome: 'Representação Centro-Oeste',
    tipo: 'Representação',
    municipios: ['Brasília'],
    responsavel: 'João Costa',
    nivel: 3
  },
  {
    id: '5',
    nome: 'Regional Sul',
    tipo: 'Regional',
    municipios: ['Curitiba', 'Porto Alegre'],
    responsavel: 'Patricia Lima',
    nivel: 1
  },
  {
    id: '6',
    nome: 'Regional Norte',
    tipo: 'Regional',
    municipios: ['Manaus'],
    responsavel: 'Roberto Ferreira',
    nivel: 1
  },
  {
    id: '7',
    nome: 'Filial Rio Interior',
    tipo: 'Filial',
    municipios: ['Rio de Janeiro'],
    responsavel: 'Luciana Mendes',
    nivel: 2
  },
  {
    id: '8',
    nome: 'Representação Minas Interior',
    tipo: 'Representação',
    municipios: ['Belo Horizonte'],
    responsavel: 'Eduardo Rocha',
    nivel: 3
  }
];