import { useEffect, useState } from 'react';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Badge } from '@/shared/components/ui/Badge';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { Plus, GitBranch, Pencil } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  address?: string | null;
  odoo_branch_id?: string | null;
  is_active: boolean;
  is_main_branch: boolean;
}

interface BranchFormData {
  name: string;
  address: string;
  odooBranchId: string;
  isMainBranch: boolean;
}

const initialFormData: BranchFormData = { name: '', address: '', odooBranchId: '', isMainBranch: false };

export function BranchManagementPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<BranchFormData>(initialFormData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updatingKeys, setUpdatingKeys] = useState<string[]>([]);

  const fetchBranches = () => {
    setLoading(true);
    api
      .get('/branches', { params: { includeInactive: true } })
      .then((res) => setBranches((res.data.data || []) as Branch[]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const handleSubmit = async () => {
    if (editingId) {
      await api.put(`/branches/${editingId}`, formData);
    } else {
      await api.post('/branches', formData);
    }
    setShowForm(false);
    setEditingId(null);
    setFormData(initialFormData);
    fetchBranches();
  };

  const startEdit = (branch: Branch) => {
    setFormData({
      name: branch.name,
      address: branch.address || '',
      odooBranchId: branch.odoo_branch_id || '',
      isMainBranch: Boolean(branch.is_main_branch),
    });
    setEditingId(branch.id);
    setShowForm(true);
  };

  const toggleBranchField = async (
    branchId: string,
    updates: { isActive?: boolean; isMainBranch?: boolean },
    key: string,
  ) => {
    setUpdatingKeys((prev) => [...prev, key]);
    try {
      await api.put(`/branches/${branchId}`, updates);
      setBranches((prev) =>
        prev.map((branch) =>
          branch.id === branchId
            ? {
                ...branch,
                is_active: updates.isActive ?? branch.is_active,
                is_main_branch: updates.isMainBranch ?? branch.is_main_branch,
              }
            : branch,
        ),
      );
    } finally {
      setUpdatingKeys((prev) => prev.filter((item) => item !== key));
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
        <h1 className="text-2xl font-bold text-gray-900">Branch Management</h1>
        <Button
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
            setFormData(initialFormData);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          New Branch
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">{editingId ? 'Edit Branch' : 'Create Branch'}</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Branch Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., SM City Cebu Branch"
            />
            <Input
              label="Address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Branch address"
            />
            <Input
              label="Odoo Branch ID"
              value={formData.odooBranchId}
              onChange={(e) => setFormData({ ...formData, odooBranchId: e.target.value })}
              placeholder="Maps to Odoo branch identifier"
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.isMainBranch}
                onChange={(e) => setFormData({ ...formData, isMainBranch: e.target.checked })}
              />
              Main Branch
            </label>
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={!formData.name}>
                {editingId ? 'Update' : 'Create'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="space-y-3">
        {branches.map((branch) => (
          <Card key={branch.id}>
            <CardBody className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitBranch className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">{branch.name}</p>
                  {branch.address && (
                    <p className="text-sm text-gray-500">{branch.address}</p>
                  )}
                  {branch.odoo_branch_id && (
                    <p className="text-xs text-gray-400">Odoo ID: {branch.odoo_branch_id}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={branch.is_active ? 'success' : 'default'}>
                  {branch.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={branch.is_active}
                    disabled={updatingKeys.includes(`${branch.id}:active`)}
                    onChange={(e) =>
                      toggleBranchField(branch.id, { isActive: e.target.checked }, `${branch.id}:active`)
                    }
                  />
                  Active
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={branch.is_main_branch}
                    disabled={updatingKeys.includes(`${branch.id}:main`)}
                    onChange={(e) =>
                      toggleBranchField(
                        branch.id,
                        { isMainBranch: e.target.checked },
                        `${branch.id}:main`,
                      )
                    }
                  />
                  Main
                </label>
                {branch.is_main_branch && <Badge variant="default">Main</Badge>}
                <button
                  onClick={() => startEdit(branch)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
