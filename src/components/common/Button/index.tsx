import React from 'react';
import styles from './style.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'toggle';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isActive?: boolean;
  isIconButton?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  isActive = false,
  isIconButton = false,
  className = '',
  children,
  ...props
}) => {
  const buttonClasses = [
    styles.button,
    styles[variant],
    styles[size],
    isIconButton && styles.iconButton,
    variant === 'toggle' && isActive && styles.active,
    className
  ].filter(Boolean).join(' ');

  return (
    <button 
      className={buttonClasses}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button; 