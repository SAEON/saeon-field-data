const pool = require('../db/pool');

async function requireAuth(req, res, next) {
  const cookie = req.headers.cookie;
  if (!cookie) return res.status(401).json({ error: 'No session' });

  let identity;
  try {
    const resp = await fetch(`${process.env.KRATOS_PUBLIC_URL}/sessions/whoami`, {
      headers: { Cookie: cookie },
    });
    if (!resp.ok) return res.status(401).json({ error: 'Invalid or expired session' });
    ({ identity } = await resp.json());
  } catch {
    return res.status(401).json({ error: 'Auth service unreachable' });
  }

  const { id: kratosId, traits } = identity;
  const { email, name, role: kratosRole } = traits;

  try {
    const existing = await pool.query(
      'SELECT id, role, active FROM users WHERE auth_provider_id = $1',
      [kratosId]
    );

    let dbUser;
    if (existing.rows.length === 0) {
      const initials = deriveInitials(name);
      const VALID_ROLES = ['technician', 'technician_lead', 'data_manager'];
      const initialRole = VALID_ROLES.includes(kratosRole) ? kratosRole : 'technician';
      const result = await pool.query(
        `INSERT INTO users (auth_provider_id, auth_provider, email, full_name, display_name, initials, role, active)
         VALUES ($1, 'kratos', $2, $3, $3, $4, $5, true)
         ON CONFLICT (email) DO UPDATE
           SET auth_provider_id = EXCLUDED.auth_provider_id,
               auth_provider    = 'kratos',
               display_name     = EXCLUDED.display_name,
               initials         = EXCLUDED.initials,
               full_name        = COALESCE(users.full_name, EXCLUDED.full_name)
         RETURNING id, role, active`,
        [kratosId, email, name, initials, initialRole]
      );
      dbUser = result.rows[0];
    } else {
      dbUser = existing.rows[0];
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [dbUser.id]);
    }

    if (!dbUser.active) {
      return res.status(403).json({ error: 'Account deactivated' });
    }

    req.user = {
      sub:   kratosId,
      email,
      name,
      id:    dbUser.id,
      roles: [dbUser.role],
    };
  } catch (dbErr) {
    return next(dbErr);
  }

  next();
}

const ROLE_HIERARCHY = {
  technician:      1,
  technician_lead: 2,
  data_manager:    3,
};

function requireRole(minimumRole) {
  const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? 99;
  return (req, res, next) => {
    const userLevel = ROLE_HIERARCHY[req.user?.roles?.[0]] ?? 0;
    if (userLevel >= requiredLevel) return next();
    return res.status(403).json({ error: 'Insufficient role' });
  };
}

function deriveInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

module.exports = { requireAuth, requireRole, ROLE_HIERARCHY };
