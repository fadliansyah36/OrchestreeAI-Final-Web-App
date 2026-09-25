import React from 'react';

export function SkeletonLoader({
  className = 'h-6 w-full',
  id = 'skeleton-loader',
  count = 1,
}: {
  className?: string;
  id?: string;
  count?: number;
}) {
  if (count > 1) {
    return (
      <div id={id} className="space-y-3 w-full">
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={idx}
            className={`animate-pulse rounded-xl bg-slate-200/80 dark:bg-slate-800/80 ${className}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      id={id}
      className={`animate-pulse rounded-xl bg-slate-200/80 dark:bg-slate-800/80 ${className}`}
    />
  );
}

export function HubAnalyticsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#0B1220] flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <SkeletonLoader className="h-4 w-24" />
            <SkeletonLoader className="h-8 w-8 rounded-lg" />
          </div>
          <SkeletonLoader className="h-8 w-32" />
          <SkeletonLoader className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}
