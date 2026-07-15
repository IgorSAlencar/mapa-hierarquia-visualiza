import React from 'react';

const VISIT_ROUTE_ITEMS = [
  { label: 'Base', className: 'h-2 w-2 rounded-full bg-blue-600' },
  { label: 'Concluída', className: 'h-2 w-2 rounded-full bg-emerald-500' },
  { label: 'Pendente', className: 'h-2 w-2 rounded-full bg-amber-500' },
  { label: 'Rota do dia', className: 'h-0.5 w-3 rounded-full bg-blue-500' },
];

interface RouteLegendProps {
  plannerMode?: boolean;
  hasDestination?: boolean;
  showOriginStores?: boolean;
  showDestinationStores?: boolean;
  showCorridorStores?: boolean;
  showTerritory?: boolean;
  territoryStoreCount?: number;
  selectedStoreCount?: number;
}

/** Legenda do roteiro de visitas — ancorada abaixo dos controles do mapa. */
const RouteLegend: React.FC<RouteLegendProps> = ({
  plannerMode = false,
  hasDestination = false,
  showOriginStores = false,
  showDestinationStores = false,
  showCorridorStores = false,
  showTerritory = false,
  territoryStoreCount,
  selectedStoreCount = 0,
}) => (
  <div className="pointer-events-none w-[12.5rem] rounded-2xl border border-slate-200/90 bg-white/95 px-2.5 py-2 shadow-lg shadow-slate-900/10 backdrop-blur-sm">
    <p className="mb-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500">
      {plannerMode ? 'Legenda do roteiro' : 'Legenda'}
    </p>
    <ul className="space-y-1">
      {plannerMode ? <>
        <LegendItem label="Ponto de início">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[8px] font-bold text-white">I</span>
        </LegendItem>
        {hasDestination ? <LegendItem label="Destino selecionado">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white">F</span>
        </LegendItem> : null}
        {showOriginStores ? <LegendItem label="Lojas da origem">
          <span className="h-2.5 w-2.5 rounded-full border border-white bg-blue-600 shadow-sm" />
        </LegendItem> : null}
        {showDestinationStores ? <LegendItem label="Lojas do destino">
          <span className="h-2.5 w-2.5 rounded-full border border-white bg-emerald-500 shadow-sm" />
        </LegendItem> : null}
        {showCorridorStores || showTerritory ? <LegendItem label={showTerritory
          ? `Lojas no território (${territoryStoreCount ?? 0})`
          : 'Lojas até 20 km da rota'}>
          <span className="h-2.5 w-2.5 rounded-full border border-white bg-slate-600 shadow-sm" />
        </LegendItem> : null}
        {selectedStoreCount > 0 ? <LegendItem label={`Selecionadas (${selectedStoreCount})`}>
          <span className="h-3 w-3 rounded-full border-2 border-orange-100 bg-orange-500 shadow-sm" />
        </LegendItem> : null}
        {hasDestination ? <LegendItem label="Rota calculada">
          <span className="h-0.5 w-3.5 rounded-full bg-blue-500" />
        </LegendItem> : null}
        {showTerritory ? <LegendItem label="Território por raio">
          <span className="h-2.5 w-3.5 rounded-sm border border-sky-600/70 bg-sky-300/40" />
        </LegendItem> : null}
      </> : VISIT_ROUTE_ITEMS.map((item) => (
        <LegendItem key={item.label} label={item.label}>
          <span className={item.className} />
        </LegendItem>
      ))}
    </ul>
  </div>
);

function LegendItem({ label, children }: { label: string; children: React.ReactNode }) {
  return <li className="flex items-center gap-2 text-[10px] font-medium text-slate-700">
    <span className="flex w-4 shrink-0 items-center justify-center" aria-hidden>{children}</span>
    <span>{label}</span>
  </li>;
}

export default RouteLegend;
