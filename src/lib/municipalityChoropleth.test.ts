import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProductionQuantileScale,
  mergeProductionHeatmapIntoFeatureCollection,
  municipalityCodeFromProperties,
  normalizeMunicipalityCode,
  productionQuantileClass,
} from './municipalityChoropleth.ts';

test('normaliza e resolve códigos municipais sem usar o nome', () => {
  assert.equal(normalizeMunicipalityCode('3550308'), '3550308');
  assert.equal(normalizeMunicipalityCode(3509502), '3509502');
  assert.equal(normalizeMunicipalityCode(4102321.0), '4102321');
  assert.equal(normalizeMunicipalityCode('4.102321e+006'), '4102321');
  assert.equal(normalizeMunicipalityCode('4102321.0'), '4102321');
  assert.equal(normalizeMunicipalityCode('123'), null);
  assert.equal(municipalityCodeFromProperties({ COD_IBGE: '3550308' }), '3550308');
});

test('quantis preservam empates e separam zeros', () => {
  const scale = buildProductionQuantileScale([0, 1, 1, 2, 3, 100]);
  assert.equal(scale.thresholds.length, 4);
  assert.equal(productionQuantileClass(0, scale.thresholds), -1);
  assert.equal(productionQuantileClass(1, scale.thresholds), 0);
  assert.equal(productionQuantileClass(100, scale.thresholds), 4);
});

test('mescla municípios homônimos exclusivamente pelo código', () => {
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { id: '1111111', name: 'Bom Jesus' }, geometry: null },
      { type: 'Feature', properties: { id: '2222222', name: 'Bom Jesus' }, geometry: null },
    ],
  };
  const rows = [
    { municipalityCode: '1111111', municipalityName: 'Bom Jesus', uf: 'PI', value: 10, producingStores: 2 },
    { municipalityCode: '2222222', municipalityName: 'Bom Jesus', uf: 'RS', value: 50, producingStores: 4 },
  ];
  const merged = mergeProductionHeatmapIntoFeatureCollection(
    fc,
    rows,
    buildProductionQuantileScale(rows.map((row) => row.value))
  );
  assert.equal(merged.features[0].properties?.heatValue, 10);
  assert.equal(merged.features[1].properties?.heatValue, 50);
  assert.equal(merged.features[1].properties?.heatUf, 'RS');
});
