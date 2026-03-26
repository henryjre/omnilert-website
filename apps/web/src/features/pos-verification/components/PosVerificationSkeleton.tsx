export function PosVerificationSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 rounded bg-gray-200" />
              <div className="h-6 w-1/3 rounded bg-gray-100" />
            </div>
            <div className="h-5 w-16 rounded-full bg-gray-200" />
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="h-3 w-2/3 rounded bg-gray-100" />
            <div className="h-3 w-1/2 rounded bg-gray-100" />
          </div>
          <div className="mt-4 h-20 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50" />
          <div className="mt-4 flex gap-3">
            <div className="h-9 flex-1 rounded-lg bg-gray-200" />
            <div className="h-9 flex-1 rounded-lg bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
