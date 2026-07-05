import React from 'react';
import { Button } from './Button';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
      role="alert"
    >
      <p className="text-para-sm text-error-base max-w-sm">{message}</p>
      {onRetry && (
        <Button size="sm" variant="neutral" mode="stroke" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
