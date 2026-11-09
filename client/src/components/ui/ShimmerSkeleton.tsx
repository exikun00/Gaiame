import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div
      className={`animate-shimmer bg-off-black/60 border border-surface-25/40 rounded ${className}`}
    />
  );
};

export const HeroSkeleton: React.FC = () => {
  return (
    <div className="w-full h-[360px] md:h-[460px] rounded-2xl animate-shimmer bg-off-black border border-surface-25/40 relative overflow-hidden flex flex-col justify-end p-6 md:p-12 mb-12">
      <div className="flex gap-2 mb-4">
        <Skeleton className="w-20 h-6 rounded-full" />
        <Skeleton className="w-24 h-6 rounded-full" />
      </div>
      <Skeleton className="w-3/4 max-w-xl h-10 md:h-14 mb-4 rounded-lg" />
      <Skeleton className="w-1/2 max-w-md h-4 mb-2 rounded" />
      <Skeleton className="w-1/3 max-w-xs h-4 mb-6 rounded" />
      <div className="flex gap-4">
        <Skeleton className="w-32 h-10 rounded-full" />
        <Skeleton className="w-32 h-10 rounded-full" />
      </div>
    </div>
  );
};

export const EpisodeCardsSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="w-full aspect-video rounded-lg" />
          <Skeleton className="w-3/4 h-4 rounded mt-1" />
          <Skeleton className="w-1/2 h-3 rounded" />
        </div>
      ))}
    </div>
  );
};

export const AnimeGridSkeleton: React.FC<{ count?: number }> = ({ count = 10 }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="w-full aspect-[2/3] rounded-xl" />
          <Skeleton className="w-4/5 h-4 rounded mt-2" />
          <Skeleton className="w-2/5 h-3 rounded" />
        </div>
      ))}
    </div>
  );
};

export const FranchiseSkeleton: React.FC = () => {
  return (
    <div className="mb-10 space-y-4">
      <div className="space-y-1.5">
        <Skeleton className="w-24 h-3.5 rounded" />
        <Skeleton className="w-72 h-6 rounded mt-1" />
      </div>
      <div className="space-y-4 bg-off-black/30 border border-surface-25/40 p-4 md:p-6 rounded-2xl">
        <Skeleton className="w-36 h-4 rounded mb-2" />
        <div className="flex gap-3 overflow-x-hidden pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-2.5 pr-4 rounded-xl border border-surface-25/40 bg-off-black/60 flex-shrink-0 w-64"
            >
              <Skeleton className="w-11 h-15 rounded bg-surface-25/50 flex-shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="w-4/5 h-4 rounded" />
                <div className="flex items-center gap-2">
                  <Skeleton className="w-10 h-3 rounded" />
                  <Skeleton className="w-14 h-3.5 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const DetailPageSkeleton: React.FC = () => {
  return (
    <div className="py-8">
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start mb-12">
        <div className="w-full sm:w-64 lg:w-72 flex-shrink-0 aspect-[3/4] rounded-cards overflow-hidden">
          <Skeleton className="w-full h-full rounded-cards shadow-2xl" />
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <div className="flex gap-2 mb-4">
            <Skeleton className="w-20 h-6 rounded-full" />
            <Skeleton className="w-24 h-6 rounded-full" />
          </div>
          <Skeleton className="w-3/4 h-12 mb-4 rounded-lg" />
          <Skeleton className="w-full h-20 mb-6 rounded-lg" />
          <div className="flex gap-4">
            <Skeleton className="w-36 h-11 rounded-full" />
            <Skeleton className="w-36 h-11 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-8 space-y-4">
        <Skeleton className="w-48 h-6 mb-4 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="p-3 sm:p-4 rounded-cards bg-off-black border border-surface-25/40 flex items-center gap-3 sm:gap-4 animate-pulse"
            >
              <Skeleton className="w-24 sm:w-36 aspect-video rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="w-3/4 h-4 rounded" />
                <Skeleton className="w-1/2 h-3 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Skeleton;
