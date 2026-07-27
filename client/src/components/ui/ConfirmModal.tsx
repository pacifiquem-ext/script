import React from 'react';
import { Button } from './Button';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from './Modal';

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        showClose={!loading}
        size="sm"
        tone={destructive ? 'destructive' : 'primary'}
      >
        <ModalHeader title={title} align="start" divider />
        {description ? <ModalBody align="start">{description}</ModalBody> : null}
        <ModalFooter align="end">
          <Button
            type="button"
            size="sm"
            variant="neutral"
            mode="stroke"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={destructive ? 'error' : 'primary'}
            loading={loading}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
