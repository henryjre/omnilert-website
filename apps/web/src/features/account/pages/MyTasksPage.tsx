import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { CheckSquare, CircleCheck, Clock, LayoutGrid } from 'lucide-react';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { getMyTasks, type MyTask } from '@/features/case-reports/services/caseReport.api';
import { MyTaskCard } from '../components/MyTaskCard';

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

  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TaskTab>('all');

  useEffect(() => {
    let active = true;
    setLoading(true);

    void getMyTasks()
      .then((data) => {
        if (!active) return;
        setTasks(data);
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
  }, [showErrorToast]);

  const { pending, completed } = useMemo(() => {
    const nextPending: MyTask[] = [];
    const nextCompleted: MyTask[] = [];

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

  const visibleTasks = activeTab === 'all' ? tasks : activeTab === 'pending' ? pending : completed;

  return (
    <motion.div className="space-y-5" initial="hidden" animate="visible" variants={containerVariant}>
      <motion.div variants={sectionVariant}>
        <div className="flex items-center gap-3">
          <CheckSquare className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
        </div>
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          Review tasks assigned to you across case reports.
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
              key={activeTab}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="space-y-3"
            >
              {visibleTasks.map((task, i) => {
                const assignee = task.assignees.find((a) => a.user_id === user?.id);
                const completed = Boolean(assignee?.completed_at);

                return (
                  <motion.div key={task.id} custom={i} variants={cardVariants}>
                    <MyTaskCard
                      task={task}
                      completed={completed}
                      onClick={() => navigate(`/case-reports?caseId=${task.case_id}&taskId=${task.id}`)}
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
