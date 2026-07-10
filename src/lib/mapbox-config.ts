// MapBox configuration
export const MAPBOX_CONFIG = {
  accessToken: 'pk.eyJ1IjoiaWdyYWxlbmNhciIsImEiOiJjbWFpN3VhbDIwZWh2MnJxNDEycG1haHZpIn0.IPFXEakhJ0tprRmq4JEn_w',
  defaultStyle: 'mapbox://styles/mapbox/light-v11',
  styles: {
    default: 'mapbox://styles/mapbox/light-v11',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
    dark: 'mapbox://styles/mapbox/dark-v11',
    /** Mapbox Standard — tema/luz via `config.basemap` no GL JS v3+. */
    standardWarm: 'mapbox://styles/mapbox/standard',
    standardCool: 'mapbox://styles/mapbox/standard',
    /** Estilo customizado criado no Mapbox Studio. */
    custom: 'mapbox://styles/igralencar/cmoc8sp33003601s58ijjhro4',
  },
  /** Mapa plano (Web Mercator). Estilos v11+ podem usar `globe` no JSON — isso força visão plana. */
  projection: { name: 'mercator' as const },
  bounds: {
    /** Brasil continental (~limites IBGE); usado em encaixes pontuais. */
    brazil: [[-74.05, -33.95], [-34.7, 5.35]] as [[number, number], [number, number]],
  },
  /**
   * Vista inicial / reset do Brasil (abertura do mapa e botão 2D / limpar seleção).
   * Não restringe o pan depois — o usuário pode arrastar livremente após carregar.
   */
  initialBrazilView: {
    center: [-54.0, -14.0] as [number, number],
    /** Deve ser >= `zoom.min` (senão o scroll “para” no limite logo na abertura). */
    zoom: 3.85,
  },
  center: [-54.0, -14.0] as [number, number],
  zoom: {
    /** Impede afastar demais (o Brasil some no oceano). Menor = mais distante permitido. */
    min: 3.75,
    max: 22,
  },
  /** Sensibilidade do scroll (zoom no cursor — padrão Mapbox). */
  scrollZoom: {
    wheelZoomRate: 1 / 60,
    zoomRate: 1 / 45,
  },
  /** Inclinação da câmera; relevo DEM desligado por performance. */
  interactive3d: {
    maxPitch: 85,
    terrainEnabled: false,
    terrainDemSourceId: 'mapbox-dem',
    terrainExaggeration: 1.35,
    /** Inclinação ao focar pin (gerente/agência/loja) — mais baixo = movimento mais suave. */
    focusPitch: 50,
    /** Zoom alvo ao clicar no pin: região, sem aproximar demais. */
    focusZoomStreet: 9,
    focusZoomMin: 8.8,
    focusDurationMs: 1800,
    flatDurationMs: 1100,
    /** Desloca o centro na tela para o popup não cobrir o pin [x, y] em px. */
    focusOffset: [0, -90] as [number, number],
    /** Usa flyTo em vez de easeTo se |zoom atual − alvo| > este valor. */
    focusFlyToZoomDelta: 2.2,
  },
  /** Cobre com cor sólida tudo fora do contorno do Brasil (o mapa só “aparece” dentro do país). */
  maskOutsideBrazil: true,
  /** Fallback se o estilo não expuser `fill-color` simples na camada `land`. */
  outsideBrazilMaskColor: '#f8f4f0',
  /** Opções do import `basemap` (Mapbox Standard / Warm). */
  standardBasemap: {
    showClouds: false,
  },
} as const;