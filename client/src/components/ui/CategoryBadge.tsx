import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type CategoryVariant = 'green' | 'orange' | 'pink' | 'lilac' | 'blue';

interface CategoryBadgeProps {
  label: string;
  variant?: CategoryVariant;
  className?: string;
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  label,
  variant = 'blue',
  className,
}) => {
  const variant_classes: Record<CategoryVariant, string> = {
    green: 'text-shockingly-green border-shockingly-green/30',
    orange: 'text-orangey border-orangey/30',
    pink: 'text-pink border-pink/30',
    lilac: 'text-lilac border-lilac/30',
    blue: 'text-blue border-blue/30',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-block px-3 py-1 text-xs md:text-sm font-semibold rounded-cards border bg-transparent',
          variant_classes[variant],
          className
        )
      )}
    >
      {label}
    </span>
  );
};

export default CategoryBadge;
