// MapBox configuration
export const MAPBOX_CONFIG = {
  accessToken: 'pk.eyJ1IjoiaWdyYWxlbmNhciIsImEiOiJjbWFpN3VhbDIwZWh2MnJxNDEycG1haHZpIn0.IPFXEakhJ0tprRmq4JEn_w',
  defaultStyle: 'mapbox://styles/mapbox/light-v11',
  styles: {
    default: 'mapbox://styles/mapbox/light-v11',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  },
  /** Mapa plano (Web Mercator). Estilos v11+ podem usar `globe` no JSON — isso força visão plana. */
  projection: { name: 'mercator' as const },
  bounds: {
    /** Brasil continental (~limites IBGE); usado no enquadramento inicial. */
    brazil: [[-74.05, -33.95], [-34.7, 5.35]] as [[number, number], [number, number]],
    /**
     * Limite de pan mais amplo que o retângulo do país.
     * `maxBounds` muito justo faz o Mapbox subir o zoom mínimo (principalmente em telas largas).
     */
    panLimit: [[-95, -48], [-12, 18]] as [[number, number], [number, number]],
  },
  center: [-54.0, -14.0] as [number, number],
  /** Zoom inicial (fallback se `bounds` não for usado no construtor). */
  zoom: {
    initial: 3.2,
    min: 0,
    max: 22,
  },
  /** Cobre com cor sólida tudo fora do contorno do Brasil (o mapa só “aparece” dentro do país). */
  maskOutsideBrazil: true,
  /** Fallback se o estilo não expuser `fill-color` simples na camada `land`. */
  outsideBrazilMaskColor: '#f8f4f0',
} as const;