const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const pool = require('../db/pool');

const client = jwksClient({
  jwksUri: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`,
  cache: true,
  rateLimit: true,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    callback(err, key?.getPublicKey());
  });
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(
    token,
    getKey,
    {
      issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
      algorithms: ['RS256'],
    },
    async (err, decoded) => {
      if (err) return res.status(401).json({ error: 'Invalid token' });

      // Sync user to FDS DB and read role from DB (not from JWT).
      // Keycloak = identity; FDS DB = authorisation.
      try {
        const existing = await pool.query(
          'SELECT id, role, active FROM users WHERE auth_provider_id = $1',
          [decoded.sub]
        );

        let dbUser;
        if (existing.rows.length === 0) {
          const initials = deriveInitials(decoded.name);
          // Link existing seed row by email, or insert new row
          const result = await pool.query(
            `INSERT INTO users (auth_provider_id, auth_provider, email, full_name, display_name, initials, role, active)
             VALUES ($1, 'keycloak', $2, $3, $3, $4, 'technician', true)
             ON CONFLICT (email) DO UPDATE
               SET auth_provider_id = EXCLUDED.auth_provider_id,
                   auth_provider    = 'keycloak',
                   display_name     = EXCLUDED.display_name,
                   initials         = EXCLUDED.initials,
                   full_name        = COALESCE(users.full_name, EXCLUDED.full_name)
             RETURNING id, role, active`,
            [decoded.sub, decoded.email, decoded.name, initials]
          );
          dbUser = result.rows[0];
        } else {
          dbUser = existing.rows[0];
          await pool.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [dbUser.id]
          );
        }

        if (!dbUser.active) {
          return res.status(403).json({ error: 'Account deactivated' });
        }

        req.user = {
          sub:   decoded.sub,
          email: decoded.email,
          name:  decoded.name,
          id:    dbUser.id,
          roles: [dbUser.role],   // DB role is the source of truth for FDS authz
        };
      } catch (dbErr) {
        return next(dbErr);
      }

      next();
    }
  );
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
