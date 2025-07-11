import React from 'react';
import styles from './style.module.css';

interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'default' | 'underline' | 'contained';
  orientation?: 'horizontal' | 'vertical';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  className?: string;
}

const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  orientation = 'horizontal',
  size = 'medium',
  fullWidth = false,
  className = '',
}) => {
  const containerClasses = [
    styles.container,
    styles[orientation],
    styles[variant],
    fullWidth && styles.fullWidth,
    className
  ].filter(Boolean).join(' ');

  const handleKeyDown = (event: React.KeyboardEvent, tabId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onChange(tabId);
    }
  };

  return (
    <div className={containerClasses} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const tabClasses = [
          styles.tab,
          styles[size],
          isActive && styles.active,
          tab.disabled && styles.disabled
        ].filter(Boolean).join(' ');

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-disabled={tab.disabled}
            className={tabClasses}
            onClick={() => !tab.disabled && onChange(tab.id)}
            onKeyDown={(e) => !tab.disabled && handleKeyDown(e, tab.id)}
            tabIndex={isActive ? 0 : -1}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default Tabs; 