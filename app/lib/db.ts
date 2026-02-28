import 'server-only';
import postgres from 'postgres';

const globalForDb = globalThis as unknown as {
  __latelessSql?: ReturnType<typeof postgres>;
};

const poolMaxRaw = process.env.POSTGRES_POOL_MAX;
const poolMax = Number(poolMaxRaw);
const maxConnections =
  Number.isFinite(poolMax) && poolMax > 0 ? Math.floor(poolMax) : 10;

export function isPoolerUrl(connectionString: string) {
  try {
    const parsed = new URL(connectionString);
    return (
      parsed.hostname.toLowerCase().includes('pooler') ||
      parsed.port === '6543'
    );
  } catch {
    return false;
  }
}

function createSqlClient() {
  const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing POSTGRES_URL or DATABASE_URL');
  }

  const disablePreparedStatements = isPoolerUrl(connectionString);

  return postgres(connectionString, {
    ssl: 'require',
    prepare: disablePreparedStatements ? false : undefined,
    max: maxConnections,
    idle_timeout: 20,
    connect_timeout: 15,
  });
}

export const sql = globalForDb.__latelessSql ?? createSqlClient();

if (!globalForDb.__latelessSql) {
  globalForDb.__latelessSql = sql;
}
