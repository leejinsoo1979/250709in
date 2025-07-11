import React from 'react';
import styles from './style.module.css';

type SelectSize = 'small' | 'medium' | 'large';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[];
  size?: SelectSize;
  error?: string;
  label?: string;
  placeholder?: string;
  fullWidth?: boolean;
}

const Select: React.FC<SelectProps> = ({
  options,
  size = 'medium',
  error,
  label,
  placeholder,
  className = '',
  fullWidth = false,
  value,
  defaultValue,
  ...props
}) => {
  const containerClasses = [
    styles.container,
    fullWidth && styles.fullWidth,
    className
  ].filter(Boolean).join(' ');

  const selectClasses = [
    styles.select,
    styles[size],
    error && styles.error,
  ].filter(Boolean).join(' ');

  // controlled 컴포넌트인지 확인
  const isControlled = value !== undefined;
  
  // controlled 컴포넌트가 아닐 때만 defaultValue 설정
  const selectDefaultValue = !isControlled && placeholder ? '' : defaultValue;

  const selectProps = isControlled 
    ? { value, ...props }
    : { defaultValue: selectDefaultValue, ...props };

  return (
    <div className={containerClasses}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.selectWrapper}>
        <select className={selectClasses} {...selectProps}>
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.arrow} />
      </div>
      {error && <span className={styles.errorMessage}>{error}</span>}
    </div>
  );
};

export default Select; 