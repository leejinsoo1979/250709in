import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { StockPanel } from '../types';
import styles from '../style.module.css';

interface StockItemProps {
  stock: StockPanel;
  getColorHex: (color: string) => string;
  getMaterialName: (material: string) => string;
}

const StockItem: React.FC<StockItemProps> = ({
  stock,
  getColorHex,
  getMaterialName
}) => {
  const getStockLevel = (count: number) => {
    if (count <= 3) return 'low';
    if (count <= 10) return 'medium';
    return 'high';
  };

  return (
    <div className={styles.stockCard}>
      <div className={styles.stockCardHeader}>
        <div className={styles.stockMaterial}>
          <div 
            className={styles.stockColor}
            style={{ backgroundColor: getColorHex(stock.color) }}
          />
          <span className={styles.stockMaterialName}>
            {getMaterialName(stock.material)}
          </span>
        </div>
        <div className={styles.stockActions}>
          <button className={styles.stockActionButton}>
            <Edit2 size={14} />
          </button>
          <button className={styles.stockActionButton}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className={styles.stockCardBody}>
        <div className={styles.stockInfoRow}>
          <span className={styles.stockInfoLabel}>크기</span>
          <span className={styles.stockInfoValue}>
            {stock.width} × {stock.height}mm
          </span>
        </div>
        <div className={styles.stockInfoRow}>
          <span className={styles.stockInfoLabel}>가격</span>
          <span className={styles.stockPrice}>
            ₩{stock.price.toLocaleString()}
          </span>
        </div>
        <div className={styles.stockInfoRow}>
          <span className={styles.stockInfoLabel}>재고</span>
          <span className={`${styles.stockCount} ${styles[getStockLevel(stock.stock)]}`}>
            {stock.stock}장
          </span>
        </div>
      </div>
    </div>
  );
};

export default StockItem;