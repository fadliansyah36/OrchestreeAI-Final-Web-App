import React from 'react';
import {
  Users,
  Briefcase,
  TrendingUp,
  Brain,
  ShieldCheck,
  Sparkles,
  Search,
  CreditCard,
  Settings,
  Lock,
  ChevronRight,
  Activity,
  Layers
} from 'lucide-react';

export interface CategoryCard {
  key: string;
  label: string;
  icon: string;
  route: string;
  badgeCount?: number;
  isLocked?: boolean;
}

export interface FeatureHubScreenProps {
  domain: string;
  analyticsSlot: React.ReactNode;
  categoryCards: CategoryCard[];
  insightFeed?: React.ReactNode;
  onNavigate?: (route: string) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  users: Users,
  briefcase: Briefcase,
  trending: TrendingUp,
  brain: Brain,
  shield: ShieldCheck,
  sparkles: Sparkles,
  search: Search,
  credit: CreditCard,
  settings: Settings,
  activity: Activity,
  layers: Layers
};

export function CategoryCardTile({
  card,
  onClick
}: {
  card: CategoryCard;
  onClick?: () => void;
}) {
  const IconComponent = ICON_MAP[card.icon.toLowerCase()] || Layers;

  return (
    <button
      type="button"
      id={`hub-category-${card.key}`}
      onClick={onClick}
      disabled={card.isLocked}
      className={`group relative flex flex-col justify-between text-left p-5 rounded-2xl border transition-all duration-200 ${
        card.isLocked
          ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-75'
          : 'bg-white dark:bg-[#0B1220] border-slate-200/80 dark:border-slate-800/80 hover:border-emerald-500/60 dark:hover:border-emerald-400/60 shadow-sm hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between w-full mb-3">
        <div
          className={`p-2.5 rounded-xl ${
            card.isLocked
              ? 'bg-slate-200/60 dark:bg-slate-800 text-slate-500'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors'
          }`}
        >
          <IconComponent className="w-5 h-5" />
        </div>
        {card.isLocked ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <Lock className="w-3 h-3" />
            Terkunci
          </span>
        ) : typeof card.badgeCount === 'number' && card.badgeCount > 0 ? (
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
            {card.badgeCount}
          </span>
        ) : null}
      </div>

      <div>
        <h4 className="font-semibold text-slate-900 dark:text-white text-base tracking-tight mb-1">
          {card.label}
        </h4>
        <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 font-medium pt-1">
          <span>Buka modul</span>
          <ChevronRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
}

export function FeatureHubScreen({
  domain,
  analyticsSlot,
  categoryCards,
  insightFeed,
  onNavigate
}: FeatureHubScreenProps) {
  return (
    <div id={`feature-hub-${domain.toLowerCase().replace(/\s+/g, '-')}`} className="flex flex-col gap-6 p-4 md:p-6 max-w-7xl mx-auto w-full">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {domain}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Pusat kendali dan visibilitas operasional
          </p>
        </div>
      </header>

      {/* Analytics Slot */}
      <section aria-label="analytics" className="w-full">
        {analyticsSlot}
      </section>

      {/* Categories Grid */}
      <section aria-label="categories" className="w-full">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          Kategori Layanan
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categoryCards.map((card) => (
            <CategoryCardTile
              key={card.key}
              card={card}
              onClick={() => onNavigate && onNavigate(card.route)}
            />
          ))}
        </div>
      </section>

      {/* Actionable Insight Feed */}
      {insightFeed && (
        <section aria-label="insights" className="w-full pt-2">
          {insightFeed}
        </section>
      )}
    </div>
  );
}
