import React from 'react';
import styles from './style.module.css';

type InputSize = 'small' | 'medium' | 'large';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize;
  error?: string;
  label?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const Input: React.FC<InputProps> = ({
  size = 'medium',
  error,
  label,
  leftIcon,
  rightIcon,
  className = '',
  fullWidth = false,
  ...props
}) => {
  const containerClasses = [
    styles.container,
    fullWidth && styles.fullWidth,
    className
  ].filter(Boolean).join(' ');

  const inputClasses = [
    styles.input,
    styles[size],
    error && styles.error,
    leftIcon && styles.hasLeftIcon,
    rightIcon && styles.hasRightIcon
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.inputWrapper}>
        {leftIcon && <span className={styles.leftIcon}>{leftIcon}</span>}
        <input className={inputClasses} {...props} />
        {rightIcon && <span className={styles.rightIcon}>{rightIcon}</span>}
      </div>
      {error && <span className={styles.errorMessage}>{error}</span>}
    </div>
  );
};

export default Input; 