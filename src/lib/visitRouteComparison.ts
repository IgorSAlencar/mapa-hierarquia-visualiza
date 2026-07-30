import type { VisitRouteMapItem } from '@/lib/visitRouteMapLayer';
import type {
  VisitRouteHistoricalMetrics,
  VisitRouteMapRoute,
  VisitRouteWeeklyMetric,
} from '@/lib/visitRoutesApi';
import type { VisitRouteOwner } from '@/data/visitRoutes';

export const DAILY_ROUTE_COLORS = [
  '#2563eb',
  '#dc2626',
  '#059669',
  '#7c3aed',
  '#d97706',
  '#0891b2',
  '#db2777',
  '#4f46e5',
  '#65a30d',
  '#c2410c',
  '#0f766e',
  '#9333ea',
  '#0369a1',
  '#be123c',
  '#475569',
] as const;

export interface DailyVisitRouteMapView {
  mode: 'daily';
  date: string;
  items: VisitRouteMapItem[];
  selectedSupervisionKeys: number[];
  missingSupervisionKeys: number[];
}

export interface HistoricalVisitRouteMapView {
  mode: 'historical';
  from: string;
  to: string;
  owner: VisitRouteOwner;
  items: VisitRouteMapItem[];
  metrics: VisitRouteHistoricalMetrics;
  weeklySeries: VisitRouteWeeklyMetric[];
}

export type VisitRouteMapView = DailyVisitRouteMapView | HistoricalVisitRouteMapView;

export function buildDailyRouteMapItems(
  routes: VisitRouteMapRoute[],
  selectedSupervisionKeys: number[]
): VisitRouteMapItem[] {
  const colorBySupervision = new Map(
    selectedSupervisionKeys.map((key, index) => [
      key,
      DAILY_ROUTE_COLORS[index % DAILY_ROUTE_COLORS.length],
    ])
  );
  return routes.map((route, index) => ({
    route,
    color: colorBySupervision.get(route.chaveSupervisao)
      ?? DAILY_ROUTE_COLORS[index % DAILY_ROUTE_COLORS.length],
  }));
}

export function buildHistoricalRouteMapItems(
  routes: VisitRouteMapRoute[]
): VisitRouteMapItem[] {
  const orderedRouteIds = [...routes]
    .sort((left, right) => {
      const dateDifference = (left.plannedDate || left.data)
        .localeCompare(right.plannedDate || right.data);
      return dateDifference || left.id.localeCompare(right.id);
    })
    .map((route) => route.id);
  const colorByRouteId = new Map(
    orderedRouteIds.map((routeId, index) => [
      routeId,
      DAILY_ROUTE_COLORS[index % DAILY_ROUTE_COLORS.length],
    ])
  );
  return routes.map((route) => ({
    route,
    color: colorByRouteId.get(route.id) ?? DAILY_ROUTE_COLORS[0],
  }));
}

export function routeMapViewSignature(view: VisitRouteMapView | null): string {
  if (!view) return '';
  return [
    view.mode,
    view.mode === 'daily' ? view.date : `${view.from}:${view.to}`,
    ...view.items.map(({ route }) => route.id),
  ].join('|');
}
