import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl, { type FilterSpecification } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  BarChart3,
  LayoutGrid,
  Layers,
  MapPinOff,
  Search,
  SlidersHorizontal,
  Store,
  User,
} from 'lucide-react';
import ExpressoBottomSheet from '@/components/ExpressoBottomSheet';
import ExpressoStatePanel from '@/components/ExpressoStatePanel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { MAPBOX_CONFIG } from '@/lib/mapbox-config';
import {
  buildExpressoRegionMetrics,
  buildMunicipalityProductivityRows,
  emptyProdutoExpressoResumo,
  type ExpressoRegionMetrics,
  type MunicipalityProductivityRow,
  type ProdutoExpressoId,
} from '@/lib/expressoRegionMock';
import type { MarcadorMapa } from '@/data/commercialStructureMock';
import {
  filterRegionMapPoints,
  MOCK_REGION_SUPERVISORES,
  regionPointsToFeatureCollection,
} from '@/data/regionMapPointsMock';
import {
  buildMunicipalityValueMap,
  computeValueRangeFromRows,
  mergeChoroplethIntoFeatureCollection,
} from '@/lib/municipalityChoropleth';
import { fetchAgencyPoints, fetchStorePoints, type BboxQuery, type SqlMapPoint } from '@/lib/mapDataApi';
import { fetchExpressoProductivityRows, fetchExpressoStateMetrics } from '@/lib/expressoApi';

const BRAZIL_BOUNDARY_GEOJSON =
  'https://raw.githubusercontent.com/johan/world.geo.json/master/countries/BRA.geo.json';
const BRAZIL_STATES_GEOJSON =
  'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson';
const GEODATA_BR_BASE =
  'https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson';
const UF_TO_IBGE_CODE: Record<string, string> = {
  AC: '12',
  AL: '27',
  AP: '16',
  AM: '13',
  BA: '29',
  CE: '23',
  DF: '53',
  ES: '32',
  GO: '52',
  MA: '21',
  MT: '51',
  MS: '50',
  MG: '31',
  PA: '15',
  PB: '25',
  PR: '41',
  PE: '26',
  PI: '22',
  RJ: '33',
  RN: '24',
  RS: '43',
  RO: '11',
  RR: '14',
  SC: '42',
  SP: '35',
  SE: '28',
  TO: '17',
};

type GeoJSONPosition = [number, number];
type Bounds = [[number, number], [number, number]];

function buildOutsideBrazilMaskFeature(
  brazil: GeoJSON.Feature
): GeoJSON.Feature<GeoJSON.Polygon> {
  const worldRing: GeoJSONPosition[] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  const { geometry } = brazil;
  const holeRings: GeoJSONPosition[][] = [];
  if (geometry.type === 'Polygon') {
    holeRings.push(geometry.coordinates[0] as GeoJSONPosition[]);
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      holeRings.push(poly[0] as GeoJSONPosition[]);
    }
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [worldRing, ...holeRings],
    },
  };
}

function resolveLandMatchMaskColor(m: mapboxgl.Map): string {
  const tryIds = ['land', 'national-park'];
  for (const id of tryIds) {
    if (!m.getLayer(id)) continue;
    try {
      const c = m.getPaintProperty(id, 'fill-color');
      if (typeof c === 'string') return c;
      if (Array.isArray(c) && c[0] === 'rgba' && c.length >= 5) {
        const [, r, g, b, a] = c as [string, number, number, number, number];
        return `rgba(${r},${g},${b},${a})`;
      }
    } catch {
      /* skip */
    }
  }
  return MAPBOX_CONFIG.outsideBrazilMaskColor;
}

function keepOnlyStateAndCityLabels(m: mapboxgl.Map) {
  const layers = m.getStyle().layers;
  if (!layers) return;
  for (const layer of layers) {
    if (layer.type !== 'symbol') continue;
    const id = layer.id.toLowerCase();
    const sourceLayer = String(
      (layer as mapboxgl.SymbolLayerSpecification)['source-layer'] ?? ''
    ).toLowerCase();
    const keep =
      id.includes('settlement') ||
      id.includes('place-label') ||
      id.includes('state-label') ||
      id.includes('admin-1') ||
      sourceLayer.includes('place_label');
    try {
      m.setLayoutProperty(layer.id, 'visibility', keep ? 'visible' : 'none');
    } catch {
      /* skip */
    }
  }
}

const BR_ISO_FILTER: FilterSpecification = ['==', ['get', 'iso_3166_1'], 'BR'];
const SYMBOL_SOURCE_LAYERS_BR_ONLY = new Set(['place_label', 'airport_label']);

function restrictSymbolLayersToBrazil(m: mapboxgl.Map) {
  const layers = m.getStyle().layers;
  if (!layers) return;

  for (const layer of layers) {
    if (layer.type !== 'symbol') continue;
    const id = layer.id;
    if (id.startsWith('brazil-') || id.startsWith('brasil-') || id.startsWith('structure-')) continue;

    const sourceLayer = (layer as mapboxgl.SymbolLayerSpecification)['source-layer'];
    if (!sourceLayer || !SYMBOL_SOURCE_LAYERS_BR_ONLY.has(sourceLayer)) continue;

    const existing = (layer as mapboxgl.SymbolLayerSpecification).filter;
    const combined: FilterSpecification = existing
      ? (['all', existing, BR_ISO_FILTER] as FilterSpecification)
      : BR_ISO_FILTER;

    try {
      m.setFilter(id, combined);
    } catch {
      /* skip */
    }
  }
}

function applyBrazilBasemapLabelTweaks(m: mapboxgl.Map) {
  keepOnlyStateAndCityLabels(m);
  restrictSymbolLayersToBrazil(m);
}

function firstSymbolLayerId(m: mapboxgl.Map): string | undefined {
  return m.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
}

function isStandardStyleUrl(styleUrl: string): boolean {
  return styleUrl.includes('mapbox/standard');
}

type FillPaint = NonNullable<mapboxgl.FillLayerSpecification['paint']>;
type LinePaint = NonNullable<mapboxgl.LineLayerSpecification['paint']>;
type CirclePaint = NonNullable<mapboxgl.CircleLayerSpecification['paint']>;

/** Standard usa iluminação do basemap; fills precisam de emissive para não “apagarem”. */
function fillPaintForStandard(styleUrl: string, paint: FillPaint): FillPaint {
  if (!isStandardStyleUrl(styleUrl)) return paint;
  return { ...paint, 'fill-emissive-strength': 1 };
}

function linePaintForStandard(styleUrl: string, paint: LinePaint): LinePaint {
  if (!isStandardStyleUrl(styleUrl)) return paint;
  return { ...paint, 'line-emissive-strength': 1 };
}

function circlePaintForStandard(styleUrl: string, paint: CirclePaint): CirclePaint {
  if (!isStandardStyleUrl(styleUrl)) return paint;
  return { ...paint, 'circle-emissive-strength': 1 };
}

function applyStandardWarmBasemap(m: mapboxgl.Map) {
  const tryTheme = (theme: string) => {
    try {
      m.setConfigProperty('basemap', 'theme', theme);
      return true;
    } catch {
      return false;
    }
  };
  if (!tryTheme('warm')) tryTheme('default');
  try {
    m.setConfigProperty('basemap', 'show3dObjects', false);
    m.setConfigProperty('basemap', 'lightPreset', 'day');
  } catch {
    /* ignore */
  }
}

function markersToFeatureCollection(markers: MarcadorMapa[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map((mk) => ({
      type: 'Feature' as const,
      properties: {
        id: mk.id,
        nome: mk.nome,
        subtitulo: mk.subtitulo,
        kind: mk.kind,
        cargo: mk.cargo ?? '',
        detalhe_agencias: mk.detalheAgencias ?? '',
      },
      geometry: {
        type: 'Point' as const,
        coordinates: mk.lngLat,
      },
    })),
  };
}

function markersToFeatureCollectionByKind(
  markers: MarcadorMapa[],
  kind: MarcadorMapa['kind']
): GeoJSON.FeatureCollection {
  return markersToFeatureCollection(markers.filter((m) => m.kind === kind));
}

const AGENCY_LAYER_IDS = [
  'structure-agencies-clusters',
  'structure-agencies-cluster-count',
  'structure-agencies-point',
] as const;

function setAgencyLayersVisibility(m: mapboxgl.Map, visible: boolean) {
  const vis = visible ? 'visible' : 'none';
  for (const id of AGENCY_LAYER_IDS) {
    if (!m.getLayer(id)) continue;
    try {
      m.setLayoutProperty(id, 'visibility', vis);
    } catch {
      /* skip */
    }
  }
}

function expandBoundsFromCoords(coords: unknown, bounds: mapboxgl.LngLatBounds) {
  if (!Array.isArray(coords)) return;
  if (
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number' &&
    Number.isFinite(coords[0]) &&
    Number.isFinite(coords[1])
  ) {
    bounds.extend([coords[0], coords[1]]);
    return;
  }

  for (const item of coords) expandBoundsFromCoords(item, bounds);
}

function featureBounds(feature: GeoJSON.Feature): Bounds | null {
  const geometry = feature.geometry;
  if (!geometry) return null;
  const bounds = new mapboxgl.LngLatBounds();
  if (geometry.type === 'GeometryCollection') {
    for (const g of geometry.geometries) {
      expandBoundsFromCoords((g as Exclude<GeoJSON.Geometry, GeoJSON.GeometryCollection>).coordinates, bounds);
    }
  } else {
    expandBoundsFromCoords(geometry.coordinates, bounds);
  }
  if (bounds.isEmpty()) return null;
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return [
    [sw.lng, sw.lat],
    [ne.lng, ne.lat],
  ];
}

type GeoJSONRing = GeoJSONPosition[];

function pointInRing(point: GeoJSONPosition, ring: GeoJSONRing): boolean {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonRings(point: GeoJSONPosition, rings: GeoJSONRing[]): boolean {
  if (rings.length === 0) return false;
  if (!pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

function pointInGeometryLngLat(lngLat: mapboxgl.LngLat, geometry: GeoJSON.Geometry): boolean {
  const point: GeoJSONPosition = [lngLat.lng, lngLat.lat];
  if (geometry.type === 'Polygon') {
    return pointInPolygonRings(point, geometry.coordinates as GeoJSONRing[]);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) =>
      pointInPolygonRings(point, poly as GeoJSONRing[])
    );
  }
  return false;
}

/** Escolhe o município cujo polígono contém o clique (GeoJSON do estado), não o hit de camada. */
function findMunicipalityFeatureContainingLngLat(
  fc: GeoJSON.FeatureCollection,
  lngLat: mapboxgl.LngLat
): GeoJSON.Feature | null {
  if (!fc.features.length) return null;
  const inside = fc.features.filter(
    (f) => f.geometry && pointInGeometryLngLat(lngLat, f.geometry as GeoJSON.Geometry)
  );
  if (inside.length === 0) return null;
  if (inside.length === 1) return inside[0];
  let best = inside[0];
  let bestArea = Infinity;
  for (const f of inside) {
    const b = featureBounds(f);
    if (!b) continue;
    const [[w, s], [e, n]] = b;
    const area = Math.abs(e - w) * Math.abs(n - s);
    if (area < bestArea) {
      bestArea = area;
      best = f;
    }
  }
  return best;
}

function resetMunicipalityVisuals(
  m: mapboxgl.Map,
  fcRef?: React.MutableRefObject<GeoJSON.FeatureCollection>,
  rawFcRef?: React.MutableRefObject<GeoJSON.FeatureCollection>
) {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  const contextSource = m.getSource('municipalities-context') as mapboxgl.GeoJSONSource | undefined;
  contextSource?.setData(empty);
  const selectedSource = m.getSource('selected-municipality') as mapboxgl.GeoJSONSource | undefined;
  selectedSource?.setData(empty);
  if (fcRef) fcRef.current = empty;
  if (rawFcRef) rawFcRef.current = empty;
}

function clearRegionOverlaySources(m: mapboxgl.Map) {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  for (const sourceId of [
    'region-overlay-agencias',
    'region-overlay-supervisores',
    'region-overlay-lojas',
  ] as const) {
    const source = m.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(empty);
  }
}

function resolveStateId(props?: GeoJSON.GeoJsonProperties): string {
  return String(
    props?.sigla ??
      props?.code_hasc ??
      props?.name ??
      props?.name_pt ??
      props?.nome ??
      props?.id ??
      ''
  );
}

function resolveStateName(props?: GeoJSON.GeoJsonProperties): string {
  return String(props?.name ?? props?.name_pt ?? props?.nome ?? props?.sigla ?? 'Estado');
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function municipalityNameFromProperties(props?: GeoJSON.GeoJsonProperties): string {
  return String(
    props?.name ??
      props?.nome ??
      props?.NM_MUNICIP ??
      props?.NOME ??
      props?.municipio ??
      props?.city ??
      ''
  );
}

function resolveMunicipalityIbgeCode(props?: GeoJSON.GeoJsonProperties): number | null {
  if (!props) return null;
  const candidates = [
    props.CD_MUN,
    props.cd_mun,
    props.COD_IBGE,
    props.cod_ibge,
    props.IBGE,
    props.ibge,
    props.id,
    props.code,
  ];
  for (const raw of candidates) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length >= 6) {
      const parsed = Number.parseInt(digits.slice(0, 7), 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function parseUfFromShortCode(shortCode: unknown): string | null {
  const raw = String(shortCode ?? '').toUpperCase();
  const m = raw.match(/^BR-([A-Z]{2})/);
  return m?.[1] ?? null;
}

function resolveStateCode(props?: GeoJSON.GeoJsonProperties): string | null {
  const sigla = String(props?.sigla ?? '').toUpperCase();
  if (UF_TO_IBGE_CODE[sigla]) return sigla;
  const hasc = String(props?.code_hasc ?? '').toUpperCase();
  const hascUf = hasc.startsWith('BR.') ? hasc.slice(3) : '';
  if (UF_TO_IBGE_CODE[hascUf]) return hascUf;
  return null;
}

function cityLabelLayerIds(m: mapboxgl.Map): string[] {
  const layers = m.getStyle().layers ?? [];
  return layers
    .filter((layer) => {
      if (layer.type !== 'symbol') return false;
      const id = layer.id.toLowerCase();
      const sourceLayer = String((layer as mapboxgl.SymbolLayerSpecification)['source-layer'] ?? '').toLowerCase();
      return (
        id.includes('settlement') ||
        id.includes('place-label') ||
        id.includes('city') ||
        sourceLayer.includes('place_label')
      );
    })
    .map((layer) => layer.id);
}

type MapStyleMode = 'default' | 'satellite' | 'standardWarm';

const MAP_LAYOUT_OPTIONS: {
  id: MapStyleMode;
  label: string;
  caption: string;
  previewClass: string;
}[] = [
  {
    id: 'default',
    label: 'Mapa claro (Light)',
    caption: 'Claro',
    previewClass: 'bg-gradient-to-br from-white via-slate-100 to-slate-300 ring-1 ring-inset ring-slate-300/80',
  },
  {
    id: 'satellite',
    label: 'Satélite com ruas',
    caption: 'Sat.',
    previewClass: 'bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 ring-1 ring-inset ring-slate-700',
  },
  {
    id: 'standardWarm',
    label: 'Mapbox Standard (tema warm)',
    caption: 'Warm',
    previewClass: 'bg-gradient-to-br from-amber-50 via-orange-100 to-amber-200 ring-1 ring-inset ring-amber-400/90',
  },
];

type SearchOption = {
  id: string;
  label: string;
  kind: 'estado' | 'municipio';
  feature: GeoJSON.Feature;
  uf?: string | null;
};

function buildStateSearchOptions(statesFc: GeoJSON.FeatureCollection): SearchOption[] {
  const options = statesFc.features
    .map((feature) => {
      const label = resolveStateName(feature.properties);
      const uf = resolveStateCode(feature.properties);
      const id = resolveStateId(feature.properties);
      if (!label || !id) return null;
      return {
        id: `state-${id}`,
        label,
        kind: 'estado' as const,
        feature,
        uf,
      };
    })
    .filter(Boolean) as SearchOption[];
  return options.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

function buildMunicipalitySearchOptions(
  municipalitiesFc: GeoJSON.FeatureCollection,
  stateUf: string | null
): SearchOption[] {
  const options = municipalitiesFc.features
    .map((feature, index) => {
      const name = municipalityNameFromProperties(feature.properties);
      if (!name) return null;
      return {
        id: `muni-${stateUf ?? 'uf'}-${index}-${normalizeText(name)}`,
        label: name,
        kind: 'municipio' as const,
        feature,
        uf: stateUf,
      };
    })
    .filter(Boolean) as SearchOption[];
  return options.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

interface MapComponentProps {
  mapMarkers: MarcadorMapa[];
  filtersPanelOpen?: boolean;
  onOpenFilters?: () => void;
}

const MapComponent: React.FC<MapComponentProps> = ({
  mapMarkers,
  filtersPanelOpen = false,
  onOpenFilters,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const mapMarkersRef = useRef(mapMarkers);
  mapMarkersRef.current = mapMarkers;
  const { toast } = useToast();
  const clickHandlerRef = useRef<((e: mapboxgl.MapLayerMouseEvent) => void) | null>(null);
  const stateClickHandlerRef = useRef<((e: mapboxgl.MapLayerMouseEvent) => void) | null>(null);
  const cityClickHandlerRef = useRef<((e: mapboxgl.MapMouseEvent) => void) | null>(null);
  const municipalityClickHandlerRef = useRef<((e: mapboxgl.MapLayerMouseEvent) => void) | null>(null);
  const selectStateFeatureRef = useRef<((feature: GeoJSON.Feature) => void) | null>(null);
  const selectMunicipalityFeatureRef = useRef<((feature: GeoJSON.Feature) => void) | null>(null);
  const municipiosCacheRef = useRef<Record<string, GeoJSON.FeatureCollection>>({});
  const allMunicipalitiesFcRef = useRef<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const loadingAllMunicipalitiesRef = useRef(false);
  /** Municípios do UF atual (mesmo dado da fonte municipalities-context) para hit-test por polígono. */
  const municipalitiesFcRef = useRef<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  /** GeoJSON municipal bruto (sem heatValue), para restaurar após coropleto. */
  const municipalitiesRawFcRef = useRef<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const selectedStateCodeRef = useRef<string | null>(null);
  const [selectedStateLabel, setSelectedStateLabel] = useState<string | null>(null);
  const [selectedStateFeature, setSelectedStateFeature] = useState<GeoJSON.Feature | null>(null);
  const [selectedCityLabel, setSelectedCityLabel] = useState<string | null>(null);
  const [selectedMunicipalityIbge, setSelectedMunicipalityIbge] = useState<number | null>(null);
  const [selectedMunicipalityFeature, setSelectedMunicipalityFeature] = useState<GeoJSON.Feature | null>(
    null
  );
  const [overlayAgencias, setOverlayAgencias] = useState(false);
  const [overlaySupervisores, setOverlaySupervisores] = useState(false);
  const [overlayLojas, setOverlayLojas] = useState(false);
  const [sqlAgencyPoints, setSqlAgencyPoints] = useState<SqlMapPoint[]>([]);
  const [sqlStorePoints, setSqlStorePoints] = useState<SqlMapPoint[]>([]);
  const [loadingAgencyPoints, setLoadingAgencyPoints] = useState(false);
  const [loadingStorePoints, setLoadingStorePoints] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);
  const mapTransitionTimerRef = useRef<number | null>(null);
  const mapTransitionStartRef = useRef<number>(Date.now());
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const [isMapTransitionLoading, setIsMapTransitionLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [stateSearchOptions, setStateSearchOptions] = useState<SearchOption[]>([]);
  const [municipalitySearchOptions, setMunicipalitySearchOptions] = useState<SearchOption[]>([]);
  const [allMunicipalityNames, setAllMunicipalityNames] = useState<string[]>([]);
  const [mapStyleMode, setMapStyleMode] = useState<MapStyleMode>('default');
  /** Abre o seletor de layout ao clicar (útil sem hover, ex.: touch). Combinado com hover no botão Layers. */
  const [mapLayoutMenuPinned, setMapLayoutMenuPinned] = useState(false);
  const [mapLayoutFlyoutHover, setMapLayoutFlyoutHover] = useState(false);
  const layoutFlyoutHoverTimerRef = useRef<number | null>(null);
  const mapLayoutPickerRef = useRef<HTMLDivElement>(null);

  const clearLayoutHoverTimer = useCallback(() => {
    if (layoutFlyoutHoverTimerRef.current != null) {
      window.clearTimeout(layoutFlyoutHoverTimerRef.current);
      layoutFlyoutHoverTimerRef.current = null;
    }
  }, []);

  const scheduleLayoutHoverEnd = useCallback(() => {
    clearLayoutHoverTimer();
    layoutFlyoutHoverTimerRef.current = window.setTimeout(() => {
      setMapLayoutFlyoutHover(false);
      layoutFlyoutHoverTimerRef.current = null;
    }, 140);
  }, [clearLayoutHoverTimer]);

  const openLayoutFlyoutHover = useCallback(() => {
    clearLayoutHoverTimer();
    setMapLayoutFlyoutHover(true);
  }, [clearLayoutHoverTimer]);

  useEffect(() => () => clearLayoutHoverTimer(), [clearLayoutHoverTimer]);

  const showLayoutFlyout = mapLayoutMenuPinned || mapLayoutFlyoutHover;
  const [productivitySheetOpen, setProductivitySheetOpen] = useState(false);
  const [selectedBottomProduct, setSelectedBottomProduct] = useState<ProdutoExpressoId | null>(null);
  const [productivityScope, setProductivityScope] = useState<'estado' | 'municipio'>('estado');
  const [sqlExpressoMetrics, setSqlExpressoMetrics] = useState<ExpressoRegionMetrics | null>(null);
  const [sqlProductivityRows, setSqlProductivityRows] = useState<MunicipalityProductivityRow[] | null>(null);
  const [municipalityChoroplethEnabled, setMunicipalityChoroplethEnabled] = useState(false);
  /** Incrementa quando o GeoJSON de municípios (UF ou Brasil) é escrito nos refs — refs sozinhos não disparam o efeito do coroplético. */
  const [municipalitiesGeoVersion, setMunicipalitiesGeoVersion] = useState(0);
  const [choroplethLegend, setChoroplethLegend] = useState<{ min: number; max: number } | null>(null);
  /** Malha municipal (preenchimento + contornos do contexto); não afeta zoom nem contorno do município selecionado. */
  const [municipalityMeshVisible, setMunicipalityMeshVisible] = useState(true);
  const [outsideMaskColor, setOutsideMaskColor] = useState<string>(MAPBOX_CONFIG.outsideBrazilMaskColor);
  const activeBaseStyle =
    mapStyleMode === 'satellite'
      ? MAPBOX_CONFIG.styles.satellite
      : mapStyleMode === 'standardWarm'
        ? MAPBOX_CONFIG.styles.standardWarm
        : MAPBOX_CONFIG.styles.default;

  useEffect(() => {
    if (!mapLayoutMenuPinned) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = mapLayoutPickerRef.current;
      if (root && !root.contains(e.target as Node)) {
        setMapLayoutMenuPinned(false);
        setMapLayoutFlyoutHover(false);
        clearLayoutHoverTimer();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [mapLayoutMenuPinned, clearLayoutHoverTimer]);

  const fallbackExpressoMetrics = useMemo(
    () => buildExpressoRegionMetrics(mapMarkers, selectedStateFeature),
    [mapMarkers, selectedStateFeature]
  );
  const expressoMetrics = sqlExpressoMetrics ?? fallbackExpressoMetrics;

  const filteredRegionAgencias = useMemo(
    () => filterRegionMapPoints(sqlAgencyPoints, selectedMunicipalityFeature, selectedStateFeature),
    [sqlAgencyPoints, selectedMunicipalityFeature, selectedStateFeature]
  );
  const filteredRegionSupervisores = useMemo(
    () =>
      filterRegionMapPoints(MOCK_REGION_SUPERVISORES, selectedMunicipalityFeature, selectedStateFeature),
    [selectedMunicipalityFeature, selectedStateFeature]
  );
  const filteredRegionLojas = useMemo(
    () => filterRegionMapPoints(sqlStorePoints, selectedMunicipalityFeature, selectedStateFeature),
    [sqlStorePoints, selectedMunicipalityFeature, selectedStateFeature]
  );

  const getCurrentMapBbox = (): BboxQuery | null => {
    const m = map.current;
    if (!m) return null;
    const bounds = m.getBounds();
    return {
      minLng: bounds.getWest(),
      minLat: bounds.getSouth(),
      maxLng: bounds.getEast(),
      maxLat: bounds.getNorth(),
    };
  };

  const refreshOverlayDataForViewport = async () => {
    const bbox = getCurrentMapBbox();
    if (!bbox) return;

    if (overlayAgencias && !loadingAgencyPoints) {
      setLoadingAgencyPoints(true);
      try {
        const points = await fetchAgencyPoints({ bbox });
        setSqlAgencyPoints(points);
      } catch (error) {
        console.error('Falha ao carregar agências SQL:', error);
        toast({
          title: 'Falha ao carregar agências',
          description: 'Não foi possível buscar agências no SQL Server.',
          variant: 'destructive',
        });
      } finally {
        setLoadingAgencyPoints(false);
      }
    }

    if (overlayLojas && !loadingStorePoints) {
      setLoadingStorePoints(true);
      try {
        const points = await fetchStorePoints({ bbox });
        setSqlStorePoints(points);
      } catch (error) {
        console.error('Falha ao carregar lojas SQL:', error);
        toast({
          title: 'Falha ao carregar lojas',
          description: 'Não foi possível buscar lojas no SQL Server.',
          variant: 'destructive',
        });
      } finally {
        setLoadingStorePoints(false);
      }
    }
  };

  const visibleSearchOptions = useMemo(() => {
    const q = normalizeText(searchQuery);
    if (q.length < 2) return [];
    const states = stateSearchOptions.filter((item) => normalizeText(item.label).includes(q));
    const municipalities = municipalitySearchOptions.filter((item) =>
      normalizeText(item.label).includes(q)
    );
    return [...states.slice(0, 6), ...municipalities.slice(0, 8)];
  }, [searchQuery, stateSearchOptions, municipalitySearchOptions]);

  const municipalityNamesForTable = useMemo(() => {
    const names =
      selectedStateFeature == null
        ? allMunicipalityNames
        : municipalitySearchOptions.map((item) => item.label).filter(Boolean);
    return names.length > 0 ? names.slice(0, 60) : selectedCityLabel ? [selectedCityLabel] : [];
  }, [allMunicipalityNames, municipalitySearchOptions, selectedCityLabel, selectedStateFeature]);

  const stateNamesForTable = useMemo(
    () => stateSearchOptions.map((item) => item.label).filter(Boolean).slice(0, 60),
    [stateSearchOptions]
  );

  const fallbackMunicipalityProductivityRows = useMemo(() => {
    if (!selectedBottomProduct) return [];
    const names = productivityScope === 'estado' ? stateNamesForTable : municipalityNamesForTable;
    return buildMunicipalityProductivityRows(selectedBottomProduct, names);
  }, [selectedBottomProduct, productivityScope, stateNamesForTable, municipalityNamesForTable]);
  const municipalityProductivityRows = sqlProductivityRows ?? fallbackMunicipalityProductivityRows;

  const productsForBottomSheet = useMemo(
    () =>
      expressoMetrics?.produtos ?? [
        emptyProdutoExpressoResumo('consignado', 'Consignado'),
        emptyProdutoExpressoResumo('lime', 'Lime'),
        emptyProdutoExpressoResumo('contas', 'Contas'),
        emptyProdutoExpressoResumo('seguros', 'Seguros'),
      ],
    [expressoMetrics]
  );
  const hasStatePanel = Boolean(selectedStateLabel && expressoMetrics);
  const hasMapSelection = Boolean(
    selectedStateFeature || selectedMunicipalityFeature || selectedCityLabel
  );
  const choroplethModeLabel = useMemo(() => {
    if (!municipalityChoroplethEnabled || !selectedBottomProduct) return null;
    if (productivityScope === 'estado') return 'Estados (Brasil)';
    return selectedStateFeature ? 'Municípios do estado selecionado' : 'Todos os municípios (Brasil)';
  }, [municipalityChoroplethEnabled, selectedBottomProduct, productivityScope, selectedStateFeature]);

  const selectedStateUf = useMemo(
    () => resolveStateCode(selectedStateFeature?.properties),
    [selectedStateFeature]
  );

  useEffect(() => {
    let active = true;
    if (!selectedStateUf) {
      setSqlExpressoMetrics(null);
      return () => {
        active = false;
      };
    }

    void fetchExpressoStateMetrics(selectedStateUf, selectedMunicipalityIbge)
      .then((metrics) => {
        if (!active) return;
        if (metrics && Array.isArray(metrics.produtos) && metrics.produtos.length > 0) {
          setSqlExpressoMetrics(metrics);
          return;
        }
        setSqlExpressoMetrics(null);
      })
      .catch((error) => {
        if (!active) return;
        console.warn('Falha ao carregar métricas Expresso via SQL, usando fallback mock.', error);
        setSqlExpressoMetrics(null);
      });

    return () => {
      active = false;
    };
  }, [selectedStateUf, selectedMunicipalityIbge]);

  useEffect(() => {
    let active = true;
    if (!selectedBottomProduct) {
      setSqlProductivityRows(null);
      return () => {
        active = false;
      };
    }

    const ufSigla = productivityScope === 'municipio' ? selectedStateUf : null;
    if (productivityScope === 'municipio' && !ufSigla) {
      setSqlProductivityRows(null);
      return () => {
        active = false;
      };
    }

    void fetchExpressoProductivityRows({
      produtoId: selectedBottomProduct,
      scope: productivityScope,
      ufSigla,
    })
      .then((rows) => {
        if (!active) return;
        if (Array.isArray(rows) && rows.length > 0) {
          setSqlProductivityRows(rows);
          return;
        }
        setSqlProductivityRows(null);
      })
      .catch((error) => {
        if (!active) return;
        console.warn('Falha ao carregar produtividade Expresso via SQL, usando fallback mock.', error);
        setSqlProductivityRows(null);
      });

    return () => {
      active = false;
    };
  }, [selectedBottomProduct, productivityScope, selectedStateUf]);

  const clusterClickHandlerRef = useRef<((e: mapboxgl.MapLayerMouseEvent) => void) | null>(null);
  const regionOverlayClickHandlerRef = useRef<((e: mapboxgl.MapLayerMouseEvent) => void) | null>(null);

  const handleSearchSelect = (option: SearchOption) => {
    if (option.kind === 'estado') {
      selectStateFeatureRef.current?.(option.feature);
      return;
    }
    selectMunicipalityFeatureRef.current?.(option.feature);
  };

  const handleZoomIn = () => {
    const m = map.current;
    if (!m) return;
    try {
      m.zoomIn({ duration: 250 });
    } catch {
      /* ignore */
    }
  };

  const handleZoomOut = () => {
    const m = map.current;
    if (!m) return;
    try {
      m.zoomOut({ duration: 250 });
    } catch {
      /* ignore */
    }
  };

  const startMapTransitionLoading = () => {
    mapTransitionStartRef.current = Date.now();
    setIsMapTransitionLoading(true);
  };

  const finishMapTransitionLoading = () => {
    const elapsed = Date.now() - mapTransitionStartRef.current;
    const remaining = Math.max(0, 900 - elapsed);
    if (mapTransitionTimerRef.current != null) {
      window.clearTimeout(mapTransitionTimerRef.current);
    }
    mapTransitionTimerRef.current = window.setTimeout(() => {
      setIsMapTransitionLoading(false);
      mapTransitionTimerRef.current = null;
    }, remaining);
  };

  const handleToggleAgencias = async () => {
    if (overlayAgencias) {
      setOverlayAgencias(false);
      return;
    }

    const bbox = getCurrentMapBbox();
    setLoadingAgencyPoints(true);
    try {
      const points = await fetchAgencyPoints({ bbox });
      setSqlAgencyPoints(points);
      setOverlayAgencias(true);
    } catch (error) {
        console.error('Falha ao carregar agências SQL:', error);
        toast({
          title: 'Falha ao carregar agências',
          description: 'Não foi possível buscar agências no SQL Server.',
          variant: 'destructive',
        });
      return;
    } finally {
      setLoadingAgencyPoints(false);
    }
  };

  const handleToggleLojas = async () => {
    if (overlayLojas) {
      setOverlayLojas(false);
      return;
    }

    const bbox = getCurrentMapBbox();
    setLoadingStorePoints(true);
    try {
      const points = await fetchStorePoints({ bbox });
      setSqlStorePoints(points);
      setOverlayLojas(true);
    } catch (error) {
        console.error('Falha ao carregar lojas SQL:', error);
        toast({
          title: 'Falha ao carregar lojas',
          description: 'Não foi possível buscar lojas no SQL Server.',
          variant: 'destructive',
        });
      return;
    } finally {
      setLoadingStorePoints(false);
    }
  };

  const openProductivitySheet = () => {
    setProductivityScope(selectedStateFeature ? 'municipio' : 'estado');
    setSelectedBottomProduct(null);
    setMunicipalityChoroplethEnabled(false);
    setChoroplethLegend(null);
    setProductivitySheetOpen(true);
  };

  const clearSelectedState = () => {
    const m = map.current;
    if (m?.getLayer('br-states-selected')) {
      m.setFilter('br-states-selected', ['==', ['get', 'sigla'], '__none__']);
    }
    if (m?.getLayer('br-states-dim')) {
      m.setFilter('br-states-dim', ['==', ['get', 'sigla'], '__none__']);
    }
    if (m?.getLayer('br-states-outline')) {
      m.setFilter('br-states-outline', null);
    }
    const statesSrc = m?.getSource('br-states') as mapboxgl.GeoJSONSource | undefined;
    if (statesSrc && m?.isStyleLoaded()) {
      try {
        statesSrc.setData(BRAZIL_STATES_GEOJSON);
      } catch {
        /* ignore */
      }
    }
    if (m?.getLayer('br-states-choropleth')) {
      try {
        m.setPaintProperty('br-states-choropleth', 'fill-color', '#93c5fd');
        m.setPaintProperty('br-states-choropleth', 'fill-opacity', 0);
      } catch {
        /* ignore */
      }
    }
    if (m) clearRegionOverlaySources(m);
    if (m) resetMunicipalityVisuals(m, municipalitiesFcRef, municipalitiesRawFcRef);
    setSelectedStateLabel(null);
    setSelectedStateFeature(null);
    setSelectedCityLabel(null);
    setSelectedMunicipalityIbge(null);
    setSelectedMunicipalityFeature(null);
    setMunicipalitySearchOptions([]);
    setSearchQuery('');
    setSearchOpen(false);
    setProductivitySheetOpen(false);
    setSelectedBottomProduct(null);
    setProductivityScope('estado');
    setMunicipalityChoroplethEnabled(false);
    setChoroplethLegend(null);
    selectedStateCodeRef.current = null;
    if (m?.isStyleLoaded()) {
      try {
        m.fitBounds(MAPBOX_CONFIG.bounds.brazil, {
          padding: 56,
          maxZoom: 4.75,
          duration: 650,
        });
      } catch {
        /* ignore */
      }
    }
  };

  const initializeMap = async () => {
    if (!mapContainer.current) return;

    try {
      mapboxgl.accessToken = MAPBOX_CONFIG.accessToken;

      const mapInit: mapboxgl.MapOptions & {
        config?: { basemap: Record<string, string | boolean> };
      } = {
        container: mapContainer.current,
        style: activeBaseStyle,
        projection: MAPBOX_CONFIG.projection,
        bounds: MAPBOX_CONFIG.bounds.brazil,
        fitBoundsOptions: {
          padding: 56,
          maxZoom: 4.75,
          duration: 0,
        },
        pitch: 0,
        bearing: 0,
        minPitch: 0,
        maxPitch: 0,
        dragRotate: false,
        touchPitch: false,
        minZoom: MAPBOX_CONFIG.zoom.min,
        maxZoom: MAPBOX_CONFIG.zoom.max,
        maxBounds: MAPBOX_CONFIG.bounds.panLimit,
      };
      if (isStandardStyleUrl(activeBaseStyle)) {
        mapInit.config = {
          basemap: {
            theme: 'warm',
            show3dObjects: false,
            lightPreset: 'day',
          },
        };
      }

      map.current = new mapboxgl.Map(mapInit);

      map.current.on('load', async () => {
        setMapReadyVersion((v) => v + 1);

        const m = map.current!;
        if (isStandardStyleUrl(activeBaseStyle)) {
          applyStandardWarmBasemap(m);
        }
        try {
          m.setProjection(MAPBOX_CONFIG.projection);
        } catch {
          /* estilo antigo sem API de projeção */
        }
        try {
          m.setTerrain(null);
        } catch {
          /* estilo sem terrain ou API não disponível */
        }
        m.dragRotate.disable();
        m.touchZoomRotate.disableRotation();
        const sym = firstSymbolLayerId(m);

        /** GeoJSON no Mapbox pode não estar “pronto” no mesmo tick do setData; re-dispara o coroplético no próximo task. */
        const scheduleMunicipalitiesChoroplethReapply = () => {
          setMunicipalitiesGeoVersion((v) => v + 1);
          window.setTimeout(() => {
            setMunicipalitiesGeoVersion((v) => v + 1);
          }, 0);
        };

        const loadMunicipiosByUf = async (uf: string): Promise<GeoJSON.FeatureCollection | null> => {
          if (municipiosCacheRef.current[uf]) return municipiosCacheRef.current[uf];
          const ibgeCode = UF_TO_IBGE_CODE[uf];
          if (!ibgeCode) return null;
          const url = `${GEODATA_BR_BASE}/geojs-${ibgeCode}-mun.json`;
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Falha ao carregar municípios de ${uf}: ${response.status}`);
          const fc = (await response.json()) as GeoJSON.FeatureCollection;
          municipiosCacheRef.current[uf] = fc;
          return fc;
        };
        const loadAllMunicipios = async (): Promise<GeoJSON.FeatureCollection> => {
          if (allMunicipalitiesFcRef.current.features.length > 0) return allMunicipalitiesFcRef.current;
          if (loadingAllMunicipalitiesRef.current) {
            return { type: 'FeatureCollection', features: [] };
          }
          loadingAllMunicipalitiesRef.current = true;
          try {
            const ufs = Object.keys(UF_TO_IBGE_CODE);
            const chunks = await Promise.all(
              ufs.map(async (uf) => {
                const fc = await loadMunicipiosByUf(uf);
                return fc?.features ?? [];
              })
            );
            const merged: GeoJSON.FeatureCollection = {
              type: 'FeatureCollection',
              features: chunks.flat(),
            };
            allMunicipalitiesFcRef.current = merged;
            const names = merged.features
              .map((f) => municipalityNameFromProperties(f.properties))
              .filter((name) => name.trim().length > 0)
              .slice(0, 5000);
            setAllMunicipalityNames(names);
            scheduleMunicipalitiesChoroplethReapply();
            return merged;
          } finally {
            loadingAllMunicipalitiesRef.current = false;
          }
        };

        void fetch(BRAZIL_STATES_GEOJSON)
          .then(async (response) => {
            if (!response.ok) throw new Error(`Estados: ${response.status}`);
            const statesFc = (await response.json()) as GeoJSON.FeatureCollection;
            setStateSearchOptions(buildStateSearchOptions(statesFc));
          })
          .catch((err) => console.warn('Catálogo de estados não carregado para busca:', err));

        try {
          m.addSource('brasil-context', {
            type: 'vector',
            url: 'mapbox://mapbox.country-boundaries-v1',
          });
          m.addLayer(
            {
              id: 'brasil-context-fill',
              type: 'fill',
              source: 'brasil-context',
              'source-layer': 'country_boundaries',
              filter: ['==', ['get', 'iso_3166_1'], 'BR'],
              paint: fillPaintForStandard(activeBaseStyle, {
                'fill-color': '#94a3b8',
                'fill-opacity': 0.12,
              }),
            },
            sym
          );
        } catch (e) {
          console.warn('Camada de contexto Brasil:', e);
        }

        if (MAPBOX_CONFIG.maskOutsideBrazil && sym) {
          try {
            const res = await fetch(BRAZIL_BOUNDARY_GEOJSON);
            if (!res.ok) throw new Error(`GeoJSON: ${res.status}`);
            const fc = (await res.json()) as GeoJSON.FeatureCollection;
            const br = fc.features[0];
            if (!br) throw new Error('Brasil não encontrado no GeoJSON');
            const mask = buildOutsideBrazilMaskFeature(br);
            m.addSource('brazil-outside-mask', { type: 'geojson', data: mask });
            const maskColor = resolveLandMatchMaskColor(m);
            setOutsideMaskColor(maskColor);
            m.addLayer(
              {
                id: 'brazil-outside-mask-fill',
                type: 'fill',
                source: 'brazil-outside-mask',
                paint: fillPaintForStandard(activeBaseStyle, {
                  'fill-color': maskColor,
                  'fill-opacity': 1,
                }),
              },
              sym
            );
            applyBrazilBasemapLabelTweaks(m);
            m.once('idle', () => {
              if (!map.current) return;
              applyBrazilBasemapLabelTweaks(map.current);
            });
          } catch (e) {
            console.warn('Máscara fora do Brasil não aplicada:', e);
          }
        }

        finishMapTransitionLoading();

        m.addSource('structure-people', {
          type: 'geojson',
          data: markersToFeatureCollectionByKind(mapMarkersRef.current, 'pessoa'),
        });

        m.addSource('structure-agencies', {
          type: 'geojson',
          data: markersToFeatureCollectionByKind(mapMarkersRef.current, 'agencia'),
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 52,
        });

        try {
          m.addSource('br-states', {
            type: 'geojson',
            data: BRAZIL_STATES_GEOJSON,
          });

          m.addLayer({
            id: 'br-states-outline',
            type: 'line',
            source: 'br-states',
            paint: linePaintForStandard(activeBaseStyle, {
              'line-color': '#334155',
              'line-width': 1.2,
              'line-opacity': 0.45,
            }),
          });

          m.addLayer({
            id: 'br-states-selected',
            type: 'fill',
            source: 'br-states',
            filter: ['==', ['get', 'sigla'], '__none__'],
            paint: fillPaintForStandard(activeBaseStyle, {
              'fill-color': '#93c5fd',
              'fill-opacity': 0.09,
            }),
          });
          m.addLayer({
            id: 'br-states-choropleth',
            type: 'fill',
            source: 'br-states',
            paint: fillPaintForStandard(activeBaseStyle, {
              'fill-color': '#93c5fd',
              'fill-opacity': 0,
            }),
          });

          m.addLayer({
            id: 'br-states-dim',
            type: 'fill',
            source: 'br-states',
            filter: ['==', ['get', 'sigla'], '__none__'],
            paint: fillPaintForStandard(activeBaseStyle, {
              'fill-color': '#9ca3af',
              'fill-opacity': 0.4,
            }),
          });

          m.addLayer({
            id: 'br-states-hit',
            type: 'fill',
            source: 'br-states',
            paint: fillPaintForStandard(activeBaseStyle, {
              'fill-color': '#000000',
              'fill-opacity': 0.001,
            }),
          });

          const applyStateSelection = (f: GeoJSON.Feature) => {
            const stateId = resolveStateId(f.properties);
            if (!stateId) return;

            // Ao trocar de estado, desligamos overlays regionais para evitar contexto antigo na tela.
            setOverlayAgencias(false);
            setOverlayLojas(false);
            clearRegionOverlaySources(m);
            resetMunicipalityVisuals(m, municipalitiesFcRef, municipalitiesRawFcRef);
            setMunicipalitySearchOptions([]);
            setSelectedCityLabel(null);
            setSelectedMunicipalityIbge(null);
            setSelectedMunicipalityFeature(null);

            const uf = resolveStateCode(f.properties);
            selectedStateCodeRef.current = uf;
            setSearchQuery(resolveStateName(f.properties));
            setSearchOpen(false);

            m.setFilter('br-states-selected', ['==', ['get', 'sigla'], stateId]);
            m.setFilter('br-states-dim', ['!=', ['get', 'sigla'], stateId]);
            m.setFilter('br-states-outline', ['==', ['get', 'sigla'], stateId]);
            setSelectedStateLabel(resolveStateName(f.properties));
            setSelectedStateFeature(f);

            if (uf) {
              void loadMunicipiosByUf(uf)
                .then((munis) => {
                  if (!map.current || !munis) return;
                  if (selectedStateCodeRef.current !== uf) return;
                  const ctx = map.current.getSource('municipalities-context') as
                    | mapboxgl.GeoJSONSource
                    | undefined;
                  ctx?.setData(munis);
                  municipalitiesFcRef.current = munis;
                  municipalitiesRawFcRef.current = munis;
                  setMunicipalitySearchOptions(buildMunicipalitySearchOptions(munis, uf));
                  scheduleMunicipalitiesChoroplethReapply();
                })
                .catch((err) => console.warn('Municípios do estado não carregados:', err));
            }

            const b = featureBounds(f);
            if (!b) return;
            try {
              m.fitBounds(b, { padding: 64, maxZoom: 7.8, duration: 700 });
            } catch {
              /* ignore */
            }
          };

          selectStateFeatureRef.current = applyStateSelection;

          const onStateClick = (e: mapboxgl.MapLayerMouseEvent) => {
            const f = e.features?.[0] as GeoJSON.Feature | undefined;
            if (!f) return;
            applyStateSelection(f);
          };

          stateClickHandlerRef.current = onStateClick;
          m.on('click', 'br-states-hit', onStateClick);
          m.on('mouseenter', 'br-states-hit', () => {
            m.getCanvas().style.cursor = 'pointer';
          });
          m.on('mouseleave', 'br-states-hit', () => {
            m.getCanvas().style.cursor = '';
          });
          void loadAllMunicipios().catch((err) =>
            console.warn('Falha ao preparar municípios do Brasil para coropleto:', err)
          );
        } catch (e) {
          console.warn('Camadas de estados não aplicadas:', e);
        }

        try {
          m.addSource('municipalities-context', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          m.addLayer({
            id: 'municipalities-context-fill',
            type: 'fill',
            source: 'municipalities-context',
            paint: fillPaintForStandard(activeBaseStyle, {
              'fill-color': '#67e8f9',
              'fill-opacity': 0.06,
            }),
          }, sym);

          m.addLayer({
            id: 'municipalities-context-line',
            type: 'line',
            source: 'municipalities-context',
            paint: linePaintForStandard(activeBaseStyle, {
              'line-color': '#0891b2',
              'line-width': 1.1,
              'line-opacity': 0.42,
            }),
          }, sym);

          m.addSource('selected-municipality', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          m.addLayer({
            id: 'selected-municipality-fill',
            type: 'fill',
            source: 'selected-municipality',
            paint: fillPaintForStandard(activeBaseStyle, {
              'fill-color': '#38bdf8',
              'fill-opacity': 0.12,
            }),
          }, sym);

          m.addLayer({
            id: 'selected-municipality-line',
            type: 'line',
            source: 'selected-municipality',
            paint: linePaintForStandard(activeBaseStyle, {
              'line-color': '#0284c7',
              'line-width': 2.2,
              'line-opacity': 0.85,
            }),
          }, sym);

          const selectMunicipalityFeature = (feature: GeoJSON.Feature) => {
            const source = m.getSource('selected-municipality') as mapboxgl.GeoJSONSource | undefined;
            if (!source) return;
            // Ao trocar de município, desligamos overlays regionais para o usuário reativar no novo contexto.
            setOverlayAgencias(false);
            setOverlayLojas(false);
            clearRegionOverlaySources(m);
            source.setData({ type: 'FeatureCollection', features: [feature] });
            const municipalityName = municipalityNameFromProperties(feature.properties) || 'Município';
            const municipalityIbge = resolveMunicipalityIbgeCode(feature.properties);
            setSelectedMunicipalityFeature(feature);
            setSelectedCityLabel(municipalityName);
            setSelectedMunicipalityIbge(municipalityIbge);
            setSearchQuery(municipalityName);
            setSearchOpen(false);
            const muniBounds = featureBounds(feature);
            if (!muniBounds) return;
            try {
              m.fitBounds(muniBounds, { padding: 52, maxZoom: 11.5, duration: 700 });
            } catch {
              /* ignore */
            }
          };

          selectMunicipalityFeatureRef.current = selectMunicipalityFeature;

          const onMapClick = async (e: mapboxgl.MapMouseEvent) => {
            const topStack = m.queryRenderedFeatures(e.point);
            if (topStack.length > 0) {
              const topId = topStack[0].layer.id;
              if (topId === 'br-states-hit') return;
              if (topId === 'municipalities-context-fill') return;
              if (topId.startsWith('selected-municipality')) return;
              if (topId.startsWith('structure-')) return;
              if (topId.startsWith('region-overlay-')) return;
            }

            const muniByPoly = findMunicipalityFeatureContainingLngLat(municipalitiesFcRef.current, e.lngLat);
            if (muniByPoly) {
              selectMunicipalityFeature(muniByPoly);
              return;
            }

            const labelLayers = cityLabelLayerIds(m);
            if (labelLayers.length === 0) return;
            const clickBox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
              [e.point.x - 10, e.point.y - 10],
              [e.point.x + 10, e.point.y + 10],
            ];
            const features = m.queryRenderedFeatures(clickBox, { layers: labelLayers });
            const city = features.find((feature) => {
              if (!feature.geometry || feature.geometry.type !== 'Point') return false;
              const props = feature.properties ?? {};
              const name = String(props.name ?? props.name_pt ?? props.nome ?? '');
              return name.trim().length > 0;
            });
            if (!city) return;

            const geom = city.geometry;
            if (!geom || geom.type !== 'Point') return;
            const coords = geom.coordinates as [number, number];
            const cityName = String(city.properties?.name ?? city.properties?.name_pt ?? 'Cidade');

            setSelectedCityLabel(cityName);
            setSelectedMunicipalityIbge(null);

            const guessedUf =
              selectedStateCodeRef.current ?? parseUfFromShortCode(city.properties?.short_code);
            if (guessedUf) {
              try {
                const municipios = await loadMunicipiosByUf(guessedUf);
                const contextSource = m.getSource('municipalities-context') as
                  | mapboxgl.GeoJSONSource
                  | undefined;
                const source = m.getSource('selected-municipality') as mapboxgl.GeoJSONSource | undefined;
                if (!municipios || !source || !contextSource) return;
                if (selectedStateCodeRef.current && selectedStateCodeRef.current !== guessedUf) return;

                contextSource.setData(municipios);
                municipalitiesFcRef.current = municipios;
                municipalitiesRawFcRef.current = municipios;
                scheduleMunicipalitiesChoroplethReapply();

                const cityNameNorm = normalizeText(cityName);
                const match = municipios.features.find((feature) => {
                  const muniName = municipalityNameFromProperties(feature.properties);
                  return normalizeText(muniName) === cityNameNorm;
                });

                if (match) {
                  selectMunicipalityFeature(match);
                  return;
                } else {
                  source.setData({ type: 'FeatureCollection', features: [] });
                  setSelectedMunicipalityFeature(null);
                }
              } catch (error) {
                console.warn('Não foi possível carregar contorno do município:', error);
              }
            }

            try {
              m.easeTo({ center: coords, zoom: Math.max(m.getZoom(), 9.6), duration: 700 });
            } catch {
              /* ignore */
            }
          };

          const onMunicipalityPolygonClick = (e: mapboxgl.MapLayerMouseEvent) => {
            const direct = (e.features?.[0] as GeoJSON.Feature | undefined) ?? null;
            const byPoint = findMunicipalityFeatureContainingLngLat(municipalitiesFcRef.current, e.lngLat);
            const feature = byPoint ?? direct;
            if (!feature) return;
            selectMunicipalityFeature(feature);
          };

          cityClickHandlerRef.current = onMapClick;
          m.on('click', onMapClick);
          municipalityClickHandlerRef.current = onMunicipalityPolygonClick;
          m.on('click', 'municipalities-context-fill', onMunicipalityPolygonClick);
          m.on('mouseenter', 'municipalities-context-fill', () => {
            m.getCanvas().style.cursor = 'pointer';
          });
          m.on('mouseleave', 'municipalities-context-fill', () => {
            m.getCanvas().style.cursor = '';
          });
        } catch (e) {
          console.warn('Seleção de cidade não aplicada:', e);
        }

        m.addLayer({
          id: 'structure-agencies-clusters',
          type: 'circle',
          source: 'structure-agencies',
          filter: ['has', 'point_count'],
          layout: { visibility: 'none' },
          paint: circlePaintForStandard(activeBaseStyle, {
            'circle-color': 'rgba(185, 28, 28, 0.92)',
            'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 28, 30, 100, 38],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95,
          }),
        });

        m.addLayer({
          id: 'structure-agencies-cluster-count',
          type: 'symbol',
          source: 'structure-agencies',
          filter: ['has', 'point_count'],
          layout: {
            visibility: 'none',
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 13,
          },
          paint: {
            'text-color': '#ffffff',
          },
        });

        m.addLayer({
          id: 'structure-agencies-point',
          type: 'circle',
          source: 'structure-agencies',
          filter: ['!', ['has', 'point_count']],
          layout: { visibility: 'none' },
          paint: circlePaintForStandard(activeBaseStyle, {
            'circle-radius': 8,
            'circle-color': '#b91c1c',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95,
          }),
        });

        m.addLayer({
          id: 'structure-people-circles',
          type: 'circle',
          source: 'structure-people',
          paint: circlePaintForStandard(activeBaseStyle, {
            'circle-radius': 7,
            'circle-color': [
              'match',
              ['get', 'cargo'],
              'diretoria_regional',
              '#7c3aed',
              'gerente_regional',
              '#2563eb',
              'gerente_area',
              '#16a34a',
              'coordenador',
              '#ea580c',
              'supervisor',
              '#dc2626',
              '#64748b',
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95,
          }),
        });

        const onStructClick = (e: mapboxgl.MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f || !f.properties || !map.current) return;
          const nome = String(f.properties.nome ?? '');
          const sub = String(f.properties.subtitulo ?? '');
          const det = String(f.properties.detalhe_agencias ?? '').trim();
          const detHtml = det
            ? `<div class="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600 whitespace-pre-line">${escapeHtml(det)}</div>`
            : '';
          new mapboxgl.Popup({ maxWidth: '300px' })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="text-sm"><strong>${escapeHtml(nome)}</strong><br/><span class="text-gray-600">${escapeHtml(sub)}</span>${detHtml}</div>`
            )
            .addTo(map.current);
        };

        const onClusterClick = (e: mapboxgl.MapLayerMouseEvent) => {
          const feat = e.features?.[0];
          const mapInst = map.current;
          if (!feat?.properties || !mapInst) return;
          const clusterId = feat.properties.cluster_id as number | undefined;
          const src = mapInst.getSource('structure-agencies') as mapboxgl.GeoJSONSource | undefined;
          if (clusterId === undefined || !src) return;
          src.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err || zoom == null || !map.current) return;
            const geom = feat.geometry;
            if (!geom || geom.type !== 'Point') return;
            const coords = geom.coordinates as [number, number];
            try {
              map.current.easeTo({ center: coords, zoom, duration: 420 });
            } catch {
              /* ignore */
            }
          });
        };

        clusterClickHandlerRef.current = onClusterClick;
        clickHandlerRef.current = onStructClick;

        m.on('click', 'structure-people-circles', onStructClick);
        m.on('click', 'structure-agencies-point', onStructClick);
        m.on('click', 'structure-agencies-clusters', onClusterClick);

        const setStructPointer = () => {
          m.getCanvas().style.cursor = 'pointer';
        };
        const clearStructPointer = () => {
          m.getCanvas().style.cursor = '';
        };
        for (const layerId of [
          'structure-people-circles',
          'structure-agencies-point',
          'structure-agencies-clusters',
        ] as const) {
          m.on('mouseenter', layerId, setStructPointer);
          m.on('mouseleave', layerId, clearStructPointer);
        }

        const emptyRegionFc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
        m.addSource('region-overlay-agencias', { type: 'geojson', data: emptyRegionFc });
        m.addSource('region-overlay-supervisores', { type: 'geojson', data: emptyRegionFc });
        m.addSource('region-overlay-lojas', { type: 'geojson', data: emptyRegionFc });

        try {
          const agenciaImage = await m.loadImage('/agencia.png');
          if (!m.hasImage('region-overlay-agencia-icon')) {
            m.addImage('region-overlay-agencia-icon', agenciaImage.data);
          }
        } catch (error) {
          console.warn('Não foi possível carregar ícone da agência:', error);
        }

        m.addLayer({
          id: 'region-overlay-agencias-cir',
          type: 'symbol',
          source: 'region-overlay-agencias',
          layout: {
            'icon-image': 'region-overlay-agencia-icon',
            'icon-size': 0.22,
            'icon-allow-overlap': true,
          },
        });
        m.addLayer({
          id: 'region-overlay-supervisores-cir',
          type: 'circle',
          source: 'region-overlay-supervisores',
          paint: circlePaintForStandard(activeBaseStyle, {
            'circle-radius': 7,
            'circle-color': '#7c3aed',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.95,
          }),
        });
        m.addLayer({
          id: 'region-overlay-lojas-cir',
          type: 'circle',
          source: 'region-overlay-lojas',
          paint: circlePaintForStandard(activeBaseStyle, {
            'circle-radius': 7,
            'circle-color': '#0d9488',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.95,
          }),
        });

        const onRegionOverlayClick = (e: mapboxgl.MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f || !f.properties || !map.current) return;
          const nome = String(f.properties.nome ?? '');
          const sub = String(f.properties.subtitulo ?? '');
          new mapboxgl.Popup({ maxWidth: '280px' })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="text-sm"><strong>${escapeHtml(nome)}</strong><br/><span class="text-gray-600">${escapeHtml(sub)}</span></div>`
            )
            .addTo(map.current);
        };
        regionOverlayClickHandlerRef.current = onRegionOverlayClick;

        const regionOverlayLayerIds = [
          'region-overlay-agencias-cir',
          'region-overlay-supervisores-cir',
          'region-overlay-lojas-cir',
        ] as const;

        for (const layerId of regionOverlayLayerIds) {
          m.on('click', layerId, onRegionOverlayClick);
          m.on('mouseenter', layerId, setStructPointer);
          m.on('mouseleave', layerId, clearStructPointer);
        }

        setAgencyLayersVisibility(m, mapMarkersRef.current.some((x) => x.kind === 'agencia'));

        const initial = mapMarkersRef.current;
        if (initial.length > 0) {
          const lngs = initial.map((x) => x.lngLat[0]);
          const lats = initial.map((x) => x.lngLat[1]);
          const b: mapboxgl.LngLatBoundsLike = [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ];
          try {
            m.fitBounds(b, { padding: 72, maxZoom: MAPBOX_CONFIG.zoom.max, duration: 400 });
          } catch {
            /* ignore */
          }
        }
      });

      map.current.on('error', (e) => {
        console.error('Erro no MapBox:', e);
        toast({
          title: 'Erro no mapa',
          description: 'Erro ao carregar o mapa: ' + (e.error?.message || 'Erro desconhecido'),
          variant: 'destructive',
        });
      });
    } catch (error) {
      console.error('Erro ao inicializar mapa:', error);
      toast({
        title: 'Erro de inicialização',
        description: 'Falha ao inicializar o MapBox.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;

    const srcPeople = m.getSource('structure-people') as mapboxgl.GeoJSONSource | undefined;
    const srcAgencies = m.getSource('structure-agencies') as mapboxgl.GeoJSONSource | undefined;
    if (srcPeople) srcPeople.setData(markersToFeatureCollectionByKind(mapMarkers, 'pessoa'));
    if (srcAgencies) srcAgencies.setData(markersToFeatureCollectionByKind(mapMarkers, 'agencia'));

    if (mapMarkers.length === 0) return;

    const coords = mapMarkers.map((x) => x.lngLat);
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const b: mapboxgl.LngLatBoundsLike = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];

    try {
      m.fitBounds(b, { padding: 72, maxZoom: MAPBOX_CONFIG.zoom.max, duration: 650 });
    } catch {
      /* ignore */
    }
  }, [mapMarkers]);

  useEffect(() => {
    if (!mapContainer.current) return;
    startMapTransitionLoading();
    if (map.current) {
      map.current.remove();
      map.current = null;
    }
    initializeMap();
  }, [activeBaseStyle]);

  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    setAgencyLayersVisibility(m, mapMarkers.some((x) => x.kind === 'agencia'));
    try {
      m.resize();
    } catch {
      /* ignore */
    }
  }, [mapMarkers]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!overlayAgencias && !overlayLojas) return;

    const scheduleRefresh = () => {
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        void refreshOverlayDataForViewport();
      }, 220);
    };

    m.on('moveend', scheduleRefresh);
    return () => {
      m.off('moveend', scheduleRefresh);
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [overlayAgencias, overlayLojas, mapReadyVersion]);

  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    const apply = (
      sourceId: string,
      active: boolean,
      points: Parameters<typeof regionPointsToFeatureCollection>[0]
    ) => {
      const src = m.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
      if (!src) return;
      if (!active) {
        src.setData(empty);
        return;
      }

      src.setData(regionPointsToFeatureCollection(points));
    };
    apply('region-overlay-agencias', overlayAgencias, filteredRegionAgencias);
    apply('region-overlay-supervisores', overlaySupervisores, filteredRegionSupervisores);
    apply('region-overlay-lojas', overlayLojas, filteredRegionLojas);
  }, [
    mapReadyVersion,
    overlayAgencias,
    overlaySupervisores,
    overlayLojas,
    filteredRegionAgencias,
    filteredRegionSupervisores,
    filteredRegionLojas,
  ]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const syncMapSize = () => {
      try {
        m.resize();
      } catch {
        /* ignore */
      }
    };

    syncMapSize();
    const timer = window.setTimeout(syncMapSize, 360);
    return () => window.clearTimeout(timer);
  }, [filtersPanelOpen]);

  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;

    const stdBasemap = isStandardStyleUrl(activeBaseStyle);
    const restoreDefaultMunicipalityPaint = () => {
      if (!m.getLayer('municipalities-context-fill')) return;
      try {
        m.setPaintProperty('municipalities-context-fill', 'fill-color', '#67e8f9');
        m.setPaintProperty('municipalities-context-fill', 'fill-opacity', 0.06);
        m.setPaintProperty('municipalities-context-line', 'line-color', '#0891b2');
        m.setPaintProperty('municipalities-context-line', 'line-width', 1.1);
        m.setPaintProperty('municipalities-context-line', 'line-opacity', 0.42);
        if (stdBasemap) {
          m.setPaintProperty('municipalities-context-fill', 'fill-emissive-strength', 1);
          m.setPaintProperty('municipalities-context-line', 'line-emissive-strength', 1);
        }
      } catch {
        /* estilo / ordem de camadas */
      }
    };
    const restoreStateChoroplethPaint = () => {
      if (!m.getLayer('br-states-choropleth')) return;
      try {
        m.setPaintProperty('br-states-choropleth', 'fill-color', '#93c5fd');
        m.setPaintProperty('br-states-choropleth', 'fill-opacity', 0);
        if (stdBasemap) {
          m.setPaintProperty('br-states-choropleth', 'fill-emissive-strength', 1);
        }
      } catch {
        /* ignore */
      }
    };

    const ctx = m.getSource('municipalities-context') as mapboxgl.GeoJSONSource | undefined;
    if (!ctx) {
      setChoroplethLegend(null);
      return;
    }

    const raw = municipalitiesRawFcRef.current;
    const shouldChoropleth = municipalityChoroplethEnabled && selectedBottomProduct != null;

    if (!shouldChoropleth) {
      try {
        if (raw.features.length > 0) {
          ctx.setData(raw);
          municipalitiesFcRef.current = raw;
        }
        restoreDefaultMunicipalityPaint();
        restoreStateChoroplethPaint();
      } catch {
        /* ignore */
      }
      setChoroplethLegend(null);
      return;
    }
    if (productivityScope === 'estado') {
      const rows = municipalityProductivityRows;
      const { min, max } = computeValueRangeFromRows(rows, 'producaoMes');
      const valueMap = buildMunicipalityValueMap(rows, 'producaoMes');
      const statesMerged: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: stateSearchOptions.map((option) => {
          const key = normalizeText(option.label);
          const v = valueMap.get(key);
          const missing = v === undefined || !Number.isFinite(v);
          return {
            ...option.feature,
            properties: {
              ...(option.feature.properties as GeoJSON.GeoJsonProperties),
              heatMissing: missing ? 1 : 0,
              ...(missing ? {} : { heatValue: v as number }),
            },
          } as GeoJSON.Feature;
        }),
      };
      const fillColorExpr: mapboxgl.ExpressionSpecification = [
        'case',
        ['==', ['get', 'heatMissing'], 1],
        '#cbd5e1',
        ['interpolate', ['linear'], ['to-number', ['get', 'heatValue']], min, '#e0f2fe', max, '#0c4a6e'],
      ];
      try {
        const statesSource = m.getSource('br-states') as mapboxgl.GeoJSONSource | undefined;
        statesSource?.setData(statesMerged);
        restoreDefaultMunicipalityPaint();
        m.setPaintProperty('br-states-choropleth', 'fill-color', fillColorExpr);
        m.setPaintProperty('br-states-choropleth', 'fill-opacity', 0.72);
        if (stdBasemap) {
          m.setPaintProperty('br-states-choropleth', 'fill-emissive-strength', 1);
        }
        setChoroplethLegend({ min, max });
      } catch {
        restoreStateChoroplethPaint();
        setChoroplethLegend(null);
      }
      return;
    }

    const rawToUse =
      selectedStateFeature == null && allMunicipalitiesFcRef.current.features.length > 0
        ? allMunicipalitiesFcRef.current
        : raw;
    const rows = municipalityProductivityRows;
    const { min, max } = computeValueRangeFromRows(rows, 'producaoMes');
    const valueMap = buildMunicipalityValueMap(rows, 'producaoMes');
    const merged = mergeChoroplethIntoFeatureCollection(rawToUse, valueMap);
    try {
      restoreStateChoroplethPaint();
      ctx.setData(merged);
      municipalitiesFcRef.current = merged;
      const fillColorExpr: mapboxgl.ExpressionSpecification = [
        'case',
        ['==', ['get', 'heatMissing'], 1],
        '#cbd5e1',
        ['interpolate', ['linear'], ['to-number', ['get', 'heatValue']], min, '#e0f2fe', max, '#0c4a6e'],
      ];
      m.setPaintProperty('municipalities-context-fill', 'fill-color', fillColorExpr);
      m.setPaintProperty('municipalities-context-fill', 'fill-opacity', 0.72);
      m.setPaintProperty('municipalities-context-line', 'line-color', '#64748b');
      m.setPaintProperty('municipalities-context-line', 'line-width', 0.85);
      m.setPaintProperty('municipalities-context-line', 'line-opacity', 0.55);
      if (stdBasemap) {
        m.setPaintProperty('municipalities-context-fill', 'fill-emissive-strength', 1);
        m.setPaintProperty('municipalities-context-line', 'line-emissive-strength', 1);
      }
      setChoroplethLegend({ min, max });
    } catch {
      restoreDefaultMunicipalityPaint();
      setChoroplethLegend(null);
    }
  }, [
    municipalityChoroplethEnabled,
    selectedBottomProduct,
    selectedStateFeature,
    stateSearchOptions,
    municipalitySearchOptions,
    selectedMunicipalityFeature,
    productivityScope,
    municipalityProductivityRows,
    municipalitiesGeoVersion,
    activeBaseStyle,
  ]);

  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    const visibility = municipalityMeshVisible ? 'visible' : 'none';
    for (const layerId of ['municipalities-context-fill', 'municipalities-context-line'] as const) {
      if (!m.getLayer(layerId)) continue;
      try {
        m.setLayoutProperty(layerId, 'visibility', visibility);
      } catch {
        /* estilo recarregando */
      }
    }
  }, [municipalityMeshVisible, mapReadyVersion]);

  /** Com coropleto ativo, o destaque do município não pode cobrir o degradê (fill transparente + contorno leve). */
  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    if (!m.getLayer('selected-municipality-fill') || !m.getLayer('selected-municipality-line')) return;
    const stdBasemap = isStandardStyleUrl(activeBaseStyle);
    try {
      if (municipalityChoroplethEnabled) {
        m.setPaintProperty('selected-municipality-fill', 'fill-opacity', 0);
        m.setPaintProperty('selected-municipality-line', 'line-width', 1.1);
        m.setPaintProperty('selected-municipality-line', 'line-opacity', 0.55);
        m.setPaintProperty('selected-municipality-line', 'line-color', '#0f172a');
      } else {
        m.setPaintProperty('selected-municipality-fill', 'fill-opacity', 0.12);
        m.setPaintProperty('selected-municipality-line', 'line-width', 2.2);
        m.setPaintProperty('selected-municipality-line', 'line-opacity', 0.85);
        m.setPaintProperty('selected-municipality-line', 'line-color', '#0284c7');
      }
      if (stdBasemap) {
        m.setPaintProperty('selected-municipality-fill', 'fill-emissive-strength', 1);
        m.setPaintProperty('selected-municipality-line', 'line-emissive-strength', 1);
      }
    } catch {
      /* estilo recarregando */
    }
  }, [municipalityChoroplethEnabled, activeBaseStyle]);

  useEffect(() => {
    return () => {
      const m = map.current;
      if (m && clickHandlerRef.current) {
        m.off('click', 'structure-people-circles', clickHandlerRef.current);
        m.off('click', 'structure-agencies-point', clickHandlerRef.current);
      }
      if (m && clusterClickHandlerRef.current) {
        m.off('click', 'structure-agencies-clusters', clusterClickHandlerRef.current);
      }
      if (m && stateClickHandlerRef.current) {
        m.off('click', 'br-states-hit', stateClickHandlerRef.current);
      }
      if (m && cityClickHandlerRef.current) {
        m.off('click', cityClickHandlerRef.current);
      }
      if (m && municipalityClickHandlerRef.current) {
        m.off('click', 'municipalities-context-fill', municipalityClickHandlerRef.current);
      }
      if (m && regionOverlayClickHandlerRef.current) {
        const h = regionOverlayClickHandlerRef.current;
        for (const id of [
          'region-overlay-agencias-sym',
          'region-overlay-supervisores-sym',
          'region-overlay-lojas-sym',
          'region-overlay-agencias-cir',
          'region-overlay-supervisores-cir',
          'region-overlay-lojas-cir',
        ] as const) {
          m.off('click', id, h);
        }
      }
      map.current?.remove();
      map.current = null;
      if (mapTransitionTimerRef.current != null) {
        window.clearTimeout(mapTransitionTimerRef.current);
        mapTransitionTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative h-full rounded-lg overflow-hidden">
      <div ref={mapContainer} className="absolute inset-0" />
      {isMapTransitionLoading && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          style={{ backgroundColor: outsideMaskColor }}
        >
          <div className="w-[min(86vw,340px)] rounded-xl border border-white/35 bg-white/15 px-4 py-3 shadow-sm">
            <p className="text-center text-xs font-medium text-slate-800">
              Carregando visual do mapa...
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/35">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-slate-700/70" />
            </div>
          </div>
        </div>
      )}
      <div className="absolute top-4 left-4 z-20 w-[min(95vw,380px)]">
        <div>
          <div className="relative h-10 rounded-full border border-slate-200/90 bg-white/95 shadow-md shadow-slate-900/5 backdrop-blur-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setSearchOpen(false), 120);
              }}
              placeholder="Buscar estado ou município..."
              className="h-full rounded-full border-0 bg-transparent pl-9 pr-3 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          {searchOpen && searchQuery.trim().length >= 2 && (
            <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-slate-200/90 bg-white/98 p-1 shadow-md shadow-slate-900/5">
              {visibleSearchOptions.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  Nenhum resultado. Tente outro nome.
                </p>
              ) : (
                visibleSearchOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSearchSelect(option)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="text-sm text-slate-800">{option.label}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
                      {option.kind}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              title="Mostrar agências no mapa"
              aria-label="Mostrar agências no mapa"
              aria-pressed={overlayAgencias}
              onClick={handleToggleAgencias}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold shadow-sm backdrop-blur-sm transition-colors ${
                overlayAgencias
                  ? 'border-slate-600 bg-slate-700 text-white shadow-slate-900/15'
                  : 'border-slate-200/90 bg-white/95 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              AG
            </button>
            <button
              type="button"
              title="Mostrar supervisores no mapa"
              aria-label="Mostrar supervisores no mapa"
              aria-pressed={overlaySupervisores}
              onClick={() => setOverlaySupervisores((v) => !v)}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-colors ${
                overlaySupervisores
                  ? 'border-slate-600 bg-slate-700 text-white shadow-slate-900/15'
                  : 'border-slate-200/90 bg-white/95 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <User className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Mostrar lojas no mapa"
              aria-label="Mostrar lojas no mapa"
              aria-pressed={overlayLojas}
              onClick={handleToggleLojas}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-colors ${
                overlayLojas
                  ? 'border-slate-600 bg-slate-700 text-white shadow-slate-900/15'
                  : 'border-slate-200/90 bg-white/95 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Store className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div
        className={`absolute top-4 z-20 overflow-visible transition-[right] duration-500 ease-out ${
          hasStatePanel ? 'right-[calc(min(96vw,480px)+0.75rem)]' : 'right-4'
        }`}
      >
        <div className="rounded-3xl border border-slate-200/90 bg-white/95 p-2 shadow-lg shadow-slate-900/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Button
              type="button"
              size="icon"
              onClick={onOpenFilters}
              aria-label="Abrir filtros"
              className="h-10 w-10 rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
            <div ref={mapLayoutPickerRef} className="relative z-[60] h-10 w-10 shrink-0">
              <div
                role="radiogroup"
                aria-label="Estilo do mapa"
                onMouseEnter={openLayoutFlyoutHover}
                onMouseLeave={scheduleLayoutHoverEnd}
                className={`absolute right-full top-1/2 z-10 mr-1.5 flex w-max -translate-y-1/2 flex-row items-center gap-0.5 rounded-2xl border border-slate-200/90 bg-white/95 p-0.5 shadow-md shadow-slate-900/10 backdrop-blur-sm transition duration-200 ease-out ${
                  showLayoutFlyout
                    ? 'pointer-events-auto translate-x-0 opacity-100'
                    : 'pointer-events-none -translate-x-1 opacity-0'
                }`}
              >
                {MAP_LAYOUT_OPTIONS.map((opt) => {
                  const selected = mapStyleMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      title={opt.label}
                      onClick={() => {
                        clearSelectedState();
                        setMapStyleMode(opt.id);
                        setMapLayoutMenuPinned(false);
                        setMapLayoutFlyoutHover(false);
                        clearLayoutHoverTimer();
                      }}
                      className="flex h-10 w-10 flex-col items-center justify-center gap-px rounded-md p-0 transition-colors hover:bg-slate-100/90 focus:outline-none focus-visible:bg-slate-100/90"
                    >
                      <span className="sr-only">{opt.label}</span>
                      <span
                        className={`h-6 w-6 shrink-0 rounded-full shadow-inner ${opt.previewClass} ${
                          selected
                            ? 'ring-2 ring-blue-600 ring-offset-1 ring-offset-white'
                            : 'ring-1 ring-slate-200/70'
                        }`}
                        aria-hidden
                      />
                      <span className="max-w-[2.4rem] truncate text-center text-[7px] font-semibold leading-tight text-slate-600">
                        {opt.caption}
                      </span>
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                size="icon"
                aria-haspopup="true"
                aria-expanded={showLayoutFlyout}
                onClick={() => setMapLayoutMenuPinned((p) => !p)}
                onMouseEnter={openLayoutFlyoutHover}
                onMouseLeave={scheduleLayoutHoverEnd}
                title="Estilo do mapa — menu à esquerda deste botão; passe o mouse ou clique para fixar"
                aria-label="Estilo do mapa: abrir opções de layout"
                className={`h-10 w-10 rounded-full border shadow-sm hover:text-slate-900 ${
                  mapStyleMode === 'standardWarm'
                    ? 'border-amber-300/90 bg-amber-50 text-amber-950 hover:bg-amber-100/90'
                    : mapStyleMode === 'satellite'
                      ? 'border-slate-600 bg-slate-700 text-white shadow-slate-900/15 hover:bg-slate-600'
                      : 'border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Layers className="h-4 w-4" />
              </Button>
            </div>
            <Button
              type="button"
              size="icon"
              onClick={openProductivitySheet}
              aria-label="Abrir produtividade por município"
              className="h-10 w-10 rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <div className="my-1 h-px w-8 bg-slate-200/90" />
            <Button
              type="button"
              size="icon"
              onClick={handleZoomIn}
              aria-label="Aproximar mapa"
              className="h-10 w-10 rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
            >
              <span className="text-xl leading-none">+</span>
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={handleZoomOut}
              aria-label="Afastar mapa"
              className="h-10 w-10 rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
            >
              <span className="text-xl leading-none">-</span>
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={() => setMunicipalityMeshVisible((v) => !v)}
              aria-pressed={municipalityMeshVisible}
              title={
                municipalityMeshVisible
                  ? 'Ocultar malha de municípios (mantém zoom e seleção)'
                  : 'Mostrar malha de municípios'
              }
              aria-label={
                municipalityMeshVisible
                  ? 'Ocultar malha de municípios no mapa'
                  : 'Mostrar malha de municípios no mapa'
              }
              className={`h-10 w-10 rounded-full border shadow-sm hover:text-slate-900 ${
                municipalityMeshVisible
                  ? 'border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50'
                  : 'border-amber-200/90 bg-amber-50/95 text-amber-900 hover:bg-amber-100/95'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={clearSelectedState}
              disabled={!hasMapSelection}
              title={
                hasMapSelection
                  ? 'Limpar seleção (estado/município) e voltar a visão do Brasil'
                  : 'Nada selecionado no mapa'
              }
              aria-label="Limpar seleção do mapa"
              className="h-10 w-10 rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
            >
              <MapPinOff className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      {mapMarkers.length > 0 && (
        <div className="absolute left-4 top-[152px] z-10 max-w-[240px] rounded-lg border border-border/60 bg-map-surface/95 p-3 shadow-lg backdrop-blur-sm">
          <p className="text-sm font-medium">Camada comercial</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {mapMarkers.filter((x) => x.kind === 'pessoa').length} correspondentes no mapa
            {mapMarkers.filter((x) => x.kind === 'agencia').length > 0 && (
              <>
                {' '}
                · {mapMarkers.filter((x) => x.kind === 'agencia').length} agências (filtros)
              </>
            )}
          </p>
        </div>
      )}
      {hasStatePanel && (
        <ExpressoStatePanel
          regionName={selectedStateLabel}
          cityFocus={selectedCityLabel}
          metrics={expressoMetrics}
          onClose={clearSelectedState}
          onOpenProductivitySheet={openProductivitySheet}
        />
      )}
      {(() => {
        const productivityDockInset = hasStatePanel ? 'left-0 right-[min(96vw,480px)]' : 'left-0 right-0';
        const showChoroplethLegend =
          municipalityChoroplethEnabled && choroplethLegend != null && selectedBottomProduct != null;

        const legendBody =
          showChoroplethLegend && choroplethLegend ? (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Produção no mês</p>
              <div
                className="mt-1.5 h-2.5 w-full rounded-full"
                style={{
                  background: 'linear-gradient(to right, #e0f2fe, #0c4a6e)',
                }}
              />
              <div className="mt-1 flex justify-between gap-2 text-[10px] tabular-nums text-slate-600">
                <span>
                  {choroplethLegend.min.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                    maximumFractionDigits: 0,
                  })}
                </span>
                <span>
                  {choroplethLegend.max.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
              <p className="mt-1 text-[9px] text-slate-400">Cinza: sem dado para o município</p>
            </>
          ) : null;

        if (productivitySheetOpen) {
          return (
            <div
              className={`pointer-events-none absolute bottom-0 z-30 flex flex-col-reverse gap-2 pb-[env(safe-area-inset-bottom,0px)] ${productivityDockInset}`}
            >
              {/* Em column-reverse o 1º filho fica colado ao rodapé: sheet primeiro, legenda acima. */}
              <div className="pointer-events-auto min-w-0 w-full">
                <ExpressoBottomSheet
                  dock
                  open={productivitySheetOpen}
                  products={productsForBottomSheet}
                  selectedProduct={selectedBottomProduct}
                  rows={municipalityProductivityRows}
                  scope={productivityScope}
                  showMunicipalityScope={Boolean(selectedStateFeature)}
                  onScopeChange={(scope) => {
                    if (scope === 'municipio' && !selectedStateFeature) return;
                    setProductivityScope(scope);
                  }}
                  rightInsetClass={hasStatePanel ? 'right-[min(96vw,480px)]' : 'right-0'}
                  onClose={() => {
                    setProductivitySheetOpen(false);
                    setSelectedBottomProduct(null);
                    setMunicipalityChoroplethEnabled(false);
                    setChoroplethLegend(null);
                  }}
                  onBackToCards={() => {
                    setSelectedBottomProduct(null);
                    setMunicipalityChoroplethEnabled(false);
                    setChoroplethLegend(null);
                  }}
                  onSelectProduct={setSelectedBottomProduct}
                  choroplethEnabled={municipalityChoroplethEnabled}
                  onChoroplethEnabledChange={setMunicipalityChoroplethEnabled}
                  canUseChoropleth
                  choroplethModeLabel={choroplethModeLabel ?? undefined}
                />
              </div>
              {legendBody ? (
                <div className="pointer-events-none mx-4 max-w-[220px] self-start rounded-lg border border-slate-200/90 bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm">
                  {legendBody}
                </div>
              ) : null}
            </div>
          );
        }

        return legendBody ? (
          <div className="pointer-events-none absolute bottom-4 left-4 z-20 max-w-[220px] rounded-lg border border-slate-200/90 bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm">
            {legendBody}
          </div>
        ) : null;
      })()}
    </div>
  );
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default MapComponent;
