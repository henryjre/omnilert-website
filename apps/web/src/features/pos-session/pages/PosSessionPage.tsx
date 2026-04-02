import { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import type { ElementType } from 'react';
import { Monitor, Layers, LayoutGrid, FolderOpen, FolderCheck, BadgeCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSocket } from '@/shared/hooks/useSocket';
import { useBranchStore } from '@/shared/store/branchStore';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { PosSessionSkeleton } from '../components/PosSessionSkeleton';
import { SessionCard } from '../components/SessionCard';
import { SessionDetailPanel } from '../components/SessionDetailPanel';

// --- Status tab types ---

type StatusTab = 'all' | 'open' | 'closed' | 'audited';

const TABS: { id: StatusTab; label: string; icon: LucideIcon }[] = [
  { id: 'all',     label: 'All',     icon: LayoutGrid  },
  { id: 'open',    label: 'Open',    icon: FolderOpen  },
  { id: 'closed',  label: 'Closed',  icon: FolderCheck },
  { id: 'audited', label: 'Audited', icon: BadgeCheck  },
];

function getSessionTab(status: string): StatusTab {
  if (status === 'audit_complete') return 'audited';
  if (status === 'closed') return 'closed';
  return 'open';
}

export function PosSessionPage() {
  const { error: showErrorToast } = useAppToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 10;

  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  const branches = useBranchStore((s) => s.branches);
  const socket = useSocket('/pos-session');

  // Build branch lookup map — gives both branchName and companyName
  const branchLookup = useMemo(
    () => new Map(branches.map((b) => [b.id, b])),
    [branches],
  );

  // Filter sessions client-side by selected branches (safety net + used for tab counts)
  const filteredSessions = useMemo(() => {
    if (selectedBranchIds.length === 0) return sessions;
    const set = new Set(selectedBranchIds);
    return sessions.filter((s) => !s.branch_id || set.has(s.branch_id));
  }, [sessions, selectedBranchIds]);

  // Tab-filtered sessions
  const tabSessions = useMemo(() => {
    setPage(1);
    if (activeTab === 'all') return filteredSessions;
    return filteredSessions.filter((s) => getSessionTab(s.status) === activeTab);
  }, [filteredSessions, activeTab]);

  const totalPages = Math.ceil(tabSessions.length / PAGE_SIZE);
  const pagedSessions = tabSessions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fetchSessions = useCallback(() => {
    if (selectedBranchIds.length === 0) return;
    setLoading(true);
    api
      .get('/pos-sessions', { params: { branchIds: selectedBranchIds.join(',') } })
      .then((res) => setSessions(res.data.data || []))
      .catch((err: any) => {
        showErrorToast(err?.response?.data?.error || 'Failed to load POS sessions');
      })
      .finally(() => setLoading(false));
  }, [selectedBranchIds, showErrorToast]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Join/leave branch rooms for real-time updates
  useEffect(() => {
    if (!socket || selectedBranchIds.length === 0) return;
    for (const id of selectedBranchIds) socket.emit('join-branch', id);
    return () => {
      for (const id of selectedBranchIds) socket.emit('leave-branch', id);
    };
  }, [socket, selectedBranchIds]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('pos-session:new', (data: any) => {
      setSessions((prev) => [data, ...prev]);
    });

    socket.on('pos-session:updated', (data: any) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === data.id ? { ...data, verifications: s.verifications } : s,
        ),
      );
      setSelectedSession((prev: any) =>
        prev?.id === data.id
          ? { ...data, verifications: prev.verifications }
          : prev,
      );
    });

    socket.on('pos-verification:updated', (data: any) => {
      const updateVers = (vers: any[]) => {
        const idx = vers.findIndex((v: any) => v.id === data.id);
        if (idx === -1) return vers;
        const updated = [...vers];
        updated[idx] = data;
        return updated;
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.verifications ? { ...s, verifications: updateVers(s.verifications) } : s,
        ),
      );
      setSelectedSession((prev: any) =>
        prev?.verifications
          ? { ...prev, verifications: updateVers(prev.verifications) }
          : prev,
      );
    });

    socket.on('pos-verification:new', (data: any) => {
      setSelectedSession((prev: any) => {
        if (!prev || prev.id !== data.pos_session_id) return prev;
        return { ...prev, verifications: [...(prev.verifications || []), data] };
      });
    });

    return () => {
      socket.off('pos-session:new');
      socket.off('pos-session:updated');
      socket.off('pos-verification:updated');
      socket.off('pos-verification:new');
    };
  }, [socket]);

  const openDetail = async (sessionId: string) => {
    try {
      const res = await api.get(`/pos-sessions/${sessionId}`);
      setSelectedSession(res.data.data);
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error || 'Failed to load session detail');
    }
  };

  const getBranchInfo = (session: any) => {
    if (!session.branch_id) return undefined;
    const branch = branchLookup.get(session.branch_id);
    if (!branch) return undefined;
    return { companyName: branch.companyName, branchName: branch.name };
  };

  return (
    <>
      <div className="min-w-0 space-y-5">
        {/* Page header */}
        <div>
          <div className="flex items-center gap-3">
            <Monitor className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">POS Sessions</h1>
          </div>
          <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
            {TABS.find((t) => t.id === activeTab)?.label}
          </p>
          <p className="mt-1 hidden text-sm text-gray-500 sm:block">
            Monitor and audit point-of-sale sessions across all branches.
          </p>
        </div>

        <ViewToggle
          options={TABS}
          activeId={activeTab}
          onChange={(id) => {
            setActiveTab(id);
            setPage(1);
          }}
          layoutId="pos-session-tabs"
          className="sm:flex-1"
        />

        {/* Content */}
        {loading ? (
          <PosSessionSkeleton />
        ) : tabSessions.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <Layers className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">
              {activeTab === 'all' ? 'No POS sessions found.' : `No ${activeTab} sessions.`}
            </p>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-col gap-4">
              {pagedSessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  branchInfo={getBranchInfo(s)}
                  onUpdate={fetchSessions}
                  onOpenDetail={() => openDetail(s.id)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                <p className="text-sm text-gray-500">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, tabSessions.length)} of {tabSessions.length} sessions
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                        p === page
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Panel via Portal */}
      {createPortal(
        <AnimatePresence>
          {selectedSession && (
            <>
              {/* Side panel backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                onClick={() => setSelectedSession(null)}
              />

              {/* Side panel */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[600px] flex-col overflow-hidden bg-white shadow-2xl"
              >
                <SessionDetailPanel
                  session={selectedSession}
                  branchInfo={getBranchInfo(selectedSession)}
                  onClose={() => setSelectedSession(null)}
                  onUpdate={() => openDetail(selectedSession.id)}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
