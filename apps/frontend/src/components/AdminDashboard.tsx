'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  type AuditLogEntry,
  type DockMetricRow,
  type Role,
  type User,
  type UserMetricRow,
  type UserRole,
  assignRole,
  createRole,
  deleteRole,
  fetchAuditLog,
  fetchDockMetrics,
  fetchReportMetrics,
  fetchRoles,
  fetchUsers,
  setUserRole,
  unassignRole,
} from '@/lib/api';

type Period = 'week' | 'month' | 'year';
type Tab = 'users' | 'roles' | 'metrics' | 'dock' | 'audit';

// Dark-mode categorical palette, fixed order (never cycled/reassigned) - see
// the dataviz skill's references/palette.md for the validation behind this
// exact ordering and hex set. These are data-identity colors, not UI chrome,
// so they stay separate from the term-* theme tokens.
const SERIES_COLORS = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
];
const MAX_SERIES = SERIES_COLORS.length;

function formatBucket(iso: string, period: Period) {
  const d = new Date(iso);
  if (period === 'week') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (period === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  return d.getFullYear().toString();
}

const ACTION_LABELS: Record<string, string> = {
  'user.role_changed': 'changed role of',
  'channel.created': 'created channel',
  'message.deleted': 'deleted a message in',
  'bot.created': 'created bot',
  'bot.deleted': 'deleted bot',
  'role.created': 'created role',
  'role.deleted': 'deleted role',
  'role.assigned': 'assigned role',
  'role.unassigned': 'unassigned role',
  'channel.announcement_mode': 'toggled announcement mode on',
};

function describeAuditEntry(entry: AuditLogEntry): string {
  const actor = entry.actor?.displayName ?? 'System';
  const label = ACTION_LABELS[entry.action] ?? entry.action;
  const meta = entry.metadata;
  const subject = (meta?.name as string) ?? (meta?.username as string) ?? entry.targetId ?? '';
  return `${actor} ${label} ${subject}`.trim();
}

function PeriodTabs({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs">
      {(['week', 'month', 'year'] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`rounded px-2 py-1 ${
            period === p ? 'bg-term-green-dim text-term-bg' : 'text-term-muted hover:bg-term-input'
          }`}
        >
          {p === 'week' ? 'Weekly' : p === 'month' ? 'Monthly' : 'Yearly'}
        </button>
      ))}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  async function handleRoleChange(userId: string, role: UserRole) {
    setError(null);
    try {
      const updated = await setUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: updated.role } : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  }

  if (loading) return <p className="text-xs text-term-muted">Loading…</p>;

  return (
    <div className="overflow-auto">
      {error && <p className="mb-2 text-xs text-term-red">{error}</p>}
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-term-muted">
            <th className="py-1 pr-3">Username</th>
            <th className="py-1 pr-3">Display name</th>
            <th className="py-1 pr-3">Status</th>
            <th className="py-1 pr-3">Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-term-line">
              <td className="py-1.5 pr-3 text-term-green-bright">{u.username}</td>
              <td className="py-1.5 pr-3 text-term-green-bright">{u.displayName}</td>
              <td className="py-1.5 pr-3 text-term-muted">{u.status}</td>
              <td className="py-1.5 pr-3">
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                  className="rounded border border-term-line bg-term-input px-1.5 py-1 text-xs text-term-green-bright outline-none focus:border-term-green"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="MOD">MOD</option>
                  <option value="MEMBER">MEMBER</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchRoles(), fetchUsers()])
      .then(([roles, users]) => {
        setRoles(roles);
        setUsers(users);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setError(null);
    try {
      const role = await createRole(newRoleName.trim());
      setRoles((prev) => [...prev, role]);
      setNewRoleName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role');
    }
  }

  async function handleDelete(roleId: string) {
    setError(null);
    try {
      await deleteRole(roleId);
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete role');
    }
  }

  async function handleToggleMember(role: Role, userId: string) {
    setError(null);
    const isAssigned = role.userIds.includes(userId);
    try {
      if (isAssigned) {
        await unassignRole(role.id, userId);
      } else {
        await assignRole(role.id, userId);
      }
      setRoles((prev) =>
        prev.map((r) =>
          r.id === role.id
            ? { ...r, userIds: isAssigned ? r.userIds.filter((id) => id !== userId) : [...r.userIds, userId] }
            : r,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role membership');
    }
  }

  if (loading) return <p className="text-xs text-term-muted">Loading…</p>;

  return (
    <div className="overflow-auto">
      {error && <p className="mb-2 text-xs text-term-red">{error}</p>}

      <form onSubmit={handleCreate} className="mb-3 flex gap-2">
        <input
          value={newRoleName}
          onChange={(e) => setNewRoleName(e.target.value)}
          placeholder="New role name"
          className="flex-1 rounded border border-term-line bg-term-input px-2 py-1 text-xs text-term-green-bright outline-none focus:border-term-green"
        />
        <button
          type="submit"
          className="rounded bg-term-green-dim px-3 py-1 text-xs font-medium text-term-bg hover:bg-term-green"
        >
          + Create
        </button>
      </form>

      {roles.length === 0 && <p className="text-xs text-term-muted">No roles yet.</p>}

      <div className="space-y-2">
        {roles.map((role) => (
          <div key={role.id} className="rounded border border-term-line">
            <div className="flex items-center justify-between px-3 py-2 text-xs">
              <button
                onClick={() => setExpandedRoleId(expandedRoleId === role.id ? null : role.id)}
                className="text-left text-term-green-bright hover:text-term-green"
              >
                {role.name} <span className="text-term-muted">({role.userIds.length})</span>
              </button>
              <button onClick={() => handleDelete(role.id)} className="text-term-red hover:opacity-80">
                Delete
              </button>
            </div>
            {expandedRoleId === role.id && (
              <div className="max-h-40 space-y-0.5 overflow-y-auto border-t border-term-line p-2">
                {users.map((user) => (
                  <label key={user.id} className="flex items-center gap-1.5 px-1 text-[11px] text-term-muted">
                    <input
                      type="checkbox"
                      checked={role.userIds.includes(user.id)}
                      onChange={() => handleToggleMember(role, user.id)}
                    />
                    {user.displayName}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricsTab() {
  const [period, setPeriod] = useState<Period>('week');
  const [rows, setRows] = useState<UserMetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<{ bucketIndex: number; x: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchReportMetrics(period)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [period]);

  const { buckets, series, maxValue } = useMemo(() => {
    const bucketSet = Array.from(new Set(rows.map((r) => r.bucket))).sort();
    const totalsByUser = new Map<string, { displayName: string; total: number }>();
    for (const r of rows) {
      const existing = totalsByUser.get(r.userId);
      totalsByUser.set(r.userId, {
        displayName: r.displayName,
        total: (existing?.total ?? 0) + r.messageCount,
      });
    }
    const topUserIds = Array.from(totalsByUser.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, MAX_SERIES)
      .map(([id]) => id);

    const seriesList = topUserIds.map((userId, i) => {
      const displayName = totalsByUser.get(userId)!.displayName;
      const values = bucketSet.map(
        (b) => rows.find((r) => r.userId === userId && r.bucket === b)?.messageCount ?? 0,
      );
      return { userId, displayName, color: SERIES_COLORS[i], values };
    });

    const max = Math.max(1, ...seriesList.flatMap((s) => s.values));
    return { buckets: bucketSet, series: seriesList, maxValue: max };
  }, [rows]);

  const width = 640;
  const height = 220;
  const padding = { top: 12, right: 12, bottom: 24, left: 32 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  function xFor(i: number) {
    return buckets.length <= 1 ? plotWidth / 2 : (i / (buckets.length - 1)) * plotWidth;
  }
  function yFor(v: number) {
    return plotHeight - (v / maxValue) * plotHeight;
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-xs">
        <PeriodTabs period={period} onChange={setPeriod} />
        <button
          onClick={() => setShowTable((v) => !v)}
          className="ml-auto rounded px-2 py-1 text-term-muted hover:bg-term-input"
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {loading && <p className="text-xs text-term-muted">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-xs text-term-muted">No message activity in this period yet.</p>
      )}

      {!loading && rows.length > 0 && !showTable && (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full" onMouseLeave={() => setHover(null)}>
            <g transform={`translate(${padding.left},${padding.top})`}>
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <line
                  key={t}
                  x1={0}
                  x2={plotWidth}
                  y1={plotHeight * (1 - t)}
                  y2={plotHeight * (1 - t)}
                  stroke="#16401f"
                  strokeWidth={1}
                />
              ))}

              {series.map((s) => {
                const points = s.values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ');
                return (
                  <polyline
                    key={s.userId}
                    points={points}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}

              {buckets.map((_, i) => (
                <rect
                  key={i}
                  x={xFor(i) - plotWidth / Math.max(buckets.length, 1) / 2}
                  y={0}
                  width={plotWidth / Math.max(buckets.length, 1)}
                  height={plotHeight}
                  fill="transparent"
                  onMouseEnter={() => setHover({ bucketIndex: i, x: xFor(i) })}
                />
              ))}
              {hover && (
                <line
                  x1={hover.x}
                  x2={hover.x}
                  y1={0}
                  y2={plotHeight}
                  stroke="#5fae78"
                  strokeWidth={1}
                  strokeDasharray="2,2"
                />
              )}

              {buckets.map((b, i) =>
                buckets.length <= 8 || i % Math.ceil(buckets.length / 8) === 0 ? (
                  <text
                    key={b}
                    x={xFor(i)}
                    y={plotHeight + 16}
                    textAnchor="middle"
                    className="fill-term-muted"
                    fontSize={10}
                  >
                    {formatBucket(b, period)}
                  </text>
                ) : null,
              )}
            </g>
          </svg>

          {hover && (
            <div className="mt-1 rounded border border-term-line bg-term-input p-2 text-xs">
              <p className="mb-1 font-medium text-term-green-bright">
                {formatBucket(buckets[hover.bucketIndex], period)}
              </p>
              {series.map((s) => (
                <div key={s.userId} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-term-muted">{s.displayName}:</span>
                  <span className="text-term-green-bright">{s.values[hover.bucketIndex]}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-3">
            {series.map((s) => (
              <span key={s.userId} className="flex items-center gap-1.5 text-xs text-term-muted">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.displayName}
              </span>
            ))}
          </div>
        </div>
      )}

      {!loading && rows.length > 0 && showTable && (
        <div className="overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-term-muted">
                <th className="py-1 pr-3">Period</th>
                {series.map((s) => (
                  <th key={s.userId} className="py-1 pr-3">
                    {s.displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={b} className="border-t border-term-line">
                  <td className="py-1 pr-3 text-term-muted">{formatBucket(b, period)}</td>
                  {series.map((s) => (
                    <td key={s.userId} className="py-1 pr-3 text-term-green-bright">
                      {s.values[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function DockTab() {
  const [period, setPeriod] = useState<Period>('week');
  const [rows, setRows] = useState<DockMetricRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDockMetrics(period)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [period]);

  const buckets = useMemo(() => Array.from(new Set(rows.map((r) => r.bucket))).sort(), [rows]);

  function totalFor(bucket: string, direction: 'IN' | 'OUT', unitType: 'BIN' | 'PALLET') {
    return rows
      .filter((r) => r.bucket === bucket && r.direction === direction && r.unitType === unitType)
      .reduce((sum, r) => sum + r.totalQuantity, 0);
  }

  return (
    <>
      <PeriodTabs period={period} onChange={setPeriod} />

      {loading && <p className="text-xs text-term-muted">Loading…</p>}
      {!loading && buckets.length === 0 && (
        <p className="text-xs text-term-muted">No dock activity logged yet. Use !in / !out in a channel.</p>
      )}

      {!loading && buckets.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-term-muted">
                <th className="py-1 pr-3">Period</th>
                <th className="py-1 pr-3">In (bins)</th>
                <th className="py-1 pr-3">In (pallets)</th>
                <th className="py-1 pr-3">Out (pallets)</th>
                <th className="py-1 pr-3">Out (bins)</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b} className="border-t border-term-line">
                  <td className="py-1 pr-3 text-term-muted">{formatBucket(b, period)}</td>
                  <td className="py-1 pr-3 text-term-green-bright">{totalFor(b, 'IN', 'BIN')}</td>
                  <td className="py-1 pr-3 text-term-green-bright">{totalFor(b, 'IN', 'PALLET')}</td>
                  <td className="py-1 pr-3 text-term-green-bright">{totalFor(b, 'OUT', 'PALLET')}</td>
                  <td className="py-1 pr-3 text-term-green-bright">{totalFor(b, 'OUT', 'BIN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLog()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-1 overflow-y-auto">
      {loading && <p className="text-xs text-term-muted">Loading…</p>}
      {!loading && entries.length === 0 && <p className="text-xs text-term-muted">No audit events yet.</p>}
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center justify-between rounded border border-term-line px-3 py-2 text-xs"
        >
          <span className="text-term-green-bright">{describeAuditEntry(entry)}</span>
          <span className="shrink-0 pl-3 text-term-muted">{new Date(entry.createdAt).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export function AdminDashboard({
  currentUserRole,
  onClose,
}: {
  currentUserRole: UserRole | undefined;
  onClose: () => void;
}) {
  const isAdmin = currentUserRole === 'ADMIN';
  const tabs: { id: Tab; label: string }[] = [
    ...(isAdmin ? ([{ id: 'users', label: 'USERS' }] as const) : []),
    ...(isAdmin ? ([{ id: 'roles', label: 'ROLES' }] as const) : []),
    { id: 'metrics', label: 'METRICS' },
    { id: 'dock', label: 'DOCK' },
    ...(isAdmin ? ([{ id: 'audit', label: 'AUDIT_LOG' }] as const) : []),
  ];
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0].id);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-term-overlay p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded border border-term-line bg-term-panel p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-term-green-bright">&gt; ADMIN_DASHBOARD</h2>
          <button onClick={onClose} className="text-term-muted hover:text-term-green-bright">
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded border px-2 py-1 ${
                activeTab === tab.id
                  ? 'border-term-green bg-term-green-dim text-term-bg'
                  : 'border-term-line text-term-muted hover:border-term-green-dim'
              }`}
            >
              [{i + 1}] {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {activeTab === 'users' && isAdmin && <UsersTab />}
          {activeTab === 'roles' && isAdmin && <RolesTab />}
          {activeTab === 'metrics' && <MetricsTab />}
          {activeTab === 'dock' && <DockTab />}
          {activeTab === 'audit' && isAdmin && <AuditTab />}
        </div>
      </div>
    </div>
  );
}
