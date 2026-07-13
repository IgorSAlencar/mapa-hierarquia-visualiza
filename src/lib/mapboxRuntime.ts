/**
 * Runtime Mapbox: pré-aquece workers, faz prefetch/cache do estilo
 * e evita re-download desnecessário entre navegações/reloads da sessão.
 */
import mapboxgl from 'mapbox-gl';
import type { StyleSpecification } from 'mapbox-gl';

import { MAPBOX_CONFIG } from '@/lib/mapbox-config';

const STYLE_CACHE_PREFIX = 'mbx-style-cache-v1:';
const STYLE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let runtimeBootstrapped = false;
const prefetchInFlight = new Map<string, Promise<void>>();
const memoryStyleCache = new Map<string, { ts: number; style: StyleSpecification }>();

type CachedStylePayload = { ts: number; style: StyleSpecification };

function styleUrlToHttp(styleUrl: string): string {
  if (styleUrl.startsWith('http://') || styleUrl.startsWith('https://')) {
    const u = new URL(styleUrl);
    if (!u.searchParams.has('access_token')) {
      u.searchParams.set('access_token', MAPBOX_CONFIG.accessToken);
    }
    return u.toString();
  }
  const id = styleUrl.replace(/^mapbox:\/\/styles\//, '');
  return `https://api.mapbox.com/styles/v1/${id}?access_token=${encodeURIComponent(MAPBOX_CONFIG.accessToken)}`;
}

function readPersistedStyle(styleUrl: string): StyleSpecification | null {
  const mem = memoryStyleCache.get(styleUrl);
  if (mem && Date.now() - mem.ts < STYLE_CACHE_TTL_MS) {
    return mem.style;
  }
  try {
    const raw = sessionStorage.getItem(STYLE_CACHE_PREFIX + styleUrl);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedStylePayload;
    if (!parsed?.style || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > STYLE_CACHE_TTL_MS) return null;
    memoryStyleCache.set(styleUrl, parsed);
    return parsed.style;
  } catch {
    return null;
  }
}

function persistStyle(styleUrl: string, style: StyleSpecification): void {
  const payload: CachedStylePayload = { ts: Date.now(), style };
  memoryStyleCache.set(styleUrl, payload);
  try {
    sessionStorage.setItem(STYLE_CACHE_PREFIX + styleUrl, JSON.stringify(payload));
  } catch {
    /* quota / private mode — memória já cobre a sessão */
  }
}

/**
 * Estilos com `imports` devem continuar como URL para que o GL JS resolva os
 * fragmentos na versão compatível. O estilo Bradesco importa o Standard, mesmo
 * que isso não seja visível no identificador da URL.
 */
export function styleSupportsObjectCache(styleUrl: string): boolean {
  return (
    !styleUrl.includes('mapbox/standard') &&
    styleUrl !== MAPBOX_CONFIG.styles.custom
  );
}

/** Token, workers e limites — chamar cedo (main) e antes de criar o mapa. */
export function ensureMapboxRuntime(): void {
  if (runtimeBootstrapped) return;
  runtimeBootstrapped = true;

  mapboxgl.accessToken = MAPBOX_CONFIG.accessToken;

  try {
    mapboxgl.prewarm();
  } catch {
    /* ambientes sem WebGL / workers */
  }

  mapboxgl.maxParallelImageRequests = 16;
}

/**
 * Prefetch do JSON do estilo (aquece HTTP cache + sessionStorage).
 * Seguro chamar várias vezes; deduplica por URL.
 */
export function prefetchMapboxStyle(styleUrl: string): Promise<void> {
  ensureMapboxRuntime();
  const existing = prefetchInFlight.get(styleUrl);
  if (existing) return existing;

  const task = (async () => {
    if (readPersistedStyle(styleUrl)) return;
    try {
      const res = await fetch(styleUrlToHttp(styleUrl), {
        method: 'GET',
        credentials: 'omit',
        cache: 'force-cache',
      });
      if (!res.ok) return;
      const style = (await res.json()) as StyleSpecification;
      persistStyle(styleUrl, style);
    } catch {
      /* offline / CORS — mapa ainda carrega pela URL */
    }
  })();

  prefetchInFlight.set(styleUrl, task);
  void task.finally(() => {
    prefetchInFlight.delete(styleUrl);
  });
  return task;
}

/** Prefetch do estilo padrão + alguns alternativos usados no seletor. */
export function prefetchDefaultMapboxStyles(): void {
  ensureMapboxRuntime();
  const urls = [
    MAPBOX_CONFIG.styles.standardWarm,
    MAPBOX_CONFIG.styles.standardCool,
    MAPBOX_CONFIG.styles.default,
    MAPBOX_CONFIG.styles.satellite,
    MAPBOX_CONFIG.styles.dark,
    MAPBOX_CONFIG.styles.custom,
  ];
  for (const url of urls) {
    void prefetchMapboxStyle(url);
  }
}

/**
 * Resolve o estilo para o construtor do Map: objeto em cache quando seguro,
 * senão URL (Standard / cache miss). Sempre dispara prefetch em background.
 */
export async function resolveMapStyleForInit(
  styleUrl: string
): Promise<string | StyleSpecification> {
  ensureMapboxRuntime();
  void prefetchMapboxStyle(styleUrl);

  if (!styleSupportsObjectCache(styleUrl)) {
    return styleUrl;
  }

  const cached = readPersistedStyle(styleUrl);
  if (cached) return cached;

  try {
    await prefetchMapboxStyle(styleUrl);
  } catch {
    /* ignore */
  }
  return readPersistedStyle(styleUrl) ?? styleUrl;
}

/**
 * Executa `fn` quando o estilo está utilizável.
 * `isStyleLoaded()` fica false com setData/tiles pendentes — não desistir:
 * reagenda em `idle` / `style.load`.
 */
export function runWhenMapStyleReady(map: mapboxgl.Map, fn: () => void): () => void {
  let cancelled = false;
  let idleHandler: (() => void) | null = null;
  let styleHandler: (() => void) | null = null;

  const run = () => {
    if (cancelled) return;
    try {
      fn();
    } catch {
      /* estilo/camadas ainda trocando */
    }
  };

  const tryNow = (): boolean => {
    try {
      if (map.isStyleLoaded()) {
        run();
        return true;
      }
    } catch {
      return false;
    }
    return false;
  };

  if (tryNow()) {
    return () => {
      cancelled = true;
    };
  }

  idleHandler = () => {
    if (cancelled) return;
    if (tryNow()) {
      cleanup();
    }
  };
  styleHandler = () => {
    if (cancelled) return;
    map.once('idle', idleHandler!);
  };

  const cleanup = () => {
    if (idleHandler) map.off('idle', idleHandler);
    if (styleHandler) map.off('style.load', styleHandler);
    idleHandler = null;
    styleHandler = null;
  };

  map.once('idle', idleHandler);
  map.once('style.load', styleHandler);

  return () => {
    cancelled = true;
    cleanup();
  };
}
