import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';
import { toastDefaults } from './toast';

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      {...toastDefaults}
      {...props}
      toastOptions={{
        className: 'w-[min(420px,calc(100vw-2rem))] bg-transparent shadow-none border-none p-0',
        ...props.toastOptions,
      }}
    />
  );
}
