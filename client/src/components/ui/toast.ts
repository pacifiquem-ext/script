import { toast as sonnerToast, type ToasterProps } from 'sonner';
import type { ReactElement } from 'react';

const defaultOptions: ToasterProps = {
  className: 'group/toast',
  position: 'bottom-center',
  gap: 8,
  duration: 4000,
};

function customToast(
  renderFunc: (t: string | number) => ReactElement,
  options: ToasterProps = {},
) {
  sonnerToast.custom(renderFunc, { ...defaultOptions, ...options });
}

export const toastDefaults = defaultOptions;

export const toast = {
  ...sonnerToast,
  custom: customToast,
};
