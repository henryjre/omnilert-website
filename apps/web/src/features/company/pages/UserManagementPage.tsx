import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { Plus, Save, X } from 'lucide-react';

type Role = {
  id: string;
  name: string;
  color?: string | null;
};

type AssignmentOptionCompany = {
  id: string;
  name: string;
  slug: string;
  branches: Array<{ id: string; name: string; odoo_branch_id: string }>;
};

type UserItem = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  user_key: string | null;
  employee_number: number | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  roles: Array<{ id: string; name: string; color: string | null }>;
  companies: Array<{ companyId: string; companyName: string; companySlug: string }>;
  companyBranches: Array<{
    companyId: string;
    companyName: string;
    branchId: string;
    branchName: string;
    assignmentType: string;
  }>;
};

type CompanyAssignmentForm = {
  companyId: string;
  branchIds: string[];
};

type CreateForm = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  userKey: string;
  employeeNumber: string;
  roleIds: string[];
  companyAssignments: CompanyAssignmentForm[];
};

const EMPTY_CREATE_FORM: CreateForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  userKey: '',
  employeeNumber: '',
  roleIds: [],
  companyAssignments: [],
};

function groupBranchesByCompany(user: UserItem): CompanyAssignmentForm[] {
  const map = new Map<string, string[]>();
  for (const branch of user.companyBranches) {
    const current = map.get(branch.companyId) ?? [];
    current.push(branch.branchId);
    map.set(branch.companyId, Array.from(new Set(current)));
  }
  return Array.from(map.entries()).map(([companyId, branchIds]) => ({ companyId, branchIds }));
}

function uniqueNames(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function pillsWithOverflow(
  items: string[],
  maxVisible: number,
  color: 'slate' | 'indigo' | 'emerald' = 'slate',
) {
  const visible = items.slice(0, maxVisible);
  const remaining = Math.max(0, items.length - maxVisible);

  const colorClass =
    color === 'indigo'
      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
      : color === 'emerald'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((item) => (
        <span
          key={item}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${colorClass}`}
          title={item}
        >
          {item}
        </span>
      ))}
      {remaining > 0 && (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          +{remaining} more
        </span>
      )}
    </div>
  );
}

export function UserManagementPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [companies, setCompanies] = useState<AssignmentOptionCompany[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);
  const [editCompanyAssignments, setEditCompanyAssignments] = useState<CompanyAssignmentForm[]>([]);
  const [editUserKey, setEditUserKey] = useState('');
  const [editEmployeeNumber, setEditEmployeeNumber] = useState('');

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, optionsRes] = await Promise.all([
        api.get('/users'),
        api.get('/users/assignment-options'),
      ]);
      setUsers(usersRes.data.data || []);
      setRoles(optionsRes.data.data?.roles || []);
      setCompanies(optionsRes.data.data?.companies || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(''), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const roleMap = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const companyMap = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);

  const toggleRole = (
    current: string[],
    set: (next: string[]) => void,
    roleId: string,
  ) => {
    set(current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]);
  };

  const toggleCompany = (
    current: CompanyAssignmentForm[],
    set: (next: CompanyAssignmentForm[]) => void,
    companyId: string,
  ) => {
    const exists = current.find((item) => item.companyId === companyId);
    if (exists) {
      set(current.filter((item) => item.companyId !== companyId));
      return;
    }
    set([...current, { companyId, branchIds: [] }]);
  };

  const toggleBranch = (
    current: CompanyAssignmentForm[],
    set: (next: CompanyAssignmentForm[]) => void,
    companyId: string,
    branchId: string,
  ) => {
    set(
      current.map((item) => {
        if (item.companyId !== companyId) return item;
        return {
          ...item,
          branchIds: item.branchIds.includes(branchId)
            ? item.branchIds.filter((id) => id !== branchId)
            : [...item.branchIds, branchId],
        };
      }),
    );
  };

  const validateAssignments = (assignments: CompanyAssignmentForm[]): string | null => {
    if (assignments.length === 0) return 'Select at least one company assignment.';
    const missingBranches = assignments.find((item) => item.branchIds.length === 0);
    if (missingBranches) {
      const companyName = companies.find((company) => company.id === missingBranches.companyId)?.name ?? 'selected company';
      return `Select at least one branch for ${companyName}.`;
    }
    return null;
  };

  const openPanel = (user: UserItem) => {
    setSelectedUserId(user.id);
    setEditRoleIds(user.roles.map((role) => role.id));
    setEditCompanyAssignments(groupBranchesByCompany(user));
    setEditUserKey(user.user_key || '');
    setEditEmployeeNumber(user.employee_number ? String(user.employee_number) : '');
    setError('');
    setSuccess('');
  };

  const closePanel = () => {
    setSelectedUserId(null);
    setEditRoleIds([]);
    setEditCompanyAssignments([]);
    setEditUserKey('');
    setEditEmployeeNumber('');
  };

  const createUser = async () => {
    setError('');
    setSuccess('');
    const assignmentError = validateAssignments(createForm.companyAssignments);
    if (assignmentError) {
      setError(assignmentError);
      return;
    }
    if (createForm.roleIds.length === 0) {
      setError('Select at least one role.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/users', {
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        userKey: createForm.userKey.trim(),
        employeeNumber: createForm.employeeNumber.trim() ? Number(createForm.employeeNumber) : undefined,
        roleIds: createForm.roleIds,
        companyAssignments: createForm.companyAssignments,
      });
      setCreateForm(EMPTY_CREATE_FORM);
      setShowCreate(false);
      setSuccess('User created.');
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!selectedUser) return;
    setError('');
    setSuccess('');
    const assignmentError = validateAssignments(editCompanyAssignments);
    if (assignmentError) {
      setError(assignmentError);
      return;
    }

    setSaving(true);
    try {
      const updates: Promise<any>[] = [
        api.put(`/users/${selectedUser.id}/roles`, { roleIds: editRoleIds }),
        api.put(`/users/${selectedUser.id}/branches`, { companyAssignments: editCompanyAssignments }),
      ];

      const trimmedUserKey = editUserKey.trim();
      const trimmedEmployeeNumber = editEmployeeNumber.trim();
      if (trimmedUserKey || trimmedEmployeeNumber) {
        updates.push(api.put(`/users/${selectedUser.id}`, {
          userKey: trimmedUserKey || undefined,
          employeeNumber: trimmedEmployeeNumber ? Number(trimmedEmployeeNumber) : undefined,
        }));
      }

      await Promise.all(updates);
      setSuccess('User updated.');
      closePanel();
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const setUserActive = async (userId: string, isActive: boolean) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (isActive) {
        await api.put(`/users/${userId}`, { isActive: true });
      } else {
        await api.delete(`/users/${userId}`);
      }
      setSuccess(isActive ? 'User unarchived.' : 'User archived.');
      if (selectedUserId === userId) closePanel();
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update user status');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (userId: string) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.delete(`/users/${userId}/permanent`);
      setSuccess('User permanently deleted.');
      if (selectedUserId === userId) closePanel();
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <Button onClick={() => setShowCreate((prev) => !prev)}>
            <Plus className="mr-1 h-4 w-4" />
            New User
          </Button>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        {success && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>}

        {showCreate && (
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Create Global User</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="First Name"
                  value={createForm.firstName}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, firstName: e.target.value }))}
                />
                <Input
                  label="Last Name"
                  value={createForm.lastName}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, lastName: e.target.value }))}
                />
              </div>
              <Input
                label="Email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
              />
              <Input
                label="Password"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
              />
              <Input
                label="User Key"
                value={createForm.userKey}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, userKey: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
              <Input
                label="Employee Number (optional)"
                value={createForm.employeeNumber}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, employeeNumber: e.target.value }))}
                placeholder="e.g. 60"
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Roles</label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRole(createForm.roleIds, (next) => setCreateForm((prev) => ({ ...prev, roleIds: next })), role.id)}
                      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                        createForm.roleIds.includes(role.id)
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      style={createForm.roleIds.includes(role.id) ? { backgroundColor: role.color || '#3b82f6' } : {}}
                    >
                      {role.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Company Access and Odoo Employee Branch Targets</label>
                <div className="space-y-3">
                  {companies.map((company) => {
                    const selected = createForm.companyAssignments.find((item) => item.companyId === company.id);
                    return (
                      <div key={company.id} className="rounded-lg border border-gray-200 p-3">
                        <button
                          type="button"
                          onClick={() =>
                            toggleCompany(
                              createForm.companyAssignments,
                              (next) => setCreateForm((prev) => ({ ...prev, companyAssignments: next })),
                              company.id,
                            )
                          }
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            selected ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {company.name}
                        </button>

                        {selected && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {company.branches.map((branch) => (
                              <button
                                key={branch.id}
                                type="button"
                                onClick={() =>
                                  toggleBranch(
                                    createForm.companyAssignments,
                                    (next) => setCreateForm((prev) => ({ ...prev, companyAssignments: next })),
                                    company.id,
                                    branch.id,
                                  )
                                }
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                  selected.branchIds.includes(branch.id)
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {branch.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={createUser} disabled={saving}>
                  {saving ? 'Creating...' : 'Create User'}
                </Button>
                <Button variant="ghost" onClick={() => setShowCreate(false)} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : users.length === 0 ? (
          <Card>
            <CardBody>
              <p className="py-8 text-center text-gray-500">No users found.</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {users.map((user) => {
              const companyNames = uniqueNames(user.companies.map((company) => company.companyName));
              const branchNames = uniqueNames(user.companyBranches.map((branch) => branch.branchName));

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => openPanel(user)}
                  className="w-full text-left"
                >
                  <Card className={`h-full transition-shadow hover:shadow-md ${
                    selectedUserId === user.id ? 'border-primary-300 ring-1 ring-primary-200' : 'border-gray-200'
                  }`}
                  >
                    <CardBody className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-900">
                            {user.first_name} {user.last_name}
                          </p>
                          <p className="truncate text-sm text-gray-600">{user.email}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                        }`}
                        >
                          {user.is_active ? 'Active' : 'Archived'}
                        </span>
                      </div>

                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Roles</p>
                        {user.roles.length > 0
                          ? pillsWithOverflow(user.roles.map((role) => role.name), 4, 'slate')
                          : <p className="text-xs text-gray-500">No roles</p>}
                      </div>

                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Companies</p>
                        {companyNames.length > 0
                          ? pillsWithOverflow(companyNames, 3, 'indigo')
                          : <p className="text-xs text-gray-500">No company access</p>}
                      </div>

                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Odoo Branches</p>
                        {branchNames.length > 0
                          ? pillsWithOverflow(branchNames, 4, 'emerald')
                          : <p className="text-xs text-gray-500">No branch snapshot</p>}
                      </div>

                      <div className="border-t border-gray-100 pt-2 text-xs text-gray-500">
                        Last Login: {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}
                      </div>
                    </CardBody>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={closePanel} />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[620px] transform bg-white shadow-2xl transition-transform duration-300 ${
          selectedUser ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {!selectedUser ? null : (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedUser.first_name} {selectedUser.last_name}
                </h2>
                <p className="text-sm text-gray-600">{selectedUser.email}</p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Current Companies</p>
                {pillsWithOverflow(uniqueNames(selectedUser.companies.map((company) => company.companyName)), 8, 'indigo')}
                <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Current Odoo Branches</p>
                {pillsWithOverflow(uniqueNames(selectedUser.companyBranches.map((branch) => branch.branchName)), 10, 'emerald')}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="User Key"
                  value={editUserKey}
                  onChange={(e) => setEditUserKey(e.target.value)}
                />
                <Input
                  label="Employee Number"
                  value={editEmployeeNumber}
                  onChange={(e) => setEditEmployeeNumber(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Roles</label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRole(editRoleIds, setEditRoleIds, role.id)}
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

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Company Access and Odoo Employee Branch Targets</label>
                <div className="space-y-3">
                  {companies.map((company) => {
                    const selected = editCompanyAssignments.find((item) => item.companyId === company.id);
                    return (
                      <div key={company.id} className="rounded-lg border border-gray-200 bg-white p-3">
                        <button
                          type="button"
                          onClick={() => toggleCompany(editCompanyAssignments, setEditCompanyAssignments, company.id)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            selected ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {company.name}
                        </button>
                        {selected && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {company.branches.map((branch) => (
                              <button
                                key={branch.id}
                                type="button"
                                onClick={() => toggleBranch(editCompanyAssignments, setEditCompanyAssignments, company.id, branch.id)}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                  selected.branchIds.includes(branch.id)
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {branch.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 p-5">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button onClick={saveEdit} disabled={saving}>
                  <Save className="mr-1 h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                {selectedUser.is_active ? (
                  <Button variant="danger" onClick={() => setUserActive(selectedUser.id, false)} disabled={saving}>
                    Archive
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setUserActive(selectedUser.id, true)} disabled={saving}>
                    Unarchive
                  </Button>
                )}
                {!selectedUser.is_active && (
                  <Button
                    variant="danger"
                    onClick={() => deleteUser(selectedUser.id)}
                    disabled={saving}
                    className="sm:col-span-2"
                  >
                    Permanently Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
