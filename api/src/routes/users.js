const express = require('express');
const router  = express.Router();
const db      = require('../db/queries');
const { requireAuth, requireRole, ROLE_HIERARCHY } = require('../middleware/auth');

router.use(requireAuth);

const VALID_ROLES  = ['technician', 'technician_lead', 'data_manager'];
const DEPARTMENTS  = ['EFTEON', 'GFW', 'SMCRI'];

// ── Kratos admin helper ───────────────────────────────────────────────────────

async function kratosAdminFetch(path, options = {}) {
  const url = `${process.env.KRATOS_ADMIN_URL}${path}`;
  const res  = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  return res;
}

// =============================================================
// GET /api/users/available
// Returns Kratos identities that are not yet in FDS.
// =============================================================
router.get('/available', requireRole('technician_lead'), async (req, res, next) => {
  try {
    const kratosRes = await kratosAdminFetch('/admin/identities?page_size=200');
    if (!kratosRes.ok) throw new Error('Failed to fetch identities from auth service');
    const identities = await kratosRes.json();

    const existing      = await db.getAllUsers();
    const existingEmails = new Set(existing.map(u => u.email?.toLowerCase()));

    const available = identities
      .filter(i => i.state === 'active' && i.traits?.email && !existingEmails.has(i.traits.email.toLowerCase()))
      .map(i => ({
        kratos_id: i.id,
        email:     i.traits.email,
        full_name: i.traits.name || i.traits.email,
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
    const { id, email, full_name, display_name, initials, role, department, active, password_change_required } = user;
    res.json({ id, email, full_name, display_name, initials, role, department, active, password_change_required: !!password_change_required });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/me/password-changed — clear the forced-change flag after user sets new password
router.post('/me/password-changed', async (req, res, next) => {
  try {
    await db.clearPasswordChangeRequired(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// =============================================================
// GET /api/users
// Leads see technicians only. Managers see all roles.
// =============================================================
router.get('/', requireRole('technician_lead'), async (req, res, next) => {
  try {
    const callerLevel = ROLE_HIERARCHY[req.user.roles[0]] ?? 0;
    const role = callerLevel < ROLE_HIERARCHY['data_manager'] ? 'technician' : undefined;
    const users = await db.getAllUsers({ role });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// =============================================================
// POST /api/users
// Creates the Kratos identity first, then the FDS DB row.
// Rolls back the Kratos identity if the DB insert fails.
// =============================================================
router.post('/', requireRole('technician_lead'), async (req, res, next) => {
  try {
    const { email, full_name, role, department, password } = req.body;

    if (!email || !full_name || !role || !password) {
      return res.status(400).json({ error: 'email, full_name, role, and password are required' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    if (!department || !DEPARTMENTS.includes(department)) {
      return res.status(400).json({ error: `department must be one of: ${DEPARTMENTS.join(', ')}` });
    }

    // Leads can only create accounts strictly below their own level
    const callerLevel   = ROLE_HIERARCHY[req.user.roles[0]] ?? 0;
    const targetLevel   = ROLE_HIERARCHY[role] ?? 0;
    const maxManageable = callerLevel === ROLE_HIERARCHY['data_manager'] ? callerLevel : callerLevel - 1;
    if (targetLevel > maxManageable) {
      return res.status(403).json({ error: 'Cannot create a user with this role' });
    }

    // 1. Create identity in Kratos
    const kratosRes = await kratosAdminFetch('/admin/identities', {
      method: 'POST',
      body: JSON.stringify({
        schema_id:   'fds-identity',
        traits:      { email, name: full_name, role },
        credentials: { password: { config: { password } } },
      }),
    });

    if (!kratosRes.ok) {
      const body = await kratosRes.json().catch(() => ({}));
      const msg  = body?.error?.message ?? body?.ui?.messages?.[0]?.text ?? 'Failed to create identity in auth service';
      return res.status(kratosRes.status === 409 ? 409 : 400).json({ error: msg });
    }

    const identity = await kratosRes.json();

    // 2. Insert into FDS DB — rollback Kratos identity on failure
    const parts    = full_name.trim().split(/\s+/).filter(Boolean);
    const initials = ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();

    try {
      const user = await db.createUser({
        email,
        fullName:       full_name,
        initials,
        role,
        department,
        authProviderId: identity.id,
      });
      res.status(201).json(user);
    } catch (dbErr) {
      // Rollback: remove the Kratos identity so it doesn't become an orphan
      await kratosAdminFetch(`/admin/identities/${identity.id}`, { method: 'DELETE' }).catch(() => {});
      if (dbErr.code === '23505') return res.status(409).json({ error: 'A user with that email already exists' });
      throw dbErr;
    }
  } catch (err) {
    next(err);
  }
});

// =============================================================
// PATCH /api/users/:id
// Leads: can only toggle active on technician accounts.
// Managers: can update role or active on any user.
// =============================================================
router.patch('/:id', requireRole('technician_lead'), async (req, res, next) => {
  try {
    const id     = parseInt(req.params.id, 10);
    const target = await db.getUserById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const { role, active, department } = req.body;

    const callerLevel   = ROLE_HIERARCHY[req.user.roles[0]] ?? 0;
    const targetLevel   = ROLE_HIERARCHY[target.role] ?? 0;
    const maxManageable = callerLevel === ROLE_HIERARCHY['data_manager'] ? callerLevel : callerLevel - 1;
    if (targetLevel > maxManageable) {
      return res.status(403).json({ error: 'Cannot manage this account' });
    }
    if (callerLevel < ROLE_HIERARCHY['data_manager']) {
      if (role !== undefined) return res.status(403).json({ error: 'Cannot change user roles' });
      if (active === undefined) return res.status(400).json({ error: 'active is required' });
    }
    if (department !== undefined && !DEPARTMENTS.includes(department)) {
      return res.status(400).json({ error: `department must be one of: ${DEPARTMENTS.join(', ')}` });
    }

    const updated = await db.updateUser(id, { role, active, department });
    if (!updated) return res.status(400).json({ error: 'No valid fields to update' });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
