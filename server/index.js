import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import authRoutes from './routes/authRoutes.js';
import mapRoutes from './routes/mapRoutes.js';
import expressoRoutes from './routes/expressoRoutes.js';
import commercialStructureRoutes from './routes/commercialStructureRoutes.js';
import visitRoutesRoutes from './routes/visitRoutesRoutes.js';
import { requireAuth } from './auth/authMiddleware.js';
import { poolConnect } from './db/sqlServer.js';
import {
  DEV_API_PORT,
  DEV_API_PROXY_TARGET,
  DEV_API_URL,
  DEV_BASE_URL,
  DEV_FRONTEND_PORT,
} from '../dev.network.js';

const app = express();
const port = DEV_API_PORT;
const defaultFrontendOrigin = `${DEV_BASE_URL}:${DEV_FRONTEND_PORT}`;
const allowedOrigins = new Set(
  String(process.env.CORS_ORIGINS ?? `${defaultFrontendOrigin},http://localhost:${DEV_FRONTEND_PORT}`)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origem não autorizada pelo CORS.'));
  },
}));
// A geometria GeoJSON completa precisa atravessar a API sem ser truncada.
app.use(express.json({ limit: '6mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api', requireAuth);
app.use('/api/map', mapRoutes);
app.use('/api/expresso', expressoRoutes);
app.use('/api/estrutura', commercialStructureRoutes);
app.use('/api/roteiros', visitRoutesRoutes);

poolConnect
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`API SQL: ${DEV_API_URL} | proxy Vite → ${DEV_API_PROXY_TARGET}`);
    });
  })
  .catch((error) => {
    console.error('Falha ao iniciar API por erro de conexão SQL:', error);
    process.exit(1);
  });
