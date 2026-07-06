import React from 'react';
import { Alert } from './Alert';
import { Button } from './Button';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 w-full max-w-md mx-auto">
      <Alert
        status="error"
        variant="stroke"
        title="Something went wrong"
        description={message}
        action={
          onRetry ? (
            <Button size="sm" variant="neutral" mode="stroke" onClick={onRetry}>
              Try again
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
