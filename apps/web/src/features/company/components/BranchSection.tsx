import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pencil, GitBranch, X } from 'lucide-react';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Badge } from '@/shared/components/ui/Badge';
import { Spinner } from '@/shared/components/ui/Spinner';

interface Branch {
  id: string;
  name: string;
  address?: string | null;
  odoo_branch_id?: string | null;
  is_active: boolean;
  is_main_branch: boolean;
}

interface FormData {
  name: string;
  address: string;
  odooBranchId: string;
  isMainBranch: boolean;
  isActive: boolean;
}

const defaultFormData: FormData = {
  name: '',
  address: '',
  odooBranchId: '',
  isMainBranch: false,
  isActive: true,
};

interface ToggleProps {
  value: boolean;
  onChange: (val: boolean) => void;
}

function Toggle({ value, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
        value ? 'bg-primary-600' : 'bg-gray-200'
      }`}
    >
      <motion.span
        animate={{ x: value ? 16 : 2 }}
        transition={{ type: 'spring', stiffness: 700, damping: 30 }}
        className="inline-block h-4 w-4 rounded-full bg-white shadow-sm"
        style={{ marginTop: '2px' }}
      />
    </button>
  );
}

interface BranchSectionProps {
  companyId: string;
}

export function BranchSection({ companyId }: BranchSectionProps) {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [saving, setSaving] = useState(false);

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/super/companies/${companyId}/branches`);
      setBranches(res.data.data ?? []);
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchBranches();
    }
    // Reset UI state when company changes
    setShowCreateForm(false);
    setEditingId(null);
    setFormData(defaultFormData);
  }, [companyId]);

  const handleAddBranchClick = () => {
    setShowCreateForm(true);
    setEditingId(null);
    setFormData(defaultFormData);
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setFormData(defaultFormData);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      await api.post(`/super/companies/${companyId}/branches`, {
        name: formData.name.trim(),
        address: formData.address.trim() || undefined,
        odooBranchId: formData.odooBranchId.trim() || undefined,
        isMainBranch: formData.isMainBranch,
      });
      showSuccessToast('Branch created successfully');
      setShowCreateForm(false);
      setFormData(defaultFormData);
      await fetchBranches();
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to create branch');
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (branch: Branch) => {
    setEditingId(branch.id);
    setShowCreateForm(false);
    setFormData({
      name: branch.name,
      address: branch.address ?? '',
      odooBranchId: branch.odoo_branch_id ?? '',
      isMainBranch: branch.is_main_branch,
      isActive: branch.is_active,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData(defaultFormData);
  };

  const handleSave = async (branchId: string) => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      await api.put(`/super/companies/${companyId}/branches/${branchId}`, {
        name: formData.name.trim(),
        address: formData.address.trim() || undefined,
        odooBranchId: formData.odooBranchId.trim() || undefined,
        isMainBranch: formData.isMainBranch,
        isActive: formData.isActive,
      });
      showSuccessToast('Branch updated successfully');
      setEditingId(null);
      setFormData(defaultFormData);
      await fetchBranches();
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to update branch');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (branch: Branch) => {
    setBranches((prev) =>
      prev.map((b) => (b.id === branch.id ? { ...b, is_active: !branch.is_active } : b)),
    );
    try {
      await api.put(`/super/companies/${companyId}/branches/${branch.id}`, {
        isActive: !branch.is_active,
      });
    } catch (err: any) {
      setBranches((prev) =>
        prev.map((b) => (b.id === branch.id ? { ...b, is_active: branch.is_active } : b)),
      );
      showErrorToast(err.response?.data?.error || 'Failed to update branch');
    }
  };

  const updateFormField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const renderInlineForm = (isEdit: boolean, branchId?: string) => (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
      <Input
        label="Name"
        id={isEdit ? `edit-name-${branchId}` : 'create-name'}
        value={formData.name}
        onChange={(e) => updateFormField('name', e.target.value)}
        placeholder="Branch name"
      />
      <Input
        label="Address"
        id={isEdit ? `edit-address-${branchId}` : 'create-address'}
        value={formData.address}
        onChange={(e) => updateFormField('address', e.target.value)}
        placeholder="Address (optional)"
      />
      <Input
        label="Odoo Branch ID"
        id={isEdit ? `edit-odoo-${branchId}` : 'create-odoo'}
        value={formData.odooBranchId}
        onChange={(e) => updateFormField('odooBranchId', e.target.value)}
        placeholder="Odoo Branch ID (optional)"
      />
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700">Main Branch</span>
        <Toggle
          value={formData.isMainBranch}
          onChange={(val) => updateFormField('isMainBranch', val)}
        />
      </div>
      {isEdit && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">Active</span>
          <Toggle
            value={formData.isActive}
            onChange={(val) => updateFormField('isActive', val)}
          />
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        {isEdit ? (
          <Button
            variant="primary"
            size="sm"
            disabled={!formData.name.trim() || saving}
            onClick={() => handleSave(branchId!)}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={!formData.name.trim() || saving}
            onClick={handleCreate}
          >
            {saving ? 'Creating...' : 'Create'}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={isEdit ? handleCancelEdit : handleCancelCreate}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Branches</h3>
        {!showCreateForm && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAddBranchClick}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Branch
          </Button>
        )}
      </div>

      {/* Inline create form */}
      {showCreateForm && renderInlineForm(false)}

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      )}

      {/* Empty state */}
      {!loading && branches.length === 0 && !showCreateForm && (
        <p className="text-sm text-gray-500">No branches yet.</p>
      )}

      {/* Branch list */}
      {!loading && branches.length > 0 && (
        <div className="divide-y divide-gray-100">
          {branches.map((branch) => (
            <div key={branch.id} className="py-2">
              {editingId === branch.id ? (
                renderInlineForm(true, branch.id)
              ) : (
                <div className="flex items-start gap-2">
                  {/* Icon */}
                  <GitBranch className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />

                  {/* Name + address */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 truncate block">
                      {branch.name}
                    </span>
                    {branch.address && (
                      <span className="text-xs text-gray-500 truncate block">
                        {branch.address}
                      </span>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1 shrink-0">
                    {branch.is_active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="default">Inactive</Badge>
                    )}
                    {branch.is_main_branch && (
                      <Badge variant="info">Main</Badge>
                    )}
                  </div>

                  {/* Pencil edit button */}
                  <button
                    type="button"
                    onClick={() => handleEditClick(branch)}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                    aria-label={`Edit ${branch.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>

                  {/* Archive toggle (is_active) */}
                  <div className="shrink-0">
                    <Toggle
                      value={branch.is_active}
                      onChange={() => handleToggleActive(branch)}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
