import React from 'react';
import { Inbox, ArrowRight } from 'lucide-react';

export interface EmptyStateProps {
  id?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ElementType;
}

export function EmptyState({
  id = 'empty-state-view',
  title,
  description,
  actionLabel,
  onAction,
  icon: IconComponent = Inbox
}: EmptyStateProps) {
  return (
    <div
      id={id}
      className="flex flex-col items-center justify-center text-center p-8 md:p-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 w-full"
    >
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-400 dark:text-slate-500 mb-4">
        <IconComponent className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
      </div>

      <h3 className="text-base md:text-lg font-semibold text-slate-900 dark:text-white mb-1.5">
        {title}
      </h3>

      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
        {description}
      </p>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          <span>{actionLabel}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
