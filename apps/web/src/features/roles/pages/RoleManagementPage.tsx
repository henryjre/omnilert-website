import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import {
  PERMISSIONS,
  PERMISSION_CATEGORIES,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_PREREQUISITES,
  type PermissionKey,
} from '@omnilert/shared';
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

const PERMISSION_NAME_OVERRIDES: Partial<Record<string, string>> = {
  [PERMISSIONS.CASE_REPORT_MANAGE]: 'Manage Case Reports',
  [PERMISSIONS.EMPLOYEE_PROFILES_VIEW]: 'View',
  [PERMISSIONS.SCHEDULE_VIEW]: 'View',
  [PERMISSIONS.SCHEDULE_MANAGE_SHIFT]: 'Manage Shift',
  [PERMISSIONS.SCHEDULE_END_SHIFT]: 'Manage Shift',
  [PERMISSIONS.VIOLATION_NOTICE_MANAGE]: 'Manage Violations',
  [PERMISSIONS.WORKPLACE_RELATIONS_VIEW]: 'View',
  [PERMISSIONS.CASH_REQUESTS_VIEW]: 'View',
};

function isManageShiftPermissionKey(key: string): boolean {
  return key === PERMISSIONS.SCHEDULE_MANAGE_SHIFT || key === PERMISSIONS.SCHEDULE_END_SHIFT;
}

function TogglePill({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
        checked ? 'bg-primary-600' : 'bg-gray-200'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <motion.span
        animate={{ x: checked ? 16 : 2 }}
        transition={{ type: 'spring', stiffness: 700, damping: 30 }}
        className="inline-block h-4 w-4 rounded-full bg-white shadow-sm"
        style={{ marginTop: '2px' }}
      />
    </button>
  );
}

function isEnabledAsPrerequisite(
  permId: string,
  permissionIds: string[],
  permissions: Permission[],
): boolean {
  const perm = permissions.find((p) => p.id === permId);
  if (!perm || !permissionIds.includes(permId)) return false;
  return permissions.some((p) => {
    const prereqKey = PERMISSION_PREREQUISITES[p.key as PermissionKey];
    if (!prereqKey) return false;
    const prereqPerm = permissions.find((pp) => pp.key === prereqKey);
    return prereqPerm?.id === permId && permissionIds.includes(p.id);
  });
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
      const nextPermissions = ((permsRes.data.data || []) as Permission[]).map((permission) => ({
        ...permission,
        name: PERMISSION_NAME_OVERRIDES[permission.key] ?? permission.name,
      }));
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

  const isDirty =
    selectedRole !== null &&
    originalDraft !== null &&
    roleDraft !== null &&
    hasRoleEditorChanges(originalDraft, roleDraft);

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
      const toggledPermission = permissions.find((p) => p.id === permId);
      const linkedManageShiftIds = toggledPermission?.key === PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC
        ? permissions.filter((permission) => isManageShiftPermissionKey(permission.key)).map((permission) => permission.id)
        : [];
      const isEnabling = !prev.permissionIds.includes(permId);
      let nextIds = new Set(prev.permissionIds);

      if (isEnabling) {
        // Walk up the prerequisite chain (enable all prerequisites)
        const toEnable = [permId, ...linkedManageShiftIds];
        while (toEnable.length > 0) {
          const id = toEnable.pop()!;
          nextIds.add(id);
          const perm = permissions.find((p) => p.id === id);
          if (perm) {
            const prereqKey = PERMISSION_PREREQUISITES[perm.key as PermissionKey];
            if (prereqKey) {
              const prereqPerm = permissions.find((p) => p.key === prereqKey);
              if (prereqPerm && !nextIds.has(prereqPerm.id)) {
                toEnable.push(prereqPerm.id);
              }
            }
          }
        }
      } else {
        // Walk down the dependents chain (disable all dependents)
        const toDisable = [permId, ...linkedManageShiftIds];
        while (toDisable.length > 0) {
          const id = toDisable.pop()!;
          nextIds.delete(id);
          const perm = permissions.find((p) => p.id === id);
          if (perm) {
            // Find all permissions that depend on this one
            const dependentKeys = Object.entries(PERMISSION_PREREQUISITES)
              .filter(([, prereqKey]) => prereqKey === perm.key)
              .map(([depKey]) => depKey);
            for (const depKey of dependentKeys) {
              const depPerm = permissions.find((p) => p.key === depKey);
              if (depPerm && nextIds.has(depPerm.id)) {
                toDisable.push(depPerm.id);
              }
            }
          }
        }
      }

      return {
        ...prev,
        permissionIds: [...nextIds].sort((a, b) => a.localeCompare(b)),
      };
    });
  };

  const saveRole = async () => {
    if (!selectedRole || !roleDraft || !originalDraft) return;

    const trimmedName = roleDraft.name.trim();
    const metadataChanged =
      trimmedName !== originalDraft.name ||
      roleDraft.color !== originalDraft.color ||
      roleDraft.priority !== originalDraft.priority;
    const permissionsChanged =
      JSON.stringify([...roleDraft.permissionIds].sort()) !==
      JSON.stringify([...originalDraft.permissionIds].sort());

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
                  {role.is_system && <Badge variant="default">System</Badge>}
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
                  {selectedRole
                    ? 'Edit role settings and permissions.'
                    : 'Select a role to start editing.'}
                </p>
              </div>
              {selectedRole && (
                <div className="flex items-center gap-2">
                  {isDirty && <Badge variant="warning">Unsaved changes</Badge>}
                  <Button
                    size="sm"
                    onClick={saveRole}
                    disabled={
                      editorLoading || savingRole || !roleDraft || !roleDraft.name.trim() || !isDirty
                    }
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
                      onChange={(e) =>
                        setRoleDraft({ ...roleDraft, priority: Number(e.target.value) })
                      }
                      min="0"
                      max="99"
                    />
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Preview
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <div
                        className="h-5 w-5 rounded-full border border-white shadow-sm"
                        style={{ backgroundColor: roleDraft.color }}
                      />
                      <div>
                        <p className="font-medium text-gray-900">
                          {roleDraft.name.trim() || 'Untitled role'}
                        </p>
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
                        <h4 className="mb-2 text-sm font-semibold text-gray-700">
                          {category.label}
                        </h4>
                        <div className="space-y-1">
                          {category.permissions
                            .map((permKey) => {
                              const permission = permissions.find((p) => p.key === permKey);
                              if (!permission) return null;

                              const isChecked = roleDraft.permissionIds.includes(permission.id);
                              const isPrerequisite = isEnabledAsPrerequisite(
                                permission.id,
                                roleDraft.permissionIds,
                                permissions,
                              );
                              return (
                                <div
                                  key={permission.id}
                                  className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-gray-50"
                                >
                                  <div className="mt-0.5 flex-shrink-0">
                                    <TogglePill
                                      checked={isChecked}
                                      onChange={() =>
                                        !isPrerequisite && togglePermission(permission.id)
                                      }
                                      disabled={isPrerequisite}
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium text-gray-800">
                                        {permission.name}
                                      </p>
                                      {isPrerequisite && (
                                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                                          Required
                                        </span>
                                      )}
                                    </div>
                                    {PERMISSION_DESCRIPTIONS[permission.key as PermissionKey] && (
                                      <p className="text-xs text-gray-500">
                                        {PERMISSION_DESCRIPTIONS[permission.key as PermissionKey]}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
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
