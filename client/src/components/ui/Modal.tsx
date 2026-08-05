import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../../lib/cn';
import { IconClose } from '../../lib/icons';
import { Button } from './Button';
import modalImage1 from '../../assets/modal-image-1.jpg';
import modalImage2 from '../../assets/modal-image-2.jpg';
import modalImage3 from '../../assets/modal-image-3.jpg';
import modalImage4 from '../../assets/modal-image-4.jpg';

export const Modal = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;

type ModalTone = 'primary' | 'destructive';

export const MODAL_IMAGES = [modalImage1, modalImage2, modalImage3, modalImage4] as const;

function pickModalImage() {
  return MODAL_IMAGES[Math.floor(Math.random() * MODAL_IMAGES.length)]!;
}

/** Shared modal chrome: image hero → body slots → close control. */
export function ModalContent({
  children,
  className,
  bodyClassName,
  showClose = true,
  size = 'md',
  tone = 'primary',
  heroSrc,
}: {
  children: React.ReactNode;
  className?: string;
  /** Extra classes on the padded body stack (title / copy / actions). */
  bodyClassName?: string;
  showClose?: boolean;
  size?: 'sm' | 'md' | 'lg';
  tone?: ModalTone;
  /** Optional fixed hero image; otherwise one of the modal assets is picked at random. */
  heroSrc?: string;
}) {
  const max = size === 'sm' ? 'max-w-[360px]' : size === 'lg' ? 'max-w-[560px]' : 'max-w-[440px]';
  const [randomHero] = React.useState(pickModalImage);
  const resolvedHero = heroSrc ?? randomHero;

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[200] bg-neutral-950/40 backdrop-blur-[10px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <Dialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-[201] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-20 border-0 bg-white p-0 shadow-none focus:outline-none',
          max,
          className,
        )}
        data-tone={tone}
      >
        <div
          className="pointer-events-none relative h-[108px] overflow-hidden bg-neutral-100"
          aria-hidden
        >
          <img src={resolvedHero} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>

        <div className={cn('relative z-[1] flex flex-col gap-4 px-7 pb-6 pt-5', bodyClassName)}>
          {children}
        </div>

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
