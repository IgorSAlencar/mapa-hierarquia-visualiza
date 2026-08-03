import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { difference } from 'polyclip-ts';
import { buildOutsideBrazilMaskFeature } from './brazilOutsideMask.ts';

function geometrySegments(geometry: Geometry): Set<string> {
  const segments = new Set<string>();

  const visit = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) return;
    if (
      coordinates.length >= 2 &&
      Array.isArray(coordinates[0]) &&
      typeof coordinates[0][0] === 'number'
    ) {
      const ring = coordinates as Position[];
      for (let index = 1; index < ring.length; index += 1) {
        const from = ring[index - 1].join(',');
        const to = ring[index].join(',');
        segments.add(from < to ? `${from}|${to}` : `${to}|${from}`);
      }
      return;
    }
    for (const child of coordinates) visit(child);
  };

  if (geometry.type !== 'GeometryCollection') visit(geometry.coordinates);
  return segments;
}

function readBrazilBoundary(fileName: string): GeoJSON.Feature {
  const fc = JSON.parse(
    readFileSync(new URL(`../../public/geo/${fileName}`, import.meta.url), 'utf8')
  ) as GeoJSON.FeatureCollection;
  const brazil = fc.features[0];
  assert.ok(brazil?.geometry);
  return brazil;
}

function assertMaskFollowsBoundary(brazil: GeoJSON.Feature, minimumSegments: number): void {
  assert.ok(brazil.geometry);

  const mask = buildOutsideBrazilMaskFeature(brazil);
  const boundarySegments = geometrySegments(brazil.geometry);
  const maskSegments = geometrySegments(mask.geometry);

  assert.ok(boundarySegments.size > minimumSegments);
  for (const segment of boundarySegments) {
    assert.ok(maskSegments.has(segment), `segmento ausente na máscara: ${segment}`);
  }
}

function multiPolygonCoordinates(feature: GeoJSON.Feature): Position[][][] {
  assert.ok(feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon');
  const geometry = feature.geometry as Polygon | MultiPolygon;
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

test('a máscara externa preserva todos os segmentos do contorno integral do IBGE', () => {
  assertMaskFollowsBoundary(readBrazilBoundary('brasil-limite-ibge.geojson'), 60_000);
});

test('a máscara externa preserva todos os segmentos do contorno de visão geral', () => {
  assertMaskFollowsBoundary(
    readBrazilBoundary('brasil-limite-ibge-overview.geojson'),
    17_000
  );
});

test('a máscara fixa cobre o mundo sem avançar sobre o Brasil', () => {
  const integral = readBrazilBoundary('brasil-limite-ibge.geojson');
  const fallback = readBrazilBoundary('brasil-limite-ibge-fallback.geojson');

  assertMaskFollowsBoundary(fallback, 1_500);
  assert.deepEqual(
    difference(multiPolygonCoordinates(integral), multiPolygonCoordinates(fallback)),
    []
  );
});

test('o cache da máscara é independente para cada nível de detalhe', () => {
  const overview = readBrazilBoundary('brasil-limite-ibge-overview.geojson');
  const integral = readBrazilBoundary('brasil-limite-ibge.geojson');

  assert.notStrictEqual(
    buildOutsideBrazilMaskFeature(overview),
    buildOutsideBrazilMaskFeature(integral)
  );
});
