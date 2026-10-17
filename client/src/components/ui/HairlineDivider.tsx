import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface HairlineDividerProps {
  className?: string;
}

export const HairlineDivider: React.FC<HairlineDividerProps> = ({ className }) => {
  return (
    <hr
      className={twMerge(
        clsx('w-full border-0 h-[1px] bg-surface-25 my-8 md:my-12', className)
      )}
    />
  );
};

export default HairlineDivider;
