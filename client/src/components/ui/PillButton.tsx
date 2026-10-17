import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const PillButton: React.FC<PillButtonProps> = ({
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
    <button
      className={twMerge(
        clsx(
          'inline-flex items-center justify-center gap-2 font-semibold text-surface-cream',
          'bg-transparent border border-surface-cream rounded-buttons',
          'transition-opacity duration-200 hover:opacity-80 active:opacity-60',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          size_classes,
          className
        )
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export default PillButton;
