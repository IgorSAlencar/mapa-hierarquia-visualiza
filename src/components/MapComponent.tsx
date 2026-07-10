import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl, { type FilterSpecification } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  BarChart3,
  LayoutGrid,
  Layers,
  MapPinOff,
  Search,
  ChevronLeft,
  SlidersHorizontal,
  Store,
  Users,
  X,
} from 'lucide-react';
import ExpressoBottomSheet from '@/components/ExpressoBottomSheet';
import ExpressoStatePanel from '@/components/ExpressoStatePanel';
import MapOverlayMarkerInfoPanel from '@/components/MapOverlayMarkerInfoPanel';
import {
  agencyMapPopupHoverOptions,
  buildAgencyPopupHtml,
  readAgencyPopupInfoFromProperties,
  type AgencyPopupInfo,
} from '@/components/AgencyInfoPopup';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { buildOutsideBrazilMaskFeature } from '@/lib/brazilOutsideMask';
import { attachMapPointerGestureGuard } from '@/lib/mapPointerGestures';
import { MAPBOX_CONFIG } from '@/lib/mapbox-config';
import {
  animateToFlatView,
  animateToPointFocus,
  captureMapCamera,
  restoreMapCamera,
  fitMapToBrazilOverview,
  applyMapScrollZoomSettings,
  getPointCoordinates,
  type SavedMapCamera,
} from '@/lib/mapCameraFocus';
import {
  buildExpressoRegionMetrics,
  buildMunicipalityProductivityRows,
  emptyProdutoExpressoResumo,
  type ExpressoRegionMetrics,
  type MunicipalityProductivityRow,
  type ProdutoExpressoId,
} from '@/lib/expressoRegionMock';
import {
  resolveSqlHierarchyFromUiMarkerId,
  type MarcadorMapa,
  type SqlHierarchyFilter,
} from '@/data/commercialStructureMock';
import {
  filterRegionMapPoints,
  COMMERCIAL_TEAM_LEVEL_LABEL,
  COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL,
  regionPointsToFeatureCollection,
  type CommercialTeamLevel,
} from '@/data/regionMapPointsMock';
import {
  buildMunicipalityValueMap,
  computeValueRangeFromRows,
  mergeChoroplethIntoFeatureCollection,
} from '@/lib/municipalityChoropleth';
import {
  fetchAgencyPoints,
  fetchCommercialSeatPoints,
  fetchStorePoints,
  type BboxQuery,
  type SqlMapPoint,
} from '@/lib/mapDataApi';
import { fetchExpressoProductivityRows, fetchExpressoStateMetrics } from '@/lib/expressoApi';
import { loadSupervisionAreas } from '@/lib/supervisionAreas';
import { getVisitRouteBounds, syncVisitRouteOnMap } from '@/lib/visitRouteMapLayer';
import RouteLegend from '@/components/navigator/RouteLegend';
import { isCompareScopeHierarchy } from '@/lib/compareAreasScope';
import {
  fetchSupervisoesForCompareScope,
  mergeCompareSupervisionList,
  writeCompareSupervisionsToMap,
} from '@/lib/compareSupervisionsGeoJson';
import type { VisitRoute } from '@/data/visitRoutesMock';

/** Malha nacional IBGE (serviço de malhas → arquivo em `public/geo`). */
const BRAZIL_BOUNDARY_GEOJSON = '/geo/brasil-limite-ibge.geojson';
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

let cachedBrazilBoundaryFeature: GeoJSON.Feature | null = null;

/** Contorno nacional exatamente como em `BRAZIL_BOUNDARY_GEOJSON` (lon/lat, sem simplificar). */
async function loadBrazilBoundaryFeature(): Promise<GeoJSON.Feature> {
  if (cachedBrazilBoundaryFeature) return cachedBrazilBoundaryFeature;

  const res = await fetch(BRAZIL_BOUNDARY_GEOJSON);
  if (!res.ok) throw new Error(`GeoJSON Brasil: ${res.status}`);
  const fc = (await res.json()) as GeoJSON.FeatureCollection;
  const br =
    fc.features.find((f) => String(f.properties?.codarea ?? '').toUpperCase() === 'BR') ??
    fc.features[0];
  if (!br?.geometry) throw new Error('Brasil não encontrado no GeoJSON');
  cachedBrazilBoundaryFeature = br;
  return br;
}

function brazilBoundaryFeatureCollection(
  brazil: GeoJSON.Feature
): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [brazil] };
}

function paintColorToCss(c: unknown): string | null {
  if (typeof c === 'string') return c;
  if (Array.isArray(c) && c[0] === 'rgba' && c.length >= 5) {
    const [, r, g, b, a] = c as [string, number, number, number, number];
    return `rgba(${r},${g},${b},${a})`;
  }
  return null;
}

function resolveLandMatchMaskColor(m: mapboxgl.Map): string {
  const tryIds = ['land', 'national-park'];
  for (const id of tryIds) {
    if (!m.getLayer(id)) continue;
    try {
      const parsed = paintColorToCss(m.getPaintProperty(id, 'fill-color'));
      if (parsed) return parsed;
    } catch {
      /* skip */
    }
  }
  return MAPBOX_CONFIG.outsideBrazilMaskColor;
}

/** Cor sólida da máscara “fora do Brasil”, alinhada ao fundo de cada layout. */
function resolveOutsideBrazilMaskColor(m: mapboxgl.Map, styleUrl: string): string {
  if (styleUrl.includes('satellite')) {
    try {
      if (m.getLayer('background')) {
        const bg = paintColorToCss(m.getPaintProperty('background', 'background-color'));
        if (bg) return bg;
      }
    } catch {
      /* skip */
    }
    return '#0c1018';
  }

  if (isStandardStyleUrl(styleUrl)) {
    try {
      const theme = m.getConfigProperty('basemap', 'theme');
      if (theme === 'cool') return '#9ecae8';
    } catch {
      /* skip */
    }
    return '#98d5f5';
  }

  return resolveLandMatchMaskColor(m);
}

const BRAZIL_OUTLINE_LINE = '#7b8590';
const BRAZIL_OUTLINE_HALO = '#ffffff';

function ensureBrazilBoundaryOutlineLayers(
  m: mapboxgl.Map,
  styleUrl: string,
  beforeId?: string
): void {
  const haloPaint = linePaintForStandard(styleUrl, {
    'line-color': BRAZIL_OUTLINE_HALO,
    'line-width': 5,
    'line-opacity': 0.92,
    'line-blur': 0.35,
  });
  const linePaint = linePaintForStandard(styleUrl, {
    'line-color': BRAZIL_OUTLINE_LINE,
    'line-width': 2,
    'line-opacity': 1,
  });

  if (!m.getLayer('brazil-boundary-halo')) {
    m.addLayer(
      {
        id: 'brazil-boundary-halo',
        type: 'line',
        source: 'brazil-boundary',
        paint: haloPaint,
      },
      beforeId
    );
  } else {
    try {
      m.setPaintProperty('brazil-boundary-halo', 'line-color', BRAZIL_OUTLINE_HALO);
      m.setPaintProperty('brazil-boundary-halo', 'line-width', 5);
      if (isStandardStyleUrl(styleUrl)) {
        m.setPaintProperty('brazil-boundary-halo', 'line-emissive-strength', 1);
      }
    } catch {
      /* estilo recarregando */
    }
  }

  if (!m.getLayer('brazil-boundary-line')) {
    m.addLayer(
      {
        id: 'brazil-boundary-line',
        type: 'line',
        source: 'brazil-boundary',
        paint: linePaint,
      },
      beforeId
    );
  } else {
    try {
      m.setPaintProperty('brazil-boundary-line', 'line-color', BRAZIL_OUTLINE_LINE);
      m.setPaintProperty('brazil-boundary-line', 'line-width', 2);
      if (isStandardStyleUrl(styleUrl)) {
        m.setPaintProperty('brazil-boundary-line', 'line-emissive-strength', 1);
      }
    } catch {
      /* ignore */
    }
  }
}

function findMaskInsertBeforeLayerId(m: mapboxgl.Map): string | undefined {
  const layers = m.getStyle().layers ?? [];
  const symbol = layers.find((l) => l.type === 'symbol');
  if (symbol) return symbol.id;

  const labelLike = layers.find((l) => {
    const id = l.id.toLowerCase();
    return (
      id.includes('place') ||
      id.includes('label') ||
      id.includes('settlement') ||
      id.includes('road-name') ||
      id.includes('poi')
    );
  });
  return labelLike?.id;
}

const BRAZIL_CUTOUT_LAYER_IDS = [
  'brazil-outside-clip',
  'brazil-outside-mask-fill',
  'brazil-boundary-halo',
  'brazil-boundary-line',
] as const;

/** Primeira camada de dados do app (máscara/clip ficam logo abaixo). */
function findFirstAppDataLayerId(m: mapboxgl.Map): string | undefined {
  const cutout = new Set<string>(BRAZIL_CUTOUT_LAYER_IDS);
  for (const layer of m.getStyle().layers ?? []) {
    if (cutout.has(layer.id)) continue;
    if (
      layer.id.startsWith('brazil-') ||
      layer.id.startsWith('brasil-') ||
      layer.id.startsWith('br-states') ||
      layer.id.startsWith('structure-') ||
      layer.id.startsWith('br-')
    ) {
      return layer.id;
    }
  }
  return undefined;
}

function repositionBrazilCutoutLayers(m: mapboxgl.Map): void {
  const beforeId = findFirstAppDataLayerId(m);
  for (const id of BRAZIL_CUTOUT_LAYER_IDS) {
    if (!m.getLayer(id)) continue;
    try {
      m.moveLayer(id, beforeId);
    } catch {
      /* estilo recarregando */
    }
  }
}

function ensureBrazilOutsideClipLayer(m: mapboxgl.Map, beforeId?: string): void {
  if (m.getLayer('brazil-outside-clip')) return;
  try {
    m.addLayer(
      {
        id: 'brazil-outside-clip',
        type: 'clip',
        source: 'brazil-outside-mask',
        layout: {
          'clip-layer-types': ['symbol', 'model'],
        },
      } as mapboxgl.LayerSpecification,
      beforeId
    );
  } catch {
    /* Mapbox GL sem clip layer ou estilo incompatível */
  }
}

async function ensureBrazilOutsideMask(
  m: mapboxgl.Map,
  styleUrl: string,
  _legacyBeforeId?: string
): Promise<boolean> {
  if (!MAPBOX_CONFIG.maskOutsideBrazil) return false;

  const stackBeforeId = findFirstAppDataLayerId(m);

  const maskColor = resolveOutsideBrazilMaskColor(m, styleUrl);
  const existingMaskFill = m.getLayer('brazil-outside-mask-fill');

  try {
    const br = await loadBrazilBoundaryFeature();
    const boundaryFc = brazilBoundaryFeatureCollection(br);
    const mask = buildOutsideBrazilMaskFeature(br);

    const boundarySrc = m.getSource('brazil-boundary') as mapboxgl.GeoJSONSource | undefined;
    if (boundarySrc) boundarySrc.setData(boundaryFc);
    else {
      m.addSource('brazil-boundary', {
        type: 'geojson',
        data: boundaryFc,
        tolerance: 0,
      });
    }

    const maskSrc = m.getSource('brazil-outside-mask') as mapboxgl.GeoJSONSource | undefined;
    if (maskSrc) maskSrc.setData(mask);
    else {
      m.addSource('brazil-outside-mask', {
        type: 'geojson',
        data: mask,
        tolerance: 0,
      });
    }

    ensureBrazilOutsideClipLayer(m, stackBeforeId);

    if (!existingMaskFill) {
      m.addLayer(
        {
          id: 'brazil-outside-mask-fill',
          type: 'fill',
          source: 'brazil-outside-mask',
          paint: fillPaintForStandard(styleUrl, {
            'fill-color': maskColor,
            'fill-opacity': 1,
          }),
        },
        stackBeforeId
      );
    } else {
      try {
        m.setPaintProperty('brazil-outside-mask-fill', 'fill-color', maskColor);
        m.setPaintProperty('brazil-outside-mask-fill', 'fill-opacity', 1);
        if (isStandardStyleUrl(styleUrl)) {
          m.setPaintProperty('brazil-outside-mask-fill', 'fill-emissive-strength', 1);
        } else {
          m.setPaintProperty('brazil-outside-mask-fill', 'fill-emissive-strength', 0);
        }
      } catch {
        /* estilo recarregando */
      }
    }

    ensureBrazilBoundaryOutlineLayers(m, styleUrl, stackBeforeId ?? findMaskInsertBeforeLayerId(m));
    repositionBrazilCutoutLayers(m);
    scheduleBrazilBasemapLabelTweaks(m);
    return true;
  } catch (e) {
    console.warn('Máscara fora do Brasil não aplicada:', e);
    return false;
  }
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
    // No Standard, o rótulo "Brazil"/"Brasil" costuma vir em camadas country/admin-0.
    const hideForeign =
      id.includes('country') ||
      id.includes('continent') ||
      id.includes('admin-0') ||
      id.includes('admin0') ||
      id.includes('region-label') ||
      id.includes('marine') ||
      id.includes('water-name') ||
      id.includes('waterway') ||
      sourceLayer.includes('country');
    const keep =
      !hideForeign &&
      (id.includes('settlement') ||
        id.includes('place-label') ||
        id.includes('place_label') ||
        id.includes('state-label') ||
        id.includes('admin-1') ||
        id.includes('admin1') ||
        sourceLayer.includes('place_label'));
    try {
      m.setLayoutProperty(layer.id, 'visibility', keep ? 'visible' : 'none');
    } catch {
      /* skip */
    }
  }
}

const BR_ISO_FILTER: FilterSpecification = ['==', ['get', 'iso_3166_1'], 'BR'];
/** Remove rótulos de país (ex.: "Brazil") mantendo estados e cidades. */
const HIDE_COUNTRY_PLACE_FILTER: FilterSpecification = [
  '!',
  [
    'in',
    ['coalesce', ['get', 'class'], ['get', 'type'], ''],
    ['literal', ['country', 'disputed_country', 'dependency', 'continent']],
  ],
];
const HIDE_BRAZIL_COUNTRY_NAME_FILTER: FilterSpecification = [
  'all',
  ['!=', ['downcase', ['to-string', ['coalesce', ['get', 'name_en'], '']]], 'brazil'],
  ['!=', ['downcase', ['to-string', ['coalesce', ['get', 'name'], '']]], 'brazil'],
  ['!=', ['downcase', ['to-string', ['coalesce', ['get', 'name'], '']]], 'brasil'],
  ['!=', ['downcase', ['to-string', ['coalesce', ['get', 'name_pt'], '']]], 'brasil'],
  ['!=', ['downcase', ['to-string', ['coalesce', ['get', 'name_preferred'], '']]], 'brazil'],
  ['!=', ['downcase', ['to-string', ['coalesce', ['get', 'name_preferred'], '']]], 'brasil'],
];
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
      ? ([
          'all',
          existing,
          BR_ISO_FILTER,
          HIDE_COUNTRY_PLACE_FILTER,
          HIDE_BRAZIL_COUNTRY_NAME_FILTER,
        ] as FilterSpecification)
      : ([
          'all',
          BR_ISO_FILTER,
          HIDE_COUNTRY_PLACE_FILTER,
          HIDE_BRAZIL_COUNTRY_NAME_FILTER,
        ] as FilterSpecification);

    try {
      m.setFilter(id, combined);
    } catch {
      /* skip */
    }
  }
}

/** Camadas `place-*` do Standard podem não usar `source-layer` clássico; aplica filtro de país. */
function hideCountryLabelsOnPlaceSymbolLayers(m: mapboxgl.Map) {
  for (const layer of m.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue;
    const id = layer.id.toLowerCase();
    if (id.startsWith('brazil-') || id.startsWith('brasil-') || id.startsWith('structure-')) continue;

    const sourceLayer = String(
      (layer as mapboxgl.SymbolLayerSpecification)['source-layer'] ?? ''
    ).toLowerCase();

    // Standard: esconde camadas de país por visibilidade (filtro às vezes não aplica).
    if (
      id.includes('country') ||
      id.includes('continent') ||
      id.includes('admin-0') ||
      id.includes('admin0') ||
      sourceLayer.includes('country')
    ) {
      try {
        m.setLayoutProperty(layer.id, 'visibility', 'none');
      } catch {
        /* skip */
      }
      continue;
    }

    const looksLikePlace =
      id.includes('place') ||
      id.includes('settlement') ||
      sourceLayer.includes('place_label') ||
      sourceLayer.includes('place');
    if (!looksLikePlace) continue;

    try {
      const existing = (layer as mapboxgl.SymbolLayerSpecification).filter;
      const combined: FilterSpecification = existing
        ? ([
            'all',
            existing,
            HIDE_COUNTRY_PLACE_FILTER,
            HIDE_BRAZIL_COUNTRY_NAME_FILTER,
          ] as FilterSpecification)
        : (['all', HIDE_COUNTRY_PLACE_FILTER, HIDE_BRAZIL_COUNTRY_NAME_FILTER] as FilterSpecification);
      m.setFilter(layer.id, combined);
    } catch {
      /* skip */
    }
  }
}

function applyBrazilBasemapLabelTweaks(m: mapboxgl.Map) {
  keepOnlyStateAndCityLabels(m);
  restrictSymbolLayersToBrazil(m);
  hideCountryLabelsOnPlaceSymbolLayers(m);
}

/** Standard carrega rótulos em fragmentos assíncronos — reaplica a remoção de "Brazil". */
function scheduleBrazilBasemapLabelTweaks(m: mapboxgl.Map) {
  applyBrazilBasemapLabelTweaks(m);
  const reapply = () => {
    if (!m.getStyle()) return;
    applyBrazilBasemapLabelTweaks(m);
  };
  m.once('idle', reapply);
  // Fragmentos do Standard podem chegar depois do primeiro idle.
  window.setTimeout(reapply, 400);
  window.setTimeout(reapply, 1200);
}

function firstSymbolLayerId(m: mapboxgl.Map): string | undefined {
  return findMaskInsertBeforeLayerId(m);
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

function disableBasemapClouds(m: mapboxgl.Map) {
  if (MAPBOX_CONFIG.standardBasemap.showClouds === false) {
    try {
      m.setConfigProperty('basemap', 'showClouds', false);
    } catch {
      /* GL/estilo sem showClouds */
    }
  }
  for (const layer of m.getStyle().layers ?? []) {
    if (!layer.id.toLowerCase().includes('cloud')) continue;
    try {
      m.setLayoutProperty(layer.id, 'visibility', 'none');
    } catch {
      /* skip */
    }
  }
}

/** Fonte de rótulos próprios (Streets v8) para o Standard, já que o basemap fica sem place labels. */
const BR_PLACES_SOURCE_ID = 'brazil-places';

function ensureCustomBrazilPlaceLabels(m: mapboxgl.Map) {
  try {
    if (!m.getSource(BR_PLACES_SOURCE_ID)) {
      m.addSource(BR_PLACES_SOURCE_ID, {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-streets-v8',
      });
    }
    if (!m.getLayer('brazil-state-labels')) {
      m.addLayer({
        id: 'brazil-state-labels',
        type: 'symbol',
        source: BR_PLACES_SOURCE_ID,
        'source-layer': 'place_label',
        minzoom: 3,
        maxzoom: 9,
        filter: [
          'all',
          ['==', ['get', 'iso_3166_1'], 'BR'],
          ['==', ['get', 'class'], 'state'],
        ],
        layout: {
          'text-field': ['coalesce', ['get', 'name_pt'], ['get', 'name']],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9.5, 6, 13],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.12,
          'text-max-width': 7,
        },
        paint: {
          'text-color': '#8a94a6',
          'text-halo-color': 'rgba(255,255,255,0.9)',
          'text-halo-width': 1.2,
          'text-emissive-strength': 1,
        },
      });
    }
    if (!m.getLayer('brazil-city-labels')) {
      m.addLayer({
        id: 'brazil-city-labels',
        type: 'symbol',
        source: BR_PLACES_SOURCE_ID,
        'source-layer': 'place_label',
        minzoom: 4,
        filter: [
          'all',
          ['==', ['get', 'iso_3166_1'], 'BR'],
          ['==', ['get', 'class'], 'settlement'],
          ['<=', ['coalesce', ['get', 'symbolrank'], 16], 14],
        ],
        layout: {
          'text-field': ['coalesce', ['get', 'name_pt'], ['get', 'name']],
          'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 8, 12.5, 12, 16],
          'text-max-width': 8,
        },
        paint: {
          'text-color': '#3f4a5a',
          'text-halo-color': 'rgba(255,255,255,0.92)',
          'text-halo-width': 1.1,
          'text-emissive-strength': 1,
        },
      });
    }
  } catch (error) {
    console.warn('Falha ao criar rótulos próprios de estados/cidades:', error);
  }
}

function applyStandardThemeBasemap(m: mapboxgl.Map, theme: 'warm' | 'cool') {
  const tryTheme = (t: string) => {
    try {
      m.setConfigProperty('basemap', 'theme', t);
      return true;
    } catch {
      return false;
    }
  };
  if (!tryTheme(theme)) tryTheme('default');
  try {
    m.setConfigProperty('basemap', 'show3dObjects', true);
    m.setConfigProperty('basemap', 'lightPreset', 'day');
    // No Standard os rótulos ficam num import inacessível via setFilter;
    // desliga todos os place labels e usa camadas próprias (sem "Brazil").
    m.setConfigProperty('basemap', 'showPlaceLabels', false);
    disableBasemapClouds(m);
  } catch {
    /* ignore */
  }
  ensureCustomBrazilPlaceLabels(m);
  scheduleBrazilBasemapLabelTweaks(m);
  repositionBrazilCutoutLayers(m);
}

function syncMapTerrain(m: mapboxgl.Map) {
  const { terrainEnabled, terrainDemSourceId, terrainExaggeration } = MAPBOX_CONFIG.interactive3d;
  try {
    if (!terrainEnabled) {
      m.setTerrain(null);
      return;
    }
    if (!m.getSource(terrainDemSourceId)) {
      m.addSource(terrainDemSourceId, {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });
    }
    m.setTerrain({ source: terrainDemSourceId, exaggeration: terrainExaggeration });
  } catch {
    /* estilo sem suporte a terrain */
  }
}

function enableMapPitchAndRotation(m: mapboxgl.Map) {
  const maxPitch = MAPBOX_CONFIG.interactive3d.maxPitch;
  try {
    m.setMaxPitch(maxPitch);
    m.setMinPitch(0);
    m.dragRotate.enable();
    m.touchZoomRotate.enableRotation();
  } catch {
    /* ignore */
  }
}

function markersToFeatureCollection(
  markers: MarcadorMapa[],
  panelHierarchy?: SqlHierarchyFilter | null
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map((mk) => {
      const cargo = mk.cargo ?? '';
      let chaveEntidade: number | null = null;
      let commercialLevel = '';
      if (cargo === 'supervisor') {
        commercialLevel = 'supervisor';
        if (Number.isFinite(Number(panelHierarchy?.chaveSupervisao))) {
          chaveEntidade = Math.trunc(Number(panelHierarchy!.chaveSupervisao));
        }
      } else if (cargo === 'coordenador') {
        commercialLevel = 'coordenador';
        if (Number.isFinite(Number(panelHierarchy?.chaveCoordenacao))) {
          chaveEntidade = Math.trunc(Number(panelHierarchy!.chaveCoordenacao));
        }
      } else if (cargo === 'gerente_area') {
        commercialLevel = 'gerente_area';
        if (Number.isFinite(Number(panelHierarchy?.chaveGerenciaArea))) {
          chaveEntidade = Math.trunc(Number(panelHierarchy!.chaveGerenciaArea));
        }
      }
      return {
        type: 'Feature' as const,
        properties: {
          id: mk.id,
          nome: mk.nome,
          subtitulo: mk.subtitulo,
          kind: mk.kind,
          cargo,
          detalhe_agencias: mk.detalheAgencias ?? '',
          commercial_level: commercialLevel,
          chave_entidade: chaveEntidade,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: mk.lngLat,
        },
      };
    }),
  };
}

function markersToFeatureCollectionByKind(
  markers: MarcadorMapa[],
  kind: MarcadorMapa['kind'],
  panelHierarchy?: SqlHierarchyFilter | null
): GeoJSON.FeatureCollection {
  return markersToFeatureCollection(
    markers.filter((m) => m.kind === kind),
    panelHierarchy
  );
}

function readHierarchyFilterFromSeatFeature(
  feature: GeoJSON.Feature,
  panelHierarchy: SqlHierarchyFilter | null | undefined
): SqlHierarchyFilter | null {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const level = String(props.commercial_level ?? '').trim().toLowerCase();
  const chaveEntidade = Number(props.chave_entidade);
  if (Number.isFinite(chaveEntidade) && chaveEntidade > 0) {
    if (level === 'supervisor') return { chaveSupervisao: Math.trunc(chaveEntidade) };
    if (level === 'coordenador') return { chaveCoordenacao: Math.trunc(chaveEntidade) };
    if (level === 'gerente_area') return { chaveGerenciaArea: Math.trunc(chaveEntidade) };
  }

  const cargo = String(props.cargo ?? '').trim().toLowerCase();
  if (cargo === 'supervisor') {
    if (Number.isFinite(Number(panelHierarchy?.chaveSupervisao))) {
      return { chaveSupervisao: Math.trunc(Number(panelHierarchy!.chaveSupervisao)) };
    }
    return resolveSqlHierarchyFromUiMarkerId(String(props.id ?? ''));
  }
  if (cargo === 'coordenador') {
    if (Number.isFinite(Number(panelHierarchy?.chaveCoordenacao))) {
      return { chaveCoordenacao: Math.trunc(Number(panelHierarchy!.chaveCoordenacao)) };
    }
    return resolveSqlHierarchyFromUiMarkerId(String(props.id ?? ''));
  }
  if (cargo === 'gerente_area') {
    if (Number.isFinite(Number(panelHierarchy?.chaveGerenciaArea))) {
      return { chaveGerenciaArea: Math.trunc(Number(panelHierarchy!.chaveGerenciaArea)) };
    }
    return resolveSqlHierarchyFromUiMarkerId(String(props.id ?? ''));
  }

  return null;
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

function clearSelectedMunicipalityVisual(m: mapboxgl.Map) {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  const selectedSource = m.getSource('selected-municipality') as mapboxgl.GeoJSONSource | undefined;
  selectedSource?.setData(empty);
}

function applySelectionLayerTransitions(m: mapboxgl.Map) {
  const transition = { duration: 260, delay: 0 };
  const setPaintTransition = (
    layerId: string,
    property:
      | 'fill-color-transition'
      | 'fill-opacity-transition'
      | 'line-color-transition'
      | 'line-opacity-transition'
      | 'line-width-transition'
  ) => {
    if (!m.getLayer(layerId)) return;
    try {
      m.setPaintProperty(layerId, property, transition);
    } catch {
      /* camada pode não suportar a propriedade */
    }
  };

  setPaintTransition('br-states-selected', 'fill-opacity-transition');
  setPaintTransition('br-states-selected', 'fill-color-transition');
  setPaintTransition('br-states-dim', 'fill-opacity-transition');
  setPaintTransition('br-states-dim', 'fill-color-transition');
  setPaintTransition('br-states-choropleth', 'fill-opacity-transition');
  setPaintTransition('br-states-choropleth', 'fill-color-transition');

  setPaintTransition('selected-municipality-fill', 'fill-opacity-transition');
  setPaintTransition('selected-municipality-line', 'line-opacity-transition');
  setPaintTransition('selected-municipality-line', 'line-color-transition');
  setPaintTransition('selected-municipality-line', 'line-width-transition');
}

function clearRegionOverlaySources(m: mapboxgl.Map) {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  for (const sourceId of [
    'region-overlay-agencias',
    'region-overlay-supervisores',
    'region-overlay-lojas',
    'supervision-area',
    'supervisions-compare',
  ] as const) {
    const source = m.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(empty);
  }
}

const AGENCY_CLICK_LAYER_IDS = ['region-overlay-agencias-cir', 'structure-agencies-point'] as const;
const LOJA_CLICK_LAYER_IDS = ['region-overlay-lojas-cir'] as const;
/** Bolinhas de gerentes — sempre acima de agências/lojas no mapa. */
const MANAGER_CIRCLE_LAYER_IDS = [
  'region-overlay-supervisores-cir',
  'structure-people-circles',
] as const;

/** Bolinha de agência no overlay regional (sempre maior que loja no mesmo zoom). */
const OVERLAY_AGENCIA_CIRCLE_RADIUS: mapboxgl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  3,
  6,
  7,
  8,
  11,
  10,
  14,
  13,
];

/** Bolinha de loja — ~70% do raio da agência em cada nível de zoom. */
const OVERLAY_LOJA_CIRCLE_RADIUS: mapboxgl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  3,
  4,
  7,
  5.5,
  11,
  7,
  14,
  9,
];

const OVERLAY_AGENCIA_CIRCLE_RADIUS_HIGHLIGHT = 15;
const OVERLAY_LOJA_CIRCLE_RADIUS_HIGHLIGHT = 10;

function normalizeCodAgKey(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const n = Number(raw.replace(',', '.'));
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return raw;
}

/** Raio de toque em px — maior com zoom distante (bolinha pequena na tela). */
function agencyClickPaddingPx(zoom: number): number {
  return Math.min(44, Math.max(18, 56 - zoom * 2.4));
}

function pickAgencyFeatureAtPoint(m: mapboxgl.Map, point: mapboxgl.Point): GeoJSON.Feature | null {
  const pad = agencyClickPaddingPx(m.getZoom());
  const box: [mapboxgl.PointLike, mapboxgl.PointLike] = [
    [point.x - pad, point.y - pad],
    [point.x + pad, point.y + pad],
  ];
  const layers = AGENCY_CLICK_LAYER_IDS.filter((id) => m.getLayer(id));
  if (layers.length === 0) return null;

  const hits = m.queryRenderedFeatures(box, { layers: [...layers] });
  if (hits.length === 0) return null;

  const sqlAgency = hits.find((f) => String(f.properties?.kind ?? '') === 'agencia');
  if (sqlAgency) return sqlAgency as GeoJSON.Feature;

  const structureAgency = hits.find((f) => f.layer?.id === 'structure-agencies-point');
  return (structureAgency ?? hits[0]) as GeoJSON.Feature;
}

function pickLojaFeatureAtPoint(m: mapboxgl.Map, point: mapboxgl.Point): GeoJSON.Feature | null {
  const pad = agencyClickPaddingPx(m.getZoom());
  const box: [mapboxgl.PointLike, mapboxgl.PointLike] = [
    [point.x - pad, point.y - pad],
    [point.x + pad, point.y + pad],
  ];
  const layers = LOJA_CLICK_LAYER_IDS.filter((id) => m.getLayer(id));
  if (layers.length === 0) return null;
  const hits = m.queryRenderedFeatures(box, { layers: [...layers] });
  if (hits.length === 0) return null;
  const loja = hits.find((f) => String(f.properties?.kind ?? '') === 'loja');
  return (loja ?? hits[0]) as GeoJSON.Feature;
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

type MapStyleMode = 'default' | 'satellite' | 'dark' | 'standardWarm' | 'standardCool' | 'custom';

const MAP_STYLE_URL: Record<MapStyleMode, string> = {
  default: MAPBOX_CONFIG.styles.default,
  satellite: MAPBOX_CONFIG.styles.satellite,
  dark: MAPBOX_CONFIG.styles.dark,
  standardWarm: MAPBOX_CONFIG.styles.standardWarm,
  standardCool: MAPBOX_CONFIG.styles.standardCool,
  custom: MAPBOX_CONFIG.styles.custom,
};

/**
 * Centro/zoom da pré-visualização — área natural de litoral (Lençóis Maranhenses).
 * Sem cidades/rodovias → o estilo não renderiza rótulos, mas mantém contraste terra/água.
 */
const STYLE_PREVIEW_VIEW = { lon: -42.78, lat: -2.55, zoom: 10.5 } as const;

/** Miniatura real do estilo via Mapbox Static Images API (usa o token já configurado). */
function buildStylePreviewUrl(styleUrl: string): string {
  const styleId = styleUrl.replace('mapbox://styles/', '');
  const { lon, lat, zoom } = STYLE_PREVIEW_VIEW;
  const params = new URLSearchParams({
    access_token: MAPBOX_CONFIG.accessToken,
    attribution: 'false',
    logo: 'false',
  });
  // 64px @2x = imagem leve e nítida em telas retina.
  return `https://api.mapbox.com/styles/v1/${styleId}/static/${lon},${lat},${zoom},0/64x64@2x?${params.toString()}`;
}

const MAP_LAYOUT_OPTIONS: {
  id: MapStyleMode;
  label: string;
  caption: string;
  previewImage: string;
  /** Leve matiz sobre a miniatura para distinguir warm/cool (mesmo style URL Standard). */
  tintClass?: string;
}[] = [
  {
    id: 'default',
    label: 'Mapa claro (Light)',
    caption: 'Claro',
    previewImage: buildStylePreviewUrl(MAPBOX_CONFIG.styles.default),
  },
  {
    id: 'dark',
    label: 'Mapa escuro (Dark)',
    caption: 'Dark',
    previewImage: buildStylePreviewUrl(MAPBOX_CONFIG.styles.dark),
  },
  {
    id: 'satellite',
    label: 'Satélite com ruas',
    caption: 'Sat.',
    previewImage: buildStylePreviewUrl(MAPBOX_CONFIG.styles.satellite),
  },
  {
    id: 'standardWarm',
    label: 'Mapbox Standard (tema warm)',
    caption: 'Warm',
    // A Static Images API não suporta o estilo `mapbox/standard`; usa um clássico + matiz.
    previewImage: buildStylePreviewUrl('mapbox://styles/mapbox/streets-v12'),
    tintClass: 'bg-amber-400/25',
  },
  {
    id: 'standardCool',
    label: 'Mapbox Standard (tema cool)',
    caption: 'Cool',
    previewImage: buildStylePreviewUrl('mapbox://styles/mapbox/streets-v12'),
    tintClass: 'bg-sky-400/25',
  },
  {
    id: 'custom',
    label: 'Bradesco',
    caption: 'Bradesco',
    previewImage: buildStylePreviewUrl('mapbox://styles/igralencar/cmoc8sp33003601s58ijjhro4'),
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

function filterMunicipalitySearchOptions(
  municipalitiesFc: GeoJSON.FeatureCollection,
  query: string,
  limit: number
): SearchOption[] {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  const options = municipalitiesFc.features
    .map((feature, index) => {
      const name = municipalityNameFromProperties(feature.properties);
      if (!name || !normalizeText(name).includes(q)) return null;
      return {
        id: `muni-br-${index}-${normalizeText(name)}`,
        label: name,
        kind: 'municipio' as const,
        feature,
        uf: null,
      };
    })
    .filter(Boolean) as SearchOption[];
  return options.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')).slice(0, limit);
}

function fitMapToRegionFeature(
  m: mapboxgl.Map,
  feature: GeoJSON.Feature,
  kind: SearchOption['kind']
) {
  const bounds = featureBounds(feature);
  if (!bounds) return;
  const fit =
    kind === 'estado'
      ? { padding: 64, maxZoom: 7.8, duration: 700 }
      : { padding: 52, maxZoom: 11.5, duration: 700 };
  try {
    m.fitBounds(bounds, fit);
  } catch {
    /* ignore */
  }
}

const OVERLAY_BBOX_FETCH_PADDING_RATIO = 0.4;
const OVERLAY_ZOOM_REFETCH_DELTA = 0.4;
const OVERLAY_MOVEEND_DEBOUNCE_MS = 820;
const OVERLAY_VIEWPORT_DRAW_DEBOUNCE_MS = 120;

function hasPanelHierarchyFilter(filter: SqlHierarchyFilter | null | undefined): boolean {
  if (!filter) return false;
  return Object.values(filter).some((v) => v != null && Number.isFinite(Number(v)) && Number(v) > 0);
}

function parseOverlaySeatHierarchyKey(key: string | null): SqlHierarchyFilter | null {
  if (!key) return null;
  try {
    const parsed = JSON.parse(key) as SqlHierarchyFilter;
    return hasPanelHierarchyFilter(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Painel tem prioridade; senão usa o filtro definido por clique na sede (bolinha) no mapa. */
function resolveCompareScopeHierarchy(
  panel: SqlHierarchyFilter | null | undefined,
  overlayKey: string | null
): SqlHierarchyFilter | null {
  if (isCompareScopeHierarchy(panel)) return panel!;
  const overlay = parseOverlaySeatHierarchyKey(overlayKey);
  return isCompareScopeHierarchy(overlay) ? overlay : null;
}

function resolveSeatPointsFetchHierarchy(
  panel: SqlHierarchyFilter | null | undefined,
  overlayKey: string | null
): SqlHierarchyFilter | null | undefined {
  if (isCompareScopeHierarchy(panel)) return panel;
  const overlay = parseOverlaySeatHierarchyKey(overlayKey);
  if (overlay) return overlay;
  return panel ?? null;
}

function expandBbox(bbox: BboxQuery, paddingRatio = OVERLAY_BBOX_FETCH_PADDING_RATIO): BboxQuery {
  const lngSpan = bbox.maxLng - bbox.minLng;
  const latSpan = bbox.maxLat - bbox.minLat;
  const padLng = lngSpan * paddingRatio;
  const padLat = latSpan * paddingRatio;
  return {
    minLng: bbox.minLng - padLng,
    minLat: bbox.minLat - padLat,
    maxLng: bbox.maxLng + padLng,
    maxLat: bbox.maxLat + padLat,
  };
}

function bboxContains(outer: BboxQuery, inner: BboxQuery): boolean {
  return (
    inner.minLng >= outer.minLng &&
    inner.maxLng <= outer.maxLng &&
    inner.minLat >= outer.minLat &&
    inner.maxLat <= outer.maxLat
  );
}

function pointInBbox(lngLat: [number, number], bbox: BboxQuery): boolean {
  const [lng, lat] = lngLat;
  return lng >= bbox.minLng && lng <= bbox.maxLng && lat >= bbox.minLat && lat <= bbox.maxLat;
}

function overlayPointCacheKey(point: SqlMapPoint): string {
  const id = String(point.id ?? '').trim();
  if (id) return id;
  const cod = String(point.codAg ?? '').trim();
  if (cod) return `cod-${cod}`;
  return `${point.lngLat[0]}:${point.lngLat[1]}`;
}

function mergeOverlayPointsIntoCache(cache: Map<string, SqlMapPoint>, incoming: SqlMapPoint[]): void {
  for (const p of incoming) {
    cache.set(overlayPointCacheKey(p), p);
  }
}

function pruneOverlayCacheFarFromBbox(
  cache: Map<string, SqlMapPoint>,
  centerBbox: BboxQuery,
  maxSpanMultiplier = 2
): void {
  const lngSpan = centerBbox.maxLng - centerBbox.minLng;
  const latSpan = centerBbox.maxLat - centerBbox.minLat;
  const padLng = lngSpan * maxSpanMultiplier;
  const padLat = latSpan * maxSpanMultiplier;
  const pruneBox: BboxQuery = {
    minLng: centerBbox.minLng - padLng,
    minLat: centerBbox.minLat - padLat,
    maxLng: centerBbox.maxLng + padLng,
    maxLat: centerBbox.maxLat + padLat,
  };
  for (const [key, p] of cache) {
    if (!pointInBbox(p.lngLat, pruneBox)) cache.delete(key);
  }
}

function overlayPointsSignature(points: Array<{ id: string; seatColor?: string }>): string {
  if (points.length === 0) return '0';
  // Inclui a cor: só o id não detecta mudança de paleta (ex.: variação por GC III).
  const ids = points.map((p) => `${p.id}#${p.seatColor ?? ''}`).sort();
  return `${points.length}|${ids.join('|')}`;
}

interface MapComponentProps {
  mapMarkers: MarcadorMapa[];
  hierarchyFilter?: SqlHierarchyFilter | null;
  filtersPanelOpen?: boolean;
  onOpenFilters?: () => void;
  /** Roteiro de visitas ativo (linha + paradas numeradas no mapa). */
  visitRoute?: VisitRoute | null;
  selectedVisitStopId?: number | null;
  onVisitStopSelect?: (stopId: number) => void;
  /** Comando de foco da câmera: `stopId` null enquadra o roteiro inteiro. */
  visitFocus?: { tick: number; stopId: number | null } | null;
  /** Modo "Comparar áreas das supervisões" (controlado pelo pai, ex. painel Navegar). */
  compareSupervisionAreas?: boolean;
  onCompareSupervisionAreasChange?: (active: boolean) => void;
  /** Incrementado pelo painel Navegar a cada "Comparar áreas no mapa" (pipeline único). */
  compareApplyTick?: number;
  /** "Todos" em GG e GC III no painel: compara as áreas de toda a estrutura. */
  compareAllTerritory?: boolean;
  /** Painéis flutuantes do Navegar (abaixo da UI do mapa: busca, AG, lojas, equipe). */
  navigatorOverlays?: React.ReactNode;
}

const COMMERCIAL_TEAM_LEVEL_OPTIONS: Array<{ id: CommercialTeamLevel; label: string }> = [
  { id: 'supervisor', label: COMMERCIAL_TEAM_LEVEL_LABEL.supervisor },
  { id: 'coordenador', label: COMMERCIAL_TEAM_LEVEL_LABEL.coordenador },
  { id: 'gerente_area', label: COMMERCIAL_TEAM_LEVEL_LABEL.gerente_area },
];

type StoreSegmentKey = 'varejo' | 'grandes_redes' | 'exclusivo' | 'casas_bahia';

const STORE_SEGMENT_OPTIONS: Array<{ id: StoreSegmentKey; label: string }> = [
  { id: 'varejo', label: 'Varejo' },
  { id: 'grandes_redes', label: 'Grandes Redes' },
  { id: 'exclusivo', label: 'Exclusivo' },
  { id: 'casas_bahia', label: 'Casas Bahia' },
];

function seatBaseHue(chaveGerenciaArea: number | null | undefined): number {
  if (!Number.isFinite(Number(chaveGerenciaArea))) return 220;
  return (Math.abs(Number(chaveGerenciaArea)) * 47) % 360;
}

/** Deslocamentos de matiz por GC III dentro da mesma gerência — diferença evidente, mesma família. */
const SEAT_COORD_HUE_OFFSETS = [0, 32, -32, 58, -58, 84, -84] as const;

function seatCoordHueOffset(coordIndex: number | null | undefined): number {
  if (coordIndex == null || !Number.isFinite(coordIndex)) return 0;
  return SEAT_COORD_HUE_OFFSETS[Math.abs(Math.trunc(coordIndex)) % SEAT_COORD_HUE_OFFSETS.length];
}

/**
 * Índice estável de cada GC III por gerência (ordenado pela chave),
 * para atribuir cores distintas dentro da paleta da GG.
 */
function buildCoordColorIndexByGa(points: Array<{
  chaveGerenciaArea?: number | null;
  chaveCoordenacao?: number | null;
  chaveEntidade?: number | null;
  commercialLevel?: string | null;
}>): Map<string, number> {
  const byGa = new Map<number, Set<number>>();
  for (const point of points) {
    const ga = Number(point.chaveGerenciaArea);
    if (!Number.isFinite(ga) || ga <= 0) continue;
    let coord = Number(point.chaveCoordenacao);
    if ((!Number.isFinite(coord) || coord <= 0) && point.commercialLevel === 'coordenador') {
      coord = Number(point.chaveEntidade);
    }
    if (!Number.isFinite(coord) || coord <= 0) continue;
    let set = byGa.get(ga);
    if (!set) {
      set = new Set();
      byGa.set(ga, set);
    }
    set.add(Math.trunc(coord));
  }
  const index = new Map<string, number>();
  for (const [ga, coords] of byGa) {
    [...coords]
      .sort((a, b) => a - b)
      .forEach((coord, i) => {
        index.set(`${ga}:${coord}`, i);
      });
  }
  return index;
}

function resolvePointCoordKey(point: {
  chaveGerenciaArea?: number | null;
  chaveCoordenacao?: number | null;
  chaveEntidade?: number | null;
  commercialLevel?: string | null;
}): { ga: number | null; coord: number | null } {
  const gaRaw = Number(point.chaveGerenciaArea);
  const ga = Number.isFinite(gaRaw) && gaRaw > 0 ? Math.trunc(gaRaw) : null;
  let coord = Number(point.chaveCoordenacao);
  if ((!Number.isFinite(coord) || coord <= 0) && point.commercialLevel === 'coordenador') {
    coord = Number(point.chaveEntidade);
  }
  return {
    ga,
    coord: Number.isFinite(coord) && coord > 0 ? Math.trunc(coord) : null,
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hh = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh >= 0 && hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = light - c / 2;
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Cor da sede: matiz base da gerência + variação por GC III.
 * GG usa só a cor da gerência; GC III sempre varia por coordenação.
 * GC (supervisor) só herda a variante do GC III quando o detalhe da coordenação está ativo.
 */
function seatColorByLevel(
  chaveGerenciaArea: number | null | undefined,
  level: CommercialTeamLevel | string | null | undefined,
  chaveCoordenacao?: number | null,
  coordIndex?: number | null,
  options?: { varySupervisorByCoord?: boolean }
): string {
  const baseHue = seatBaseHue(chaveGerenciaArea);
  const varySupervisor = options?.varySupervisorByCoord === true;
  const useCoordShift =
    level === 'coordenador' || (level === 'supervisor' && varySupervisor);
  const hue = useCoordShift
    ? (baseHue + seatCoordHueOffset(coordIndex) + 360) % 360
    : baseHue;
  // Saturação um pouco maior nas variantes de GC III para reforçar a diferença visual.
  const sat =
    useCoordShift && coordIndex != null && coordIndex > 0
      ? 78
      : 72;
  const light =
    level === 'gerente_area' ? 44 : level === 'coordenador' ? 52 : level === 'supervisor' ? 66 : 60;
  return hslToHex(hue, sat, light);
}

function resolveStoreSegment(point: SqlMapPoint): StoreSegmentKey {
  const cod = String(point.codAg ?? '').trim();
  const id = point.id.trim().toLowerCase();
  const nome = point.nome.trim().toLowerCase();
  if (nome.includes('bahia') || id.includes('bahia')) return 'casas_bahia';
  const seedRaw = cod || id || nome || '0';
  let hash = 0;
  for (let i = 0; i < seedRaw.length; i += 1) {
    hash = (hash * 31 + seedRaw.charCodeAt(i)) % 9973;
  }
  const bucket = Math.abs(hash) % 4;
  return STORE_SEGMENT_OPTIONS[bucket].id;
}

const MapComponent: React.FC<MapComponentProps> = ({
  mapMarkers,
  hierarchyFilter = null,
  filtersPanelOpen = false,
  onOpenFilters,
  visitRoute = null,
  selectedVisitStopId = null,
  onVisitStopSelect,
  visitFocus = null,
  compareSupervisionAreas: compareSupervisionAreasProp = false,
  onCompareSupervisionAreasChange,
  compareApplyTick = 0,
  compareAllTerritory = false,
  navigatorOverlays,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const mapMarkersRef = useRef(mapMarkers);
  mapMarkersRef.current = mapMarkers;
  const onVisitStopSelectRef = useRef(onVisitStopSelect);
  onVisitStopSelectRef.current = onVisitStopSelect;
  const visitRouteFitIdRef = useRef<string | null>(null);
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
  const [commercialTeamMenuOpen, setCommercialTeamMenuOpen] = useState(false);
  const [commercialTeamLevelVisibility, setCommercialTeamLevelVisibility] = useState<
    Record<CommercialTeamLevel, boolean>
  >({
    supervisor: true,
    coordenador: true,
    gerente_area: true,
  });
  const [overlayLojas, setOverlayLojas] = useState(false);
  /** Modo "Comparar áreas das supervisões": pinta as áreas de todas as supervisões filhas da GA/Coord ativa. */
  const [compareSupervisionAreasLocal, setCompareSupervisionAreasLocal] = useState(false);
  const compareSupervisionAreas = onCompareSupervisionAreasChange
    ? compareSupervisionAreasProp
    : compareSupervisionAreasLocal;
  const setCompareSupervisionAreas = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof value === 'function' ? value(compareSupervisionAreas) : value;
      if (onCompareSupervisionAreasChange) onCompareSupervisionAreasChange(next);
      else setCompareSupervisionAreasLocal(next);
    },
    [compareSupervisionAreas, onCompareSupervisionAreasChange]
  );
  const compareSupervisionAreasRef = useRef(false);
  const [storeSegmentMenuOpen, setStoreSegmentMenuOpen] = useState(false);
  const [storeSegmentVisibility, setStoreSegmentVisibility] = useState<Record<StoreSegmentKey, boolean>>({
    varejo: true,
    grandes_redes: true,
    exclusivo: true,
    casas_bahia: true,
  });
  const [sqlAgencyPoints, setSqlAgencyPoints] = useState<SqlMapPoint[]>([]);
  const [sqlSeatPoints, setSqlSeatPoints] = useState<SqlMapPoint[]>([]);
  const [apiSupervisoesForCompare, setApiSupervisoesForCompare] = useState<
    Array<{ chave: number; descricao: string }>
  >([]);
  const [sqlStorePoints, setSqlStorePoints] = useState<SqlMapPoint[]>([]);
  const [loadingAgencyPoints, setLoadingAgencyPoints] = useState(false);
  const [loadingSeatPoints, setLoadingSeatPoints] = useState(false);
  const [loadingStorePoints, setLoadingStorePoints] = useState(false);
  /** Quando definido, o overlay de lojas mostra só lojas com este COD_AG. */
  const [storeFilterCodAg, setStoreFilterCodAg] = useState<string | null>(null);
  const [storeFilterAgencyName, setStoreFilterAgencyName] = useState<string | null>(null);
  const [pinnedAgencyPoint, setPinnedAgencyPoint] = useState<SqlMapPoint | null>(null);
  /** Detalhe do marcador clicado (barra inferior); hover continua no popup do mapa. */
  const [overlayMarkerSelection, setOverlayMarkerSelection] = useState<AgencyPopupInfo | null>(null);
  const storeFilterCodAgRef = useRef<string | null>(null);
  const overlaySeatHierarchyRef = useRef<SqlHierarchyFilter | null>(null);
  const hierarchyFilterRef = useRef<SqlHierarchyFilter | null | undefined>(hierarchyFilter);
  const selectAgencyForStoresRef = useRef<
    (codAg: string, agencyName?: string | null, agencyPoint?: SqlMapPoint | null) => Promise<void>
  >(async () => {});
  const refreshTimerRef = useRef<number | null>(null);
  const viewportBoundsTickTimerRef = useRef<number | null>(null);
  const lastViewportOverlayBboxKeyRef = useRef<string | null>(null);
  const overlayAgencyCacheRef = useRef(new Map<string, SqlMapPoint>());
  const overlayStoreCacheRef = useRef(new Map<string, SqlMapPoint>());
  const overlayFetchedBboxCacheRef = useRef<BboxQuery | null>(null);
  const overlayLastFetchZoomRef = useRef<number | null>(null);
  const lastOverlayFcSignatureRef = useRef<Record<string, string>>({});
  const [viewportBoundsTick, setViewportBoundsTick] = useState(0);
  const [overlaySeatFilterKey, setOverlaySeatFilterKey] = useState<string | null>(null);
  /** Histórico de filtros da legenda para o botão Voltar (GG → GC III → GC). */
  const seatLegendHistoryRef = useRef<Array<string | null>>([]);
  const overlaySeatFilterKeyRef = useRef<string | null>(null);
  const mapTransitionTimerRef = useRef<number | null>(null);
  const mapTransitionStartRef = useRef<number>(Date.now());
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const mapStyleSwapPreserveRef = useRef(false);
  const preservedCameraForStyleSwapRef = useRef<SavedMapCamera | null>(null);
  const [isMapTransitionLoading, setIsMapTransitionLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [stateSearchOptions, setStateSearchOptions] = useState<SearchOption[]>([]);
  const [municipalitySearchOptions, setMunicipalitySearchOptions] = useState<SearchOption[]>([]);
  const [allMunicipalityNames, setAllMunicipalityNames] = useState<string[]>([]);
  const [mapStyleMode, setMapStyleMode] = useState<MapStyleMode>('standardWarm');
  /** Abre o seletor de layout ao clicar (útil sem hover, ex.: touch). Combinado com hover no botão Layers. */
  const [mapLayoutMenuPinned, setMapLayoutMenuPinned] = useState(false);
  const [mapLayoutFlyoutHover, setMapLayoutFlyoutHover] = useState(false);
  const layoutFlyoutHoverTimerRef = useRef<number | null>(null);
  const mapLayoutPickerRef = useRef<HTMLDivElement>(null);
  const commercialTeamPickerRef = useRef<HTMLDivElement>(null);
  const storeSegmentPickerRef = useRef<HTMLDivElement>(null);

  const selectedCommercialTeamLevels = useMemo(
    () =>
      COMMERCIAL_TEAM_LEVEL_OPTIONS.filter((option) => commercialTeamLevelVisibility[option.id]).map(
        (option) => option.id
      ),
    [commercialTeamLevelVisibility]
  );
  const selectedStoreSegments = useMemo(
    () => STORE_SEGMENT_OPTIONS.filter((option) => storeSegmentVisibility[option.id]).map((option) => option.id),
    [storeSegmentVisibility]
  );

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
  const [municipalityMeshVisible, setMunicipalityMeshVisible] = useState(false);
  const municipalityMeshVisibleRef = useRef(municipalityMeshVisible);
  const [outsideMaskColor, setOutsideMaskColor] = useState<string>(MAPBOX_CONFIG.outsideBrazilMaskColor);
  const activeBaseStyle = MAP_STYLE_URL[mapStyleMode];
  const activeStandardTheme: 'warm' | 'cool' | null =
    mapStyleMode === 'standardCool' ? 'cool' : mapStyleMode === 'standardWarm' ? 'warm' : null;

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

  useEffect(() => {
    if (!commercialTeamMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = commercialTeamPickerRef.current;
      if (root && !root.contains(e.target as Node)) {
        setCommercialTeamMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [commercialTeamMenuOpen]);

  useEffect(() => {
    if (!storeSegmentMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = storeSegmentPickerRef.current;
      if (root && !root.contains(e.target as Node)) {
        setStoreSegmentMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [storeSegmentMenuOpen]);

  const fallbackExpressoMetrics = useMemo(
    () => buildExpressoRegionMetrics(mapMarkers, selectedStateFeature),
    [mapMarkers, selectedStateFeature]
  );
  const expressoMetrics = sqlExpressoMetrics ?? fallbackExpressoMetrics;

  const overlayScopeIsViewportExploration = useMemo(
    () =>
      !storeFilterCodAg &&
      !overlaySeatFilterKey &&
      !hasPanelHierarchyFilter(hierarchyFilter),
    [storeFilterCodAg, overlaySeatFilterKey, hierarchyFilter]
  );

  const visibleViewportBbox = useMemo((): BboxQuery | null => {
    void viewportBoundsTick;
    const m = map.current;
    if (!m) return null;
    const bounds = m.getBounds();
    return {
      minLng: bounds.getWest(),
      minLat: bounds.getSouth(),
      maxLng: bounds.getEast(),
      maxLat: bounds.getNorth(),
    };
  }, [viewportBoundsTick, mapReadyVersion]);

  const filteredRegionAgencias = useMemo(() => {
    if (storeFilterCodAg) {
      if (pinnedAgencyPoint) return [pinnedAgencyPoint];
      const key = normalizeCodAgKey(storeFilterCodAg);
      return sqlAgencyPoints.filter((p) => normalizeCodAgKey(p.codAg) === key);
    }
    let points = filterRegionMapPoints(
      sqlAgencyPoints,
      selectedMunicipalityFeature,
      selectedStateFeature
    );
    if (overlayScopeIsViewportExploration && visibleViewportBbox) {
      const drawBbox = expandBbox(visibleViewportBbox, 0.12);
      points = points.filter((p) => pointInBbox(p.lngLat, drawBbox));
    }
    return points;
  }, [
    sqlAgencyPoints,
    storeFilterCodAg,
    pinnedAgencyPoint,
    selectedMunicipalityFeature,
    selectedStateFeature,
    overlayScopeIsViewportExploration,
    visibleViewportBbox,
  ]);
  const seatCoordColorIndex = useMemo(
    () => buildCoordColorIndexByGa(sqlSeatPoints),
    [sqlSeatPoints]
  );

  /** Filtro de sede ativo (clique na legenda/mapa ou painel): GG, GC III ou GC. */
  const activeSeatScope = useMemo(() => {
    const fromOverlay = parseOverlaySeatHierarchyKey(overlaySeatFilterKey);
    const parse = (value: unknown) => {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    };
    return {
      ga: parse(fromOverlay?.chaveGerenciaArea) ?? parse(hierarchyFilter?.chaveGerenciaArea),
      coord: parse(fromOverlay?.chaveCoordenacao) ?? parse(hierarchyFilter?.chaveCoordenacao),
      sup: parse(fromOverlay?.chaveSupervisao) ?? parse(hierarchyFilter?.chaveSupervisao),
    };
  }, [
    overlaySeatFilterKey,
    hierarchyFilter?.chaveGerenciaArea,
    hierarchyFilter?.chaveCoordenacao,
    hierarchyFilter?.chaveSupervisao,
  ]);

  /**
   * Na visão geral (sem seleção), GC ficam com cor uniforme da gerência.
   * Com GG/GC III/GC selecionado, os GC herdam a variante de cor do seu GC III.
   */
  const varySupervisorSeatColorByCoord =
    activeSeatScope.ga != null || activeSeatScope.coord != null || activeSeatScope.sup != null;

  const filteredRegionSupervisores = useMemo(
    () => {
      const visibleLevels = new Set(selectedCommercialTeamLevels);
      const { ga: scopeGa, coord: scopeCoord, sup: scopeSup } = activeSeatScope;

      // Dados do GC selecionado (para manter GC III/GG pais visíveis quando um GC está ativo).
      const selectedSupPoint =
        scopeSup != null
          ? sqlSeatPoints.find(
              (p) => p.commercialLevel === 'supervisor' && Number(p.chaveEntidade) === scopeSup
            )
          : undefined;
      const supParentCoord = selectedSupPoint ? Number(selectedSupPoint.chaveCoordenacao) : NaN;
      const supParentGa = selectedSupPoint ? Number(selectedSupPoint.chaveGerenciaArea) : NaN;
      const selectedCoordPoint =
        scopeCoord != null
          ? sqlSeatPoints.find(
              (p) => p.commercialLevel === 'coordenador' && Number(p.chaveEntidade) === scopeCoord
            )
          : undefined;
      const coordParentGa =
        scopeGa ?? (selectedCoordPoint ? Number(selectedCoordPoint.chaveGerenciaArea) : NaN);

      /** Mantém só pontos do escopo selecionado — some com bolinhas de outras gerências/coordenações. */
      const inActiveScope = (point: SqlMapPoint): boolean => {
        if (scopeSup != null) {
          if (point.commercialLevel === 'supervisor') {
            return Number(point.chaveEntidade) === scopeSup;
          }
          if (point.commercialLevel === 'coordenador') {
            return Number(point.chaveEntidade) === supParentCoord;
          }
          if (point.commercialLevel === 'gerente_area') {
            return Number(point.chaveEntidade) === supParentGa;
          }
          return true;
        }
        if (scopeCoord != null) {
          if (point.commercialLevel === 'coordenador') {
            return Number(point.chaveEntidade) === scopeCoord;
          }
          if (point.commercialLevel === 'supervisor') {
            return Number(point.chaveCoordenacao) === scopeCoord;
          }
          if (point.commercialLevel === 'gerente_area') {
            return Number(point.chaveEntidade) === coordParentGa;
          }
          return true;
        }
        if (scopeGa != null) {
          return Number(point.chaveGerenciaArea) === scopeGa;
        }
        return true;
      };

      const filteredByLevel = sqlSeatPoints
        .filter((point) => !point.commercialLevel || visibleLevels.has(point.commercialLevel))
        .filter(inActiveScope)
        .map((point) => {
          const { ga, coord } = resolvePointCoordKey(point);
          const coordIndex =
            ga != null && coord != null ? seatCoordColorIndex.get(`${ga}:${coord}`) ?? null : null;
          return {
            ...point,
            seatColor: seatColorByLevel(
              point.chaveGerenciaArea,
              point.commercialLevel,
              coord,
              coordIndex,
              { varySupervisorByCoord: varySupervisorSeatColorByCoord }
            ),
          };
        });
      return filterRegionMapPoints(filteredByLevel, selectedMunicipalityFeature, selectedStateFeature);
    },
    [
      sqlSeatPoints,
      selectedMunicipalityFeature,
      selectedStateFeature,
      selectedCommercialTeamLevels,
      activeSeatScope,
      seatCoordColorIndex,
      varySupervisorSeatColorByCoord,
    ]
  );
  const compareScopeHierarchy = useMemo(() => {
    const resolved = resolveCompareScopeHierarchy(hierarchyFilter, overlaySeatFilterKey);
    if (resolved) return resolved;
    // "Todos" em GG e GC III no painel: escopo vazio = estrutura inteira,
    // desde que não haja uma supervisão única filtrada.
    const supKey = Number(hierarchyFilter?.chaveSupervisao);
    if (compareAllTerritory && !(Number.isFinite(supKey) && supKey > 0)) {
      return {} as SqlHierarchyFilter;
    }
    return null;
  }, [hierarchyFilter, overlaySeatFilterKey, compareAllTerritory]);

  /**
   * Lista de supervisões filhas da GA/Coord ativa para o modo "Comparar áreas".
   * Usa sedes do mapa; se ainda vazio, cai na lista da API de estrutura comercial.
   */
  const compareSupervisionsList = useMemo(() => {
    if (!compareScopeHierarchy) return [] as ReturnType<typeof mergeCompareSupervisionList>;
    return mergeCompareSupervisionList(
      sqlSeatPoints,
      apiSupervisoesForCompare,
      compareScopeHierarchy
    );
  }, [sqlSeatPoints, compareScopeHierarchy, apiSupervisoesForCompare]);

  /** Habilita o botão de comparar quando há GA ou Coord no painel ou via clique na sede no mapa. */
  const canCompareSupervisionAreas = useMemo(
    () => Boolean(compareScopeHierarchy) && compareSupervisionsList.length > 0,
    [compareScopeHierarchy, compareSupervisionsList.length]
  );

  /** Só exibe o controle de comparar áreas com GG ou GC III visíveis em "Mostrar Equipe Comercial". */
  const showCompareSupervisionAreasButton = useMemo(
    () =>
      overlaySupervisores &&
      (commercialTeamLevelVisibility.coordenador || commercialTeamLevelVisibility.gerente_area),
    [overlaySupervisores, commercialTeamLevelVisibility]
  );

  const compareScopeLabel = useMemo(() => {
    const scope = compareScopeHierarchy;
    if (!scope) return '';

    const coord = Number(scope.chaveCoordenacao);
    if (Number.isFinite(coord) && coord > 0) {
      const coordPoint = sqlSeatPoints.find(
        (p) => p.commercialLevel === 'coordenador' && Number(p.chaveEntidade) === coord
      );
      const nome = String(coordPoint?.nome ?? '').trim();
      return nome || `${COMMERCIAL_TEAM_LEVEL_LABEL.coordenador} ${coord}`;
    }
    const ga = Number(scope.chaveGerenciaArea);
    if (Number.isFinite(ga) && ga > 0) {
      const gaPoint = sqlSeatPoints.find(
        (p) => p.commercialLevel === 'gerente_area' && Number(p.chaveEntidade) === ga
      );
      const nome = String(gaPoint?.nome ?? '').trim();
      return nome || `${COMMERCIAL_TEAM_LEVEL_LABEL.gerente_area} ${ga}`;
    }
    return 'Toda a estrutura';
  }, [compareScopeHierarchy, sqlSeatPoints]);

  const seatLegendSupervisorFilter = useMemo(() => {
    const fromOverlay = parseOverlaySeatHierarchyKey(overlaySeatFilterKey);
    const chave =
      Number(fromOverlay?.chaveSupervisao) ||
      Number(hierarchyFilter?.chaveSupervisao) ||
      NaN;
    return Number.isFinite(chave) && chave > 0 ? Math.trunc(chave) : null;
  }, [overlaySeatFilterKey, hierarchyFilter?.chaveSupervisao]);

  const seatLegendCoordenacaoFilter = useMemo(() => {
    if (seatLegendSupervisorFilter != null) return null;
    const fromOverlay = parseOverlaySeatHierarchyKey(overlaySeatFilterKey);
    const chave =
      Number(fromOverlay?.chaveCoordenacao) ||
      Number(hierarchyFilter?.chaveCoordenacao) ||
      NaN;
    return Number.isFinite(chave) && chave > 0 ? Math.trunc(chave) : null;
  }, [
    seatLegendSupervisorFilter,
    overlaySeatFilterKey,
    hierarchyFilter?.chaveCoordenacao,
  ]);

  const seatLegendGerenciaFilter = useMemo(() => {
    if (seatLegendSupervisorFilter != null || seatLegendCoordenacaoFilter != null) return null;
    const fromOverlay = parseOverlaySeatHierarchyKey(overlaySeatFilterKey);
    const chave =
      Number(fromOverlay?.chaveGerenciaArea) ||
      Number(hierarchyFilter?.chaveGerenciaArea) ||
      NaN;
    return Number.isFinite(chave) && chave > 0 ? Math.trunc(chave) : null;
  }, [
    seatLegendSupervisorFilter,
    seatLegendCoordenacaoFilter,
    overlaySeatFilterKey,
    hierarchyFilter?.chaveGerenciaArea,
  ]);

  /** Com GC selecionado: só nome + chave da supervisão (sem coluna GC). */
  const seatLegendSelectedGc = useMemo(() => {
    if (seatLegendSupervisorFilter == null) return null;
    const point =
      sqlSeatPoints.find(
        (p) =>
          p.commercialLevel === 'supervisor' &&
          Number(p.chaveEntidade) === seatLegendSupervisorFilter
      ) ??
      sqlSeatPoints.find((p) => Number(p.chaveEntidade) === seatLegendSupervisorFilter) ??
      null;
    if (!point) {
      return {
        chave: String(seatLegendSupervisorFilter),
        nome: `${COMMERCIAL_TEAM_LEVEL_LABEL.supervisor} ${seatLegendSupervisorFilter}`,
        color: seatColorByLevel(null, 'supervisor'),
        lngLat: null as [number, number] | null,
      };
    }
    const { ga, coord } = resolvePointCoordKey(point);
    const coordIndex =
      ga != null && coord != null ? seatCoordColorIndex.get(`${ga}:${coord}`) ?? null : null;
    return {
      chave: String(seatLegendSupervisorFilter),
      nome:
        String(point.nome ?? '').trim() ||
        `${COMMERCIAL_TEAM_LEVEL_LABEL.supervisor} ${seatLegendSupervisorFilter}`,
      color: seatColorByLevel(ga, 'supervisor', coord, coordIndex, {
        varySupervisorByCoord: true,
      }),
      lngLat: point.lngLat,
    };
  }, [seatLegendSupervisorFilter, sqlSeatPoints, seatCoordColorIndex]);

  /** Com GC III selecionado: lista todos os GC da coordenação. */
  const seatLegendGcEntries = useMemo(() => {
    if (seatLegendCoordenacaoFilter == null) return [];
    const coord = seatLegendCoordenacaoFilter;
    const entries: Array<{
      chave: string;
      nome: string;
      color: string;
      lngLat: [number, number] | null;
    }> = [];

    for (const point of sqlSeatPoints) {
      if (point.commercialLevel !== 'supervisor') continue;
      const pointCoord = Number(point.chaveCoordenacao);
      if (pointCoord !== coord) continue;
      const chave = Number(point.chaveEntidade);
      if (!Number.isFinite(chave) || chave <= 0) continue;
      const { ga } = resolvePointCoordKey(point);
      const coordIndex =
        ga != null ? seatCoordColorIndex.get(`${ga}:${coord}`) ?? null : null;
      entries.push({
        chave: String(chave),
        nome:
          String(point.nome ?? '').trim() ||
          `${COMMERCIAL_TEAM_LEVEL_LABEL.supervisor} ${chave}`,
        color: seatColorByLevel(ga, 'supervisor', coord, coordIndex, {
          varySupervisorByCoord: true,
        }),
        lngLat: point.lngLat,
      });
    }

    return entries.sort((a, b) => Number(a.chave) - Number(b.chave));
  }, [seatLegendCoordenacaoFilter, sqlSeatPoints, seatCoordColorIndex]);

  /** Com GG selecionado: lista GC III da gerência + quantidade de GC em cada um. */
  const seatLegendGc3Entries = useMemo(() => {
    if (seatLegendGerenciaFilter == null) return [];
    const ga = seatLegendGerenciaFilter;
    const map = new Map<
      number,
      { chave: string; nome: string; color: string; gcCount: number; lngLat: [number, number] | null }
    >();

    for (const point of sqlSeatPoints) {
      if (Number(point.chaveGerenciaArea) !== ga) continue;
      if (point.commercialLevel === 'coordenador') {
        const chave = Number(point.chaveEntidade ?? point.chaveCoordenacao);
        if (!Number.isFinite(chave) || chave <= 0) continue;
        const existing = map.get(chave);
        const coordIndex = seatCoordColorIndex.get(`${ga}:${chave}`) ?? null;
        map.set(chave, {
          chave: String(chave),
          nome:
            String(point.nome ?? '').trim() ||
            `${COMMERCIAL_TEAM_LEVEL_LABEL.coordenador} ${chave}`,
          color: seatColorByLevel(ga, 'coordenador', chave, coordIndex),
          gcCount: existing?.gcCount ?? 0,
          lngLat: point.lngLat ?? existing?.lngLat ?? null,
        });
        continue;
      }
      if (point.commercialLevel === 'supervisor') {
        const chave = Number(point.chaveCoordenacao);
        if (!Number.isFinite(chave) || chave <= 0) continue;
        const existing = map.get(chave);
        const coordIndex = seatCoordColorIndex.get(`${ga}:${chave}`) ?? null;
        if (existing) {
          existing.gcCount += 1;
        } else {
          map.set(chave, {
            chave: String(chave),
            nome: `${COMMERCIAL_TEAM_LEVEL_LABEL.coordenador} ${chave}`,
            color: seatColorByLevel(ga, 'coordenador', chave, coordIndex),
            gcCount: 1,
            lngLat: null,
          });
        }
      }
    }

    return [...map.values()].sort((a, b) => Number(a.chave) - Number(b.chave));
  }, [seatLegendGerenciaFilter, sqlSeatPoints, seatCoordColorIndex]);

  const seatLegendGc3Total = useMemo(
    () => seatLegendGc3Entries.reduce((sum, entry) => sum + entry.gcCount, 0),
    [seatLegendGc3Entries]
  );

  const seatLegendEntries = useMemo(() => {
    const map = new Map<
      number,
      { ga: string; gaNome: string; color: string; gcCount: number }
    >();
    for (const point of sqlSeatPoints) {
      const ga = Number(point.chaveGerenciaArea);
      if (!Number.isFinite(ga)) continue;
      let entry = map.get(ga);
      if (!entry) {
        entry = {
          ga: String(ga),
          gaNome: `${COMMERCIAL_TEAM_LEVEL_LABEL.gerente_area} ${ga}`,
          color: seatColorByLevel(ga, 'gerente_area'),
          gcCount: 0,
        };
        map.set(ga, entry);
      }
      if (point.commercialLevel === 'gerente_area') {
        const nome = String(point.nome ?? '').trim();
        if (nome) entry.gaNome = nome;
      }
      if (point.commercialLevel === 'supervisor') {
        entry.gcCount += 1;
      }
    }
    return [...map.values()].sort((a, b) => Number(a.ga) - Number(b.ga)).slice(0, 8);
  }, [sqlSeatPoints]);
  const seatLegendGcTotal = useMemo(
    () => seatLegendEntries.reduce((sum, entry) => sum + entry.gcCount, 0),
    [seatLegendEntries]
  );
  const seatLegendCompact = seatLegendSelectedGc != null;
  const seatLegendGc3Detail = seatLegendCoordenacaoFilter != null;
  const seatLegendGgDetail = seatLegendGerenciaFilter != null;
  const filteredRegionLojas = useMemo(() => {
    const visibleSegments = new Set(selectedStoreSegments);
    const applySegmentFilter = (points: SqlMapPoint[]) =>
      points.filter((point) => visibleSegments.has(resolveStoreSegment(point)));

    if (storeFilterCodAg) {
      if (loadingStorePoints && sqlStorePoints.length === 0) return [];
      return applySegmentFilter(sqlStorePoints);
    }
    let visibleByArea = filterRegionMapPoints(
      sqlStorePoints,
      selectedMunicipalityFeature,
      selectedStateFeature
    );
    if (overlayScopeIsViewportExploration && visibleViewportBbox) {
      const drawBbox = expandBbox(visibleViewportBbox, 0.12);
      visibleByArea = visibleByArea.filter((p) => pointInBbox(p.lngLat, drawBbox));
    }
    return applySegmentFilter(visibleByArea);
  }, [
    sqlStorePoints,
    storeFilterCodAg,
    loadingStorePoints,
    selectedMunicipalityFeature,
    selectedStateFeature,
    selectedStoreSegments,
    overlayScopeIsViewportExploration,
    visibleViewportBbox,
  ]);

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

  const shouldSkipViewportOverlayRefresh = () => {
    if (storeFilterCodAgRef.current) return true;
    if (overlaySeatHierarchyRef.current) return true;
    if (hasPanelHierarchyFilter(hierarchyFilterRef.current)) return true;
    return false;
  };

  const clearOverlayViewportCaches = useCallback(() => {
    overlayAgencyCacheRef.current.clear();
    overlayStoreCacheRef.current.clear();
    overlayFetchedBboxCacheRef.current = null;
    overlayLastFetchZoomRef.current = null;
    lastViewportOverlayBboxKeyRef.current = null;
  }, []);

  const applyAgencyFetchResult = useCallback(
    (points: SqlMapPoint[], mode: 'merge' | 'replace', pruneAround?: BboxQuery | null) => {
      if (mode === 'replace') {
        overlayAgencyCacheRef.current.clear();
      }
      mergeOverlayPointsIntoCache(overlayAgencyCacheRef.current, points);
      if (pruneAround) {
        pruneOverlayCacheFarFromBbox(overlayAgencyCacheRef.current, pruneAround);
      }
      setSqlAgencyPoints([...overlayAgencyCacheRef.current.values()]);
    },
    []
  );

  const applyStoreFetchResult = useCallback(
    (points: SqlMapPoint[], mode: 'merge' | 'replace', pruneAround?: BboxQuery | null) => {
      if (mode === 'replace') {
        overlayStoreCacheRef.current.clear();
      }
      mergeOverlayPointsIntoCache(overlayStoreCacheRef.current, points);
      if (pruneAround) {
        pruneOverlayCacheFarFromBbox(overlayStoreCacheRef.current, pruneAround);
      }
      setSqlStorePoints([...overlayStoreCacheRef.current.values()]);
    },
    []
  );

  const fitMapToLngLatPoints = (points: Array<{ lngLat: [number, number] }>) => {
    const m = map.current;
    if (!m || points.length === 0) return;
    const lngs = points.map((p) => p.lngLat[0]);
    const lats = points.map((p) => p.lngLat[1]);
    const bounds: mapboxgl.LngLatBoundsLike = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    try {
      m.fitBounds(bounds, {
        padding: 72,
        maxZoom: points.length === 1 ? 14 : 12,
        duration: 650,
      });
    } catch {
      /* ignore */
    }
  };

  /** Clique na legenda: aplica filtro hierárquico + zoom (troca o conteúdo da legenda). */
  const applySeatLegendHierarchy = (
    hierarchy: SqlHierarchyFilter | null,
    zoomPoints: Array<{ lngLat: [number, number] }>,
    options?: { fromBack?: boolean }
  ) => {
    if (!options?.fromBack) {
      seatLegendHistoryRef.current.push(overlaySeatFilterKeyRef.current);
    }
    if (!hierarchy) {
      overlaySeatHierarchyRef.current = null;
      overlaySeatFilterKeyRef.current = null;
      setOverlaySeatFilterKey(null);
    } else {
      const nextKey = JSON.stringify(hierarchy);
      overlaySeatHierarchyRef.current = hierarchy;
      overlaySeatFilterKeyRef.current = nextKey;
      setOverlaySeatFilterKey(nextKey);
    }
    // Navegação na legenda não deve ligar os overlays de agências/lojas:
    // preserva o que o usuário escolheu nos toggles e só limpa o pin de agência.
    clearOverlayViewportCaches();
    setStoreFilterCodAg(null);
    setStoreFilterAgencyName(null);
    setPinnedAgencyPoint(null);
    storeFilterCodAgRef.current = null;
    if (zoomPoints.length > 0) fitMapToLngLatPoints(zoomPoints);
  };

  const focusSeatLegendGerencia = (chaveGerenciaArea: string, options?: { fromBack?: boolean }) => {
    const ga = Number(chaveGerenciaArea);
    if (!Number.isFinite(ga) || ga <= 0) return;
    const points = sqlSeatPoints.filter((p) => Number(p.chaveGerenciaArea) === ga);
    applySeatLegendHierarchy({ chaveGerenciaArea: Math.trunc(ga) }, points, options);
  };

  const focusSeatLegendSelectedGc = () => {
    if (!seatLegendSelectedGc?.lngLat) return;
    fitMapToLngLatPoints([{ lngLat: seatLegendSelectedGc.lngLat }]);
  };

  // Zoom automático da legenda acontece apenas no nível gerente de gestão:
  // GC III e GC mantêm a câmera onde está (zoomPoints vazio).
  const focusSeatLegendGc3 = (chaveCoordenacao: string, options?: { fromBack?: boolean }) => {
    const coord = Number(chaveCoordenacao);
    if (!Number.isFinite(coord) || coord <= 0) return;
    applySeatLegendHierarchy({ chaveCoordenacao: Math.trunc(coord) }, [], options);
  };

  const focusSeatLegendGc = (chaveSupervisao: string, _lngLat: [number, number] | null) => {
    const chave = Number(chaveSupervisao);
    if (!Number.isFinite(chave) || chave <= 0) return;
    applySeatLegendHierarchy({ chaveSupervisao: Math.trunc(chave) }, []);
  };

  /** Volta ao estado anterior da legenda (histórico de cliques). */
  const goBackSeatLegend = () => {
    const previousKey =
      seatLegendHistoryRef.current.length > 0
        ? seatLegendHistoryRef.current.pop() ?? null
        : null;
    const previous = parseOverlaySeatHierarchyKey(previousKey);

    if (!previous) {
      // Voltar à visão geral não mexe na câmera (zoom só no nível GG).
      applySeatLegendHierarchy(null, [], { fromBack: true });
      return;
    }

    if (previous.chaveSupervisao != null) {
      const chave = Math.trunc(Number(previous.chaveSupervisao));
      applySeatLegendHierarchy({ chaveSupervisao: chave }, [], { fromBack: true });
      return;
    }

    if (previous.chaveCoordenacao != null) {
      focusSeatLegendGc3(String(Math.trunc(Number(previous.chaveCoordenacao))), { fromBack: true });
      return;
    }

    if (previous.chaveGerenciaArea != null) {
      focusSeatLegendGerencia(String(Math.trunc(Number(previous.chaveGerenciaArea))), {
        fromBack: true,
      });
    }
  };

  const seatLegendCanGoBack =
    seatLegendCompact || seatLegendGc3Detail || seatLegendGgDetail;

  const loadStoreOverlayPoints = useCallback(
    async (options?: {
      codAg?: string | null;
      bbox?: BboxQuery | null;
      silent?: boolean;
      hierarchy?: SqlHierarchyFilter | null;
    }) => {
      const codAg =
        options?.codAg !== undefined ? options.codAg : storeFilterCodAgRef.current;
      const seatHierarchy = options?.hierarchy ?? overlaySeatHierarchyRef.current;
      const bbox =
        options?.bbox !== undefined
          ? options.bbox
          : codAg || seatHierarchy
            ? null
            : getCurrentMapBbox();
      const silent = options?.silent === true;
      const hierarchyForFetch =
        options?.hierarchy !== undefined
          ? options.hierarchy
          : codAg
            ? null
            : seatHierarchy ?? null;

      if (!silent) {
        setLoadingStorePoints(true);
        if (codAg) setSqlStorePoints([]);
      }
      try {
        const points = await fetchStorePoints(
          codAg
            ? { codAg, hierarchy: null }
            : hierarchyForFetch
              ? { hierarchy: hierarchyForFetch }
              : bbox
                ? { bbox, hierarchy: hierarchyFilterRef.current ?? null }
                : { hierarchy: hierarchyFilterRef.current ?? null }
        );
        if (codAg || hierarchyForFetch) {
          applyStoreFetchResult(points, 'replace');
        } else if (bbox) {
          applyStoreFetchResult(points, 'merge', expandBbox(bbox));
        } else {
          applyStoreFetchResult(points, 'replace');
        }
        return points;
      } finally {
        if (!silent) setLoadingStorePoints(false);
      }
    },
    [applyStoreFetchResult]
  );

  const resetAgencyStoreFilterSync = useCallback(() => {
    storeFilterCodAgRef.current = null;
    overlaySeatHierarchyRef.current = null;
    seatLegendHistoryRef.current = [];
    overlaySeatFilterKeyRef.current = null;
    setOverlaySeatFilterKey(null);
    setStoreFilterCodAg(null);
    setStoreFilterAgencyName(null);
    setPinnedAgencyPoint(null);
    setSqlStorePoints([]);
    setOverlayMarkerSelection(null);
  }, []);

  const resetAgencyStoreFilterSyncRef = useRef(resetAgencyStoreFilterSync);
  useEffect(() => {
    resetAgencyStoreFilterSyncRef.current = resetAgencyStoreFilterSync;
  }, [resetAgencyStoreFilterSync]);

  const clearStoreAgencyFilter = useCallback(async () => {
    resetAgencyStoreFilterSync();
    if (!overlayLojas) {
      return;
    }
    await loadStoreOverlayPoints({ codAg: null, bbox: getCurrentMapBbox() });
  }, [loadStoreOverlayPoints, overlayLojas, resetAgencyStoreFilterSync]);

  const selectAgencyForStores = useCallback(
    async (codAg: string, agencyName?: string | null, agencyPoint?: SqlMapPoint | null) => {
      const raw = codAg.trim();
      if (!raw) return;
      const asNum = Number(raw.replace(',', '.'));
      const normalized = Number.isFinite(asNum) ? String(Math.trunc(asNum)) : raw;
      const agencyLabel = agencyName?.trim() || 'Agência';
      const pinned =
        agencyPoint ??
        sqlAgencyPoints.find((p) => normalizeCodAgKey(p.codAg) === normalized) ??
        null;

      storeFilterCodAgRef.current = normalized;
      overlaySeatHierarchyRef.current = null;
      seatLegendHistoryRef.current = [];
      overlaySeatFilterKeyRef.current = null;
      setOverlaySeatFilterKey(null);
      setStoreFilterCodAg(normalized);
      setStoreFilterAgencyName(agencyLabel);
      setPinnedAgencyPoint(pinned);
      setOverlayLojas(true);
      setSqlStorePoints([]);

      try {
        const points = await loadStoreOverlayPoints({ codAg: normalized });
        if (points.length === 0) {
          setSqlStorePoints([]);
          toast({
            title: 'Nenhuma loja vinculada',
            description: `Não há lojas vinculadas à agência ${normalized} - ${agencyLabel}.`,
          });
          return;
        }
      } catch (error) {
        console.error('Falha ao carregar lojas da agência:', error);
        toast({
          title: 'Falha ao carregar lojas',
          description:
            error instanceof Error ? error.message : 'Não foi possível buscar lojas vinculadas.',
          variant: 'destructive',
        });
      }
    },
    [loadStoreOverlayPoints, sqlAgencyPoints, toast]
  );

  useEffect(() => {
    selectAgencyForStoresRef.current = selectAgencyForStores;
  }, [selectAgencyForStores]);

  const refreshOverlayDataForViewport = async (options?: { silent?: boolean; force?: boolean }) => {
    const silent = options?.silent === true;
    const force = options?.force === true;

    if (!force && shouldSkipViewportOverlayRefresh()) {
      return;
    }

    const m = map.current;
    const panelHierarchy = hierarchyFilterRef.current;
    if (force && hasPanelHierarchyFilter(panelHierarchy)) {
      if (overlayAgencias && !loadingAgencyPoints) {
        if (!silent) setLoadingAgencyPoints(true);
        try {
          const points = await fetchAgencyPoints({ hierarchy: panelHierarchy });
          applyAgencyFetchResult(points, 'replace');
        } catch (error) {
          console.error('Falha ao carregar agências SQL:', error);
          if (!silent) {
            toast({
              title: 'Falha ao carregar agências',
              description: 'Não foi possível buscar agências no SQL Server.',
              variant: 'destructive',
            });
          }
        } finally {
          if (!silent) setLoadingAgencyPoints(false);
        }
      }
      if (overlayLojas && (silent || !loadingStorePoints) && !storeFilterCodAgRef.current) {
        try {
          await loadStoreOverlayPoints({
            codAg: null,
            bbox: null,
            silent,
            hierarchy: panelHierarchy,
          });
        } catch (error) {
          console.error('Falha ao carregar lojas SQL:', error);
          if (!silent) {
            toast({
              title: 'Falha ao carregar lojas',
              description: 'Não foi possível buscar lojas no SQL Server.',
              variant: 'destructive',
            });
          }
        }
      }
      return;
    }

    const viewport = getCurrentMapBbox();
    if (!viewport || !m) return;

    const zoom = m.getZoom();
    const cachedFetchBbox = overlayFetchedBboxCacheRef.current;
    if (
      !force &&
      cachedFetchBbox &&
      bboxContains(cachedFetchBbox, viewport) &&
      overlayLastFetchZoomRef.current != null &&
      Math.abs(zoom - overlayLastFetchZoomRef.current) < OVERLAY_ZOOM_REFETCH_DELTA
    ) {
      return;
    }

    const fetchBbox = expandBbox(viewport);
    overlayFetchedBboxCacheRef.current = fetchBbox;
    overlayLastFetchZoomRef.current = zoom;

    if (overlayAgencias && !loadingAgencyPoints) {
      if (!silent) setLoadingAgencyPoints(true);
      try {
        const points = await fetchAgencyPoints({
          bbox: fetchBbox,
          hierarchy: hierarchyFilterRef.current ?? null,
        });
        applyAgencyFetchResult(points, 'merge', fetchBbox);
      } catch (error) {
        console.error('Falha ao carregar agências SQL:', error);
        if (!silent) {
          toast({
            title: 'Falha ao carregar agências',
            description: 'Não foi possível buscar agências no SQL Server.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!silent) setLoadingAgencyPoints(false);
      }
    }

    if (overlayLojas && (silent || !loadingStorePoints) && !storeFilterCodAgRef.current) {
      try {
        await loadStoreOverlayPoints({
          codAg: null,
          bbox: fetchBbox,
          silent,
        });
      } catch (error) {
        console.error('Falha ao carregar lojas SQL:', error);
        if (!silent) {
          toast({
            title: 'Falha ao carregar lojas',
            description: 'Não foi possível buscar lojas no SQL Server.',
            variant: 'destructive',
          });
        }
      }
    }
  };

  const clearSupervisorOverlayFilter = useCallback(async () => {
    const emptyFc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    const supervisionAreaSource = map.current?.getSource('supervision-area') as
      | mapboxgl.GeoJSONSource
      | undefined;
    supervisionAreaSource?.setData(emptyFc);
    const supervisionsCompareSource = map.current?.getSource('supervisions-compare') as
      | mapboxgl.GeoJSONSource
      | undefined;
    supervisionsCompareSource?.setData(emptyFc);

    overlaySeatHierarchyRef.current = null;
    seatLegendHistoryRef.current = [];
    overlaySeatFilterKeyRef.current = null;
    setOverlaySeatFilterKey(null);
    setOverlayMarkerSelection(null);
    overlayAgencyCacheRef.current.clear();
    overlayStoreCacheRef.current.clear();
    overlayFetchedBboxCacheRef.current = null;
    overlayLastFetchZoomRef.current = null;
    lastOverlayFcSignatureRef.current = {};
    setSqlAgencyPoints([]);
    setSqlStorePoints([]);
    setOverlayAgencias(false);
    setOverlayLojas(false);

    await refreshOverlayDataForViewport({
      silent: false,
      force: hasPanelHierarchyFilter(hierarchyFilterRef.current),
    });
  }, []);

  const visibleSearchOptions = useMemo(() => {
    const q = normalizeText(searchQuery);
    if (q.length < 2) return [];
    const states = stateSearchOptions.filter((item) => normalizeText(item.label).includes(q));
    const municipalities =
      municipalitySearchOptions.length > 0
        ? municipalitySearchOptions.filter((item) => normalizeText(item.label).includes(q))
        : filterMunicipalitySearchOptions(allMunicipalitiesFcRef.current, searchQuery, 8);
    return [...states.slice(0, 6), ...municipalities.slice(0, 8)];
  }, [searchQuery, stateSearchOptions, municipalitySearchOptions, municipalitiesGeoVersion]);

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
  const [statePanelMinimized, setStatePanelMinimized] = useState(false);
  /** Painel ocupando a tela (expandido). Minimizado mantém a seleção mas libera o layout. */
  const statePanelExpanded = hasStatePanel && !statePanelMinimized;

  /** Toda nova seleção de estado/município reabre o painel (cancela o estado minimizado). */
  useEffect(() => {
    setStatePanelMinimized(false);
  }, [selectedStateLabel, selectedCityLabel]);

  const dismissMapMarkerDock = () => {
    if (storeFilterCodAg) {
      void clearStoreAgencyFilter();
      return;
    }
    if (overlaySeatFilterKey || overlaySeatHierarchyRef.current) {
      void clearSupervisorOverlayFilter();
      return;
    }
    setOverlayMarkerSelection(null);
  };
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
  const regionOverlayAgencyClickHandlerRef = useRef<
    ((e: mapboxgl.MapLayerMouseEvent) => void) | null
  >(null);

  useEffect(() => {
    municipalityMeshVisibleRef.current = municipalityMeshVisible;
  }, [municipalityMeshVisible]);

  useEffect(() => {
    compareSupervisionAreasRef.current = compareSupervisionAreas;
  }, [compareSupervisionAreas]);

  useEffect(() => {
    hierarchyFilterRef.current = hierarchyFilter;
  }, [hierarchyFilter]);

  useEffect(() => {
    overlaySeatFilterKeyRef.current = overlaySeatFilterKey;
  }, [overlaySeatFilterKey]);

  useEffect(() => {
    storeFilterCodAgRef.current = storeFilterCodAg;
  }, [storeFilterCodAg]);

  const meshSelectionEnabled = () => municipalityMeshVisibleRef.current;
  const agencyHoverEnterHandlerRef = useRef<((e: mapboxgl.MapLayerMouseEvent) => void) | null>(null);
  const agencyHoverLeaveHandlerRef = useRef<((e: mapboxgl.MapLayerMouseEvent) => void) | null>(null);
  const agencyHoverPopupRef = useRef<mapboxgl.Popup | null>(null);
  const overlayMarkerHoverLayersRef = useRef<string[]>([]);
  const pointFocusCameraActiveRef = useRef(false);
  const preFocusCameraRef = useRef<SavedMapCamera | null>(null);
  /** Evita seleção de UF/município no mesmo clique que saiu do foco 3D. */
  const suppressMeshSelectionClickRef = useRef(false);
  const mapPointerGestureGuardRef = useRef<ReturnType<typeof attachMapPointerGestureGuard> | null>(
    null
  );

  const handleSearchSelect = (option: SearchOption) => {
    if (!meshSelectionEnabled()) {
      const m = map.current;
      if (m) {
        fitMapToRegionFeature(m, option.feature, option.kind);
      }
      setSearchQuery(option.label);
      setSearchOpen(false);
      return;
    }
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

  const handleResetMapView2d = () => {
    const m = map.current;
    if (!m) return;
    const restore = preFocusCameraRef.current;
    preFocusCameraRef.current = null;
    pointFocusCameraActiveRef.current = false;
    animateToFlatView(m, restore);
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
      // Desligar o overlay não pode apagar a seleção da legenda (equipe comercial):
      // só limpa os pontos de agência e o toggle.
      overlayAgencyCacheRef.current.clear();
      overlayFetchedBboxCacheRef.current = null;
      overlayLastFetchZoomRef.current = null;
      if (!overlayLojas) {
        lastViewportOverlayBboxKeyRef.current = null;
      }
      setSqlAgencyPoints([]);
      setOverlayAgencias(false);
      return;
    }

    // Prioriza a hierarquia selecionada na legenda (ex.: gerente comercial em foco);
    // sem seleção, cai no filtro do painel ou no viewport.
    const seatHierarchy = overlaySeatHierarchyRef.current;
    const activeHierarchy = seatHierarchy ?? hierarchyFilter ?? null;
    const useHierarchyOnly =
      Boolean(seatHierarchy) || hasPanelHierarchyFilter(hierarchyFilter);

    const viewport = getCurrentMapBbox();
    const fetchBbox = viewport ? expandBbox(viewport) : null;
    if (!useHierarchyOnly && fetchBbox && map.current) {
      overlayFetchedBboxCacheRef.current = fetchBbox;
      overlayLastFetchZoomRef.current = map.current.getZoom();
    }
    setLoadingAgencyPoints(true);
    setOverlayAgencias(true);
    try {
      const points = await fetchAgencyPoints({
        bbox: useHierarchyOnly ? null : fetchBbox ?? viewport,
        hierarchy: activeHierarchy,
      });
      if (useHierarchyOnly) {
        applyAgencyFetchResult(points, 'replace');
      } else if (fetchBbox) {
        applyAgencyFetchResult(points, 'merge', fetchBbox);
      } else {
        applyAgencyFetchResult(points, 'replace');
      }
      if (points.length === 0) {
        toast({
          title: 'Nenhuma agência nesta área',
          description: hierarchyFilter
            ? 'A API respondeu, mas o filtro da escada comercial não encontrou agências com COD_AG compatível. Limpe os filtros ou ajuste o vínculo COD_AG no SQL.'
            : 'Verifique o zoom do mapa ou se há agências com coordenadas na região.',
        });
      }
    } catch (error) {
      console.error('Falha ao carregar agências SQL:', error);
      setOverlayAgencias(false);
      toast({
        title: 'Falha ao carregar agências',
        description:
          error instanceof Error
            ? error.message
            : 'Não foi possível buscar agências. Confira se a API está rodando (npm run dev:api).',
        variant: 'destructive',
      });
    } finally {
      setLoadingAgencyPoints(false);
    }
  };

  const handleToggleCommercialTeamOverlay = () => {
    if (overlaySupervisores) {
      setOverlaySupervisores(false);
      setCommercialTeamMenuOpen(false);
      return;
    }
    setCommercialTeamLevelVisibility({
      supervisor: true,
      coordenador: false,
      gerente_area: false,
    });
    setOverlaySupervisores(true);
    setCommercialTeamMenuOpen(true);
    setLoadingSeatPoints(true);
    void fetchCommercialSeatPoints({ hierarchy: hierarchyFilter })
      .then((points) => {
        setSqlSeatPoints(points);
      })
      .catch((error) => {
        console.error('Falha ao carregar sedes da estrutura:', error);
        setOverlaySupervisores(false);
        setCommercialTeamMenuOpen(false);
        toast({
          title: 'Falha ao carregar estrutura comercial',
          description: 'Não foi possível buscar os pontos de sede da estrutura comercial.',
          variant: 'destructive',
        });
      })
      .finally(() => {
        setLoadingSeatPoints(false);
      });
  };

  const handleToggleCommercialLevel = (level: CommercialTeamLevel) => {
    setCommercialTeamLevelVisibility((prev) => {
      const next = { ...prev, [level]: !prev[level] };
      const hasAnySelected = Object.values(next).some(Boolean);
      if (!hasAnySelected) return prev;
      return next;
    });
  };

  const handleToggleStoreSegment = (segment: StoreSegmentKey) => {
    setStoreSegmentVisibility((prev) => {
      const next = { ...prev, [segment]: !prev[segment] };
      const hasAnySelected = Object.values(next).some(Boolean);
      if (!hasAnySelected) return prev;
      return next;
    });
  };

  const handleToggleLojas = async () => {
    if (overlayLojas) {
      // Desligar o overlay não pode apagar a seleção da legenda (equipe comercial):
      // só limpa filtro de agência-pin, pontos de loja e o toggle.
      storeFilterCodAgRef.current = null;
      setStoreFilterCodAg(null);
      setStoreFilterAgencyName(null);
      setPinnedAgencyPoint(null);
      overlayStoreCacheRef.current.clear();
      overlayFetchedBboxCacheRef.current = null;
      overlayLastFetchZoomRef.current = null;
      if (!overlayAgencias) {
        lastViewportOverlayBboxKeyRef.current = null;
      }
      setSqlStorePoints([]);
      setOverlayLojas(false);
      setStoreSegmentMenuOpen(false);
      return;
    }

    setStoreFilterCodAg(null);
    // Com um gerente selecionado na legenda, busca as lojas da hierarquia dele
    // (loadStoreOverlayPoints resolve via overlaySeatHierarchyRef quando bbox não é passado).
    const seatHierarchy = overlaySeatHierarchyRef.current;
    const viewport = getCurrentMapBbox();
    const fetchBbox = viewport ? expandBbox(viewport) : null;
    if (!seatHierarchy && fetchBbox && map.current) {
      overlayFetchedBboxCacheRef.current = fetchBbox;
      overlayLastFetchZoomRef.current = map.current.getZoom();
    }
    setOverlayLojas(true);
    setStoreSegmentMenuOpen(true);
    try {
      await loadStoreOverlayPoints(
        seatHierarchy
          ? { codAg: null }
          : { codAg: null, bbox: fetchBbox ?? viewport }
      );
    } catch (error) {
      console.error('Falha ao carregar lojas SQL:', error);
      setOverlayLojas(false);
      setStoreSegmentMenuOpen(false);
      toast({
        title: 'Falha ao carregar lojas',
        description: 'Não foi possível buscar lojas no SQL Server.',
        variant: 'destructive',
      });
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
    resetAgencyStoreFilterSync();
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
        m.setPaintProperty('br-states-choropleth', 'fill-color', '#bfdbfe');
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
    setStatePanelMinimized(false);
    selectedStateCodeRef.current = null;
    if (m?.isStyleLoaded()) {
      fitMapToBrazilOverview(m, { duration: 650 });
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
        // Suaviza zoom/pan: evita fade de tiles que gera sensação de "piscar".
        fadeDuration: 0,
        // Evita refresh automático de tiles expirados durante interação.
        refreshExpiredTiles: false,
        renderWorldCopies: false,
        projection: MAPBOX_CONFIG.projection,
        center: MAPBOX_CONFIG.initialBrazilView.center,
        zoom: MAPBOX_CONFIG.initialBrazilView.zoom,
        pitch: 0,
        bearing: 0,
        minPitch: 0,
        maxPitch: MAPBOX_CONFIG.interactive3d.maxPitch,
        dragRotate: true,
        touchPitch: true,
        minZoom: MAPBOX_CONFIG.zoom.min,
        maxZoom: MAPBOX_CONFIG.zoom.max,
        scrollZoom: true,
        attributionControl: false,
      };
      if (activeStandardTheme) {
        mapInit.config = {
          basemap: {
            theme: activeStandardTheme,
            show3dObjects: true,
            lightPreset: 'day',
            showClouds: MAPBOX_CONFIG.standardBasemap.showClouds,
            // Standard não permite esconder só o rótulo de país ("Brazil");
            // desligamos todos e desenhamos estados/cidades com camadas próprias.
            showPlaceLabels: false,
          },
        };
      }

      map.current = new mapboxgl.Map(mapInit);
      applyMapScrollZoomSettings(map.current);
      mapPointerGestureGuardRef.current?.detach();
      mapPointerGestureGuardRef.current = attachMapPointerGestureGuard(map.current);

      map.current.on('load', async () => {
        setMapReadyVersion((v) => v + 1);

        const m = map.current!;
        if (activeStandardTheme) {
          applyStandardThemeBasemap(m, activeStandardTheme);
        }
        try {
          m.setProjection(MAPBOX_CONFIG.projection);
        } catch {
          /* estilo antigo sem API de projeção */
        }
        syncMapTerrain(m);
        enableMapPitchAndRotation(m);
        const sym = firstSymbolLayerId(m);

        const beginPointFocusCamera = (coords: [number, number]) => {
          if (!pointFocusCameraActiveRef.current) {
            preFocusCameraRef.current = captureMapCamera(m);
          }
          animateToPointFocus(m, coords);
          pointFocusCameraActiveRef.current = true;
        };

        const dismissPointFocusCamera = () => {
          if (!pointFocusCameraActiveRef.current) return;
          const restore = preFocusCameraRef.current;
          preFocusCameraRef.current = null;
          pointFocusCameraActiveRef.current = false;
          suppressMeshSelectionClickRef.current = true;
          window.setTimeout(() => {
            suppressMeshSelectionClickRef.current = false;
          }, 0);
          animateToFlatView(m, restore);
        };

        const isMeshSelectionClick = (e: { point: { x: number; y: number } }) => {
          if (suppressMeshSelectionClickRef.current) return false;
          const guard = mapPointerGestureGuardRef.current;
          if (!guard?.isSelectionClick(e)) return false;
          return true;
        };

        const commitPointFocusBaseline = () => {
          const mapInst = map.current;
          if (!mapInst) return;
          preFocusCameraRef.current = captureMapCamera(mapInst);
        };

        const markOverlayPointerClick = () => {
          suppressMeshSelectionClickRef.current = true;
          window.setTimeout(() => {
            suppressMeshSelectionClickRef.current = false;
          }, 480);
        };

        const pinOverlayMarkerSelection = (feature: GeoJSON.Feature) => {
          agencyHoverPopupRef.current?.remove();
          setOverlayMarkerSelection(readAgencyPopupInfoFromProperties(feature.properties));
        };

        const handleLojaFeatureClick = (feature: GeoJSON.Feature, lngLat: mapboxgl.LngLatLike) => {
          if (!map.current) return;
          const coords =
            getPointCoordinates(feature) ?? getPointCoordinates(lngLat);
          if (coords) {
            beginPointFocusCamera(coords);
          }
          pinOverlayMarkerSelection(feature);
        };

        const handleAgencyFeatureClick = (feature: GeoJSON.Feature, lngLat: mapboxgl.LngLatLike) => {
          if (!map.current) return;
          markOverlayPointerClick();
          const coords =
            getPointCoordinates(feature) ?? getPointCoordinates(lngLat);
          if (coords) {
            beginPointFocusCamera(coords);
          }
          const info = readAgencyPopupInfoFromProperties(feature.properties);
          pinOverlayMarkerSelection(feature);
          if (info.kind === 'agencia' && info.codAg) {
            let agencyPoint: SqlMapPoint | null = null;
            if (feature.geometry?.type === 'Point') {
              const [lng, lat] = feature.geometry.coordinates as [number, number];
              agencyPoint = {
                id: String(feature.properties?.id ?? `sql-agencia-${info.codAg}`),
                nome: info.nome || 'Agência',
                kind: 'agencia',
                lngLat: [lng, lat],
                codAg: info.codAg,
                enderecoFormatado: info.enderecoFormatado || null,
              };
            }
            void selectAgencyForStoresRef.current(info.codAg, info.nome, agencyPoint);
          }
        };

        const applySupervisionAreaForHierarchy = async (
          hierarchy: SqlHierarchyFilter
        ): Promise<void> => {
          const mapInst = map.current;
          if (!mapInst) return;
          const areaSource = mapInst.getSource('supervision-area') as
            | mapboxgl.GeoJSONSource
            | undefined;
          if (!areaSource) return;
          const emptyFc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

          // Áreas só existem para o nível de supervisão; em coordenador/gerente_area
          // zeramos para não deixar polígono de outra seleção "vazando" no mapa.
          if (hierarchy.chaveSupervisao == null) {
            areaSource.setData(emptyFc);
            return;
          }

          try {
            const index = await loadSupervisionAreas();
            if (!map.current) return;
            const liveSource = map.current.getSource('supervision-area') as
              | mapboxgl.GeoJSONSource
              | undefined;
            if (!liveSource) return;
            const areaFeature = index.getByChave(hierarchy.chaveSupervisao);
            liveSource.setData(
              areaFeature
                ? { type: 'FeatureCollection', features: [areaFeature] }
                : emptyFc
            );
          } catch (error) {
            console.warn('Falha ao carregar área de atuação da supervisão:', error);
            try {
              areaSource.setData(emptyFc);
            } catch {
              /* source pode ter sido removida em troca de estilo */
            }
          }
        };

        const handleCommercialSeatClick = async (feature: GeoJSON.Feature, lngLat: mapboxgl.LngLatLike) => {
          if (!map.current) return;
          markOverlayPointerClick();
          const coords = getPointCoordinates(feature) ?? getPointCoordinates(lngLat);
          if (coords) beginPointFocusCamera(coords);
          pinOverlayMarkerSelection(feature);
          const hierarchy = readHierarchyFilterFromSeatFeature(feature, hierarchyFilterRef.current);
          if (!hierarchy) {
            toast({
              title: `${COMMERCIAL_TEAM_LEVEL_LABEL.supervisor} não identificado`,
              description:
                `Selecione o ${COMMERCIAL_TEAM_LEVEL_LABEL.supervisor} no painel de filtros (chave SQL) ou clique no ponto da estrutura comercial no mapa.`,
            });
            return;
          }

          overlaySeatHierarchyRef.current = hierarchy;
          seatLegendHistoryRef.current.push(overlaySeatFilterKeyRef.current);
          const nextKey = JSON.stringify(hierarchy);
          overlaySeatFilterKeyRef.current = nextKey;
          setOverlaySeatFilterKey(nextKey);
          overlayFetchedBboxCacheRef.current = null;
          overlayLastFetchZoomRef.current = null;
          lastViewportOverlayBboxKeyRef.current = null;
          setOverlayAgencias(true);
          setOverlayLojas(true);
          setStoreFilterCodAg(null);
          setStoreFilterAgencyName(null);
          setPinnedAgencyPoint(null);
          storeFilterCodAgRef.current = null;

          setLoadingAgencyPoints(true);
          setLoadingStorePoints(true);
          // Dispara o desenho da área em paralelo aos fetches de agências/lojas — falha do GeoJSON
          // (rede/parse) não pode travar o filtro principal.
          const areaPromise = applySupervisionAreaForHierarchy(hierarchy);
          try {
            const [agencias, lojas] = await Promise.all([
              fetchAgencyPoints({ hierarchy }),
              fetchStorePoints({ hierarchy }),
            ]);
            applyAgencyFetchResult(agencias, 'replace');
            applyStoreFetchResult(lojas, 'replace');
            window.setTimeout(() => {
              commitPointFocusBaseline();
            }, MAPBOX_CONFIG.interactive3d.focusDurationMs + 80);
          } catch (error) {
            console.error('Falha ao filtrar estrutura comercial:', error);
            toast({
              title: `Falha ao filtrar ${COMMERCIAL_TEAM_LEVEL_LABEL.supervisor}`,
              description: 'Não foi possível carregar agências e lojas vinculadas ao ponto selecionado.',
              variant: 'destructive',
            });
          } finally {
            setLoadingAgencyPoints(false);
            setLoadingStorePoints(false);
            await areaPromise;
          }
        };

        const tryOverlayMarkerClickFirst = (point: mapboxgl.Point, lngLat: mapboxgl.LngLatLike): boolean => {
          // Prioriza gerentes (camada visual acima) quando há sobreposição com agência/loja.
          const seatLayers = MANAGER_CIRCLE_LAYER_IDS.filter((id) => m.getLayer(id));
          if (seatLayers.length > 0) {
            const seatHits = m.queryRenderedFeatures(
              [
                [point.x - 10, point.y - 10],
                [point.x + 10, point.y + 10],
              ],
              { layers: [...seatLayers] }
            );
            const seatFeature = seatHits[0] as GeoJSON.Feature | undefined;
            if (seatFeature?.properties) {
              const cargo = String(seatFeature.properties.cargo ?? '').trim().toLowerCase();
              const isManagerSeat =
                String(seatFeature.properties.kind ?? '') === 'supervisor' ||
                cargo === 'supervisor' ||
                cargo === 'coordenador' ||
                cargo === 'gerente_area';
              if (isManagerSeat) {
                void handleCommercialSeatClick(seatFeature, lngLat);
                return true;
              }
            }
          }

          const agencyFeature = pickAgencyFeatureAtPoint(m, point);
          if (agencyFeature) {
            handleAgencyFeatureClick(agencyFeature, lngLat);
            return true;
          }

          const lojaFeature = pickLojaFeatureAtPoint(m, point);
          if (lojaFeature) {
            handleLojaFeatureClick(lojaFeature, lngLat);
            return true;
          }

          return false;
        };

        /** GeoJSON no Mapbox pode não estar “pronto” no mesmo tick do setData; re-dispara o coroplético no próximo task. */
        const scheduleMunicipalitiesChoroplethReapply = () => {
          setMunicipalitiesGeoVersion((v) => v + 1);
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
          const br = await loadBrazilBoundaryFeature();
          m.addSource('brazil-boundary', {
            type: 'geojson',
            data: brazilBoundaryFeatureCollection(br),
            tolerance: 0,
          });
          m.addLayer(
            {
              id: 'brasil-context-fill',
              type: 'fill',
              source: 'brazil-boundary',
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

        const syncOutsideMaskColorState = () => {
          if (!map.current?.getLayer('brazil-outside-mask-fill')) return;
          const maskColor = resolveOutsideBrazilMaskColor(map.current, activeBaseStyle);
          setOutsideMaskColor(maskColor);
        };

        const tryApplyOutsideBrazilMask = async () => {
          const applied = await ensureBrazilOutsideMask(m, activeBaseStyle, sym);
          if (applied) syncOutsideMaskColorState();
          return applied;
        };

        void tryApplyOutsideBrazilMask();
        m.once('idle', () => {
          if (!map.current) return;
          void (async () => {
            const applied = await ensureBrazilOutsideMask(map.current!, activeBaseStyle);
            if (applied) {
              syncOutsideMaskColorState();
              disableBasemapClouds(map.current!);
              scheduleBrazilBasemapLabelTweaks(map.current!);
              repositionBrazilCutoutLayers(map.current!);
            }
          })();
        });

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
              'fill-color': '#bfdbfe',
              'fill-opacity': 0.05,
            }),
          });
          m.addLayer({
            id: 'br-states-choropleth',
            type: 'fill',
            source: 'br-states',
            paint: fillPaintForStandard(activeBaseStyle, {
              'fill-color': '#bfdbfe',
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

            resetAgencyStoreFilterSyncRef.current();

            // Ao trocar de estado, desligamos overlays regionais para evitar contexto antigo na tela.
            setOverlayAgencias(false);
            setOverlayLojas(false);
            clearRegionOverlaySources(m);
            clearSelectedMunicipalityVisual(m);
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
            if (!isMeshSelectionClick(e)) return;
            if (tryOverlayMarkerClickFirst(e.point, e.lngLat)) return;
            if (pointFocusCameraActiveRef.current) {
              dismissPointFocusCamera();
              return;
            }
            if (!meshSelectionEnabled()) return;
            const f = e.features?.[0] as GeoJSON.Feature | undefined;
            if (!f) return;
            applyStateSelection(f);
          };

          stateClickHandlerRef.current = onStateClick;
          m.on('click', 'br-states-hit', onStateClick);
          m.on('mouseenter', 'br-states-hit', () => {
            if (!meshSelectionEnabled()) return;
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
              'fill-color': '#bae6fd',
              'fill-opacity': 0.08,
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

            resetAgencyStoreFilterSyncRef.current();

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
            if (!isMeshSelectionClick(e)) return;
            if (tryOverlayMarkerClickFirst(e.point, e.lngLat)) return;

            if (pointFocusCameraActiveRef.current) {
              dismissPointFocusCamera();
              return;
            }

            const topStack = m.queryRenderedFeatures(e.point);
            if (topStack.length > 0) {
              const topId = topStack[0].layer.id;
              if (topId === 'region-overlay-agencias-cir' || topId === 'structure-agencies-point') {
                return;
              }
              if (topId === 'br-states-hit') return;
              if (topId === 'municipalities-context-fill') return;
              if (topId.startsWith('selected-municipality')) return;
              if (topId.startsWith('structure-')) return;
              if (topId.startsWith('region-overlay-')) return;
            }

            if (meshSelectionEnabled()) {
              const muniByPoly = findMunicipalityFeatureContainingLngLat(
                municipalitiesFcRef.current,
                e.lngLat
              );
              if (muniByPoly) {
                selectMunicipalityFeature(muniByPoly);
                return;
              }
            }

            const labelLayers = cityLabelLayerIds(m);
            if (labelLayers.length === 0) {
              dismissPointFocusCamera();
              return;
            }
            const clickBox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
              [e.point.x - 5, e.point.y - 5],
              [e.point.x + 5, e.point.y + 5],
            ];
            const features = m.queryRenderedFeatures(clickBox, { layers: labelLayers });
            const city = features.find((feature) => {
              if (!feature.geometry || feature.geometry.type !== 'Point') return false;
              const props = feature.properties ?? {};
              const name = String(props.name ?? props.name_pt ?? props.nome ?? '');
              return name.trim().length > 0;
            });
            if (!city) {
              dismissPointFocusCamera();
              return;
            }

            if (!meshSelectionEnabled()) {
              dismissPointFocusCamera();
              return;
            }

            const geom = city.geometry;
            if (!geom || geom.type !== 'Point') return;
            const coords = geom.coordinates as [number, number];
            const cityName = String(city.properties?.name ?? city.properties?.name_pt ?? 'Cidade');

            resetAgencyStoreFilterSyncRef.current();
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
            if (!isMeshSelectionClick(e)) return;
            if (tryOverlayMarkerClickFirst(e.point, e.lngLat)) return;
            if (pointFocusCameraActiveRef.current) {
              dismissPointFocusCamera();
              return;
            }
            if (!meshSelectionEnabled()) return;
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
            if (!meshSelectionEnabled()) return;
            m.getCanvas().style.cursor = 'pointer';
          });
          m.on('mouseleave', 'municipalities-context-fill', () => {
            m.getCanvas().style.cursor = '';
          });

          applySelectionLayerTransitions(m);
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
            'circle-radius': 10,
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
          if (String(f.properties.kind ?? '') === 'agencia') {
            handleAgencyFeatureClick(f as GeoJSON.Feature, e.lngLat);
            return;
          }
          const cargo = String(f.properties.cargo ?? '').trim().toLowerCase();
          if (cargo === 'supervisor' || cargo === 'coordenador' || cargo === 'gerente_area') {
            e.originalEvent?.stopPropagation();
            void handleCommercialSeatClick(f as GeoJSON.Feature, e.lngLat);
            return;
          }
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
        m.addSource('supervision-area', { type: 'geojson', data: emptyRegionFc });
        m.addSource('supervisions-compare', { type: 'geojson', data: emptyRegionFc });

        // Área de atuação da supervisão selecionada (fica abaixo dos pontos, acima do basemap).
        // Usamos a primeira camada de estrutura como `beforeId` para os círculos continuarem por cima.
        const structureBeforeId = m.getLayer('structure-people-circles')
          ? 'structure-people-circles'
          : sym;
        m.addLayer(
          {
            id: 'supervisions-compare-fill',
            type: 'fill',
            source: 'supervisions-compare',
            paint: fillPaintForStandard(activeBaseStyle, {
              'fill-color': ['coalesce', ['to-color', ['get', 'compare_color']], '#94a3b8'],
              'fill-opacity': 0.22,
            }),
          },
          structureBeforeId
        );
        m.addLayer(
          {
            id: 'supervisions-compare-line',
            type: 'line',
            source: 'supervisions-compare',
            paint: linePaintForStandard(activeBaseStyle, {
              'line-color': ['coalesce', ['to-color', ['get', 'compare_color']], '#475569'],
              'line-width': 1.8,
              'line-opacity': 0.95,
            }),
          },
          structureBeforeId
        );
        m.addLayer(
          {
            id: 'supervision-area-fill',
            type: 'fill',
            source: 'supervision-area',
            paint: fillPaintForStandard(activeBaseStyle, {
              'fill-color': '#a855f7',
              'fill-opacity': 0.18,
            }),
          },
          structureBeforeId
        );
        m.addLayer(
          {
            id: 'supervision-area-line',
            type: 'line',
            source: 'supervision-area',
            paint: linePaintForStandard(activeBaseStyle, {
              'line-color': '#7c3aed',
              'line-width': 1.6,
              'line-opacity': 0.85,
            }),
          },
          structureBeforeId
        );

        m.addLayer({
          id: 'region-overlay-agencias-cir',
          type: 'circle',
          source: 'region-overlay-agencias',
          paint: circlePaintForStandard(activeBaseStyle, {
            'circle-radius': OVERLAY_AGENCIA_CIRCLE_RADIUS,
            'circle-color': '#b91c1c',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.95,
          }),
        });
        m.addLayer({
          id: 'region-overlay-supervisores-cir',
          type: 'circle',
          source: 'region-overlay-supervisores',
          paint: circlePaintForStandard(activeBaseStyle, {
            'circle-radius': 7,
            'circle-color': ['coalesce', ['to-color', ['get', 'seat_color']], '#7c3aed'],
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
            'circle-radius': OVERLAY_LOJA_CIRCLE_RADIUS,
            'circle-color': '#0d9488',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.95,
          }),
        });

        const onRegionOverlayMarkerClick = (e: mapboxgl.MapLayerMouseEvent) => {
          e.originalEvent?.stopPropagation();
          const f = e.features?.[0] as GeoJSON.Feature | undefined;
          if (!f?.properties || !map.current) return;
          const info = readAgencyPopupInfoFromProperties(f.properties);
          if (info.kind === 'loja') {
            handleLojaFeatureClick(f, e.lngLat);
            return;
          }
          if (info.kind !== 'agencia') {
            void handleCommercialSeatClick(f, e.lngLat);
            return;
          }
          pinOverlayMarkerSelection(f);
        };

        const onRegionAgencyOverlayClick = (e: mapboxgl.MapLayerMouseEvent) => {
          const f = (e.features?.[0] as GeoJSON.Feature | undefined) ?? pickAgencyFeatureAtPoint(m, e.point);
          if (!f) return;
          handleAgencyFeatureClick(f, e.lngLat);
        };

        regionOverlayClickHandlerRef.current = onRegionOverlayMarkerClick;
        regionOverlayAgencyClickHandlerRef.current = onRegionAgencyOverlayClick;

        m.on('click', 'region-overlay-agencias-cir', onRegionAgencyOverlayClick);
        m.on('mouseenter', 'region-overlay-agencias-cir', setStructPointer);
        m.on('mouseleave', 'region-overlay-agencias-cir', clearStructPointer);

        for (const layerId of ['region-overlay-supervisores-cir', 'region-overlay-lojas-cir'] as const) {
          m.on('click', layerId, onRegionOverlayMarkerClick);
          m.on('mouseenter', layerId, setStructPointer);
          m.on('mouseleave', layerId, clearStructPointer);
        }

        // Ordem visual: agências/lojas abaixo; bolinhas de gerentes sempre no topo.
        for (const layerId of MANAGER_CIRCLE_LAYER_IDS) {
          if (!m.getLayer(layerId)) continue;
          try {
            m.moveLayer(layerId);
          } catch {
            /* ignore */
          }
        }

        const hoverPopup = new mapboxgl.Popup(agencyMapPopupHoverOptions);
        agencyHoverPopupRef.current = hoverPopup;

        const onOverlayMarkerHoverEnter = (e: mapboxgl.MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f?.properties || !map.current || !f.geometry || f.geometry.type !== 'Point') return;
          const coordinates = [...(f.geometry.coordinates as [number, number])] as [number, number];
          const info = readAgencyPopupInfoFromProperties(f.properties);

          map.current.getCanvas().style.cursor = 'pointer';
          hoverPopup
            .setLngLat(coordinates)
            .setHTML(buildAgencyPopupHtml(info, { compact: true }))
            .addTo(map.current);
        };

        const onOverlayMarkerHoverLeave = () => {
          if (!map.current) return;
          map.current.getCanvas().style.cursor = '';
          hoverPopup.remove();
        };

        const onOverlayMarkerPointerDown = () => {
          hoverPopup.remove();
        };

        agencyHoverEnterHandlerRef.current = onOverlayMarkerHoverEnter;
        agencyHoverLeaveHandlerRef.current = onOverlayMarkerHoverLeave;

        const overlayHoverLayerIds = [
          'structure-agencies-point',
          'region-overlay-agencias-cir',
          'region-overlay-lojas-cir',
          'region-overlay-supervisores-cir',
          'structure-people-circles',
        ] as const;
        overlayMarkerHoverLayersRef.current = overlayHoverLayerIds.filter((id) => Boolean(m.getLayer(id)));

        for (const layerId of overlayHoverLayerIds) {
          if (!m.getLayer(layerId)) continue;
          m.on('mouseenter', layerId, onOverlayMarkerHoverEnter);
          m.on('mouseleave', layerId, onOverlayMarkerHoverLeave);
          m.on('mousedown', layerId, onOverlayMarkerPointerDown);
        }

        setAgencyLayersVisibility(m, mapMarkersRef.current.some((x) => x.kind === 'agencia'));

        try {
          m.resize();
        } catch {
          /* ignore */
        }
        const preserved = preservedCameraForStyleSwapRef.current;
        if (mapStyleSwapPreserveRef.current && preserved) {
          mapStyleSwapPreserveRef.current = false;
          preservedCameraForStyleSwapRef.current = null;
          restoreMapCamera(m, preserved);
        } else {
          fitMapToBrazilOverview(m, { duration: 0 });
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
    if (srcPeople) {
      srcPeople.setData(
        markersToFeatureCollectionByKind(mapMarkers, 'pessoa', hierarchyFilter ?? null)
      );
    }
    if (srcAgencies) srcAgencies.setData(markersToFeatureCollectionByKind(mapMarkers, 'agencia'));

    if (mapMarkers.length === 0) return;

    const overviewZoom = MAPBOX_CONFIG.initialBrazilView.zoom;
    if (m.getZoom() > overviewZoom + 0.35) {
      return;
    }

    const coords = mapMarkers.map((x) => x.lngLat);
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const lngSpan = Math.max(...lngs) - Math.min(...lngs);
    const latSpan = Math.max(...lats) - Math.min(...lats);
    /** Filtro nacional: encaixar o país com folga, não só a caixa dos pins. */
    if (lngSpan > 20 && latSpan > 14) {
      fitMapToBrazilOverview(m, { duration: 650 });
      return;
    }

    const b: mapboxgl.LngLatBoundsLike = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];

    try {
      m.fitBounds(b, { padding: 72, maxZoom: MAPBOX_CONFIG.zoom.max, duration: 650 });
    } catch {
      /* ignore */
    }
  }, [mapMarkers, hierarchyFilter]);

  useEffect(() => {
    if (!mapContainer.current) return;
    const isStyleSwap = Boolean(map.current);
    if (isStyleSwap) {
      preservedCameraForStyleSwapRef.current = captureMapCamera(map.current!);
      mapStyleSwapPreserveRef.current = true;
    }
    startMapTransitionLoading();
    if (map.current) {
      mapPointerGestureGuardRef.current?.detach();
      mapPointerGestureGuardRef.current = null;
      map.current.remove();
      map.current = null;
    }
    initializeMap();
  }, [activeBaseStyle, activeStandardTheme]);

  /** Reaplica seleção geográfica e overlays no mapa após troca de estilo (camadas custom são recriadas no load). */
  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    if (!m.getLayer('br-states-selected')) return;

    lastOverlayFcSignatureRef.current = {};

    const state = selectedStateFeature;
    if (state) {
      const stateId = resolveStateId(state.properties);
      if (stateId) {
        try {
          m.setFilter('br-states-selected', ['==', ['get', 'sigla'], stateId]);
          m.setFilter('br-states-dim', ['!=', ['get', 'sigla'], stateId]);
          m.setFilter('br-states-outline', ['==', ['get', 'sigla'], stateId]);
        } catch {
          /* estilo recarregando */
        }
      }
      const munis = municipalitiesFcRef.current;
      const ctx = m.getSource('municipalities-context') as mapboxgl.GeoJSONSource | undefined;
      if (ctx && munis.features.length > 0) {
        try {
          ctx.setData(munis);
        } catch {
          /* ignore */
        }
      }
    }

    if (selectedMunicipalityFeature) {
      const sel = m.getSource('selected-municipality') as mapboxgl.GeoJSONSource | undefined;
      try {
        sel?.setData({
          type: 'FeatureCollection',
          features: [selectedMunicipalityFeature],
        });
      } catch {
        /* ignore */
      }
    }

    const hierarchy = overlaySeatHierarchyRef.current;
    if (hierarchy?.chaveSupervisao != null) {
      void (async () => {
        try {
          const index = await loadSupervisionAreas();
          const mapInst = map.current;
          if (!mapInst?.isStyleLoaded()) return;
          const src = mapInst.getSource('supervision-area') as mapboxgl.GeoJSONSource | undefined;
          if (!src) return;
          const areaFeature = index.getByChave(hierarchy.chaveSupervisao!);
          src.setData(
            areaFeature
              ? { type: 'FeatureCollection', features: [areaFeature] }
              : { type: 'FeatureCollection', features: [] }
          );
        } catch (error) {
          console.warn('Falha ao restaurar área de supervisão após troca de estilo:', error);
        }
      })();
    }

    if (compareSupervisionAreas && compareSupervisionsList.length > 0) {
      void writeCompareSupervisionsToMap(m, compareSupervisionsList).catch((error) => {
        console.warn('Falha ao restaurar comparação de áreas após troca de estilo:', error);
      });
    }
  }, [
    mapReadyVersion,
    selectedStateFeature,
    selectedMunicipalityFeature,
    compareSupervisionAreas,
    compareSupervisionsList,
  ]);

  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    const showStructureAgencies =
      !storeFilterCodAg && mapMarkers.some((x) => x.kind === 'agencia');
    setAgencyLayersVisibility(m, showStructureAgencies);
    try {
      m.resize();
    } catch {
      /* ignore */
    }
  }, [mapMarkers, storeFilterCodAg, mapReadyVersion]);

  useEffect(() => {
    if (!compareApplyTick || !compareSupervisionAreas || !compareScopeHierarchy) return;

    let cancelled = false;
    const scope = compareScopeHierarchy;

    setLoadingSeatPoints(true);

    void (async () => {
      try {
        const [seatPoints, apiItems] = await Promise.all([
          fetchCommercialSeatPoints({ hierarchy: scope }),
          fetchSupervisoesForCompareScope(scope),
        ]);
        if (cancelled) return;

        setSqlSeatPoints(seatPoints);
        setApiSupervisoesForCompare(apiItems);

        const list = mergeCompareSupervisionList(seatPoints, apiItems, scope);
        const m = map.current;
        if (m?.isStyleLoaded()) {
          await writeCompareSupervisionsToMap(m, list);
          for (const layerId of ['supervisions-compare-fill', 'supervisions-compare-line'] as const) {
            if (!m.getLayer(layerId)) continue;
            try {
              m.setLayoutProperty(layerId, 'visibility', 'visible');
            } catch {
              /* estilo recarregando */
            }
          }
        }
      } catch (error) {
        console.warn('Falha ao aplicar comparação de áreas pelo Navegar:', error);
      } finally {
        if (!cancelled) setLoadingSeatPoints(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [compareApplyTick, compareSupervisionAreas, compareScopeHierarchy, mapReadyVersion]);

  useEffect(() => {
    if (!compareSupervisionAreas || !compareScopeHierarchy) {
      setApiSupervisoesForCompare([]);
      return;
    }
    let cancelled = false;
    void fetchSupervisoesForCompareScope(compareScopeHierarchy)
      .then((items) => {
        if (!cancelled) setApiSupervisoesForCompare(items);
      })
      .catch((error) => {
        console.warn('Falha ao carregar supervisões para comparar áreas:', error);
        if (!cancelled) setApiSupervisoesForCompare([]);
      });
    return () => {
      cancelled = true;
    };
  }, [compareSupervisionAreas, compareScopeHierarchy]);

  /** Ao comparar pela barra de camadas, liga a equipe comercial se ainda não estiver ativa. */
  useEffect(() => {
    if (!compareSupervisionAreas || !compareScopeHierarchy) return;
    if (compareApplyTick > 0) return;
    setCommercialTeamLevelVisibility({
      supervisor: true,
      coordenador: false,
      gerente_area: false,
    });
    setOverlaySupervisores(true);
  }, [compareSupervisionAreas, compareScopeHierarchy, compareApplyTick]);

  useEffect(() => {
    const seatHierarchy =
      compareSupervisionAreas && compareScopeHierarchy
        ? compareScopeHierarchy
        : resolveSeatPointsFetchHierarchy(hierarchyFilter, overlaySeatFilterKey);
    const shouldFetchSeats =
      overlaySupervisores ||
      (compareSupervisionAreas && isCompareScopeHierarchy(compareScopeHierarchy));
    if (!shouldFetchSeats) return;
    setLoadingSeatPoints(true);
    void fetchCommercialSeatPoints({ hierarchy: seatHierarchy ?? hierarchyFilter })
      .then((points) => {
        setSqlSeatPoints(points);
      })
      .catch((error) => {
        console.error('Falha ao atualizar sedes da estrutura:', error);
      })
      .finally(() => {
        setLoadingSeatPoints(false);
      });
  }, [
    overlaySupervisores,
    compareSupervisionAreas,
    compareScopeHierarchy,
    hierarchyFilter,
    overlaySeatFilterKey,
  ]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const applyVisibility = () => {
      const visibility = compareSupervisionAreas ? 'visible' : 'none';
      for (const layerId of ['supervisions-compare-fill', 'supervisions-compare-line'] as const) {
        if (!m.getLayer(layerId)) continue;
        try {
          m.setLayoutProperty(layerId, 'visibility', visibility);
        } catch {
          /* estilo recarregando */
        }
      }
    };
    // isStyleLoaded() fica false com qualquer mudança pendente (setData, tiles);
    // se desistíssemos aqui, o desligamento nunca seria aplicado. Reagenda no idle.
    if (m.isStyleLoaded()) {
      applyVisibility();
      return;
    }
    m.once('idle', applyVisibility);
    return () => {
      m.off('idle', applyVisibility);
    };
  }, [compareSupervisionAreas, mapReadyVersion]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!overlayAgencias && !overlayLojas) {
      lastViewportOverlayBboxKeyRef.current = null;
      return;
    }

    const scheduleViewportDrawTick = () => {
      if (shouldSkipViewportOverlayRefresh()) return;
      if (viewportBoundsTickTimerRef.current != null) {
        window.clearTimeout(viewportBoundsTickTimerRef.current);
      }
      viewportBoundsTickTimerRef.current = window.setTimeout(() => {
        setViewportBoundsTick((t) => t + 1);
        viewportBoundsTickTimerRef.current = null;
      }, OVERLAY_VIEWPORT_DRAW_DEBOUNCE_MS);
    };

    const scheduleRefresh = () => {
      scheduleViewportDrawTick();
      if (shouldSkipViewportOverlayRefresh()) return;
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        void refreshOverlayDataForViewport({ silent: true });
      }, OVERLAY_MOVEEND_DEBOUNCE_MS);
    };

    m.on('moveend', scheduleRefresh);
    return () => {
      m.off('moveend', scheduleRefresh);
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (viewportBoundsTickTimerRef.current != null) {
        window.clearTimeout(viewportBoundsTickTimerRef.current);
        viewportBoundsTickTimerRef.current = null;
      }
    };
  }, [overlayAgencias, overlayLojas, mapReadyVersion, hierarchyFilter]);

  useEffect(() => {
    if (!overlayAgencias && !overlayLojas) return;
    clearOverlayViewportCaches();
    void refreshOverlayDataForViewport({
      silent: true,
      force: hasPanelHierarchyFilter(hierarchyFilter),
    });
  }, [hierarchyFilter, clearOverlayViewportCaches]);

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
        lastOverlayFcSignatureRef.current[sourceId] = '';
        src.setData(empty);
        return;
      }

      const signature = overlayPointsSignature(points);
      if (lastOverlayFcSignatureRef.current[sourceId] === signature) {
        return;
      }
      lastOverlayFcSignatureRef.current[sourceId] = signature;
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
    if (!m?.isStyleLoaded() || !m.getLayer('region-overlay-agencias-cir')) return;

    try {
      if (overlayAgencias && storeFilterCodAg) {
        m.setPaintProperty('region-overlay-agencias-cir', 'circle-opacity', 0.98);
        m.setPaintProperty('region-overlay-agencias-cir', 'circle-radius', OVERLAY_AGENCIA_CIRCLE_RADIUS_HIGHLIGHT);
        m.setPaintProperty('region-overlay-agencias-cir', 'circle-stroke-width', 3);
        m.setPaintProperty('region-overlay-agencias-cir', 'circle-stroke-opacity', 1);
      } else {
        m.setPaintProperty('region-overlay-agencias-cir', 'circle-opacity', 0.95);
        m.setPaintProperty('region-overlay-agencias-cir', 'circle-radius', OVERLAY_AGENCIA_CIRCLE_RADIUS);
        m.setPaintProperty('region-overlay-agencias-cir', 'circle-stroke-width', 2);
        m.setPaintProperty('region-overlay-agencias-cir', 'circle-stroke-opacity', 1);
      }

      if (m.getLayer('region-overlay-lojas-cir')) {
        if (overlayLojas && storeFilterCodAg) {
          m.setPaintProperty('region-overlay-lojas-cir', 'circle-opacity', 0.98);
          m.setPaintProperty('region-overlay-lojas-cir', 'circle-radius', OVERLAY_LOJA_CIRCLE_RADIUS_HIGHLIGHT);
          m.setPaintProperty('region-overlay-lojas-cir', 'circle-stroke-width', 2);
        } else {
          m.setPaintProperty('region-overlay-lojas-cir', 'circle-opacity', 0.95);
          m.setPaintProperty('region-overlay-lojas-cir', 'circle-radius', OVERLAY_LOJA_CIRCLE_RADIUS);
          m.setPaintProperty('region-overlay-lojas-cir', 'circle-stroke-width', 2);
        }
      }
    } catch {
      /* estilo recarregando */
    }
  }, [overlayAgencias, overlayLojas, storeFilterCodAg, mapReadyVersion, activeBaseStyle]);

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
        m.setPaintProperty('br-states-choropleth', 'fill-color', '#bfdbfe');
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

  /** Sai do modo "Comparar áreas" quando o escopo hierárquico (GG/GC III) deixa de existir. */
  useEffect(() => {
    if (compareSupervisionAreas && !compareScopeHierarchy) {
      setCompareSupervisionAreas(false);
    }
  }, [compareSupervisionAreas, compareScopeHierarchy, setCompareSupervisionAreas]);

  /**
   * Modo "Comparar áreas das supervisões": carrega o GeoJSON sob demanda, monta uma
   * FeatureCollection com `compare_color` por feature e despeja na source
   * `supervisions-compare`. Quando o modo desliga (ou some o escopo), a source é zerada.
   */
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    let cancelled = false;

    const syncCompareSource = () => {
      if (cancelled) return;
      const source = m.getSource('supervisions-compare') as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;

      if (!compareSupervisionAreas) {
        try {
          source.setData({ type: 'FeatureCollection', features: [] });
        } catch {
          /* estilo recarregando */
        }
        return;
      }

      if (compareSupervisionsList.length === 0) {
        return;
      }

      void writeCompareSupervisionsToMap(m, compareSupervisionsList).catch((error) => {
        if (!cancelled) {
          console.warn('Falha ao carregar áreas das supervisões para comparação:', error);
        }
      });
    };

    // Mesmo racional do efeito de visibilidade: não desistir quando isStyleLoaded()
    // estiver false por mudanças pendentes; reagenda a sincronização no idle.
    if (m.isStyleLoaded()) {
      syncCompareSource();
    } else {
      m.once('idle', syncCompareSource);
    }

    return () => {
      cancelled = true;
      m.off('idle', syncCompareSource);
    };
  }, [compareSupervisionAreas, compareSupervisionsList, mapReadyVersion]);

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
        m.setPaintProperty('selected-municipality-fill', 'fill-opacity', 0.08);
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

  /** Camada do roteiro de visitas (linha + paradas numeradas por status). */
  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    syncVisitRouteOnMap(m, visitRoute, selectedVisitStopId, (stopId) => {
      onVisitStopSelectRef.current?.(stopId);
    });
    if (!visitRoute) {
      visitRouteFitIdRef.current = null;
      return;
    }
    if (visitRouteFitIdRef.current !== visitRoute.id) {
      visitRouteFitIdRef.current = visitRoute.id;
      const bounds = getVisitRouteBounds(visitRoute);
      if (bounds) {
        try {
          m.fitBounds(bounds, { padding: 120, maxZoom: 11, duration: 1100, essential: true });
        } catch {
          /* viewport pequena para o padding */
        }
      }
    }
  }, [visitRoute, selectedVisitStopId, mapReadyVersion]);

  /** Foco de câmera pedido pelos painéis ("Abrir no mapa" / "Ver roteiro completo"). */
  useEffect(() => {
    const m = map.current;
    if (!m || !visitFocus || !visitRoute) return;
    if (visitFocus.stopId == null) {
      const bounds = getVisitRouteBounds(visitRoute);
      if (bounds) {
        try {
          m.fitBounds(bounds, { padding: 120, maxZoom: 11, duration: 1100, essential: true });
        } catch {
          /* viewport pequena para o padding */
        }
      }
      return;
    }
    const stop = visitRoute.stops.find((s) => s.id === visitFocus.stopId);
    if (stop) animateToPointFocus(m, [stop.lng, stop.lat]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitFocus]);

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
      if (m && regionOverlayAgencyClickHandlerRef.current) {
        m.off('click', 'region-overlay-agencias-cir', regionOverlayAgencyClickHandlerRef.current);
      }
      if (m && regionOverlayClickHandlerRef.current) {
        const h = regionOverlayClickHandlerRef.current;
        for (const id of ['region-overlay-supervisores-cir', 'region-overlay-lojas-cir'] as const) {
          m.off('click', id, h);
        }
      }
      if (m && agencyHoverEnterHandlerRef.current && agencyHoverLeaveHandlerRef.current) {
        for (const id of overlayMarkerHoverLayersRef.current) {
          if (m.getLayer(id)) {
            m.off('mouseenter', id, agencyHoverEnterHandlerRef.current);
            m.off('mouseleave', id, agencyHoverLeaveHandlerRef.current);
          }
        }
      }
      agencyHoverPopupRef.current?.remove();
      agencyHoverPopupRef.current = null;
      mapPointerGestureGuardRef.current?.detach();
      mapPointerGestureGuardRef.current = null;
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
      {navigatorOverlays ? (
        <div className="pointer-events-none absolute inset-0 z-[15] overflow-visible">
          {navigatorOverlays}
        </div>
      ) : null}
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
            <div
              className="relative z-30 mt-2 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/12 ring-1 ring-slate-900/5"
              role="listbox"
              aria-label="Resultados da busca"
            >
              {visibleSearchOptions.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-slate-500">
                  Nenhum resultado. Tente outro nome.
                </p>
              ) : (
                visibleSearchOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSearchSelect(option)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-100 active:bg-slate-200/80"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                      {option.label}
                    </span>
                    <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
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
              disabled={loadingAgencyPoints}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold shadow-sm backdrop-blur-sm transition-colors disabled:opacity-60 ${
                overlayAgencias
                  ? 'border-slate-600 bg-slate-700 text-white shadow-slate-900/15'
                  : 'border-slate-200/90 bg-white/95 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {loadingAgencyPoints ? '…' : 'AG'}
            </button>
            <div ref={commercialTeamPickerRef} className="relative">
              <button
                type="button"
                title="Mostrar Equipe Comercial"
                aria-label="Mostrar Equipe Comercial"
                aria-expanded={commercialTeamMenuOpen}
                aria-pressed={overlaySupervisores}
                disabled={loadingSeatPoints}
                onClick={handleToggleCommercialTeamOverlay}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-colors disabled:opacity-60 ${
                  overlaySupervisores
                    ? 'border-slate-600 bg-slate-700 text-white shadow-slate-900/15'
                    : 'border-slate-200/90 bg-white/95 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {loadingSeatPoints ? <span className="text-xs">…</span> : <Users className="h-4 w-4" />}
              </button>
              {overlaySupervisores && commercialTeamMenuOpen && (
                <div className="absolute left-0 top-[calc(100%+0.4rem)] z-30 min-w-[220px] rounded-xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-900/10">
                  <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Mostrar no mapa
                  </p>
                  <div className="space-y-1">
                    {COMMERCIAL_TEAM_LEVEL_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleToggleCommercialLevel(option.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                          commercialTeamLevelVisibility[option.id]
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span>{option.label}</span>
                        <span
                          className={`h-4 w-4 rounded border text-[10px] leading-[14px] text-center ${
                            commercialTeamLevelVisibility[option.id]
                              ? 'border-slate-700 bg-slate-700 text-white'
                              : 'border-slate-300 bg-white text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="pt-2 text-[11px] text-slate-500">
                    Selecione pelo menos um nível.
                  </p>
                </div>
              )}
            </div>
            <div ref={storeSegmentPickerRef} className="relative">
              <button
                type="button"
                title="Mostrar lojas no mapa"
                aria-label="Mostrar lojas no mapa"
                aria-expanded={storeSegmentMenuOpen}
                aria-pressed={overlayLojas}
                disabled={loadingStorePoints}
                onClick={handleToggleLojas}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-colors disabled:opacity-60 ${
                  overlayLojas
                    ? 'border-slate-600 bg-slate-700 text-white shadow-slate-900/15'
                    : 'border-slate-200/90 bg-white/95 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Store className="h-4 w-4" />
              </button>
              {overlayLojas && storeSegmentMenuOpen && (
                <div className="absolute left-0 top-[calc(100%+0.4rem)] z-30 min-w-[220px] rounded-xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-900/10">
                  <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Mostrar no mapa
                  </p>
                  <div className="space-y-1">
                    {STORE_SEGMENT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleToggleStoreSegment(option.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                          storeSegmentVisibility[option.id]
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span>{option.label}</span>
                        <span
                          className={`h-4 w-4 rounded border text-[10px] leading-[14px] text-center ${
                            storeSegmentVisibility[option.id]
                              ? 'border-slate-700 bg-slate-700 text-white'
                              : 'border-slate-300 bg-white text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="pt-2 text-[11px] text-slate-500">
                    Selecione pelo menos um tipo.
                  </p>
                </div>
              )}
            </div>
            {showCompareSupervisionAreasButton ? (
            <button
              type="button"
              title={
                canCompareSupervisionAreas
                  ? compareSupervisionAreas
                    ? `Ocultar áreas dos ${COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.supervisor} — ${compareScopeLabel}`
                    : `Comparar áreas dos ${COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.supervisor} — ${compareScopeLabel}`
                  : `Selecione um ${COMMERCIAL_TEAM_LEVEL_LABEL.gerente_area} ou ${COMMERCIAL_TEAM_LEVEL_LABEL.coordenador} no mapa para comparar áreas`
              }
              aria-label={`Comparar áreas dos ${COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.supervisor}`}
              aria-pressed={compareSupervisionAreas}
              disabled={!canCompareSupervisionAreas}
              onClick={() => setCompareSupervisionAreas((v) => !v)}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                compareSupervisionAreas
                  ? 'border-slate-600 bg-slate-700 text-white shadow-slate-900/15'
                  : 'border-slate-200/90 bg-white/95 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Layers className="h-4 w-4" />
            </button>
            ) : null}
          </div>
          <MapOverlayMarkerInfoPanel
            storeFilterCodAg={storeFilterCodAg}
            storeFilterAgencyName={storeFilterAgencyName}
            overlayMarkerSelection={overlayMarkerSelection}
            storeCountOnMap={sqlStorePoints.length}
            overlayLojasActive={overlayLojas}
            onDismiss={dismissMapMarkerDock}
          />
        </div>
      </div>
      <div
        className={`absolute top-4 z-20 flex flex-col items-end gap-2 overflow-visible transition-[right] duration-500 ease-out ${
          statePanelExpanded ? 'right-[calc(min(96vw,480px)+0.75rem)]' : 'right-4'
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
                className={`absolute right-full top-1/2 z-10 mr-4 flex w-max -translate-y-1/2 flex-row items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-lg shadow-slate-900/10 backdrop-blur-sm transition duration-200 ease-out ${
                  showLayoutFlyout
                    ? 'pointer-events-auto translate-x-0 opacity-100'
                    : 'pointer-events-none -translate-x-3 opacity-0'
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
                        setMapStyleMode(opt.id);
                        setMapLayoutMenuPinned(false);
                        setMapLayoutFlyoutHover(false);
                        clearLayoutHoverTimer();
                      }}
                      className="group flex flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-slate-100/90 focus:outline-none focus-visible:bg-slate-100/90"
                    >
                      <span className="sr-only">{opt.label}</span>
                      <span
                        className={`relative block h-9 w-9 shrink-0 overflow-hidden rounded-full shadow-inner transition ${
                          selected
                            ? 'ring-2 ring-blue-600 ring-offset-2 ring-offset-white'
                            : 'ring-1 ring-slate-200/80 group-hover:ring-slate-300'
                        }`}
                        aria-hidden
                      >
                        <img
                          src={opt.previewImage}
                          alt=""
                          loading="lazy"
                          draggable={false}
                          className="h-full w-full rounded-full object-cover"
                        />
                        {opt.tintClass ? (
                          <span className={`pointer-events-none absolute inset-0 rounded-full ${opt.tintClass}`} />
                        ) : null}
                      </span>
                      <span
                        className={`max-w-[3rem] truncate text-center text-[9px] font-semibold leading-tight ${
                          selected ? 'text-blue-700' : 'text-slate-600'
                        }`}
                      >
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
                    : mapStyleMode === 'standardCool'
                      ? 'border-cyan-300/90 bg-cyan-50 text-cyan-950 hover:bg-cyan-100/90'
                      : mapStyleMode === 'satellite' || mapStyleMode === 'dark'
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
          </div>
        </div>
      </div>
      <div
        className={`absolute bottom-4 z-20 flex max-w-[min(96vw,calc(100%-2rem))] items-end gap-3 overflow-visible pb-[env(safe-area-inset-bottom,0px)] transition-[right] duration-500 ease-out ${
          statePanelExpanded ? 'right-[calc(min(96vw,480px)+0.75rem)]' : 'right-4'
        }`}
      >
        {overlaySupervisores &&
        (seatLegendCompact ||
          seatLegendGc3Detail ||
          seatLegendGgDetail ||
          seatLegendEntries.length > 0) ? (
          <div className="pointer-events-auto min-w-0 max-w-[min(280px,calc(100vw-7rem))] shrink rounded-lg border border-slate-200/60 bg-white/90 px-2.5 py-2 text-[10px] text-slate-600 shadow-md shadow-slate-900/5 backdrop-blur-sm">
            <div className="mb-1 flex items-center gap-1.5">
              {seatLegendCanGoBack ? (
                <button
                  type="button"
                  onClick={goBackSeatLegend}
                  className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded px-1 text-[9px] font-medium uppercase tracking-wide text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                  title="Voltar ao nível anterior"
                  aria-label="Voltar ao nível anterior da legenda"
                >
                  <ChevronLeft className="h-3 w-3" aria-hidden />
                  Voltar
                </button>
              ) : null}
              <p className="min-w-0 flex-1 font-medium uppercase tracking-wide text-slate-500">
                Equipe Comercial
              </p>
            </div>
            {seatLegendCompact && seatLegendSelectedGc ? (
              <button
                type="button"
                onClick={focusSeatLegendSelectedGc}
                className="flex w-full min-w-0 items-center gap-1.5 rounded text-left transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                title={`Zoom em ${seatLegendSelectedGc.nome}`}
              >
                <span
                  className="inline-flex h-3 w-1 shrink-0 rounded-[1px]"
                  style={{ backgroundColor: seatLegendSelectedGc.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500 hover:text-slate-800">
                  {seatLegendSelectedGc.nome}
                </span>
                <span className="shrink-0 tabular-nums text-[10px] text-slate-400">
                  {seatLegendSelectedGc.chave}
                </span>
              </button>
            ) : seatLegendGc3Detail ? (
              <>
                <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-400">
                  {COMMERCIAL_TEAM_LEVEL_LABEL.supervisor}
                </div>
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {seatLegendGcEntries.length > 0 ? (
                    seatLegendGcEntries.map((entry) => (
                      <button
                        key={entry.chave}
                        type="button"
                        onClick={() => focusSeatLegendGc(entry.chave, entry.lngLat)}
                        className="flex w-full min-w-0 items-center gap-1.5 rounded text-left transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                        title={`Zoom em ${entry.nome}`}
                      >
                        <span
                          className="inline-flex h-3 w-1 shrink-0 rounded-[1px]"
                          style={{ backgroundColor: entry.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500 hover:text-slate-800">
                          {entry.nome}
                        </span>
                        <span className="shrink-0 tabular-nums text-[10px] text-slate-400">
                          {entry.chave}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="text-[10px] text-slate-400">Carregando gerentes comerciais…</p>
                  )}
                </div>
                {seatLegendGcEntries.length > 0 ? (
                  <div className="mt-1.5 border-t border-slate-200/80 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    Total{' '}
                    <span className="tabular-nums text-slate-700">{seatLegendGcEntries.length}</span>
                  </div>
                ) : null}
              </>
            ) : seatLegendGgDetail ? (
              <>
                <div className="mb-1 grid grid-cols-[minmax(0,1fr)_28px] items-center gap-1.5 text-[9px] uppercase tracking-wide text-slate-400">
                  <span>{COMMERCIAL_TEAM_LEVEL_LABEL.coordenador}</span>
                  <span className="text-center">GC</span>
                </div>
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {seatLegendGc3Entries.length > 0 ? (
                    seatLegendGc3Entries.map((entry) => (
                      <div
                        key={entry.chave}
                        className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => focusSeatLegendGc3(entry.chave)}
                          className="flex min-w-0 items-center gap-1.5 rounded text-left transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                          title={`Ver ${COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.supervisor} de ${entry.nome}`}
                        >
                          <span
                            className="inline-flex h-3 w-1 shrink-0 rounded-[1px]"
                            style={{ backgroundColor: entry.color }}
                            aria-hidden
                          />
                          <span className="truncate text-[10px] text-slate-500 hover:text-slate-800">
                            {entry.nome}
                          </span>
                        </button>
                        <span
                          className="text-center text-[10px] font-medium tabular-nums text-slate-600"
                          title={`${entry.gcCount} ${COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.supervisor}`}
                        >
                          {entry.gcCount}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-slate-400">Carregando gerentes comerciais III…</p>
                  )}
                </div>
                {seatLegendGc3Entries.length > 0 ? (
                  <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_28px] items-center gap-1.5 border-t border-slate-200/80 pt-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      Total
                    </span>
                    <span
                      className="text-center text-[10px] font-semibold tabular-nums text-slate-700"
                      title={`${seatLegendGc3Total} ${COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.supervisor}`}
                    >
                      {seatLegendGc3Total}
                    </span>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="mb-1 grid grid-cols-[minmax(0,1fr)_28px] items-center gap-1.5 text-[9px] uppercase tracking-wide text-slate-400">
                  <span>{COMMERCIAL_TEAM_LEVEL_LABEL.gerente_area}</span>
                  <span className="text-center">GC</span>
                </div>
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {seatLegendEntries.map((entry) => (
                    <div
                      key={entry.ga}
                      className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => focusSeatLegendGerencia(entry.ga)}
                        className="flex min-w-0 items-center gap-1.5 rounded text-left transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                        title={`Ver ${COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.coordenador} de ${entry.gaNome}`}
                      >
                        <span
                          className="inline-flex h-3 w-1 shrink-0 rounded-[1px]"
                          style={{ backgroundColor: entry.color }}
                          aria-hidden
                        />
                        <span className="truncate text-[10px] text-slate-500 hover:text-slate-800">
                          {entry.gaNome}
                        </span>
                      </button>
                      <span
                        className="text-center text-[10px] font-medium tabular-nums text-slate-600"
                        title={`${entry.gcCount} ${COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.supervisor}`}
                      >
                        {entry.gcCount}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_28px] items-center gap-1.5 border-t border-slate-200/80 pt-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    Total
                  </span>
                  <span
                    className="text-center text-[10px] font-semibold tabular-nums text-slate-700"
                    title={`${seatLegendGcTotal} ${COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.supervisor}`}
                  >
                    {seatLegendGcTotal}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : null}
        {visitRoute ? <RouteLegend /> : null}
        {compareSupervisionAreas && compareSupervisionsList.length > 0 ? (
          <div className="pointer-events-auto min-w-0 w-[min(280px,60vw)] shrink rounded-xl border border-slate-200/70 bg-white/90 shadow-lg shadow-slate-900/10 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-1.5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Áreas dos {COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.supervisor}
                </p>
                <p className="truncate text-xs font-medium text-slate-800" title={compareScopeLabel}>
                  {compareScopeLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompareSupervisionAreas(false)}
                title={`Ocultar áreas dos ${COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.supervisor}`}
                aria-label={`Ocultar áreas dos ${COMMERCIAL_TEAM_LEVEL_LABEL_PLURAL.supervisor}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-52 overflow-auto px-3 pb-2.5">
              <ul className="space-y-1">
                {compareSupervisionsList.map((item) => (
                  <li
                    key={item.chaveSupervisao}
                    className="flex items-center gap-2 text-[11px] text-slate-700"
                  >
                    <span
                      className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate" title={item.nome}>
                      {item.nome}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        <div className="shrink-0 rounded-3xl border border-slate-200/90 bg-white/95 p-2 shadow-lg shadow-slate-900/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Button
              type="button"
              size="icon"
              onClick={handleResetMapView2d}
              title="Voltar à visão 2D (mapa de cima)"
              aria-label="Voltar à visão 2D do mapa"
              className="h-10 w-10 rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
            >
              <span className="text-[10px] font-bold leading-none tracking-tight">2D</span>
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={() => setMunicipalityMeshVisible((v) => !v)}
              aria-pressed={municipalityMeshVisible}
              title={
                municipalityMeshVisible
                  ? 'Ocultar malha de municípios'
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
                  ? 'Limpar seleção'
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
          minimized={statePanelMinimized}
          onMinimize={() => setStatePanelMinimized(true)}
          onRestore={() => setStatePanelMinimized(false)}
        />
      )}
      {(() => {
        const productivityDockInset = statePanelExpanded ? 'left-0 right-[min(96vw,480px)]' : 'left-0 right-0';
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
                  rightInsetClass={statePanelExpanded ? 'right-[min(96vw,480px)]' : 'right-0'}
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
