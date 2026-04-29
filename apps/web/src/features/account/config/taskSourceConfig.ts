import { Boxes, FileWarning } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MyTaskSource, UnifiedMyTask } from '@omnilert/shared';

interface TaskSourceConfig {
  label: string;
  icon: LucideIcon;
  chipClassName: string;
  getNavPath: (task: UnifiedMyTask) => string;
}

export const TASK_SOURCE_CONFIG: Record<MyTaskSource, TaskSourceConfig> = {
  case_report: {
    label: 'Case Report',
    icon: FileWarning,
    chipClassName: 'bg-blue-50 text-blue-600',
    getNavPath: (t) => `/case-reports?caseId=${t.parent_id}&taskId=${t.id}`,
  },
  aic_variance: {
    label: 'AIC Variance',
    icon: Boxes,
    chipClassName: 'bg-amber-50 text-amber-600',
    getNavPath: (t) => `/aic-variance?aicId=${t.parent_id}&taskId=${t.id}`,
  },
};
