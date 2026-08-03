import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import buffer from '@turf/buffer';
import { union } from 'polyclip-ts';

const IBGE_MUNICIPAL_MESH_URL =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR' +
  '?formato=application/vnd.geo+json&qualidade=maxima&intrarregiao=municipio';
const DEFAULT_OUTPUT = resolve('public/geo/brasil-limite-ibge.geojson');
const DEFAULT_OVERVIEW_OUTPUT = resolve('public/geo/brasil-limite-ibge-overview.geojson');
const DEFAULT_FALLBACK_OUTPUT = resolve('public/geo/brasil-limite-ibge-fallback.geojson');
const DEFAULT_OVERVIEW_TOLERANCE = 0.002;
const DEFAULT_FALLBACK_TOLERANCE = 0.01;
const DEFAULT_FALLBACK_BUFFER_KM = 12;

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function asMultiPolygonCoordinates(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  throw new Error(`Geometria municipal não suportada: ${geometry?.type ?? 'vazia'}`);
}

function roundCoordinate(value) {
  return Number(value.toFixed(6));
}

function samePosition(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function normalizeRing(ring) {
  const positions = [];
  for (const [longitude, latitude] of ring) {
    const position = [roundCoordinate(longitude), roundCoordinate(latitude)];
    if (!positions.length || !samePosition(positions.at(-1), position)) {
      positions.push(position);
    }
  }

  if (positions.length > 1 && samePosition(positions[0], positions.at(-1))) {
    positions.pop();
  }
  if (positions.length < 3) return null;

  const twiceArea = positions.reduce((total, [x1, y1], index) => {
    const [x2, y2] = positions[(index + 1) % positions.length];
    return total + x1 * y2 - x2 * y1;
  }, 0);
  if (Math.abs(twiceArea) < 1e-12) return null;

  positions.push([...positions[0]]);
  return positions;
}

function roundMultiPolygon(multiPolygon) {
  return multiPolygon.flatMap((polygon) => {
    const outerRing = normalizeRing(polygon[0]);
    if (!outerRing) return [];
    const innerRings = polygon.slice(1).map(normalizeRing).filter(Boolean);
    return [[outerRing, ...innerRings]];
  });
}

function countPositions(multiPolygon) {
  return multiPolygon.reduce(
    (polygonTotal, polygon) =>
      polygonTotal +
      polygon.reduce((ringTotal, ring) => ringTotal + ring.length, 0),
    0
  );
}

function squaredSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const ratio =
      ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (ratio > 1) {
      x = end[0];
      y = end[1];
    } else if (ratio > 0) {
      x += dx * ratio;
      y += dy * ratio;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyOpenLine(points, squaredTolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let furthestIndex = -1;
    let furthestDistance = squaredTolerance;
    for (let index = first + 1; index < last; index += 1) {
      const distance = squaredSegmentDistance(points[index], points[first], points[last]);
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestIndex < 0) continue;
    keep[furthestIndex] = 1;
    stack.push([first, furthestIndex], [furthestIndex, last]);
  }

  return points.filter((_, index) => keep[index] === 1);
}

function simplifyRing(ring, tolerance) {
  const positions = ring.slice(0, -1);
  if (positions.length <= 3) return ring;

  let splitIndex = 1;
  let furthestDistance = -1;
  for (let index = 1; index < positions.length; index += 1) {
    const dx = positions[index][0] - positions[0][0];
    const dy = positions[index][1] - positions[0][1];
    const distance = dx * dx + dy * dy;
    if (distance > furthestDistance) {
      furthestDistance = distance;
      splitIndex = index;
    }
  }

  const squaredTolerance = tolerance * tolerance;
  const firstHalf = simplifyOpenLine(
    positions.slice(0, splitIndex + 1),
    squaredTolerance
  );
  const secondHalf = simplifyOpenLine(
    [...positions.slice(splitIndex), positions[0]],
    squaredTolerance
  );
  const simplified = [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
  if (simplified.length < 3) return ring;
  simplified.push([...simplified[0]]);
  return simplified;
}

function simplifyMultiPolygon(multiPolygon, tolerance) {
  return multiPolygon.map((polygon) =>
    polygon.map((ring) => simplifyRing(ring, tolerance))
  );
}

function boundaryFeatureCollection(coordinates, detail, extraProperties = {}) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          codarea: 'BR',
          fonte: 'IBGE - API de malhas geográficas v3',
          base: 'malha municipal em qualidade máxima, limites dissolvidos',
          detalhe: detail,
          ...extraProperties,
        },
        geometry: {
          type: 'MultiPolygon',
          coordinates,
        },
      },
    ],
  };
}

async function readMunicipalMesh(inputPath) {
  if (inputPath) {
    return JSON.parse(await readFile(resolve(inputPath), 'utf8'));
  }

  const response = await fetch(IBGE_MUNICIPAL_MESH_URL);
  if (!response.ok) {
    throw new Error(`IBGE respondeu ${response.status} ao baixar a malha municipal.`);
  }
  return response.json();
}

async function main() {
  const inputPath = argumentValue('--input');
  const outputPath = resolve(argumentValue('--output') ?? DEFAULT_OUTPUT);
  const overviewOutputPath = resolve(
    argumentValue('--overview-output') ?? DEFAULT_OVERVIEW_OUTPUT
  );
  const fallbackOutputPath = resolve(
    argumentValue('--fallback-output') ?? DEFAULT_FALLBACK_OUTPUT
  );
  const overviewTolerance = Number(
    argumentValue('--overview-tolerance') ?? DEFAULT_OVERVIEW_TOLERANCE
  );
  const fallbackTolerance = Number(
    argumentValue('--fallback-tolerance') ?? DEFAULT_FALLBACK_TOLERANCE
  );
  const fallbackBufferKm = Number(
    argumentValue('--fallback-buffer-km') ?? DEFAULT_FALLBACK_BUFFER_KM
  );
  const municipalities = await readMunicipalMesh(inputPath);

  if (
    municipalities?.type !== 'FeatureCollection' ||
    !Array.isArray(municipalities.features) ||
    municipalities.features.length === 0
  ) {
    throw new Error('A resposta do IBGE não contém uma FeatureCollection municipal válida.');
  }

  const geometriesByUf = new Map();
  for (const feature of municipalities.features) {
    // A API oficial usa `codarea`; a malha já consumida pelo app usa `id`.
    const municipalityCode = String(
      feature?.properties?.codarea ?? feature?.properties?.id ?? ''
    );
    const ufCode = municipalityCode.slice(0, 2);
    if (!/^\d{2}$/.test(ufCode)) {
      throw new Error(`Município sem código IBGE válido: ${municipalityCode || 'vazio'}`);
    }
    const geometries = geometriesByUf.get(ufCode) ?? [];
    geometries.push(asMultiPolygonCoordinates(feature.geometry));
    geometriesByUf.set(ufCode, geometries);
  }

  const states = [];
  for (const [ufCode, geometries] of [...geometriesByUf].sort(([a], [b]) => a.localeCompare(b))) {
    const state = union(...geometries);
    if (state.length === 0) throw new Error(`A união dos municípios da UF ${ufCode} ficou vazia.`);
    states.push(state);
    console.log(`UF ${ufCode}: ${geometries.length} municípios dissolvidos.`);
  }

  const brazil = roundMultiPolygon(union(...states));
  const overview = simplifyMultiPolygon(brazil, overviewTolerance);
  const fallbackBuffer = buffer(
    {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: overview },
    },
    fallbackBufferKm,
    { units: 'kilometers', steps: 4 }
  );
  if (!fallbackBuffer?.geometry) {
    throw new Error('Não foi possível criar o buffer da máscara fixa de segurança.');
  }
  const fallback = simplifyMultiPolygon(
    roundMultiPolygon(asMultiPolygonCoordinates(fallbackBuffer.geometry)),
    fallbackTolerance
  );

  await Promise.all([
    writeFile(
      outputPath,
      `${JSON.stringify(boundaryFeatureCollection(brazil, 'integral'))}\n`,
      'utf8'
    ),
    writeFile(
      overviewOutputPath,
      `${JSON.stringify(boundaryFeatureCollection(overview, 'visao-geral'))}\n`,
      'utf8'
    ),
    writeFile(
      fallbackOutputPath,
      `${JSON.stringify(
        boundaryFeatureCollection(fallback, 'mascara-fixa-seguranca', {
          bufferKm: fallbackBufferKm,
        })
      )}\n`,
      'utf8'
    ),
  ]);
  console.log(
    `Contorno salvo em ${outputPath}: ${brazil.length} polígonos, ` +
      `${countPositions(brazil)} vértices.`
  );
  console.log(
    `Visão geral salva em ${overviewOutputPath}: ${countPositions(overview)} vértices ` +
      `(tolerância ${overviewTolerance}°).`
  );
  console.log(
    `Máscara fixa salva em ${fallbackOutputPath}: ${countPositions(fallback)} vértices, ` +
      `buffer externo de ${fallbackBufferKm} km.`
  );
}

await main();
