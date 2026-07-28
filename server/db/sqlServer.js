import 'dotenv/config';
import sql from 'mssql';

function positiveTimeout(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const dbConfig = {
  server: process.env.SQL_SERVER ?? 'DESKTOP-G4V6794',
  database: process.env.SQL_DATABASE ?? 'TESTE',
  user: process.env.SQL_USER ?? 'sa',
  password: process.env.SQL_PASSWORD ?? 'expresso',
  connectionTimeout: positiveTimeout(process.env.SQL_CONNECTION_TIMEOUT_MS, 30_000),
  requestTimeout: positiveTimeout(process.env.SQL_REQUEST_TIMEOUT_MS, 300_000),
  options: {
    encrypt: String(process.env.SQL_ENCRYPT ?? 'false').toLowerCase() === 'true',
    trustServerCertificate:
      String(process.env.SQL_TRUST_SERVER_CERTIFICATE ?? 'true').toLowerCase() === 'true',
    enableArithAbort: true,
  },
};

const pool = new sql.ConnectionPool(dbConfig);
const poolConnect = pool.connect();

poolConnect.catch((err) => {
  console.error('Erro ao conectar ao SQL Server:', err);
});

export { sql, pool, poolConnect };
