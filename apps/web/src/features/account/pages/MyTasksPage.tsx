import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { CheckSquare, CircleCheck, Clock, LayoutGrid } from 'lucide-react';
import type { MyTaskSource, UnifiedMyTask } from '@omnilert/shared';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useBranchStore } from '@/shared/store/branchStore';
import { getMyTasks } from '@/features/account/services/account.api';
import { MyTaskCard } from '../components/MyTaskCard';
import { TASK_SOURCE_CONFIG } from '../config/taskSourceConfig';

type TaskTab = 'all' | 'pending' | 'completed';

const taskTabs: ViewOption<TaskTab>[] = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'completed', label: 'Completed', icon: CircleCheck },
];

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: 'easeOut' },
  }),
};

const containerVariant: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const sectionVariant: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

function SkeletonCard() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-48 max-w-full rounded bg-gray-200" />
          <div className="h-3 w-36 rounded bg-gray-200" />
          <div className="h-3 w-28 rounded bg-gray-200" />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="h-5 w-20 rounded-full bg-gray-200" />
          <div className="h-4 w-4 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: TaskTab }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <CheckSquare className="h-4 w-4 shrink-0 text-gray-300" />
      <p className="text-sm text-gray-400">
        {tab === 'all'
          ? 'No tasks assigned to you yet'
          : tab === 'pending'
            ? 'No pending tasks'
            : 'No completed tasks yet'}
      </p>
    </div>
  );
}

export function MyTasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { error: showErrorToast } = useAppToast();
  const { selectedBranchIds, branches, loading: branchesLoading } = useBranchStore();

  const [tasks, setTasks] = useState<UnifiedMyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TaskTab>('all');
  const [activeSource, setActiveSource] = useState<MyTaskSource | 'all'>('all');

  useEffect(() => {
    if (branchesLoading) {
      setLoading(true);
      return;
    }
    if (branches.length === 0) {
      setTasks([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    const selectedBranchIdSet = new Set(selectedBranchIds);
    const selectedCompanyIds = Array.from(
      new Set(
        branches
          .filter((branch) => selectedBranchIdSet.size === 0 || selectedBranchIdSet.has(branch.id))
          .map((branch) => branch.companyId),
      ),
    );

    void Promise.allSettled(selectedCompanyIds.map((companyId) => getMyTasks(companyId)))
      .then((results) => {
        const uniqueById = new Map<string, UnifiedMyTask>();
        for (const result of results) {
          if (result.status !== 'fulfilled') continue;
          for (const task of result.value) {
            uniqueById.set(task.id, task);
          }
        }

        const merged = Array.from(uniqueById.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );

        if (active) setTasks(merged);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const axiosErr = err as { response?: { data?: { error?: string } } };
        showErrorToast(axiosErr.response?.data?.error ?? 'Failed to load tasks');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [branches, branchesLoading, selectedBranchIds, showErrorToast]);

  const { pending, completed } = useMemo(() => {
    const nextPending: UnifiedMyTask[] = [];
    const nextCompleted: UnifiedMyTask[] = [];

    for (const task of tasks) {
      const assignee = task.assignees.find((a) => a.user_id === user?.id);
      if (assignee?.completed_at) {
        nextCompleted.push(task);
      } else {
        nextPending.push(task);
      }
    }

    return { pending: nextPending, completed: nextCompleted };
  }, [tasks, user?.id]);

  const availableSources = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.source))),
    [tasks],
  );

  const visibleTasks = useMemo(() => {
    const byTab = activeTab === 'all' ? tasks : activeTab === 'pending' ? pending : completed;
    return activeSource === 'all' ? byTab : byTab.filter((t) => t.source === activeSource);
  }, [tasks, pending, completed, activeTab, activeSource]);

  const sourceCounts = useMemo(() => {
    const byTab = activeTab === 'all' ? tasks : activeTab === 'pending' ? pending : completed;
    const counts: Record<string, number> = { all: byTab.length };
    for (const source of availableSources) {
      counts[source] = byTab.filter((t) => t.source === source).length;
    }
    return counts;
  }, [tasks, pending, completed, activeTab, availableSources]);

  return (
    <motion.div className="space-y-5" initial="hidden" animate="visible" variants={containerVariant}>
      <motion.div variants={sectionVariant}>
        <div className="flex items-center gap-3">
          <CheckSquare className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
        </div>
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          Review tasks assigned to you across all systems.
        </p>
      </motion.div>

      <motion.div variants={sectionVariant}>
        <ViewToggle
          options={taskTabs}
          activeId={activeTab}
          onChange={setActiveTab}
          layoutId="my-tasks-tabs"
          className="sm:flex-1"
          labelAboveOnMobile
        />
      </motion.div>

      {!loading && availableSources.length > 1 && (
        <motion.div variants={sectionVariant} className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveSource('all')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeSource === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All sources
            <span className="tabular-nums opacity-70">{sourceCounts.all}</span>
          </button>
          {availableSources.map((source) => {
            const config = TASK_SOURCE_CONFIG[source];
            const Icon = config.icon;
            const isActive = activeSource === source;
            return (
              <button
                key={source}
                type="button"
                onClick={() => setActiveSource(source)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : `${config.chipClassName} hover:opacity-80`
                }`}
              >
                <Icon className="h-3 w-3" />
                {config.label}
                <span className="tabular-nums opacity-70">{sourceCounts[source]}</span>
              </button>
            );
          })}
        </motion.div>
      )}

      <motion.div variants={sectionVariant}>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : visibleTasks.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeTab}-${activeSource}`}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="space-y-3"
            >
              {visibleTasks.map((task, i) => {
                const assignee = task.assignees.find((a) => a.user_id === user?.id);
                const isCompleted = Boolean(assignee?.completed_at);

                return (
                  <motion.div key={task.id} custom={i} variants={cardVariants}>
                    <MyTaskCard
                      task={task}
                      completed={isCompleted}
                      onClick={() => navigate(TASK_SOURCE_CONFIG[task.source].getNavPath(task))}
                    />
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </motion.div>
  );
}
