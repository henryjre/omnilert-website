import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { CompanyCard, type Company } from '../components/CompanyCard';
import { CompanyDetailPanel } from '../components/CompanyDetailPanel';
import { CompanyCreateModal } from '../components/CompanyCreateModal';
import { CompanyDeleteConfirmModal } from '../components/CompanyDeleteConfirmModal';

export function CompanyPage() {
  const { error: showError } = useAppToast();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);

  useEffect(() => {
    api
      .get('/super/companies/all')
      .then((res) => {
        const all = (res.data.data as Company[]) ?? [];
        setCompanies(all.filter((c) => !c.isRoot));
      })
      .catch((err) => showError(err.response?.data?.error || 'Failed to load companies'))
      .finally(() => setLoading(false));
  }, [showError]);

  function handleSaved(updated: Company) {
    setCompanies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setSelectedCompany(updated);
  }

  function handleCreated(company: Company) {
    setCompanies((prev) => [company, ...prev]);
  }

  function handleDeleted(companyId: string) {
    setCompanies((prev) => prev.filter((c) => c.id !== companyId));
    setSelectedCompany(null);
    setDeleteTarget(null);
  }

  return (
    <>
      <div className="min-w-0 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage all companies in the system.
            </p>
          </div>
          <Button onClick={() => setCreateModalOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create Company
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : companies.length === 0 ? (
          <Card>
            <CardBody>
              <p className="py-8 text-center text-gray-500">
                No companies found. Create one to get started.
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {companies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                onSelect={setSelectedCompany}
              />
            ))}
          </div>
        )}
      </div>

      {/* Side panel */}
      <CompanyDetailPanel
        company={selectedCompany}
        onClose={() => setSelectedCompany(null)}
        onSaved={handleSaved}
        onDeleteRequest={(company) => {
          setDeleteTarget(company);
        }}
      />

      {/* Create modal */}
      <CompanyCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleCreated}
      />

      {/* Delete confirm modal */}
      <CompanyDeleteConfirmModal
        company={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={handleDeleted}
      />
    </>
  );
}
