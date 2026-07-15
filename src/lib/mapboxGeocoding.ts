import { MAPBOX_CONFIG } from '@/lib/mapbox-config';

export interface AddressSuggestion {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

interface GeocodingFeature {
  id?: unknown;
  geometry?: {
    coordinates?: unknown;
  };
  properties?: {
    mapbox_id?: unknown;
    name?: unknown;
    name_preferred?: unknown;
    full_address?: unknown;
    place_formatted?: unknown;
    coordinates?: {
      latitude?: unknown;
      longitude?: unknown;
    };
  };
}

interface GeocodingResponse {
  features?: unknown;
  message?: unknown;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toSuggestion(feature: GeocodingFeature): AddressSuggestion | null {
  const geometryCoordinates = Array.isArray(feature.geometry?.coordinates)
    ? feature.geometry.coordinates
    : [];
  const longitude = Number(feature.properties?.coordinates?.longitude ?? geometryCoordinates[0]);
  const latitude = Number(feature.properties?.coordinates?.latitude ?? geometryCoordinates[1]);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const properties = feature.properties;
  const preferredName = text(properties?.name_preferred) || text(properties?.name);
  const context = text(properties?.place_formatted);
  const label = text(properties?.full_address) || [preferredName, context].filter(Boolean).join(', ');
  const id = text(properties?.mapbox_id) || text(feature.id) || `${longitude},${latitude}`;

  return label ? { id, label, latitude, longitude } : null;
}

/**
 * Busca temporária no Mapbox Geocoding v6. Os resultados ficam somente no
 * estado da tela e não são persistidos, conforme as regras da API temporária.
 */
async function fetchGeocodingSuggestions(
  query: string,
  types: string,
  fallbackError: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ').slice(0, 256);
  if (normalizedQuery.length < 3) return [];

  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.searchParams.set('q', normalizedQuery);
  url.searchParams.set('access_token', MAPBOX_CONFIG.accessToken);
  url.searchParams.set('autocomplete', 'true');
  url.searchParams.set('country', 'br');
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('types', types);
  url.searchParams.set('limit', '6');

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    signal,
  });
  const payload = (await response.json().catch(() => ({}))) as GeocodingResponse;

  if (!response.ok) {
    throw new Error(text(payload.message) || fallbackError);
  }

  if (!Array.isArray(payload.features)) return [];
  return payload.features
    .map((feature) => toSuggestion(feature as GeocodingFeature))
    .filter((suggestion): suggestion is AddressSuggestion => Boolean(suggestion));
}

export function fetchAddressSuggestions(
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  return fetchGeocodingSuggestions(
    query,
    'address,street,postcode,place',
    'Não foi possível buscar endereços agora.',
    signal
  );
}

/** Busca somente municípios brasileiros; a coordenada retornada é o centro da cidade. */
export function fetchMunicipalitySuggestions(
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  return fetchGeocodingSuggestions(
    query,
    'place',
    'Não foi possível buscar municípios agora.',
    signal
  );
}
