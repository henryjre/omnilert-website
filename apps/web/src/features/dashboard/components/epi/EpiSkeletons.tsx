import { Card, CardBody } from '@/shared/components/ui/Card';

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700 ${className}`} />;
}

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
        <Card>
          <CardBody className="space-y-3">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-9 w-48" />
            <SkeletonBlock className="h-4 w-56" />
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-3">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-9 w-28" />
            <SkeletonBlock className="h-4 w-40" />
          </CardBody>
        </Card>
      </div>

      <div className="rounded-xl p-6 shadow-lg" style={{ background: 'linear-gradient(135deg, rgb(var(--primary-600)) 0%, rgb(var(--primary-700)) 50%, rgb(var(--primary-800)) 100%)' }}>
        <div className="grid gap-6 lg:grid-cols-[220px_1fr_1fr]">
          <div className="flex flex-col items-center gap-3">
            <SkeletonBlock className="h-[120px] w-[220px] rounded-[999px] bg-white/20 dark:bg-white/10" />
            <SkeletonBlock className="h-6 w-24 bg-white/20 dark:bg-white/10" />
          </div>
          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-40 bg-white/20 dark:bg-white/10" />
            <SkeletonBlock className="h-8 w-48 bg-white/20 dark:bg-white/10" />
            <SkeletonBlock className="h-10 w-40 rounded-full bg-white/20 dark:bg-white/10" />
            <SkeletonBlock className="h-20 w-44 bg-white/20 dark:bg-white/10" />
          </div>
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-28 bg-white/20 dark:bg-white/10" />
            <SkeletonBlock className="h-28 w-full bg-white/20 dark:bg-white/10" />
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-2 overflow-hidden px-6">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonBlock key={index} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <CardBody className="space-y-4">
              <SkeletonBlock className="h-5 w-36" />
              <SkeletonBlock className="h-16 w-full" />
              <SkeletonBlock className="h-16 w-full" />
            </CardBody>
          </Card>
        ))}
      </div>

      <LeaderboardSkeleton />
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-end justify-center gap-3">
          <SkeletonBlock className="h-[120px] w-[110px]" />
          <SkeletonBlock className="h-[140px] w-[130px]" />
          <SkeletonBlock className="h-[100px] w-[110px]" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonBlock key={index} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

export function LeaderboardDetailSkeleton() {
  return (
    <div className="space-y-3 px-1 py-2">
      <SkeletonBlock className="h-4 w-36" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonBlock key={index} className="h-10 w-full rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBlock className="h-12 w-full rounded-lg" />
        <SkeletonBlock className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}
