import { useEffect, useState } from 'react';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { PERMISSION_CATEGORIES } from '@omnilert/shared';
import { Plus, Shield, Trash2 } from 'lucide-react';

export function RoleManagementPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', color: '#3498db', priority: 10 });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get('/roles'),
        api.get('/permissions'),
      ]);
      setRoles(rolesRes.data.data || []);
      setPermissions(permsRes.data.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const selectRole = async (role: any) => {
    setSelectedRole(role);
    const res = await api.get(`/roles/${role.id}/permissions`);
    setRolePermissions((res.data.data || []).map((p: any) => p.id));
  };

  const togglePermission = (permId: string) => {
    setRolePermissions((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId],
    );
  };

  const savePermissions = async () => {
    if (!selectedRole) return;
    await api.put(`/roles/${selectedRole.id}/permissions`, {
      permissionIds: rolePermissions,
    });
    fetchData();
  };

  const createRole = async () => {
    // Need at least one permission
    await api.post('/roles', {
      ...newRole,
      permissionIds: rolePermissions.length > 0 ? rolePermissions : [permissions[0]?.id],
    });
    setShowCreateForm(false);
    setNewRole({ name: '', color: '#3498db', priority: 10 });
    fetchData();
  };

  const deleteRole = async (id: string) => {
    if (!confirm('Are you sure you want to delete this role?')) return;
    await api.delete(`/roles/${id}`);
    if (selectedRole?.id === id) setSelectedRole(null);
    fetchData();
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
        {selectedRole && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">
                  Permissions for{' '}
                  <span style={{ color: selectedRole.color }}>{selectedRole.name}</span>
                </h2>
                <Button size="sm" onClick={savePermissions}>
                  Save
                </Button>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => (
                <div key={key}>
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">{category.label}</h3>
                  <div className="space-y-1">
                    {permissions
                      .filter((p: any) => p.category === key)
                      .map((perm: any) => (
                        <label
                          key={perm.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={rolePermissions.includes(perm.id)}
                            onChange={() => togglePermission(perm.id)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">{perm.name}</span>
                          <span className="text-xs text-gray-400">({perm.key})</span>
                        </label>
                      ))}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
