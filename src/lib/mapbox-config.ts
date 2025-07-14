// MapBox configuration
export const MAPBOX_CONFIG = {
  accessToken: 'pk.eyJ1IjoiaWdyYWxlbmNhciIsImEiOiJjbWFpN3VhbDIwZWh2MnJxNDEycG1haHZpIn0.IPFXEakhJ0tprRmq4JEn_w',
  defaultStyle: 'mapbox://styles/mapbox/light-v11',
  bounds: {
    brazil: [[-75, -35], [-30, 10]] as [[number, number], [number, number]],
  },
  center: [-54.0, -14.0] as [number, number],
  zoom: {
    initial: 4,
    min: 3,
    max: 8
  }
};