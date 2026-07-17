import type { VisitRoute } from '@/data/visitRoutesMock';

interface RouteCoordinate {
  lat: number;
  lng: number;
}

export interface GoogleMapsRouteLink {
  url: string;
  intermediateStopCount: number;
  mobileWaypointLimitExceeded: boolean;
  generalWaypointLimitExceeded: boolean;
}

function coordinateValue(point: RouteCoordinate): string {
  return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

/**
 * Monta uma URL universal do Google Maps preservando a ordem planejada.
 * Quando o roteiro não possui origem/destino explícitos, a primeira e a
 * última visita assumem esses papéis.
 */
export function buildGoogleMapsRouteLink(route: VisitRoute): GoogleMapsRouteLink | null {
  const orderedStops = [...route.stops].sort((a, b) => a.ordem - b.ordem);
  const origin = route.origin ?? orderedStops.shift();
  const destination = route.destination ?? orderedStops.pop();
  if (!origin || !destination) return null;

  const params = new URLSearchParams({
    api: '1',
    origin: coordinateValue(origin),
    destination: coordinateValue(destination),
    travelmode: 'driving',
    dir_action: 'navigate',
  });
  if (orderedStops.length > 0) {
    params.set('waypoints', orderedStops.map(coordinateValue).join('|'));
  }

  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    intermediateStopCount: orderedStops.length,
    mobileWaypointLimitExceeded: orderedStops.length > 3,
    generalWaypointLimitExceeded: orderedStops.length > 9,
  };
}
