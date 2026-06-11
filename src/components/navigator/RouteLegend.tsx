import React from 'react';

const ITEMS = [
  { label: 'Base', className: 'h-2.5 w-2.5 rounded-full bg-blue-600' },
  { label: 'Concluída', className: 'h-2.5 w-2.5 rounded-full bg-emerald-500' },
  { label: 'Pendente', className: 'h-2.5 w-2.5 rounded-full bg-amber-500' },
  { label: 'Rota do dia', className: 'h-1 w-4 rounded-full bg-blue-500' },
];

/** Legenda exibida apenas quando há um roteiro de visitas ativo no mapa. */
const RouteLegend: React.FC = () => (
  <div className="pointer-events-auto rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 shadow-lg shadow-slate-900/10 backdrop-blur-sm">
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Legenda</p>
    <ul className="space-y-1.5">
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-[11px] font-medium text-slate-700">
          <span className={item.className} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  </div>
);

export default RouteLegend;
