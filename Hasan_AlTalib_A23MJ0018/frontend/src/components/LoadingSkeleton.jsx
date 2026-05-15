import { cn } from '@/lib/utils';

export default function LoadingSkeleton({ width = '100%', height = 16, rounded = 6, className }) {
  return (
    <div
      className={cn('loading-shimmer', className)}
      style={{
        width,
        height,
        borderRadius: rounded,
      }}
      aria-hidden="true"
    />
  );
}
