import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ServerBadgeProps {
  server_name: string;
  is_selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export const ServerBadge: React.FC<ServerBadgeProps> = ({
  server_name,
  is_selected = false,
  onClick,
  className,
}) => {
  // Limpiar y capitalizar nombre para apariencia homogénea
  const clean_name = server_name.trim();
  const display_name = clean_name.charAt(0).toUpperCase() + clean_name.slice(1);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={twMerge(
        clsx(
          'group inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-all select-none',
          is_selected
            ? 'border-shockingly-green bg-shockingly-green/10 text-surface-cream font-semibold ring-1 ring-shockingly-green/40'
            : 'border-surface-25 bg-off-black/60 text-surface-50 hover:border-surface-cream/80 hover:text-surface-cream font-medium',
          onClick ? 'cursor-pointer' : 'cursor-default',
          className
        )
      )}
    >
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full transition-colors',
          is_selected ? 'bg-shockingly-green' : 'bg-surface-50 group-hover:bg-surface-cream'
        )}
      />
      <span>{display_name}</span>
    </button>
  );
};

export default ServerBadge;
