import React from 'react';
import { Panel } from '../types';
import styles from '../style.module.css';

interface PanelListItemProps {
  panel: Panel;
  isSelected: boolean;
  onToggle: () => void;
  onQuantityChange: (delta: number) => void;
  getColorHex: (color: string) => string;
  getMaterialName: (material: string) => string;
  onHover?: (panelName: string | null, furnitureId: string | null) => void;
}

const PanelListItem: React.FC<PanelListItemProps> = ({
  panel,
  isSelected,
  onToggle,
  onQuantityChange,
  getColorHex,
  getMaterialName,
  onHover
}) => {
  return (
    <div
      className={`${styles.panelItem} ${isSelected ? styles.selected : ''}`}
      onClick={onToggle}
      onMouseEnter={() => onHover?.(panel.meshName || panel.name, panel.furnitureId || null)}
      onMouseLeave={() => onHover?.(null, null)}
    >
      <div 
        className={styles.panelColor}
        style={{ backgroundColor: getColorHex(panel.color) }}
      />
      <div className={styles.panelInfo}>
        <div className={styles.panelName}>{panel.name}</div>
        <div className={styles.panelDimensions}>
          {panel.width} × {panel.height}mm • {getMaterialName(panel.material)}
        </div>
      </div>
      <div className={styles.panelQuantity}>
        <button
          className={styles.quantityButton}
          onClick={(e) => {
            e.stopPropagation();
            onQuantityChange(-1);
          }}
          disabled={panel.quantity <= 1}
        >
          −
        </button>
        <span className={styles.quantityValue}>{panel.quantity}</span>
        <button
          className={styles.quantityButton}
          onClick={(e) => {
            e.stopPropagation();
            onQuantityChange(1);
          }}
        >
          +
        </button>
      </div>
    </div>
  );
};

export default PanelListItem;