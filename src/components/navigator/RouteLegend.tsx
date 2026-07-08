import React from 'react';

const ITEMS = [
  { label: 'Base', className: 'h-2 w-2 rounded-full bg-blue-600' },
  { label: 'Concluída', className: 'h-2 w-2 rounded-full bg-emerald-500' },
  { label: 'Pendente', className: 'h-2 w-2 rounded-full bg-amber-500' },
  { label: 'Rota do dia', className: 'h-0.5 w-3 rounded-full bg-blue-500' },
];

/** Legenda do roteiro de visitas — ancorada abaixo dos controles do mapa. */
const RouteLegend: React.FC = () => (
  <div className="pointer-events-none w-[11.5rem] rounded-2xl border border-slate-200/90 bg-white/95 px-2.5 py-2 shadow-lg shadow-slate-900/10 backdrop-blur-sm">
    <p className="mb-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500">
      Legenda
    </p>
    <ul className="space-y-1">
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-[10px] font-medium text-slate-700">
          <span className={item.className} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  </div>
);

export default RouteLegend;
