export type DistanceAnalysisMapPointKind = 'loja' | 'agencia';

export interface DistanceAnalysisMapPoint {
  id: string;
  kind: DistanceAnalysisMapPointKind;
  label: string;
  description: string;
  lngLat: [number, number];
}

export interface DistanceAnalysisMapSelection {
  tick: number;
  point: DistanceAnalysisMapPoint;
}
