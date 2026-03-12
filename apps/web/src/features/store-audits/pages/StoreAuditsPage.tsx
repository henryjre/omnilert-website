import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StoreAudit, StoreAuditStatus, StoreAuditType } from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { ClipboardList, LayoutGrid, ShieldCheck, Star, X } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Spinner } from '@/shared/components/ui/Spinner';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { api } from '@/shared/services/api.client';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { CssAuditCard } from '../components/CssAuditCard';
import { ComplianceAuditCard } from '../components/ComplianceAuditCard';
import { CssAuditDetailPanel } from '../components/CssAuditDetailPanel';
import { ComplianceAuditDetailPanel } from '../components/ComplianceAuditDetailPanel';

type CategoryTab = 'all' | StoreAuditType;

function statusBadge(status: StoreAuditStatus) {
  if (status === 'completed') return 'success' as const;
  if (status === 'processing') return 'info' as const;
  return 'warning' as const;
}

export function StoreAuditsPage() {
  const socket = useSocket('/store-audits');
  const { hasPermission } = usePermission();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const canProcessAudit = hasPermission(PERMISSIONS.STORE_AUDIT_PROCESS);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [panelError, setPanelError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [category, setCategory] = useState<CategoryTab>('all');
  const [status, setStatus] = useState<StoreAuditStatus>('pending');
  const [audits, setAudits] = useState<StoreAudit[]>([]);
  const [processingAuditId, setProcessingAuditId] = useState<string | null>(null);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  const selectedAudit = useMemo(
    () => audits.find((audit) => audit.id === selectedAuditId) ?? null,
    [audits, selectedAuditId],
  );

  const fetchAudits = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError('');
    try {
      const response = await api.get('/store-audits', {
        params: {
          type: category === 'all' ? undefined : category,
          status,
          page: 1,
          pageSize: 100,
        },
      });
      const data = response.data.data as {
        items: StoreAudit[];
        processingAuditId: string | null;
      };
      setAudits(data.items ?? []);
      setProcessingAuditId(data.processingAuditId ?? null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load store audits');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [category, status]);

  useEffect(() => {
    void fetchAudits();
  }, [fetchAudits]);

  useEffect(() => {
    if (!selectedAuditId) return;
    const exists = audits.some((audit) => audit.id === selectedAuditId);
    if (!exists) setSelectedAuditId(null);
  }, [audits, selectedAuditId]);

  useEffect(() => {
    if (!socket) return;

    const refresh = () => {
      void fetchAudits({ silent: true });
    };

    socket.on('store-audit:new', refresh);
    socket.on('store-audit:claimed', refresh);
    socket.on('store-audit:completed', refresh);

    return () => {
      socket.off('store-audit:new', refresh);
      socket.off('store-audit:claimed', refresh);
      socket.off('store-audit:completed', refresh);
    };
  }, [socket, fetchAudits]);

  const handleProcess = async (auditId: string) => {
    setActionLoading(true);
    setPanelError('');
    try {
      await api.post(`/store-audits/${auditId}/process`);
      await fetchAudits({ silent: true });
    } catch (err: any) {
      setPanelError(err.response?.data?.error || 'Failed to process audit');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async (
    auditId: string,
    payload:
      | { star_rating: number; audit_log: string }
      | { non_idle: boolean; cellphone: boolean; uniform: boolean; hygiene: boolean; sop: boolean },
  ) => {
    setActionLoading(true);
    setPanelError('');
    try {
      await api.post(`/store-audits/${auditId}/complete`, payload);
      await fetchAudits({ silent: true });
    } catch (err: any) {
      setPanelError(err.response?.data?.error || 'Failed to complete audit');
    } finally {
      setActionLoading(false);
    }
  };

  const canClaimAudit = canProcessAudit && processingAuditId === null;

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">Store Audits</h1>
          </div>
          <Badge variant={statusBadge(status)}>{audits.length} {status}</Badge>
        </div>

        <div className="mx-auto flex w-fit flex-wrap items-center justify-center gap-1 rounded-lg bg-gray-100 p-1 sm:mx-0 sm:justify-start">
          {([
            { key: 'all', label: 'All Categories', icon: LayoutGrid },
            { key: 'customer_service', label: 'Customer Service Audit', icon: Star },
            { key: 'compliance', label: 'Compliance Audit', icon: ShieldCheck },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-label={tab.label}
              title={tab.label}
              onClick={() => {
                setCategory(tab.key);
                setSelectedAuditId(null);
                setPanelError('');
              }}
              className={`rounded-md px-4 py-2.5 text-sm font-medium transition-colors sm:px-4 sm:py-1.5 ${
                category === tab.key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <tab.icon className="h-5 w-5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mx-auto flex w-full items-center justify-center gap-1 rounded-lg bg-gray-100 p-1 sm:mx-0 sm:w-fit sm:justify-start">
          {(['pending', 'processing', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setStatus(tab);
                setSelectedAuditId(null);
                setPanelError('');
              }}
              className={`flex-1 rounded-md px-4 py-1.5 text-center text-sm font-medium capitalize transition-colors sm:flex-none ${
                status === tab
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {error && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : audits.length === 0 ? (
          <Card>
            <CardBody className="py-12 text-center">
              <p className="text-sm text-gray-500">No audits found for the selected filters.</p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {audits.map((audit) => (
              audit.type === 'customer_service' ? (
                <CssAuditCard
                  key={audit.id}
                  audit={audit}
                  selected={audit.id === selectedAuditId}
                  onSelect={() => {
                    setSelectedAuditId(audit.id);
                    setPanelError('');
                  }}
                />
              ) : (
                <ComplianceAuditCard
                  key={audit.id}
                  audit={audit}
                  selected={audit.id === selectedAuditId}
                  onSelect={() => {
                    setSelectedAuditId(audit.id);
                    setPanelError('');
                  }}
                />
              )
            ))}
          </div>
        )}
      </div>

      {(selectedAudit || actionLoading) && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setSelectedAuditId(null)}
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[680px] transform overflow-y-auto bg-white shadow-2xl transition-transform duration-300 ${
          selectedAudit ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedAudit && (
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {selectedAudit.type === 'customer_service' ? 'Customer Service Audit' : 'Compliance Audit'}
                </p>
                <p className="text-xs text-gray-500">Audit ID: {selectedAudit.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAuditId(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {selectedAudit.type === 'customer_service' ? (
              <CssAuditDetailPanel
                audit={selectedAudit}
                canProcess={canClaimAudit && selectedAudit.status === 'pending'}
                canComplete={
                  canProcessAudit
                  && selectedAudit.status === 'processing'
                  && selectedAudit.auditor_user_id === currentUserId
                }
                actionLoading={actionLoading}
                panelError={panelError}
                onProcess={() => void handleProcess(selectedAudit.id)}
                onComplete={(payload) => void handleComplete(selectedAudit.id, payload)}
              />
            ) : (
              <ComplianceAuditDetailPanel
                audit={selectedAudit}
                canProcess={canClaimAudit && selectedAudit.status === 'pending'}
                canComplete={
                  canProcessAudit
                  && selectedAudit.status === 'processing'
                  && selectedAudit.auditor_user_id === currentUserId
                }
                actionLoading={actionLoading}
                panelError={panelError}
                onProcess={() => void handleProcess(selectedAudit.id)}
                onComplete={(payload) => void handleComplete(selectedAudit.id, payload)}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
