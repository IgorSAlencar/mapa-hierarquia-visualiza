import assert from 'node:assert/strict';
import test from 'node:test';
import { canAssignRouteOutsideOwnerPortfolio } from './routeAssignmentPolicy.js';

test('níveis superiores podem atribuir roteiro fora da carteira do GC', () => {
  assert.equal(canAssignRouteOutsideOwnerPortfolio({ role: 'coordenador', isAdmin: false }), true);
  assert.equal(canAssignRouteOutsideOwnerPortfolio({ role: 'gerente_area', isAdmin: false }), true);
  assert.equal(canAssignRouteOutsideOwnerPortfolio({ role: 'admin', isAdmin: true }), true);
});

test('Gerente Comercial continua limitado à própria carteira', () => {
  assert.equal(canAssignRouteOutsideOwnerPortfolio({ role: 'supervisor', isAdmin: false }), false);
  assert.equal(canAssignRouteOutsideOwnerPortfolio(null), false);
});
