import bcrypt from 'bcryptjs';

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const PLACEHOLDER_HASH = '$2b$10$placeholder_change_in_production';

export async function ensureAdminAccount(pool: any) {
  if (!pool) return;

  const [rows] = await pool.query(
    'SELECT id, username, password_hash FROM admins WHERE username = ? LIMIT 1',
    [DEFAULT_ADMIN_USERNAME],
  );

  const admin = (rows as any[])[0];
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);

  if (!admin) {
    await pool.query(
      'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
      [DEFAULT_ADMIN_USERNAME, passwordHash],
    );
    console.warn('[admin-bootstrap] created default admin account: admin/admin123');
    return;
  }

  if (admin.password_hash === PLACEHOLDER_HASH) {
    await pool.query(
      'UPDATE admins SET password_hash = ? WHERE id = ?',
      [passwordHash, admin.id],
    );
    console.warn('[admin-bootstrap] replaced placeholder admin password hash with default admin/admin123');
  }
}
