import React from 'react';
import { CalendarCheck, MapPin, Route as RouteIcon, Users } from 'lucide-react';
import type { CommercialStructureItem } from '@/lib/commercialStructureApi';
import type { VisitRouteSupervisionSummary } from '@/lib/visitRoutesApi';

export interface RegionOverview {
  totalGerentes: number;
  gerentesComRoteiro: number;
  totalRoutes: number;
  totalVisitas: number;
  percentualCobertura: number;
}

export function calculateOverview(
  supervisoes: CommercialStructureItem[],
  summaries: VisitRouteSupervisionSummary[] = []
): RegionOverview {
  const totalGerentes = supervisoes.length;
  const supervisionKeys = new Set(supervisoes.map((item) => item.chave));
  const scopedSummaries = summaries.filter((item) => supervisionKeys.has(item.chaveSupervisao));
  const gerentesComRoteiro = scopedSummaries.reduce((total, item) => total + item.managersWithRoute, 0);
  const totalRoutes = scopedSummaries.reduce((total, item) => total + item.routes, 0);
  const totalVisitas = scopedSummaries.reduce((total, item) => total + item.visits, 0);
  const percentualCobertura = totalGerentes > 0 ? Math.round((gerentesComRoteiro / totalGerentes) * 100) : 0;

  return { totalGerentes, gerentesComRoteiro, totalRoutes, totalVisitas, percentualCobertura };
}

interface RegionOverviewCardsProps {
  supervisoes: CommercialStructureItem[];
  summaries?: VisitRouteSupervisionSummary[];
  periodLabel?: string;
}

const RegionOverviewCards: React.FC<RegionOverviewCardsProps> = ({
  supervisoes,
  summaries = [],
  periodLabel = 'hoje',
}) => {
  const overview = calculateOverview(supervisoes, summaries);
  const progressWidth = `${Math.min(100, Math.max(0, overview.percentualCobertura))}%`;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-white via-blue-50 to-sky-50 text-slate-950 shadow-md shadow-blue-950/5"
      aria-label={`Resumo da equipe ${periodLabel}`}
    >
      <div className="px-4 pb-4 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600">
              <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
              Cobertura da equipe
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight">
              {overview.gerentesComRoteiro}
              <span className="ml-1 text-base font-medium text-slate-500">de {overview.totalGerentes}</span>
            </p>
            <p className="mt-0.5 text-xs text-slate-600">gerentes com roteiro {periodLabel}</p>
          </div>
          <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-bold text-blue-700 shadow-sm">
            {overview.percentualCobertura}%
          </span>
        </div>

        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-blue-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={overview.percentualCobertura}
          aria-label="Cobertura de roteiros da equipe"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-500 transition-[width] duration-500"
            style={{ width: progressWidth }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-blue-100 border-t border-blue-100 bg-white/80">
        <div className="px-3 py-3">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Users className="h-3.5 w-3.5 text-blue-500" aria-hidden />
            Equipe
          </span>
          <strong className="mt-1 block text-sm font-bold text-slate-900">{overview.totalGerentes}</strong>
        </div>
        <div className="px-3 py-3">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <RouteIcon className="h-3.5 w-3.5 text-sky-500" aria-hidden />
            Roteiros
          </span>
          <strong className="mt-1 block text-sm font-bold text-slate-900">{overview.totalRoutes}</strong>
        </div>
        <div className="px-3 py-3">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-sky-500" aria-hidden />
            Planejadas
          </span>
          <strong className="mt-1 block text-sm font-bold text-slate-900">{overview.totalVisitas}</strong>
        </div>
      </div>
    </section>
  );
};

export default RegionOverviewCards;
