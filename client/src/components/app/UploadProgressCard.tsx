import { cn } from '../../lib/cn';

export type UploadProgressCardProps = {
  title: string;
  detail?: string;
  percent?: number | null;
  className?: string;
};

/** Compact floating progress panel (top-right). */
export function UploadProgressCard({ title, detail, percent, className }: UploadProgressCardProps) {
  const hasPercent = typeof percent === 'number' && Number.isFinite(percent);
  const width = hasPercent ? Math.min(100, Math.max(0, percent)) : 45;

  return (
    <div
      className={cn(
        'fixed top-4 right-4 z-[180] w-[min(280px,calc(100vw-2rem))] rounded-12 border border-neutral-200 bg-white p-3 shadow-lg',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-label-sm text-neutral-950 m-0 truncate">{title}</p>
      {detail ? (
        <p className="text-para-xs text-neutral-400 m-0 mt-0.5 truncate">{detail}</p>
      ) : null}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className={cn(
            'h-full rounded-full bg-primary-base transition-[width] duration-150 ease-out',
            !hasPercent && 'animate-pulse',
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      {hasPercent ? (
        <p className="text-para-xs text-primary-base font-semibold tabular-nums m-0 mt-1.5 text-right">
          {Math.round(percent)}%
        </p>
      ) : null}
    </div>
  );
}
