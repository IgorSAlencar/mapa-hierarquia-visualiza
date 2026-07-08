import React from 'react';
import { CalendarCheck, MapPin, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getRouteForSupervisao } from '@/data/visitRoutesMock';
import type { CommercialStructureItem } from '@/lib/commercialStructureApi';

export interface RegionOverview {
  totalGerentes: number;
  gerentesComRoteiro: number;
  totalVisitas: number;
  percentualCobertura: number;
}

export function calculateOverview(supervisoes: CommercialStructureItem[]): RegionOverview {
  const totalGerentes = supervisoes.length;
  const gerentesComRoteiro = supervisoes.filter((s) => getRouteForSupervisao(s.chave)).length;
  const totalVisitas = supervisoes.reduce((acc, s) => {
    const route = getRouteForSupervisao(s.chave);
    return acc + (route?.stops.length ?? 0);
  }, 0);
  const percentualCobertura = totalGerentes > 0 ? Math.round((gerentesComRoteiro / totalGerentes) * 100) : 0;

  return { totalGerentes, gerentesComRoteiro, totalVisitas, percentualCobertura };
}

interface RegionOverviewCardsProps {
  supervisoes: CommercialStructureItem[];
}

const RegionOverviewCards: React.FC<RegionOverviewCardsProps> = ({ supervisoes }) => {
  const overview = calculateOverview(supervisoes);

  const cards = [
    {
      icon: Users,
      value: String(overview.totalGerentes),
      label: 'Gerentes comerciais',
      accent: 'text-slate-900',
      iconStyle: 'bg-slate-100 text-slate-600',
    },
    {
      icon: CalendarCheck,
      value: `${overview.gerentesComRoteiro}/${overview.totalGerentes}`,
      label: 'Com roteiro hoje',
      accent: 'text-blue-700',
      iconStyle: 'bg-blue-50 text-blue-600',
    },
    {
      icon: MapPin,
      value: String(overview.totalVisitas),
      label: 'Visitas do dia',
      accent: 'text-violet-700',
      iconStyle: 'bg-violet-50 text-violet-600',
    },
    {
      icon: TrendingUp,
      value: `${overview.percentualCobertura}%`,
      label: 'Cobertura',
      accent: 'text-emerald-700',
      iconStyle: 'bg-emerald-50 text-emerald-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2"
          >
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', card.iconStyle)}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className={cn('block text-sm font-bold leading-tight', card.accent)}>{card.value}</span>
              <span className="block truncate text-[9px] font-medium leading-tight text-slate-500">
                {card.label}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default RegionOverviewCards;
