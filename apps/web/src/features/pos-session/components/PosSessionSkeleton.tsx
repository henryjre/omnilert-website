export function PosSessionSkeleton() {
  return (
    <div className="flex min-w-0 animate-pulse flex-col gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-3/4 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
              <div className="h-3 w-2/3 rounded bg-gray-100" />
            </div>
            <div className="h-5 w-16 rounded-full bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
