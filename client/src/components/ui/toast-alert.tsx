import { Alert, type AlertStatus, type AlertVariant } from './Alert';
import { toast } from './toast';

export function showAlertToast(
  message: string,
  options?: {
    title?: string;
    status?: AlertStatus;
    variant?: AlertVariant;
    duration?: number;
  },
) {
  const status = options?.status ?? 'information';
  const variant = options?.variant ?? (status === 'error' ? 'stroke' : 'lighter');
  toast.custom(
    (t) => (
      <Alert
        status={status}
        variant={variant}
        title={options?.title}
        description={message}
        onDismiss={() => toast.dismiss(t)}
        className="shadow-lg w-full"
        compact
      />
    ),
    { duration: options?.duration ?? (status === 'error' ? 6000 : 4000) },
  );
}

export const notify = {
  success: (message: string, title = 'Success') =>
    showAlertToast(message, { title, status: 'success' }),
  error: (message: string, title = 'Something went wrong') =>
    showAlertToast(message, { title, status: 'error' }),
  info: (message: string, title?: string) =>
    showAlertToast(message, { title, status: 'information' }),
  warning: (message: string, title = 'Warning') =>
    showAlertToast(message, { title, status: 'warning' }),
};
