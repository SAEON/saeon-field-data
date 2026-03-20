const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// ── Keycloak admin helper ─────────────────────────────────────────────────────

async function getKeycloakAdminToken() {
  const res = await fetch(
    `${process.env.KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:  'admin-cli',
        grant_type: 'password',
        username:   process.env.KC_ADMIN_USER,
        password:   process.env.KC_ADMIN_PASSWORD,
      }),
    }
  );
  if (!res.ok) throw new Error('Failed to obtain Keycloak admin token');
  const data = await res.json();
  return data.access_token;
}

// =============================================================
// GET /api/users/available
// Returns Keycloak users in the realm who are NOT yet in FDS.
// Used by the "Add user" picker in the dashboard.
// =============================================================
router.get('/available', requireRole('technician_lead', 'data_manager'), async (req, res, next) => {
  try {
    const token = await getKeycloakAdminToken();

    const kcRes = await fetch(
      `${process.env.KEYCLOAK_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users?max=200&enabled=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!kcRes.ok) throw new Error('Failed to fetch users from Keycloak');
    const kcUsers = await kcRes.json();

    // Get emails already in FDS
    const existing = await db.getAllUsers();
    const existingEmails = new Set(existing.map(u => u.email?.toLowerCase()));

    const available = kcUsers
      .filter(u => u.email && !existingEmails.has(u.email.toLowerCase()))
      .map(u => ({
        keycloak_id: u.id,
        email:       u.email,
        full_name:   [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    res.json(available);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// GET /api/users/me  — current authenticated user's FDS profile
// =============================================================
router.get('/me', async (req, res, next) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { id, email, full_name, display_name, initials, role, active } = user;
    res.json({ id, email, full_name, display_name, initials, role, active });
  } catch (err) {
    next(err);
  }
});

// =============================================================
// GET /api/users
// Sue sees technicians only. Marc sees all.
// =============================================================
router.get('/', requireRole('technician_lead', 'data_manager'), async (req, res, next) => {
  try {
    const isSue = req.user.roles.includes('technician_lead') && !req.user.roles.includes('data_manager');
    const role  = isSue ? 'technician' : undefined;
    const users = await db.getAllUsers({ role });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// POST /api/users
// Sue: can only create role=technician.
// Marc: can assign any role.
// =============================================================
router.post('/', requireRole('technician_lead', 'data_manager'), async (req, res, next) => {
  try {
    const { email, full_name, role } = req.body;

    if (!email || !full_name || !role) {
      return res.status(400).json({ error: 'email, full_name, and role are required' });
    }

    const VALID_ROLES = ['technician', 'technician_lead', 'data_manager'];
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    // Sue can only create technician accounts
    const isSue = req.user.roles.includes('technician_lead') && !req.user.roles.includes('data_manager');
    if (isSue && role !== 'technician') {
      return res.status(403).json({ error: 'Technician leads can only create technician accounts' });
    }

    // Compute initials from full_name (first letter of first + last word)
    const parts    = full_name.trim().split(/\s+/).filter(Boolean);
    const initials = ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();

    const user = await db.createUser({ email, fullName: full_name, initials, role });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A user with that email already exists' });
    next(err);
  }
});

// =============================================================
// PATCH /api/users/:id
// Sue: can only set active=false on technicians (deactivate).
// Marc: can update role or active on any user.
// =============================================================
router.patch('/:id', requireRole('technician_lead', 'data_manager'), async (req, res, next) => {
  try {
    const id     = parseInt(req.params.id, 10);
    const target = await db.getUserById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const { role, active } = req.body;

    const isSue = req.user.roles.includes('technician_lead') && !req.user.roles.includes('data_manager');
    if (isSue) {
      // Sue can only deactivate technicians — no role changes, no editing elevated accounts
      if (target.role !== 'technician') {
        return res.status(403).json({ error: 'Technician leads can only manage technician accounts' });
      }
      if (role !== undefined) {
        return res.status(403).json({ error: 'Technician leads cannot change user roles' });
      }
      if (active === undefined) {
        return res.status(400).json({ error: 'active is required' });
      }
    }

    const updated = await db.updateUser(id, { role, active });
    if (!updated) return res.status(400).json({ error: 'No valid fields to update' });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
