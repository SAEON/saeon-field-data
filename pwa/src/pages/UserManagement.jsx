import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import ProfileButton from '../auth/ProfileSheet.jsx';
import { getUsers, getAvailableKeycloakUsers, createUser, updateUser } from '../services/api.js';

function AppBar({ title }) {
  return (
    <header className="bg-navy h-14 flex items-center px-4 sticky top-0 z-50 shrink-0">
      <div className="w-10" />
      <div className="flex-1 text-center">
        <div className="text-white text-[17px] font-bold">{title}</div>
      </div>
      <ProfileButton />
    </header>
  );
}

function Fab({ label, onPress }) {
  return (
    <button
      onClick={onPress}
      className="fixed flex items-center gap-2 rounded-full bg-navy text-white text-[14px] font-semibold shadow-lg border-none z-40"
      style={{ bottom: 72, right: 16, height: 48, paddingLeft: 20, paddingRight: 20 }}
    >
      <span style={{ fontSize: 22, lineHeight: 1, marginTop: -1 }}>+</span>
      {label}
    </button>
  );
}

function RoleBadge({ role }) {
  const MAP = {
    technician:      { label: 'Technician', bg: '#F5F5F5', color: '#616161' },
    technician_lead: { label: 'Lead',       bg: '#FFF3E0', color: '#E65100' },
    data_manager:    { label: 'Data Mgr',   bg: '#E3F2FD', color: '#1565C0' },
  };
  const s = MAP[role] || { label: role, bg: '#F5F5F5', color: '#757575' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px',
      borderRadius: 4, background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

function InitialsAvatar({ initials, active }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: active ? 'var(--color-navy)' : '#BDBDBD',
      color: 'white', fontSize: 13, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {initials ?? '??'}
    </div>
  );
}

// ── Add user sheet — picks from Keycloak ─────────────────────────────────────
function AddUserSheet({ isLead, onClose, onCreated }) {
  const [candidates, setCandidates] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState(null); // { keycloak_id, email, full_name }
  const [role,       setRole]       = useState('technician');
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    getAvailableKeycloakUsers()
      .then(setCandidates)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = candidates.filter(u => {
    const q = search.toLowerCase();
    return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  async function handleAdd() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const user = await createUser({
        email:     selected.email,
        full_name: selected.full_name,
        role,
      });
      onCreated(user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full h-10 px-3 rounded-xl border border-border bg-white text-[13px] text-text-dark';
  const labelCls = 'text-[11px] font-semibold text-text-light uppercase tracking-wide mb-1';

  return (
    <div className="back-sheet-overlay">
      <div className="back-sheet" style={{ maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
        <div className="text-[15px] font-bold text-text-dark mb-3">Search user</div>

        {/* Search */}
        <input
          className={inputCls + ' mb-3'}
          placeholder="Search by name or email…"
          value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null); }}
          autoFocus
        />

        {/* Candidate list */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 mb-3" style={{ maxHeight: 240 }}>
          {loading && (
            <div className="text-center text-text-light text-[13px] py-6">Loading from Keycloak…</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center text-text-light text-[13px] py-6">
              {search ? 'No matches.' : 'All users are already in FDS.'}
            </div>
          )}
          {!loading && filtered.map(u => (
            <button
              key={u.keycloak_id}
              onClick={() => setSelected(u)}
              className="text-left px-3 py-2.5 rounded-xl border text-[13px] transition-colors"
              style={{
                borderColor: selected?.keycloak_id === u.keycloak_id ? 'var(--color-navy)' : 'var(--color-border)',
                background:  selected?.keycloak_id === u.keycloak_id ? '#EAF0FB' : 'white',
                fontWeight:  selected?.keycloak_id === u.keycloak_id ? 600 : 400,
              }}
            >
              <div className="text-text-dark">{u.full_name}</div>
              <div className="text-[11px] text-text-light">{u.email}</div>
            </button>
          ))}
        </div>

        {/* Role picker — leads locked to technician */}
        {selected && (
          <div className="mb-3">
            <div className={labelCls}>Role in FDS</div>
            {isLead ? (
              <div className="px-3 py-2 rounded-xl bg-surface text-[12px] text-text-light">
                Role will be set to <strong>Technician</strong>. Only a Data Manager can assign elevated roles.
              </div>
            ) : (
              <select className={inputCls} value={role} onChange={e => setRole(e.target.value)}>
                <option value="technician">Technician</option>
                <option value="technician_lead">Technician Lead</option>
                <option value="data_manager">Data Manager</option>
              </select>
            )}
          </div>
        )}

        {error && <div className="text-[12px] text-error mb-3">{error}</div>}

        <div className="flex gap-2.5">
          <button onClick={onClose} disabled={saving}
            className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold">
            Cancel
          </button>
          <button onClick={handleAdd} disabled={!selected || saving}
            className="flex-1 h-12 rounded-xl text-white text-sm font-semibold border-none"
            style={{ background: selected ? 'var(--color-navy)' : '#BDBDBD' }}>
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit role sheet (data_manager only) ─────────────────────────────────────
function EditRoleSheet({ user, onClose, onUpdated }) {
  const [role,   setRole]   = useState(user.role);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  async function handleSave() {
    if (role === user.role) { onClose(); return; }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateUser(user.id, { role });
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full h-10 px-3 rounded-xl border border-border bg-white text-[13px] text-text-dark';
  const labelCls = 'text-[11px] font-semibold text-text-light uppercase tracking-wide mb-1';

  return (
    <div className="back-sheet-overlay">
      <div className="back-sheet">
        <div className="text-[15px] font-bold text-text-dark mb-1">Edit role</div>
        <div className="text-[12px] text-text-light mb-4">{user.full_name ?? user.email}</div>

        <div className={labelCls}>Role</div>
        <select className={inputCls} value={role} onChange={e => setRole(e.target.value)}>
          <option value="technician">Technician</option>
          <option value="technician_lead">Technician Lead</option>
          <option value="data_manager">Data Manager</option>
        </select>

        {error && <div className="text-[12px] text-error mt-3">{error}</div>}

        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} disabled={saving}
            className="flex-1 h-12 border-[1.5px] border-border rounded-xl bg-white text-text-med text-sm font-semibold">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 h-12 rounded-xl bg-navy text-white text-sm font-semibold border-none">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UserManagement() {
  const { id: currentUserId, hasRole } = useAuth() ?? {};
  const isManager = hasRole?.('data_manager') ?? false;
  const isLead    = (hasRole?.('technician_lead') ?? false) && !isManager;

  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [toggling,   setToggling]   = useState(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await getUsers());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggleActive(user) {
    if (isLead && user.role !== 'technician') return;
    setToggling(user.id);
    try {
      const updated = await updateUser(user.id, { active: !user.active });
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    } catch (err) {
      console.error('Toggle failed:', err.message);
    } finally {
      setToggling(null);
    }
  }

  function handleCreated(user) {
    setUsers(prev => [...prev, user]);
  }

  function handleUpdated(updated) {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
  }

  const active   = users.filter(u => u.active);
  const inactive = users.filter(u => !u.active);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <AppBar title="Users" />

      <main className="flex-1 overflow-y-auto w-full max-w-[var(--max-width)] mx-auto pb-24">
        {loading && (
          <div className="flex items-center justify-center h-40 text-text-light text-sm">Loading…</div>
        )}

        {!loading && error && (
          <div className="mx-4 mt-4 p-4 bg-warning-light rounded-xl text-[13px] text-warning">{error}</div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-1 p-4">
            {active.length > 0 && (
              <>
                <div className="text-[11px] font-semibold text-text-light uppercase tracking-wide px-1 mb-1 mt-1">
                  Active · {active.length}
                </div>
                {active.map(user => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isManager={isManager}
                    isLead={isLead}
                    toggling={toggling === user.id}
                    onToggle={() => handleToggleActive(user)}
                    isSelf={user.id === currentUserId}
                    onEditRole={() => setEditTarget(user)}
                  />
                ))}
              </>
            )}

            {inactive.length > 0 && (
              <>
                <div className="text-[11px] font-semibold text-text-light uppercase tracking-wide px-1 mb-1 mt-4">
                  Inactive · {inactive.length}
                </div>
                {inactive.map(user => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isManager={isManager}
                    isLead={isLead}
                    toggling={toggling === user.id}
                    onToggle={() => handleToggleActive(user)}
                    isSelf={user.id === currentUserId}
                    onEditRole={() => setEditTarget(user)}
                  />
                ))}
              </>
            )}

            {users.length === 0 && (
              <div className="text-center text-text-light text-[13px] mt-10">
                No users in FDS yet. Use the button below to add from Keycloak.
              </div>
            )}
          </div>
        )}
      </main>

      <Fab label="Add user" onPress={() => setShowAdd(true)} />

      {showAdd && (
        <AddUserSheet
          isLead={isLead}
          onClose={() => setShowAdd(false)}
          onCreated={handleCreated}
        />
      )}

      {editTarget && (
        <EditRoleSheet
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}

function UserRow({ user, isManager, isLead, isSelf, toggling, onToggle, onEditRole }) {
  const canToggle = (isManager || (isLead && user.role === 'technician')) && !isSelf;

  return (
    <div
      className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{
        border: '1px solid var(--color-border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        opacity: user.active ? 1 : 0.6,
      }}
    >
      <InitialsAvatar initials={user.initials} active={user.active} />

      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-text-dark truncate">{user.full_name ?? user.email}</div>
        <div className="text-[11px] text-text-light truncate">{user.email}</div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <RoleBadge role={user.role} />

        {isManager && !isSelf && (
          <button
            onClick={onEditRole}
            className="h-7 px-2 rounded-lg text-[11px] font-semibold border-none"
            style={{ background: '#EAF0FB', color: 'var(--color-navy)' }}
          >
            Edit
          </button>
        )}

        {canToggle && (
          <div className="flex flex-col items-center gap-0.5">
            <button
              onClick={onToggle}
              disabled={toggling}
              className="relative w-10 h-5 rounded-full transition-colors duration-200 border-none shrink-0"
              style={{ background: user.active ? 'var(--color-navy)' : '#BDBDBD' }}
              aria-label={user.active ? 'Deactivate' : 'Activate'}
              aria-pressed={user.active}
            >
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
                style={{ transform: user.active ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
            <span style={{ fontSize: 9, color: user.active ? 'var(--color-navy)' : '#9E9E9E', fontWeight: 600 }}>
              {user.active ? 'Active' : 'Inactive'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
