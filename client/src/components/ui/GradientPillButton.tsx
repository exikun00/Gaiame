import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface GradientPillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const GradientPillButton: React.FC<GradientPillButtonProps> = ({
  size = 'md',
  className,
  children,
  ...props
}) => {
  const size_classes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  }[size];

  return (
    <div
      className={twMerge(
        'relative inline-flex p-[1.5px] rounded-buttons transition-all duration-200',
        'bg-gradient-to-r from-shockingly-green to-light-green',
        'hover:opacity-90 active:scale-[0.98]',
        className
      )}
    >
      <button
        className={clsx(
          'w-full h-full inline-flex items-center justify-center gap-2 font-semibold text-surface-cream',
          'bg-just-black rounded-buttons transition-colors duration-150',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          size_classes
        )}
        {...props}
      >
        {children}
      </button>
    </div>
  );
};

export default GradientPillButton;
