import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { CheckSquare } from 'lucide-react';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { getMyTasks, type MyTask } from '@/features/case-reports/services/caseReport.api';
import { MyTaskCard } from '../components/MyTaskCard';

type TaskTab = 'pending' | 'completed';

const taskTabs = [
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
] satisfies Array<{ id: TaskTab; label: string }>;

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: 'easeOut' },
  }),
};

function SkeletonCard() {
  return (
    <div className="flex animate-pulse items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-3/4 rounded bg-gray-200" />
        <div className="h-3 w-1/2 rounded bg-gray-100" />
      </div>
      <div className="h-4 w-4 rounded bg-gray-200" />
    </div>
  );
}

function EmptyState({ tab }: { tab: TaskTab }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CheckSquare className="mb-3 h-10 w-10 text-gray-300" />
      <p className="text-sm font-medium text-gray-500">
        {tab === 'pending' ? 'No pending tasks' : 'No completed tasks yet'}
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
  const [activeTab, setActiveTab] = useState<TaskTab>('pending');

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

  const visibleTasks = activeTab === 'pending' ? pending : completed;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">My Tasks</h1>
        <p className="mt-0.5 text-sm text-gray-500">Tasks assigned to you</p>
      </div>

      <ViewToggle
        options={taskTabs}
        activeId={activeTab}
        onChange={setActiveTab}
        layoutId="my-tasks-tabs"
        showIcons={false}
        size="default"
      />

      <div className="mt-4 space-y-2">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : visibleTasks.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="space-y-2"
            >
              {visibleTasks.map((task, i) => (
                <motion.div key={task.id} custom={i} variants={cardVariants}>
                  <MyTaskCard
                    task={task}
                    onClick={() => navigate(`/case-reports?caseId=${task.case_id}&taskId=${task.id}`)}
                  />
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
