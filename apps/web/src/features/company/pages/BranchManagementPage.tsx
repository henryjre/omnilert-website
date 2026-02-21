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
  isActive: boolean;
  isMainBranch: boolean;
}

const initialFormData: BranchFormData = { name: '', address: '', odooBranchId: '', isActive: true, isMainBranch: false };

export function BranchManagementPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<BranchFormData>(initialFormData);
  const [editingId, setEditingId] = useState<string | null>(null);

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
      await api.put(`/branches/${editingId}`, {
        name: formData.name,
        address: formData.address,
        odooBranchId: formData.odooBranchId,
        isActive: formData.isActive,
        isMainBranch: formData.isMainBranch,
      });
    } else {
      await api.post('/branches', {
        name: formData.name,
        address: formData.address,
        odooBranchId: formData.odooBranchId,
        isMainBranch: formData.isMainBranch,
      });
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
      isActive: Boolean(branch.is_active),
      isMainBranch: Boolean(branch.is_main_branch),
    });
    setEditingId(branch.id);
    setShowForm(true);
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
            {editingId && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                  <span className="text-sm font-medium text-gray-700">Active</span>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.isActive ? 'bg-primary-600' : 'bg-gray-300'
                    }`}
                    aria-label="Toggle Active"
                    aria-pressed={formData.isActive}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        formData.isActive ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                  <span className="text-sm font-medium text-gray-700">Main Branch</span>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, isMainBranch: !prev.isMainBranch }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.isMainBranch ? 'bg-primary-600' : 'bg-gray-300'
                    }`}
                    aria-label="Toggle Main Branch"
                    aria-pressed={formData.isMainBranch}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        formData.isMainBranch ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
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
