import cors from 'cors';
import express from 'express';
import mapRoutes from './routes/mapRoutes.js';
import expressoRoutes from './routes/expressoRoutes.js';
import commercialStructureRoutes from './routes/commercialStructureRoutes.js';
import { poolConnect } from './db/sqlServer.js';
import { DEV_API_PORT, DEV_API_PROXY_TARGET, DEV_API_URL } from '../dev.network.js';

const app = express();
const port = DEV_API_PORT;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/map', mapRoutes);
app.use('/api/expresso', expressoRoutes);
app.use('/api/estrutura', commercialStructureRoutes);

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
