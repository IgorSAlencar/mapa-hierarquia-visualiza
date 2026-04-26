import cors from 'cors';
import express from 'express';
import mapRoutes from './routes/mapRoutes.js';
import expressoRoutes from './routes/expressoRoutes.js';
import { poolConnect } from './db/sqlServer.js';
import { DEV_API_PORT, DEV_API_URL, DEV_HOST } from '../dev.network.js';

const app = express();
const port = DEV_API_PORT;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/map', mapRoutes);
app.use('/api/expresso', expressoRoutes);

poolConnect
  .then(() => {
    app.listen(port, DEV_HOST, () => {
      console.log(`API SQL rodando em ${DEV_API_URL}`);
    });
  })
  .catch((error) => {
    console.error('Falha ao iniciar API por erro de conexão SQL:', error);
    process.exit(1);
  });
