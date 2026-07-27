import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../../lib/cn';
import { IconClose } from '../../lib/icons';
import { Button } from './Button';

export const Modal = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;

type ModalTone = 'primary' | 'destructive';

const DOT_GRID: Record<ModalTone, string> = {
  primary: 'radial-gradient(circle, rgba(159,159,159,0.65) 1.5px, transparent 1.6px)',
  destructive: 'radial-gradient(circle, rgba(255, 68, 68, 0.28) 1.5px, transparent 1.6px)',
};

const BLOB_FILL: Record<ModalTone, string> = {
  primary: '#8282FF',
  destructive: '#FF4444',
};

const BORDER: Record<ModalTone, string> = {
  primary: 'border-primary-alpha-10',
  destructive: 'border-destructive-base/15',
};

function ModalHeaderBlob({
  tone,
  className,
  mirror = false,
}: {
  tone: ModalTone;
  className?: string;
  mirror?: boolean;
}) {
  const filterId = React.useId().replace(/:/g, '');

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="286"
      height="133"
      viewBox="0 0 223 180"
      fill="none"
      preserveAspectRatio="none"
      className={cn('absolute h-[133.085px] w-[285.822px]', className)}
      style={mirror ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden
    >
      <g filter={`url(#${filterId})`}>
        <path
          d="M374.048 94.6609C357.881 82.1609 291.148 63.3609 153.548 88.1609C15.9478 112.961 181.992 166.186 224.548 188.16C278.356 215.944 356.678 222.822 378.048 166.16C387.917 139.993 390.214 107.161 374.048 94.6609Z"
          fill={BLOB_FILL[tone]}
        />
      </g>
      <defs>
        <filter
          id={filterId}
          x="0"
          y="-24"
          width="485.822"
          height="333.086"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="50" result="effect1_foregroundBlur" />
        </filter>
      </defs>
    </svg>
  );
}

/** Shared modal chrome from the Figma card: decorative hero → body slots → close control. */
export function ModalContent({
  children,
  className,
  showClose = true,
  size = 'md',
  tone = 'primary',
}: {
  children: React.ReactNode;
  className?: string;
  showClose?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Soft top gradient + dot tint. Use `destructive` for delete / irreversible actions. */
  tone?: ModalTone;
}) {
  const max = size === 'sm' ? 'max-w-[360px]' : size === 'lg' ? 'max-w-[520px]' : 'max-w-[440px]';
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[200] bg-neutral-950/40 backdrop-blur-[10px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <Dialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-[201] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-20 border bg-white p-0 shadow-[0_8px_32px_rgba(0,0,0,0.08)] focus:outline-none',
          BORDER[tone],
          max,
          className,
        )}
      >
        {/* Figma hero header: dot mesh with two blurred blobs. Keep it decorative only. */}
        <div className="pointer-events-none relative h-[180px] overflow-hidden bg-white" aria-hidden>
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: DOT_GRID[tone],
              backgroundSize: '28px 28px',
              backgroundPosition: '16px 12px',
            }}
          />
          <ModalHeaderBlob tone={tone} mirror className="left-[-74px] top-[48px]" />
          <ModalHeaderBlob tone={tone} className="right-[-72px] top-[48px]" />
        </div>

        {/* Body slots inherit this spacing: title, optional illustration, copy/form, actions. */}
        <div className="relative z-[1] flex flex-col gap-6 px-8 pb-8 pt-7">{children}</div>

        {showClose ? (
          <Dialog.Close asChild>
            <Button
              type="button"
              size="xs"
              variant="neutral"
              mode="ghost"
              aria-label="Close"
              className="absolute right-3 top-3 z-[2] !px-1"
            >
              <IconClose size={16} />
            </Button>
          </Dialog.Close>
        ) : null}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

/** Title only — description belongs in `ModalBody`. */
export function ModalHeader({
  title,
  badge,
  align = 'start',
  divider = false,
  className,
}: {
  title: string;
  badge?: string;
  align?: 'start' | 'center';
  /** Very light hairline under the title. */
  divider?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'pr-8',
        align === 'center' ? 'text-center pr-0' : 'text-left',
        divider && 'pb-3 border-b border-neutral-200/70',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2',
          align === 'center' ? 'justify-center' : 'justify-start',
        )}
      >
        <Dialog.Title className="m-0 font-mono text-[22px] font-medium leading-none text-neutral-950 tracking-[-0.02em]">
          {title}
        </Dialog.Title>
        {badge ? (
          <span className="rounded-6 bg-surface-chip px-2 py-0.5 font-sans text-[11px] font-semibold leading-4 text-primary-base">
            {badge}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Optional art between title and body. */
export function ModalIllustration({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-center py-1', className)}>{children}</div>
  );
}

/** Supporting copy / custom body. String children become the dialog description. */
export function ModalBody({
  children,
  align = 'start',
  className,
}: {
  children: React.ReactNode;
  align?: 'start' | 'center';
  className?: string;
}) {
  const alignClass = align === 'center' ? 'text-center' : 'text-left';
  if (typeof children === 'string') {
    return (
      <Dialog.Description
        className={cn('m-0 text-para-sm text-neutral-500 leading-5', alignClass, className)}
      >
        {children}
      </Dialog.Description>
    );
  }
  return <div className={cn(alignClass, className)}>{children}</div>;
}

/** Action row — end-aligned by default. */
export function ModalFooter({
  children,
  align = 'end',
  className,
}: {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-1 flex flex-wrap items-center gap-2',
        align === 'center' && 'justify-center',
        align === 'end' && 'justify-end',
        align === 'start' && 'justify-start',
        className,
      )}
    >
      {children}
    </div>
  );
}
