import React, { useEffect, useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './Button';
import { Input } from './Input';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalIllustration,
} from './Modal';

export function FormModal({
  open,
  onOpenChange,
  title,
  badge,
  description,
  illustration,
  label,
  placeholder,
  initialValue = '',
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  loading = false,
  allowEmpty = false,
  validate,
  onSubmit,
  footerAlign = 'end',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  badge?: string;
  description?: string;
  illustration?: React.ReactNode;
  footerAlign?: 'start' | 'center' | 'end';
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  allowEmpty?: boolean;
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void | Promise<void>;
}) {
  const inputId = useId();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(null);
    }
  }, [open, initialValue]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    const validationError =
      validate?.(trimmed) ?? (!allowEmpty && !trimmed ? `${label} is required` : null);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    await onSubmit(trimmed);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent showClose={!loading}>
        <ModalHeader title={title} badge={badge} />
        {illustration ? <ModalIllustration>{illustration}</ModalIllustration> : null}
        {description ? (
          <ModalBody>{description}</ModalBody>
        ) : (
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
        )}
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <Input
            id={inputId}
            label={label}
            placeholder={placeholder}
            value={value}
            error={error ?? undefined}
            autoFocus
            disabled={loading}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
          />
          <ModalFooter align={footerAlign}>
            <Button
              type="button"
              size="sm"
              variant="neutral"
              mode="stroke"
              className="w-fit"
              disabled={loading}
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
            <Button type="submit" size="sm" className="w-fit" loading={loading}>
              {confirmLabel}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
