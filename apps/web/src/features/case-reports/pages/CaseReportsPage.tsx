import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CaseMessage, CaseReport } from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { FileWarning, Filter } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Spinner } from '@/shared/components/ui/Spinner';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import {
  closeCase,
  createCaseReport,
  getCaseReport,
  getMentionables,
  leaveCaseDiscussion,
  listCaseMessages,
  listCaseReports,
  markCaseRead,
  requestViolationNotice,
  sendCaseMessage,
  toggleCaseMute,
  toggleCaseReaction,
  updateCorrectiveAction,
  updateResolution,
  uploadCaseAttachment,
  type CaseReportDetail,
  type CaseReportFilters,
  type MentionableRole,
  type MentionableUser,
} from '../services/caseReport.api';
import { CaseReportCard } from '../components/CaseReportCard';
import { CaseReportDetailPanel } from '../components/CaseReportDetailPanel';
import { CaseReportFilterPanel } from '../components/CaseReportFilterPanel';
import { CreateCaseModal } from '../components/CreateCaseModal';

type StatusTab = 'all' | 'open' | 'closed';

export function CaseReportsPage() {
  const socket = useSocket('/case-reports');
  const { hasPermission } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(searchParams.get('caseId'));
  const [selectedReport, setSelectedReport] = useState<CaseReportDetail | null>(null);
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [users, setUsers] = useState<MentionableUser[]>([]);
  const [roles, setRoles] = useState<MentionableRole[]>([]);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<CaseReportFilters>({ sort_order: 'desc' });
  const [draftFilters, setDraftFilters] = useState<CaseReportFilters>({ sort_order: 'desc' });
  const [createOpen, setCreateOpen] = useState(false);

  const canCreate = hasPermission(PERMISSIONS.CASE_REPORT_CREATE);
  const canClose = hasPermission(PERMISSIONS.CASE_REPORT_CLOSE);
  const canManage = hasPermission(PERMISSIONS.CASE_REPORT_MANAGE);

  const appliedFilters = useMemo(() => ({
    ...filters,
    status: statusTab === 'all' ? undefined : statusTab,
  }), [filters, statusTab]);

  const fetchReports = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await listCaseReports(appliedFilters);
      setReports(data.items);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load case reports');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [appliedFilters]);

  const fetchDetail = useCallback(async (caseId: string) => {
    try {
      const [detail, nextMessages] = await Promise.all([getCaseReport(caseId), listCaseMessages(caseId)]);
      setSelectedReport(detail);
      setMessages(nextMessages);
      await markCaseRead(caseId);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load case detail');
    }
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    void getMentionables().then((data) => {
      setUsers(data.users);
      setRoles(data.roles);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedCaseId) {
      setSelectedReport(null);
      setMessages([]);
      return;
    }
    void fetchDetail(selectedCaseId);
  }, [fetchDetail, selectedCaseId]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => { void fetchReports(true); };
    const refreshDetail = (payload: { caseId?: string }) => {
      void fetchReports(true);
      if (payload.caseId && payload.caseId === selectedCaseId) {
        void fetchDetail(payload.caseId);
      }
    };

    socket.on('case-report:created', refresh);
    socket.on('case-report:updated', refresh);
    socket.on('case-report:attachment', refreshDetail);
    socket.on('case-report:message', refreshDetail);
    socket.on('case-report:reaction', refreshDetail);
    return () => {
      socket.off('case-report:created', refresh);
      socket.off('case-report:updated', refresh);
      socket.off('case-report:attachment', refreshDetail);
      socket.off('case-report:message', refreshDetail);
      socket.off('case-report:reaction', refreshDetail);
    };
  }, [fetchDetail, fetchReports, selectedCaseId, socket]);

  const openCount = reports.filter((report) => report.status === 'open').length;

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileWarning className="h-7 w-7 text-primary-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Case Reports</h1>
              <p className="text-sm text-gray-500">Track incidents, resolutions, and internal discussions.</p>
            </div>
          </div>
          <Badge variant="warning">{openCount} open</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-gray-100 p-1">
          {(['all', 'open', 'closed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusTab(tab)}
              className={`rounded-xl px-4 py-2 text-sm font-medium capitalize ${statusTab === tab ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setFiltersOpen((current) => !current)}>
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
          {canCreate && <Button onClick={() => setCreateOpen(true)}>New Case Report</Button>}
        </div>

        {filtersOpen && (
          <CaseReportFilterPanel
            draft={draftFilters}
            onChange={setDraftFilters}
            onApply={() => {
              setFilters(draftFilters);
              setFiltersOpen(false);
            }}
            onClear={() => {
              const cleared = { sort_order: 'desc' as const };
              setDraftFilters(cleared);
              setFilters(cleared);
            }}
            onCancel={() => {
              setDraftFilters(filters);
              setFiltersOpen(false);
            }}
          />
        )}

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : reports.length === 0 ? (
          <Card>
            <CardBody className="py-12 text-center text-sm text-gray-500">No case reports found.</CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <CaseReportCard
                key={report.id}
                report={report}
                selected={report.id === selectedCaseId}
                onSelect={() => {
                  setSelectedCaseId(report.id);
                  setSearchParams({ caseId: report.id });
                }}
                onLeave={async () => {
                  await leaveCaseDiscussion(report.id);
                  await fetchReports(true);
                }}
                onToggleMute={async () => {
                  await toggleCaseMute(report.id);
                  await fetchReports(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {selectedReport && <div className="fixed inset-0 z-40 bg-black/30" onClick={() => {
        setSelectedCaseId(null);
        setSelectedReport(null);
        setSearchParams({});
      }} />}

      <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-[680px] transform bg-white shadow-2xl transition-transform duration-300 ${selectedReport ? 'translate-x-0' : 'translate-x-full'}`}>
        <CaseReportDetailPanel
          report={selectedReport}
          messages={messages}
          users={users}
          roles={roles}
          canManage={canManage}
          canClose={canClose}
          onClosePanel={() => {
            setSelectedCaseId(null);
            setSelectedReport(null);
            setSearchParams({});
          }}
          onUpdateCorrectiveAction={async (value) => {
            if (!selectedCaseId) return;
            const detail = await updateCorrectiveAction(selectedCaseId, value);
            setSelectedReport(detail);
            await fetchReports(true);
          }}
          onUpdateResolution={async (value) => {
            if (!selectedCaseId) return;
            const detail = await updateResolution(selectedCaseId, value);
            setSelectedReport(detail);
            await fetchReports(true);
          }}
          onCloseCase={async () => {
            if (!selectedCaseId) return;
            const detail = await closeCase(selectedCaseId);
            setSelectedReport(detail);
            await fetchReports(true);
          }}
          onRequestVN={async () => {
            if (!selectedCaseId) return;
            const detail = await requestViolationNotice(selectedCaseId);
            setSelectedReport(detail);
            await fetchReports(true);
          }}
          onUploadAttachment={async (file) => {
            if (!selectedCaseId) return;
            await uploadCaseAttachment(selectedCaseId, file);
            await fetchDetail(selectedCaseId);
            await fetchReports(true);
          }}
          onSendMessage={async (input) => {
            if (!selectedCaseId) return;
            await sendCaseMessage({ caseId: selectedCaseId, ...input });
            await fetchDetail(selectedCaseId);
            await fetchReports(true);
          }}
          onReactMessage={async (messageId, emoji) => {
            if (!selectedCaseId) return;
            await toggleCaseReaction(selectedCaseId, messageId, emoji);
            await fetchDetail(selectedCaseId);
          }}
        />
      </div>

      <CreateCaseModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (payload) => {
          const created = await createCaseReport(payload);
          await fetchReports(true);
          setSelectedCaseId(created.id);
          setSearchParams({ caseId: created.id });
        }}
      />
    </>
  );
}
