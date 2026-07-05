import React from 'react';

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

  const sizeStyles = {
    md: 'h-10 px-3 rounded-10',
    sm: 'h-9 px-2.5 rounded-8',
  };

  return (
    <div className={`flex flex-col gap-1.5 ${wrapperClassName}`}>
      {label && (
        <label className="text-neutral-950 text-label-sm" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div
        className={`flex items-center gap-2 bg-white transition-shadow duration-200 relative group focus-within:shadow-[inset_0_0_0_1.5px_theme(colors.neutral.950)] outline-none ${sizeStyles[size]} ${
          error
            ? 'shadow-[inset_0_0_0_1.5px_theme(colors.error.base)]'
            : 'shadow-[inset_0_0_0_1px_theme(colors.neutral.200)]'
        }`}
      >
        {leftIcon && (
          <span className="flex items-center text-neutral-400 shrink-0 [&>svg]:w-5 [&>svg]:h-5">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          className={`flex-1 border-none outline-none bg-transparent font-sans text-sm leading-5 font-normal text-neutral-950 min-w-0 placeholder:text-neutral-400 focus:outline-none focus:shadow-none ${className}`}
          {...props}
        />
        {rightIcon && (
          <span className="flex items-center text-neutral-400 shrink-0 [&>svg]:w-5 [&>svg]:h-5">
            {rightIcon}
          </span>
        )}
      </div>
      {error && <p className="text-error-base text-para-xs">{error}</p>}
      {hint && !error && <p className="text-neutral-400 text-para-xs">{hint}</p>}
    </div>
  );
}
