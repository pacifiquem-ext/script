import React from 'react';
import { FieldHint } from './FieldHint';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: 'md' | 'sm';
  wrapperClassName?: string;
}

export function Input({
  label,
  hint,
  error,
  leftIcon,
  rightIcon,
  size = 'md',
  wrapperClassName = '',
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  const hintId = inputId ? `${inputId}-hint` : undefined;
  const errorId = inputId ? `${inputId}-error` : undefined;

  const sizeStyles = {
    md: 'h-10 px-3 rounded-10',
    sm: 'h-9 px-2.5 rounded-8',
  };

  return (
    <div className={`flex flex-col gap-1.5 ${wrapperClassName}`}>
      {label && (
        <label className="text-[#4B5563] text-label-sm" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div
        className={`flex items-center gap-2 border border-solid bg-[#F9FAFB] transition-colors duration-200 relative group outline-none ${sizeStyles[size]} ${
          error ? 'border-error-base' : 'border-[#E5E7EB] focus-within:border-primary-base'
        }`}
      >
        {leftIcon && (
          <span className="flex items-center text-neutral-400 shrink-0 [&>svg]:w-5 [&>svg]:h-5">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={`flex-1 border-none outline-none bg-transparent font-sans text-sm leading-5 font-normal text-neutral-950 min-w-0 placeholder:text-[#9CA3AF] focus:outline-none focus:shadow-none ${className}`}
          {...props}
        />
        {rightIcon && (
          <span className="flex items-center text-neutral-400 shrink-0 [&>svg]:w-5 [&>svg]:h-5">
            {rightIcon}
          </span>
        )}
      </div>
      <FieldHint id={errorId} error>
        {error}
      </FieldHint>
      {!error ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
    </div>
  );
}
