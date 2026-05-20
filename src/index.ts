import { config } from 'dotenv';
import { createPool } from 'mysql2/promise';
import { createServer } from 'http';
import { createApp } from './app';
import { ensureAdminAccount } from './modules/admin-bootstrap';

config();

const pool = createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'topicfinder',
  waitForConnections: true,
  connectionLimit: 10,
});

async function checkDb(): Promise<boolean> {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const dbHealthy = await checkDb();
  if (dbHealthy) {
    await ensureAdminAccount(pool);
  }
  const app = createApp({
    dbHealthy,
    pool,
    jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  });

  const port = process.env.PORT || 3001;
  const server = createServer(app);
  (app as any).attachWs(server);
  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });

  setInterval(async () => {
    const healthy = await checkDb();
    // DB status is checked live on each /health request via the createApp option.
    // For production, we'd inject a dynamic health checker.
  }, 30000);

  return server;
}

main().catch(console.error);
