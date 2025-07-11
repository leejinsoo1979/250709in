import React from 'react';
import styles from './style.module.css';

type CardVariant = 'default' | 'interactive' | 'selected';

interface CardProps {
  variant?: CardVariant;
  title?: string;
  subtitle?: string;
  image?: string;
  aspectRatio?: '1/1' | '4/3' | '16/9';
  onClick?: () => void;
  selected?: boolean;
  className?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

const Card: React.FC<CardProps> = ({
  variant = 'default',
  title,
  subtitle,
  image,
  aspectRatio = '1/1',
  onClick,
  selected = false,
  className = '',
  children,
  footer,
}) => {
  const cardClasses = [
    styles.card,
    styles[variant],
    selected && styles.selected,
    onClick && styles.clickable,
    className
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={cardClasses}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {image && (
        <div className={styles.imageContainer} style={{ aspectRatio }}>
          <img src={image} alt={title} className={styles.image} />
        </div>
      )}
      <div className={styles.content}>
        {(title || subtitle) && (
          <div className={styles.header}>
            {title && <h3 className={styles.title}>{title}</h3>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        )}
        {children && <div className={styles.body}>{children}</div>}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
};

export default Card; 