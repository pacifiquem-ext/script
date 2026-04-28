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

  return (
    <div className={`input-field ${wrapperClassName}`}>
      {label && (
        <label className="input-field__label text-label-sm" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={`input-field__wrapper input-field__wrapper--${size} ${error ? 'input-field__wrapper--error' : ''}`}>
        {leftIcon && <span className="input-field__icon input-field__icon--left">{leftIcon}</span>}
        <input
          id={inputId}
          className={`input-field__input ${className}`}
          {...props}
        />
        {rightIcon && <span className="input-field__icon input-field__icon--right">{rightIcon}</span>}
      </div>
      {error && <p className="input-field__error text-para-xs">{error}</p>}
      {hint && !error && <p className="input-field__hint text-para-xs">{hint}</p>}
    </div>
  );
}
