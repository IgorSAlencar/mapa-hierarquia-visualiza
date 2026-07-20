import { readFile } from 'node:fs/promises';

const areasFileUrl = new URL('../data/areas_atuacao_supervisoes.geojson', import.meta.url);
let cachedFeatureCollectionPromise = null;

function normalizeKey(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.trunc(number)) : String(value ?? '').trim();
}

async function loadFeatureCollection() {
  if (!cachedFeatureCollectionPromise) {
    cachedFeatureCollectionPromise = readFile(areasFileUrl, 'utf8')
      .then((content) => JSON.parse(content))
      .then((value) => {
        if (value?.type !== 'FeatureCollection' || !Array.isArray(value.features)) {
          throw new Error('GeoJSON de áreas de supervisão inválido.');
        }
        return value;
      })
      .catch((error) => {
        cachedFeatureCollectionPromise = null;
        throw error;
      });
  }
  return cachedFeatureCollectionPromise;
}

export async function getAuthorizedSupervisionAreas(user) {
  const featureCollection = await loadFeatureCollection();
  if (user?.isAdmin) return featureCollection;

  const allowed = new Set((user?.scope?.supervisoes ?? []).map(normalizeKey));
  return {
    type: 'FeatureCollection',
    features: featureCollection.features.filter((feature) =>
      allowed.has(normalizeKey(feature?.properties?.chave_supervisao))
    ),
  };
}
