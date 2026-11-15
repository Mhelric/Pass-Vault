import { CreditCard, FileText, Hash, KeyRound } from 'lucide-react';

export type BadgeCategory = 'login' | 'pin' | 'card' | 'note';

export interface CategoryBadgeProps {
  category: BadgeCategory;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

const CATEGORY_META: Record<
  BadgeCategory,
  { label: string; icon: typeof KeyRound; classes: string }
> = {
  login: {
    label: 'Login',
    icon: KeyRound,
    classes: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  },
  pin: {
    label: 'PIN',
    icon: Hash,
    classes: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  },
  card: {
    label: 'Card',
    icon: CreditCard,
    classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  note: {
    label: 'Note',
    icon: FileText,
    classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
};

export function CategoryBadge({
  category,
  showLabel = true,
  size = 'sm',
}: CategoryBadgeProps) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${padding} ${meta.classes}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}
