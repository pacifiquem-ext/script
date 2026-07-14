import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../../lib/cn';
import { IconClose } from '../../lib/icons';
import { Button } from './Button';

export const Modal = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;

export function ModalContent({
  children,
  className,
  showClose = true,
  size = 'md',
}: {
  children: React.ReactNode;
  className?: string;
  showClose?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const max = size === 'sm' ? 'max-w-[360px]' : size === 'lg' ? 'max-w-[520px]' : 'max-w-[420px]';
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[200] bg-neutral-950/40 backdrop-blur-[10px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <Dialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-[201] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-20 bg-white p-5 shadow-xl focus:outline-none',
          max,
          className,
        )}
      >
        {children}
        {showClose ? (
          <Dialog.Close asChild>
            <Button
              type="button"
              size="xs"
              variant="neutral"
              mode="ghost"
              aria-label="Close"
              className="absolute right-3 top-3 !px-1"
            >
              <IconClose size={16} />
            </Button>
          </Dialog.Close>
        ) : null}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function ModalHeader({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn('pr-8 mb-4 flex flex-col gap-1', className)}>
      <Dialog.Title className="text-label-sm text-neutral-950">{title}</Dialog.Title>
      {description ? (
        <Dialog.Description className="text-para-sm text-neutral-500">
          {description}
        </Dialog.Description>
      ) : (
        <Dialog.Description className="sr-only">{title}</Dialog.Description>
      )}
    </div>
  );
}

export function ModalFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mt-5 flex flex-wrap items-center justify-end gap-2', className)}>
      {children}
    </div>
  );
}
