import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { Building2, Pencil, Plus, Users } from 'lucide-react';
import { api } from '@/shared/services/api.client';

interface MemberOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
}

interface Department {
  id: string;
  name: string;
  head_user_id: string | null;
  head: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  member_count: number;
  members: MemberOption[];
}

type DepartmentForm = {
  name: string;
  headUserId: string | null;
  memberUserIds: string[];
};

const INITIAL_FORM: DepartmentForm = {
  name: '',
  headUserId: null,
  memberUserIds: [],
};

function getFullName(user: { first_name: string | null; last_name: string | null }) {
  return `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Unnamed User';
}

export function DepartmentManagementPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [form, setForm] = useState<DepartmentForm>(INITIAL_FORM);

  const selectedMembers = useMemo(
    () => members.filter((member) => form.memberUserIds.includes(member.id)),
    [members, form.memberUserIds],
  );

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [departmentsRes, membersRes] = await Promise.all([
        api.get('/departments'),
        api.get('/departments/options/members'),
      ]);
      setDepartments(departmentsRes.data.data || []);
      setMembers(membersRes.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setEditingDepartmentId(null);
    setForm(INITIAL_FORM);
    setShowForm(false);
  };

  const startCreate = () => {
    setError('');
    setSuccess('');
    setEditingDepartmentId(null);
    setForm(INITIAL_FORM);
    setShowForm(true);
  };

  const startEdit = (department: Department) => {
    setError('');
    setSuccess('');
    setEditingDepartmentId(department.id);
    setForm({
      name: department.name,
      headUserId: department.head_user_id,
      memberUserIds: department.members.map((member) => member.id),
    });
    setShowForm(true);
  };

  const toggleMember = (memberId: string) => {
    setForm((prev) => {
      const alreadySelected = prev.memberUserIds.includes(memberId);
      const memberUserIds = alreadySelected
        ? prev.memberUserIds.filter((id) => id !== memberId)
        : [...prev.memberUserIds, memberId];

      const headUserId = prev.headUserId && !memberUserIds.includes(prev.headUserId)
        ? null
        : prev.headUserId;

      return { ...prev, memberUserIds, headUserId };
    });
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (!form.name.trim()) {
      setError('Department name is required');
      return;
    }

    if (form.headUserId && !form.memberUserIds.includes(form.headUserId)) {
      setError('Department head must be selected as a department member');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        headUserId: form.headUserId,
        memberUserIds: form.memberUserIds,
      };

      if (editingDepartmentId) {
        await api.put(`/departments/${editingDepartmentId}`, payload);
        setSuccess('Department updated successfully.');
      } else {
        await api.post('/departments', payload);
        setSuccess('Department created successfully.');
      }

      await fetchData();
      resetForm();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save department');
    } finally {
      setSaving(false);
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
        <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
        <Button onClick={startCreate}>
          <Plus className="mr-1 h-4 w-4" />
          New Department
        </Button>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      {success && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      {showForm && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">
              {editingDepartmentId ? 'Edit Department' : 'Create Department'}
            </h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Department Name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Operations"
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Department Members</label>
              <div className="max-h-56 space-y-2 overflow-auto rounded-lg border border-gray-200 p-3">
                {members.map((member) => {
                  const checked = form.memberUserIds.includes(member.id);
                  return (
                    <label key={member.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(member.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="font-medium text-gray-900">{member.first_name} {member.last_name}</span>
                      <span className="text-gray-500">({member.email})</span>
                    </label>
                  );
                })}
                {members.length === 0 && (
                  <p className="text-sm text-gray-500">No active users available.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Department Head (Optional)</label>
              <select
                value={form.headUserId ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, headUserId: e.target.value || null }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">No department head</option>
                {selectedMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.first_name} {member.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving...' : editingDepartmentId ? 'Update Department' : 'Create Department'}
              </Button>
              <Button variant="secondary" onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="space-y-3">
        {departments.map((department) => (
          <Card key={department.id}>
            <CardBody className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <p className="font-medium text-gray-900">{department.name}</p>
                </div>
                <p className="text-sm text-gray-600">
                  Head:{' '}
                  <span className="font-medium text-gray-800">
                    {department.head ? getFullName(department.head) : 'Not set'}
                  </span>
                </p>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Users className="h-4 w-4" />
                  <span>{department.member_count} members</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => startEdit(department)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label={`Edit ${department.name}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
            </CardBody>
          </Card>
        ))}
        {departments.length === 0 && (
          <Card>
            <CardBody className="py-10 text-center text-sm text-gray-500">
              No departments yet.
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
