import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../../lib/cn';
import { IconClose } from '../../lib/icons';
import { Button } from './Button';

export const SideDrawer = Dialog.Root;
export const SideDrawerTrigger = Dialog.Trigger;
export const SideDrawerClose = Dialog.Close;

type SideDrawerWidth = 'sm' | 'md' | 'lg' | 'xl';

const WIDTH: Record<SideDrawerWidth, string> = {
  sm: 'w-[min(360px,100vw)]',
  md: 'w-[min(40vw,480px)] min-w-[min(320px,100vw)]',
  lg: 'w-[min(520px,100vw)]',
  xl: 'w-[min(640px,100vw)]',
};

export function SideDrawerContent({
  children,
  className,
  showClose = true,
  width = 'md',
  side = 'right',
  accessibleTitle,
}: {
  children: React.ReactNode;
  className?: string;
  showClose?: boolean;
  width?: SideDrawerWidth;
  side?: 'right' | 'left';
  /** Used when no visible SideDrawerHeader is present (e.g. custom body). */
  accessibleTitle?: string;
}) {
  const fromRight = side === 'right';
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[200] bg-neutral-950/40 backdrop-blur-[10px] data-[state=open]:animate-[side-drawer-fade-in_0.2s_ease-out] data-[state=closed]:animate-[side-drawer-fade-out_0.15s_ease-in]" />
      <Dialog.Content
        className={cn(
          'fixed top-0 bottom-0 z-[201] flex h-dvh max-h-dvh flex-col bg-white shadow-xl focus:outline-none',
          WIDTH[width],
          fromRight
            ? 'right-0 data-[state=open]:animate-[side-drawer-in-right_0.28s_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[side-drawer-out-right_0.2s_ease-in]'
            : 'left-0 data-[state=open]:animate-[side-drawer-in-left_0.28s_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[side-drawer-out-left_0.2s_ease-in]',
          className,
        )}
      >
        {accessibleTitle ? (
          <Dialog.Title className="sr-only">{accessibleTitle}</Dialog.Title>
        ) : null}
        {children}
        {showClose ? (
          <Dialog.Close asChild>
            <Button
              type="button"
              size="xs"
              variant="neutral"
              mode="ghost"
              aria-label="Close"
              className="absolute right-3 top-3 z-10 !px-1"
            >
              <IconClose size={16} />
            </Button>
          </Dialog.Close>
        ) : null}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function SideDrawerHeader({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn('shrink-0 border-b border-neutral-200 px-5 py-4 pr-12', className)}>
      <Dialog.Title className="text-label-sm text-neutral-950 m-0">{title}</Dialog.Title>
      {description ? (
        <Dialog.Description className="text-para-sm text-neutral-500 mt-1 mb-0">
          {description}
        </Dialog.Description>
      ) : (
        <Dialog.Description className="sr-only">{title}</Dialog.Description>
      )}
    </div>
  );
}

export function SideDrawerBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto', className)}>{children}</div>;
}

export function SideDrawerFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200 px-5 py-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
