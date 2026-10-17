import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface CurlyEyebrowProps {
  children: React.ReactNode;
  className?: string;
}

export const CurlyEyebrow: React.FC<CurlyEyebrowProps> = ({ children, className }) => {
  return (
    <div
      className={twMerge(
        clsx(
          'text-base md:text-lg font-normal text-surface-cream tracking-tight select-none mb-3',
          className
        )
      )}
    >
      <span className="text-surface-50 font-mono">&#123;</span>{' '}
      <span>{children}</span>{' '}
      <span className="text-surface-50 font-mono">&#125;</span>
    </div>
  );
};

export default CurlyEyebrow;
