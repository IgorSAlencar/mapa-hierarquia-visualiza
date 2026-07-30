import { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  MapPinned,
  Route as RouteIcon,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  VisitRouteHistoricalMetrics,
  VisitRouteWeeklyMetric,
} from '@/lib/visitRoutesApi';

interface VisitRouteHistoricalAnalysisProps {
  metrics: VisitRouteHistoricalMetrics;
  weeklySeries: VisitRouteWeeklyMetric[];
}

function percent(value: number): string {
  return `${Math.round(Math.max(0, value))}%`;
}

function km(value: number): string {
  return `${Math.round(value / 1000).toLocaleString('pt-BR')} km`;
}

function weekLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${value}T12:00:00`));
}

const VisitRouteHistoricalAnalysis = ({
  metrics,
  weeklySeries,
}: VisitRouteHistoricalAnalysisProps) => {
  const [chartMetric, setChartMetric] = useState<'frequency' | 'distance' | 'execution'>('frequency');
  const workingRouteDays = Number.isFinite(metrics.workingRouteDays)
    ? metrics.workingRouteDays
    : Math.round((metrics.frequencyRate / 100) * metrics.workingDays);
  const cards = [
    {
      label: 'Frequência',
      value: percent(metrics.frequencyRate),
      detail: `${workingRouteDays} de ${metrics.workingDays} dias úteis`,
      icon: Target,
      tone: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Rotas',
      value: String(metrics.totalRoutes),
      detail: `${(metrics.routeDays / Math.max(1, weeklySeries.length)).toFixed(1)} dias/semana`,
      icon: RouteIcon,
      tone: 'bg-sky-50 text-sky-700',
    },
    {
      label: 'Distância',
      value: km(metrics.totalDistanceMeters),
      detail: `${km(metrics.averageDistanceMeters)} em média`,
      icon: MapPinned,
      tone: 'bg-cyan-50 text-cyan-700',
    },
    {
      label: 'Execução',
      value: percent(metrics.completionRate),
      detail: `${metrics.completedVisits} de ${metrics.plannedVisits} visitas`,
      icon: CheckCircle2,
      tone: 'bg-emerald-50 text-emerald-700',
    },
  ];

  const chartData = weeklySeries.map((item) => ({
    ...item,
    week: weekLabel(item.weekStart),
    distanceKm: Math.round(item.distanceMeters / 1000),
    executionPercent: Math.round(item.completionRate),
  }));
  const chartConfig = {
    frequency: {
      dataKey: 'routeDays',
      label: 'Dias com roteiro',
      color: '#2563eb',
      suffix: '',
    },
    distance: {
      dataKey: 'distanceKm',
      label: 'Distância',
      color: '#0891b2',
      suffix: ' km',
    },
    execution: {
      dataKey: 'executionPercent',
      label: 'Execução',
      color: '#059669',
      suffix: '%',
    },
  }[chartMetric];

  return (
    <section className="space-y-3" aria-label="Indicadores históricos">
      <div className="grid grid-cols-2 gap-2">
        {cards.map(({ label, value, detail, icon: Icon, tone }) => (
          <article key={label} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
            </div>
            <p className="mt-2 text-lg font-black tabular-nums text-slate-950">{value}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{detail}</p>
          </article>
        ))}
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm shadow-blue-200">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-bold text-slate-900">Evolução semanal</p>
            <p className="text-[10px] text-slate-500">Frequência, distância e execução</p>
          </div>
          <TrendingUp className="ml-auto h-4 w-4 text-blue-500" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
          {([
            ['frequency', 'Frequência'],
            ['distance', 'Distância'],
            ['execution', 'Execução'],
          ] as const).map(([metric, label]) => (
            <button
              key={metric}
              type="button"
              onClick={() => setChartMetric(metric)}
              className={`rounded-md px-1.5 py-1.5 text-[10px] font-bold transition-colors ${
                chartMetric === metric
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {chartData.length > 0 ? (
          <div className="mt-3 h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 11 }}
                  formatter={(value: number) => [`${value}${chartConfig.suffix}`, chartConfig.label]}
                />
                <Line
                  type="monotone"
                  dataKey={chartConfig.dataKey}
                  stroke={chartConfig.color}
                  strokeWidth={2.5}
                  dot={{ r: 2.5 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
            Sem semanas com roteiro no período.
          </p>
        )}
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-[9px]">
          <span className="rounded-md bg-emerald-50 px-1 py-1.5 text-emerald-700">
            {metrics.completedVisits} realizadas
          </span>
          <span className="rounded-md bg-rose-50 px-1 py-1.5 text-rose-700">
            {metrics.notCompletedVisits} não realizadas
          </span>
          <span className="rounded-md bg-amber-50 px-1 py-1.5 text-amber-700">
            {metrics.rescheduledVisits} reagendadas
          </span>
          <span className="rounded-md bg-slate-100 px-1 py-1.5 text-slate-600">
            {metrics.pendingVisits} pendentes
          </span>
        </div>
      </article>
    </section>
  );
};

export default VisitRouteHistoricalAnalysis;
