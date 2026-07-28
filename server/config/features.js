import 'dotenv/config';

function flag(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

export const FEATURES = Object.freeze({
  visits: flag('VISITS_TREATMENT_ENABLED', false),
  notifications: flag('NOTIFICATIONS_ENABLED', false),
  worker: flag('VISITS_WORKER_ENABLED', false),
});

export function requireFeature(feature) {
  return function featureMiddleware(_req, res, next) {
    if (!FEATURES[feature]) {
      res.status(503).json({
        type: 'https://mapa.interno/errors/feature-disabled',
        title: 'Funcionalidade temporariamente indisponível',
        status: 503,
        code: 'FEATURE_DISABLED',
        detail: `A funcionalidade ${feature} ainda não foi ativada neste ambiente.`,
      });
      return;
    }
    next();
  };
}
