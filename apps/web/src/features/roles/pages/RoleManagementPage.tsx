import { useEffect, useState } from 'react';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { PERMISSION_CATEGORIES } from '@omnilert/shared';
import { Plus, Shield, Trash2 } from 'lucide-react';
import { createRoleEditorDraft, hasRoleEditorChanges, type RoleEditorDraft } from './roleEditorState';

interface Role {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  priority: number;
  is_system: boolean;
}

interface Permission {
  id: string;
  name: string;
  key: string;
  category: string;
}

const CATEGORY_NORMALIZATION_ALIASES: Record<string, string> = {
  shift: 'shift',
  shifts: 'shift',
  auth_request: 'auth_request',
  auth_requests: 'auth_request',
  cash_request: 'cash_request',
  cash_requests: 'cash_request',
};

function normalizePermissionCategory(category: string): string {
  return CATEGORY_NORMALIZATION_ALIASES[category] ?? category;
}

function permissionBelongsToCategory(
  permission: Permission,
  categoryKey: string,
  categoryPermissionKeys: string[],
): boolean {
  // Prefer canonical key matching so category renames/build drift cannot hide permissions.
  if (categoryPermissionKeys.includes(permission.key)) return true;
  return normalizePermissionCategory(permission.category) === normalizePermissionCategory(categoryKey);
}

export function RoleManagementPage() {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [originalDraft, setOriginalDraft] = useState<RoleEditorDraft | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleEditorDraft | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', color: '#3498db', priority: 10 });

  const fetchData = async ({
    showLoader = false,
    showErrorToastOnFailure = true,
  }: {
    showLoader?: boolean;
    showErrorToastOnFailure?: boolean;
  } = {}) => {
    if (showLoader) setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get('/roles'),
        api.get('/permissions'),
      ]);
      const nextRoles = (rolesRes.data.data || []) as Role[];
      const nextPermissions = (permsRes.data.data || []) as Permission[];
      setRoles(nextRoles);
      setPermissions(nextPermissions);
      return { roles: nextRoles, permissions: nextPermissions };
    } catch (err: any) {
      if (showErrorToastOnFailure) {
        showErrorToast(err.response?.data?.error || 'Failed to load roles and permissions');
      }
      return null;
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData({ showLoader: true });
  }, []);

  const isDirty = selectedRole !== null
    && originalDraft !== null
    && roleDraft !== null
    && hasRoleEditorChanges(originalDraft, roleDraft);

  const selectRole = async (role: Role) => {
    if (selectedRole?.id === role.id) {
      return;
    }
    if (isDirty && !window.confirm('Discard unsaved changes?')) {
      return;
    }

    setSelectedRole(role);
    setEditorLoading(true);
    try {
      const res = await api.get(`/roles/${role.id}/permissions`);
      const permissionIds = (res.data.data || []).map((permission: Permission) => permission.id);
      const nextDraft = createRoleEditorDraft(role, permissionIds);
      setOriginalDraft(nextDraft);
      setRoleDraft(nextDraft);
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to load role permissions');
      setSelectedRole(null);
      setOriginalDraft(null);
      setRoleDraft(null);
    } finally {
      setEditorLoading(false);
    }
  };

  const togglePermission = (permId: string) => {
    setRoleDraft((prev) => {
      if (!prev) return prev;
      const nextPermissionIds = prev.permissionIds.includes(permId)
        ? prev.permissionIds.filter((id) => id !== permId)
        : [...prev.permissionIds, permId];

      return {
        ...prev,
        permissionIds: nextPermissionIds.sort((a, b) => a.localeCompare(b)),
      };
    });
  };

  const saveRole = async () => {
    if (!selectedRole || !roleDraft || !originalDraft) return;

    const trimmedName = roleDraft.name.trim();
    const metadataChanged = trimmedName !== originalDraft.name
      || roleDraft.color !== originalDraft.color
      || roleDraft.priority !== originalDraft.priority;
    const permissionsChanged = JSON.stringify([...roleDraft.permissionIds].sort())
      !== JSON.stringify([...originalDraft.permissionIds].sort());

    if (!metadataChanged && !permissionsChanged) {
      return;
    }

    setSavingRole(true);
    try {
      if (metadataChanged) {
        await api.put(`/roles/${selectedRole.id}`, {
          name: trimmedName,
          color: roleDraft.color,
          priority: roleDraft.priority,
        });
      }

      if (permissionsChanged) {
        await api.put(`/roles/${selectedRole.id}/permissions`, {
          permissionIds: roleDraft.permissionIds,
        });
      }

      const refreshResult = await fetchData({ showErrorToastOnFailure: false });
      const refreshedRole = refreshResult?.roles.find((role) => role.id === selectedRole.id) ?? {
        ...selectedRole,
        name: trimmedName,
        color: roleDraft.color,
        priority: roleDraft.priority,
      };
      const nextDraft = createRoleEditorDraft(refreshedRole, roleDraft.permissionIds);
      setSelectedRole(refreshedRole);
      setOriginalDraft(nextDraft);
      setRoleDraft(nextDraft);
      showSuccessToast('Role updated successfully.');
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to save role changes');
    } finally {
      setSavingRole(false);
    }
  };

  const createRole = async () => {
    try {
      const permissionIds = roleDraft?.permissionIds.length
        ? roleDraft.permissionIds
        : permissions[0]?.id
          ? [permissions[0].id]
          : [];

      if (permissionIds.length === 0) {
        showErrorToast('No permissions available for new roles.');
        return;
      }

      await api.post('/roles', {
        ...newRole,
        permissionIds,
      });
      setShowCreateForm(false);
      setNewRole({ name: '', color: '#3498db', priority: 10 });
      showSuccessToast('Role created successfully.');
      void fetchData();
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to create role');
    }
  };

  const deleteRole = async (id: string) => {
    if (!confirm('Are you sure you want to delete this role?')) return;
    try {
      await api.delete(`/roles/${id}`);
      if (selectedRole?.id === id) {
        setSelectedRole(null);
        setOriginalDraft(null);
        setRoleDraft(null);
      }
      showSuccessToast('Role deleted successfully.');
      void fetchData();
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to delete role');
    }
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
        <h1 className="text-2xl font-bold text-gray-900">Role Management</h1>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="mr-1 h-4 w-4" />
          New Role
        </Button>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Create New Role</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Name"
              value={newRole.name}
              onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
              placeholder="e.g., Branch Manager"
            />
            <div className="flex gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Color</label>
                <input
                  type="color"
                  value={newRole.color}
                  onChange={(e) => setNewRole({ ...newRole, color: e.target.value })}
                  className="h-10 w-16 cursor-pointer rounded border border-gray-300"
                />
              </div>
              <Input
                label="Priority"
                type="number"
                value={String(newRole.priority)}
                onChange={(e) => setNewRole({ ...newRole, priority: Number(e.target.value) })}
                min="0"
                max="99"
              />
            </div>
            <Button onClick={createRole} disabled={!newRole.name}>
              Create Role
            </Button>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Roles list */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Roles</h2>
          </CardHeader>
          <CardBody className="space-y-2">
            {roles.map((role) => (
              <div
                key={role.id}
                onClick={() => selectRole(role)}
                className={`flex cursor-pointer items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                  selectedRole?.id === role.id
                    ? 'bg-primary-50 ring-1 ring-primary-200'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: role.color || '#gray' }}
                  />
                  <div>
                    <p className="font-medium text-gray-900">{role.name}</p>
                    <p className="text-xs text-gray-500">Priority: {role.priority}</p>
                  </div>
                  {role.is_system && (
                    <Badge variant="default">System</Badge>
                  )}
                </div>
                {!role.is_system && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRole(role.id);
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Permission matrix */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">Role Editor</h2>
                <p className="text-sm text-gray-500">
                  {selectedRole ? 'Edit role settings and permissions.' : 'Select a role to start editing.'}
                </p>
              </div>
              {selectedRole && (
                <div className="flex items-center gap-2">
                  {isDirty && <Badge variant="warning">Unsaved changes</Badge>}
                  <Button
                    size="sm"
                    onClick={saveRole}
                    disabled={editorLoading || savingRole || !roleDraft || !roleDraft.name.trim() || !isDirty}
                  >
                    {savingRole ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            {!selectedRole && (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                Pick a role from the left to edit its name, color, priority, and permissions.
              </div>
            )}

            {selectedRole && editorLoading && (
              <div className="flex justify-center py-12">
                <Spinner size="lg" />
              </div>
            )}

            {selectedRole && !editorLoading && roleDraft && (
              <>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="space-y-4">
                    <Input
                      label="Role Name"
                      value={roleDraft.name}
                      onChange={(e) => setRoleDraft({ ...roleDraft, name: e.target.value })}
                      placeholder="e.g., Branch Manager"
                    />
                    <Input
                      label="Priority"
                      type="number"
                      value={String(roleDraft.priority)}
                      onChange={(e) => setRoleDraft({ ...roleDraft, priority: Number(e.target.value) })}
                      min="0"
                      max="99"
                    />
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Preview</p>
                    <div className="mt-3 flex items-center gap-3">
                      <div
                        className="h-5 w-5 rounded-full border border-white shadow-sm"
                        style={{ backgroundColor: roleDraft.color }}
                      />
                      <div>
                        <p className="font-medium text-gray-900">{roleDraft.name.trim() || 'Untitled role'}</p>
                        <p className="text-xs text-gray-500">Priority: {roleDraft.priority}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      {selectedRole.is_system ? (
                        <Badge variant="info">System role</Badge>
                      ) : (
                        <Badge variant="default">Custom role</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={roleDraft.color}
                      onChange={(e) => setRoleDraft({ ...roleDraft, color: e.target.value })}
                      className="h-10 w-16 cursor-pointer rounded border border-gray-300 bg-white"
                    />
                    <span className="text-sm text-gray-500">{roleDraft.color}</span>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-700">Permissions</h3>
                  </div>
                  <div className="space-y-4">
                    {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => (
                      <div key={key}>
                        <h4 className="mb-2 text-sm font-semibold text-gray-700">{category.label}</h4>
                        <div className="space-y-1">
                          {permissions
                            .filter((permission) =>
                              permissionBelongsToCategory(permission, key, category.permissions),
                            )
                            .map((permission) => (
                              <label
                                key={permission.id}
                                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={roleDraft.permissionIds.includes(permission.id)}
                                  onChange={() => togglePermission(permission.id)}
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-gray-700">{permission.name}</span>
                                <span className="text-xs text-gray-400">({permission.key})</span>
                              </label>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
