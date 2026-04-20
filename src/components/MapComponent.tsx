import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl, { type FilterSpecification } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { BarChart3, Layers, Search, SlidersHorizontal } from 'lucide-react';
import ExpressoBottomSheet from '@/components/ExpressoBottomSheet';
import ExpressoStatePanel from '@/components/ExpressoStatePanel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { MAPBOX_CONFIG } from '@/lib/mapbox-config';
import {
  buildExpressoRegionMetrics,
  buildMunicipalityProductivityRows,
  type ProdutoExpressoId,
} from '@/lib/expressoRegionMock';
import type { MarcadorMapa } from '@/data/commercialStructureMock';

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
  fcRef?: React.MutableRefObject<GeoJSON.FeatureCollection>
) {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  const contextSource = m.getSource('municipalities-context') as mapboxgl.GeoJSONSource | undefined;
  contextSource?.setData(empty);
  const selectedSource = m.getSource('selected-municipality') as mapboxgl.GeoJSONSource | undefined;
  selectedSource?.setData(empty);
  if (fcRef) fcRef.current = empty;
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
  /** Municípios do UF atual (mesmo dado da fonte municipalities-context) para hit-test por polígono. */
  const municipalitiesFcRef = useRef<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const selectedStateCodeRef = useRef<string | null>(null);
  const [selectedStateLabel, setSelectedStateLabel] = useState<string | null>(null);
  const [selectedStateFeature, setSelectedStateFeature] = useState<GeoJSON.Feature | null>(null);
  const [selectedCityLabel, setSelectedCityLabel] = useState<string | null>(null);
  const [showLojasOnMap, setShowLojasOnMap] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [stateSearchOptions, setStateSearchOptions] = useState<SearchOption[]>([]);
  const [municipalitySearchOptions, setMunicipalitySearchOptions] = useState<SearchOption[]>([]);
  const [mapStyleMode, setMapStyleMode] = useState<'default' | 'satellite'>('default');
  const [productivitySheetOpen, setProductivitySheetOpen] = useState(false);
  const [selectedBottomProduct, setSelectedBottomProduct] = useState<ProdutoExpressoId | null>(null);
  const [productivityScope, setProductivityScope] = useState<'estado' | 'municipio'>('estado');
  const activeBaseStyle =
    mapStyleMode === 'satellite' ? MAPBOX_CONFIG.styles.satellite : MAPBOX_CONFIG.styles.default;

  const expressoMetrics = useMemo(
    () => buildExpressoRegionMetrics(mapMarkers, selectedStateFeature),
    [mapMarkers, selectedStateFeature]
  );

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
    const names = municipalitySearchOptions.map((item) => item.label).filter(Boolean);
    return names.length > 0 ? names.slice(0, 60) : selectedCityLabel ? [selectedCityLabel] : [];
  }, [municipalitySearchOptions, selectedCityLabel]);

  const stateNamesForTable = useMemo(
    () => stateSearchOptions.map((item) => item.label).filter(Boolean).slice(0, 60),
    [stateSearchOptions]
  );

  const municipalityProductivityRows = useMemo(() => {
    if (!selectedBottomProduct) return [];
    const names = productivityScope === 'estado' ? stateNamesForTable : municipalityNamesForTable;
    return buildMunicipalityProductivityRows(selectedBottomProduct, names);
  }, [selectedBottomProduct, productivityScope, stateNamesForTable, municipalityNamesForTable]);

  const productsForBottomSheet = useMemo(
    () =>
      expressoMetrics?.produtos ?? [
        { id: 'consignado' as const, nome: 'Consignado', variacaoPct: 0, lojas: 0, producaoMes: 0, subprodutos: [] },
        { id: 'lime' as const, nome: 'Lime', variacaoPct: 0, lojas: 0, producaoMes: 0, subprodutos: [] },
        { id: 'contas' as const, nome: 'Contas', variacaoPct: 0, lojas: 0, producaoMes: 0, subprodutos: [] },
        { id: 'seguros' as const, nome: 'Seguros', variacaoPct: 0, lojas: 0, producaoMes: 0, subprodutos: [] },
      ],
    [expressoMetrics]
  );
  const hasStatePanel = Boolean(selectedStateLabel && expressoMetrics);

  const clusterClickHandlerRef = useRef<((e: mapboxgl.MapLayerMouseEvent) => void) | null>(null);

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

  const openProductivitySheet = () => {
    setProductivityScope(selectedStateFeature ? 'municipio' : 'estado');
    setSelectedBottomProduct(null);
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
    if (m) resetMunicipalityVisuals(m, municipalitiesFcRef);
    setShowLojasOnMap(false);
    if (m) setAgencyLayersVisibility(m, false);
    setSelectedStateLabel(null);
    setSelectedStateFeature(null);
    setSelectedCityLabel(null);
    setMunicipalitySearchOptions([]);
    setSearchQuery('');
    setSearchOpen(false);
    setProductivitySheetOpen(false);
    setSelectedBottomProduct(null);
    setProductivityScope('estado');
    selectedStateCodeRef.current = null;
  };

  const initializeMap = async () => {
    if (!mapContainer.current) return;

    try {
      mapboxgl.accessToken = MAPBOX_CONFIG.accessToken;

      map.current = new mapboxgl.Map({
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
      });

      map.current.on('load', async () => {
        toast({
          title: 'Mapa carregado!',
          description: 'MapBox inicializado com sucesso.',
        });

        const m = map.current!;
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
              paint: {
                'fill-color': '#94a3b8',
                'fill-opacity': 0.12,
              },
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
            m.addLayer(
              {
                id: 'brazil-outside-mask-fill',
                type: 'fill',
                source: 'brazil-outside-mask',
                paint: {
                  'fill-color': maskColor,
                  'fill-opacity': 1,
                },
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
            paint: {
              'line-color': '#334155',
              'line-width': 1.2,
              'line-opacity': 0.45,
            },
          });

          m.addLayer({
            id: 'br-states-selected',
            type: 'fill',
            source: 'br-states',
            filter: ['==', ['get', 'sigla'], '__none__'],
            paint: {
              'fill-color': '#93c5fd',
              'fill-opacity': 0.09,
            },
          });

          m.addLayer({
            id: 'br-states-dim',
            type: 'fill',
            source: 'br-states',
            filter: ['==', ['get', 'sigla'], '__none__'],
            paint: {
              'fill-color': '#9ca3af',
              'fill-opacity': 0.4,
            },
          });

          m.addLayer({
            id: 'br-states-hit',
            type: 'fill',
            source: 'br-states',
            paint: {
              'fill-color': '#000000',
              'fill-opacity': 0.001,
            },
          });

          const applyStateSelection = (f: GeoJSON.Feature) => {
            const stateId = resolveStateId(f.properties);
            if (!stateId) return;

            resetMunicipalityVisuals(m, municipalitiesFcRef);
            setMunicipalitySearchOptions([]);
            setSelectedCityLabel(null);

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
                  setMunicipalitySearchOptions(buildMunicipalitySearchOptions(munis, uf));
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
            paint: {
              'fill-color': '#67e8f9',
              'fill-opacity': 0.06,
            },
          }, sym);

          m.addLayer({
            id: 'municipalities-context-line',
            type: 'line',
            source: 'municipalities-context',
            paint: {
              'line-color': '#0891b2',
              'line-width': 1.1,
              'line-opacity': 0.42,
            },
          }, sym);

          m.addSource('selected-municipality', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          m.addLayer({
            id: 'selected-municipality-fill',
            type: 'fill',
            source: 'selected-municipality',
            paint: {
              'fill-color': '#38bdf8',
              'fill-opacity': 0.12,
            },
          }, sym);

          m.addLayer({
            id: 'selected-municipality-line',
            type: 'line',
            source: 'selected-municipality',
            paint: {
              'line-color': '#0284c7',
              'line-width': 2.2,
              'line-opacity': 0.85,
            },
          }, sym);

          const selectMunicipalityFeature = (feature: GeoJSON.Feature) => {
            const source = m.getSource('selected-municipality') as mapboxgl.GeoJSONSource | undefined;
            if (!source) return;
            source.setData({ type: 'FeatureCollection', features: [feature] });
            const municipalityName = municipalityNameFromProperties(feature.properties) || 'Município';
            setSelectedCityLabel(municipalityName);
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
          paint: {
            'circle-color': 'rgba(185, 28, 28, 0.92)',
            'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 28, 30, 100, 38],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95,
          },
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
          paint: {
            'circle-radius': 8,
            'circle-color': '#b91c1c',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95,
          },
        });

        m.addLayer({
          id: 'structure-people-circles',
          type: 'circle',
          source: 'structure-people',
          paint: {
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
          },
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

        setAgencyLayersVisibility(m, false);

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
    if (map.current) {
      map.current.remove();
      map.current = null;
    }
    initializeMap();
  }, [activeBaseStyle]);

  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    setAgencyLayersVisibility(m, showLojasOnMap);
    try {
      m.resize();
    } catch {
      /* ignore */
    }
  }, [showLojasOnMap]);

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
      map.current?.remove();
      map.current = null;
    };
  }, []);

  return (
    <div className="relative h-full rounded-lg overflow-hidden">
      <div ref={mapContainer} className="absolute inset-0" />
      <div className="absolute top-4 left-4 z-20 w-[min(95vw,380px)]">
        <div>
          <div className="relative h-10 rounded-full border border-red-200/80 bg-white/95 shadow-lg backdrop-blur-sm">
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
            <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-red-100 bg-white p-1">
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
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-red-50"
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
        </div>
      </div>
      <div className="absolute right-4 top-1/2 z-20 -translate-y-1/2">
        <div className="rounded-3xl border border-red-100/90 bg-white/95 p-2 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Button
              type="button"
              size="icon"
              onClick={onOpenFilters}
              aria-label="Abrir filtros"
              className="h-10 w-10 rounded-full border border-red-200 bg-white text-red-700 shadow-sm hover:bg-red-50"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={() => {
                clearSelectedState();
                setMapStyleMode((prev) => (prev === 'default' ? 'satellite' : 'default'));
              }}
              aria-label="Alternar estilo do mapa"
              className="h-10 w-10 rounded-full border border-red-200 bg-white text-red-700 shadow-sm hover:bg-red-50"
            >
              <Layers className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={openProductivitySheet}
              aria-label="Abrir produtividade por município"
              className="h-10 w-10 rounded-full border border-red-200 bg-white text-red-700 shadow-sm hover:bg-red-50"
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <div className="my-1 h-px w-8 bg-red-100" />
            <Button
              type="button"
              size="icon"
              onClick={handleZoomIn}
              aria-label="Aproximar mapa"
              className="h-10 w-10 rounded-full border border-red-200 bg-white text-red-700 shadow-sm hover:bg-red-50"
            >
              <span className="text-xl leading-none">+</span>
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={handleZoomOut}
              aria-label="Afastar mapa"
              className="h-10 w-10 rounded-full border border-red-200 bg-white text-red-700 shadow-sm hover:bg-red-50"
            >
              <span className="text-xl leading-none">-</span>
            </Button>
          </div>
        </div>
      </div>
      {mapMarkers.length > 0 && (
        <div className="absolute left-4 top-[104px] z-10 max-w-[240px] rounded-lg border border-border/60 bg-map-surface/95 p-3 shadow-lg backdrop-blur-sm">
          <p className="text-sm font-medium">Camada comercial</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {mapMarkers.filter((x) => x.kind === 'pessoa').length} correspondentes no mapa
            {mapMarkers.filter((x) => x.kind === 'agencia').length > 0 && (
              <>
                {' '}
                · {mapMarkers.filter((x) => x.kind === 'agencia').length} lojas (ativar no painel do
                estado)
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
          showLojasOnMap={showLojasOnMap}
          onShowLojasOnMapChange={setShowLojasOnMap}
          onOpenProductivitySheet={openProductivitySheet}
        />
      )}
      <ExpressoBottomSheet
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
        rightInsetClass={hasStatePanel ? 'right-[min(96vw,420px)]' : 'right-0'}
        onClose={() => {
          setProductivitySheetOpen(false);
          setSelectedBottomProduct(null);
        }}
        onBackToCards={() => setSelectedBottomProduct(null)}
        onSelectProduct={setSelectedBottomProduct}
      />
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
