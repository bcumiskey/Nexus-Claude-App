import sql from 'mssql';

let pool = null;

const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: process.env.SQL_ENCRYPT === 'true',
    trustServerCertificate: process.env.SQL_TRUST_SERVER_CERT !== 'false',
  },
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
  },
};

export async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    console.log('✓ SQL Server connected:', config.server, '/', config.database);
  }
  return pool;
}

export async function query(text, params = {}) {
  const p = await getPool();
  const req = p.request();
  for (const [key, val] of Object.entries(params)) {
    req.input(key, val);
  }
  return req.query(text);
}

export async function healthCheck() {
  try {
    const p = await getPool();
    const result = await p.request().query(
      "SELECT SCHEMA_NAME(schema_id) AS s FROM sys.schemas WHERE name = 'nexus'"
    );
    return {
      connected: true,
      server: config.server,
      database: config.database,
      nexusSchema: result.recordset.length > 0,
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

export { sql };
