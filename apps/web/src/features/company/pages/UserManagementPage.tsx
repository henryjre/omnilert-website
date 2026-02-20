import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Badge } from '@/shared/components/ui/Badge';
import { Spinner } from '@/shared/components/ui/Spinner';
import { usePermission } from '@/shared/hooks/usePermission';
import { api } from '@/shared/services/api.client';
import { PERMISSIONS } from '@omnilert/shared';
import { Plus, Pencil, Save, X, Copy, Check, Archive, ArchiveRestore, Trash2 } from 'lucide-react';

type UserFilter = 'all' | 'active' | 'archived';

export function UserManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<UserFilter>('active');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    roleIds: [] as string[],
    branchIds: [] as string[],
  });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);
  const [editBranchIds, setEditBranchIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { hasPermission } = usePermission();
  const canManageUsers = hasPermission(PERMISSIONS.ADMIN_MANAGE_USERS);

  const displayedUsers =
    filter === 'all' ? users
    : filter === 'active' ? users.filter((u) => u.is_active)
    : users.filter((u) => !u.is_active);

  // Bulk action availability
  const selectedUsers = displayedUsers.filter((u) => selectedIds.has(u.id));
  const selectedActive = selectedUsers.filter((u) => u.is_active);
  const selectedArchived = selectedUsers.filter((u) => !u.is_active);
  const canBulkDelete = selectedArchived.length > 0 && selectedActive.length === 0;

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(displayedUsers.map((u) => u.id)));
  };

  const handleLongPressStart = (userId: string) => {
    longPressTimerRef.current = setTimeout(() => {
      setSelectMode(true);
      setSelectedIds(new Set([userId]));
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const copyUserId = (id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedUserId(id);
      setTimeout(() => setCopiedUserId(null), 2000);
    });
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, branchesRes] = await Promise.all([
        api.get('/users'),
        api.get('/roles'),
        api.get('/branches'),
      ]);
      setUsers(usersRes.data.data || []);
      setRoles(rolesRes.data.data || []);
      setBranches(branchesRes.data.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Exit select mode on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') exitSelectMode(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const createUser = async () => {
    await api.post('/users', formData);
    setShowForm(false);
    setFormData({ email: '', password: '', firstName: '', lastName: '', roleIds: [], branchIds: [] });
    fetchData();
  };

  const archiveUser = async (id: string) => {
    await api.delete(`/users/${id}`);
    fetchData();
  };

  const unarchiveUser = async (id: string) => {
    await api.put(`/users/${id}`, { isActive: true });
    fetchData();
  };

  const deleteUser = async (id: string) => {
    setDeleting(true);
    try {
      await api.delete(`/users/${id}/permanent`);
      setDeleteConfirmUserId(null);
      fetchData();
    } finally {
      setDeleting(false);
    }
  };

  // Bulk actions
  const bulkArchive = async () => {
    await Promise.all(selectedActive.map((u) => api.delete(`/users/${u.id}`)));
    exitSelectMode();
    fetchData();
  };

  const bulkUnarchive = async () => {
    await Promise.all(selectedArchived.map((u) => api.put(`/users/${u.id}`, { isActive: true })));
    exitSelectMode();
    fetchData();
  };

  const bulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all(selectedArchived.map((u) => api.delete(`/users/${u.id}/permanent`)));
      setBulkDeleteConfirm(false);
      exitSelectMode();
      fetchData();
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleRole = (roleId: string) => {
    setFormData((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((id) => id !== roleId)
        : [...prev.roleIds, roleId],
    }));
  };

  const toggleBranch = (branchId: string) => {
    setFormData((prev) => ({
      ...prev,
      branchIds: prev.branchIds.includes(branchId)
        ? prev.branchIds.filter((id) => id !== branchId)
        : [...prev.branchIds, branchId],
    }));
  };

  const startEditing = (user: any) => {
    setEditingUserId(user.id);
    setEditRoleIds(user.roles?.map((r: any) => r.id) || []);
    setEditBranchIds(user.branches?.map((b: any) => b.id) || []);
  };

  const cancelEditing = () => {
    setEditingUserId(null);
    setEditRoleIds([]);
    setEditBranchIds([]);
  };

  const saveEditing = async () => {
    if (!editingUserId) return;
    setSaving(true);
    try {
      await Promise.all([
        api.put(`/users/${editingUserId}/roles`, { roleIds: editRoleIds }),
        api.put(`/users/${editingUserId}/branches`, { branchIds: editBranchIds }),
      ]);
      setEditingUserId(null);
      fetchData();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleEditRole = (roleId: string) => {
    setEditRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  };

  const toggleEditBranch = (branchId: string) => {
    setEditBranchIds((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId],
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1 h-4 w-4" />
          New User
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Create New User</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="First Name"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              />
              <Input
                label="Last Name"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <Input
              label="Password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Roles</label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                      formData.roleIds.includes(role.id)
                        ? 'text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    style={formData.roleIds.includes(role.id) ? { backgroundColor: role.color || '#3b82f6' } : {}}
                  >
                    {role.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Branches</label>
              <div className="flex flex-wrap gap-2">
                {branches.map((branch) => (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => toggleBranch(branch.id)}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                      formData.branchIds.includes(branch.id)
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={createUser} disabled={!formData.email || !formData.password || !formData.firstName}>
                Create User
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {(['all', 'active', 'archived'] as UserFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              filter === f ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
          <span className="text-sm font-medium text-primary-800">
            {selectedIds.size} selected
          </span>
          <button
            onClick={selectAll}
            className="text-xs text-primary-600 hover:underline"
          >
            Select all ({displayedUsers.length})
          </button>
          <div className="ml-auto flex items-center gap-2">
            {selectedActive.length > 0 && (
              <Button size="sm" variant="secondary" onClick={bulkArchive}>
                <Archive className="mr-1 h-3.5 w-3.5" />
                Archive ({selectedActive.length})
              </Button>
            )}
            {selectedArchived.length > 0 && selectedActive.length === 0 && (
              <>
                <Button size="sm" variant="secondary" onClick={bulkUnarchive}>
                  <ArchiveRestore className="mr-1 h-3.5 w-3.5" />
                  Unarchive ({selectedArchived.length})
                </Button>
                <Button size="sm" variant="danger" onClick={() => setBulkDeleteConfirm(true)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete ({selectedArchived.length})
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={exitSelectMode}>
              <X className="mr-1 h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Users list */}
      <div className="space-y-3">
        {displayedUsers.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            No {filter === 'all' ? '' : filter} users.
          </p>
        )}
        {displayedUsers.map((user) => {
          const isEditing = editingUserId === user.id;
          const isSelected = selectedIds.has(user.id);
          return (
            <Card
              key={user.id}
              className={`cursor-pointer transition-colors ${isSelected ? 'ring-2 ring-primary-500 bg-primary-50' : 'hover:bg-gray-50'}`}
            >
              <CardBody>
                <div
                  className="flex items-center justify-between select-none"
                  onMouseDown={selectMode ? undefined : () => handleLongPressStart(user.id)}
                  onMouseUp={handleLongPressEnd}
                  onMouseLeave={handleLongPressEnd}
                  onTouchStart={selectMode ? undefined : () => handleLongPressStart(user.id)}
                  onTouchEnd={handleLongPressEnd}
                  onClick={selectMode ? () => toggleSelect(user.id) : undefined}
                >
                    <div className="flex items-center gap-3">
                    {selectMode && (
                      <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                        isSelected ? 'border-primary-600 bg-primary-600' : 'border-gray-300 bg-white'
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                    )}
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt="Profile"
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
                        {user.first_name?.[0]}
                        {user.last_name?.[0]}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">
                        {user.first_name} {user.last_name}
                      </p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditing && !selectMode && (
                      <>
                        {user.roles?.map((role: any) => (
                          <span
                            key={role.id}
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                            style={{ backgroundColor: role.color || '#6b7280' }}
                          >
                            {role.name}
                          </span>
                        ))}
                        {user.branches?.map((branch: any) => (
                          <span
                            key={branch.id}
                            className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600"
                          >
                            {branch.name}
                          </span>
                        ))}
                        <Badge variant={user.is_active ? 'success' : 'default'}>
                          {user.is_active ? 'Active' : 'Archived'}
                        </Badge>
                        {canManageUsers && (
                          <>
                            <button
                              onClick={() => copyUserId(user.id)}
                              title={`Copy user ID: ${user.id}`}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            >
                              {copiedUserId === user.id
                                ? <Check className="h-4 w-4 text-green-500" />
                                : <Copy className="h-4 w-4" />
                              }
                            </button>
                            {user.is_active ? (
                              <button
                                onClick={() => archiveUser(user.id)}
                                title="Archive user"
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                              >
                                <Archive className="h-4 w-4" />
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => unarchiveUser(user.id)}
                                  title="Unarchive user"
                                  className="rounded-lg p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600"
                                >
                                  <ArchiveRestore className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmUserId(user.id)}
                                  title="Delete permanently"
                                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </>
                        )}
                        {hasPermission(PERMISSIONS.ADMIN_MANAGE_ROLES) && (
                          <button
                            onClick={() => startEditing(user)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                    {!isEditing && selectMode && (
                      <Badge variant={user.is_active ? 'success' : 'default'}>
                        {user.is_active ? 'Active' : 'Archived'}
                      </Badge>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Roles</label>
                      <div className="flex flex-wrap gap-2">
                        {roles.map((role) => (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => toggleEditRole(role.id)}
                            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                              editRoleIds.includes(role.id)
                                ? 'text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                            style={editRoleIds.includes(role.id) ? { backgroundColor: role.color || '#3b82f6' } : {}}
                          >
                            {role.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Branches</label>
                      <div className="flex flex-wrap gap-2">
                        {branches.map((branch) => (
                          <button
                            key={branch.id}
                            type="button"
                            onClick={() => toggleEditBranch(branch.id)}
                            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                              editBranchIds.includes(branch.id)
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {branch.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={saveEditing} disabled={saving} size="sm">
                        <Save className="mr-1 h-4 w-4" />
                        {saving ? 'Saving...' : 'Save'}
                      </Button>
                      <Button variant="ghost" onClick={cancelEditing} size="sm">
                        <X className="mr-1 h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Single delete confirmation modal */}
      {deleteConfirmUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Delete User Permanently</h3>
            <p className="mt-2 text-sm text-gray-500">
              This user will be <strong>permanently deleted</strong> and cannot be recovered. Are you sure you want to proceed?
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteConfirmUserId(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => deleteUser(deleteConfirmUserId)} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Delete {selectedArchived.length} Users Permanently</h3>
            <p className="mt-2 text-sm text-gray-500">
              These <strong>{selectedArchived.length} users</strong> will be <strong>permanently deleted</strong> and cannot be recovered. Are you sure?
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setBulkDeleteConfirm(false)} disabled={bulkDeleting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={bulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? 'Deleting...' : `Delete ${selectedArchived.length} Users`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
