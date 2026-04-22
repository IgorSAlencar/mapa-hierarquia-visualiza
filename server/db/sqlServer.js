import sql from 'mssql';

const dbConfig = {
  server: process.env.SQL_SERVER ?? 'DESKTOP-G4V6794',
  database: process.env.SQL_DATABASE ?? 'TESTE',
  user: process.env.SQL_USER ?? 'sa',
  password: process.env.SQL_PASSWORD ?? 'expresso',
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
