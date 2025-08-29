import React from 'react';
import { Module, PlacedModule } from '@/types/module';
import styles from './FurnitureInfoModal.module.css';

interface PanelInfo {
  name: string;
  width: number;
  height: number;
  thickness: number;
  material: string;
  quantity: number;
}

interface FurnitureInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleData: Module | null;
  placedModule: PlacedModule | null;
}

const FurnitureInfoModal: React.FC<FurnitureInfoModalProps> = ({
  isOpen,
  onClose,
  moduleData,
  placedModule
}) => {
  if (!isOpen || !moduleData || !placedModule) return null;

  // 패널 정보 생성
  const getPanelList = (): PanelInfo[] => {
    const panels: PanelInfo[] = [];
    const width = placedModule.customWidth || moduleData.dimensions.width;
    const height = moduleData.dimensions.height;
    const depth = placedModule.customDepth || moduleData.dimensions.depth;

    // 기본 패널들
    panels.push({
      name: '상판',
      width: width,
      height: depth,
      thickness: 18,
      material: 'PB',
      quantity: 1
    });

    panels.push({
      name: '하판',
      width: width,
      height: depth,
      thickness: 18,
      material: 'PB',
      quantity: 1
    });

    panels.push({
      name: '좌측판',
      width: depth,
      height: height,
      thickness: 18,
      material: 'PB',
      quantity: 1
    });

    panels.push({
      name: '우측판',
      width: depth,
      height: height,
      thickness: 18,
      material: 'PB',
      quantity: 1
    });

    panels.push({
      name: '뒷판',
      width: width,
      height: height,
      thickness: 5,
      material: 'HDF',
      quantity: 1
    });

    // 서랍이 있는 경우
    if (moduleData.id.includes('drawer')) {
      const drawerCount = moduleData.id.includes('2drawer') ? 2 : 4;
      
      panels.push({
        name: '서랍 전판',
        width: width - 36,
        height: (height - 40) / drawerCount,
        thickness: 18,
        material: 'PB',
        quantity: drawerCount
      });

      panels.push({
        name: '서랍 측판',
        width: depth - 50,
        height: 120,
        thickness: 12,
        material: 'PB',
        quantity: drawerCount * 2
      });

      panels.push({
        name: '서랍 바닥',
        width: width - 60,
        height: depth - 50,
        thickness: 5,
        material: 'HDF',
        quantity: drawerCount
      });
    }

    // 중간 선반이 있는 경우
    if (moduleData.id.includes('hanging')) {
      panels.push({
        name: '중간 선반',
        width: width - 36,
        height: depth - 20,
        thickness: 18,
        material: 'PB',
        quantity: 1
      });
    }

    return panels;
  };

  const panels = getPanelList();
  const totalPanels = panels.reduce((sum, panel) => sum + panel.quantity, 0);

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>가구 상세 정보</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>기본 정보</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.label}>가구명:</span>
                <span className={styles.value}>
                  {placedModule.customWidth && placedModule.customWidth !== moduleData.dimensions.width
                    ? moduleData.name.replace(/\d+mm/, `${placedModule.customWidth}mm`)
                    : moduleData.name}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>타입:</span>
                <span className={styles.value}>{moduleData.category}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>크기:</span>
                <span className={styles.value}>
                  {placedModule.customWidth || moduleData.dimensions.width} × 
                  {moduleData.dimensions.height} × 
                  {placedModule.customDepth || moduleData.dimensions.depth}mm
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>슬롯 위치:</span>
                <span className={styles.value}>슬롯 {placedModule.slotIndex + 1}</span>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>패널 목록 (총 {totalPanels}개)</h3>
            <div className={styles.panelTable}>
              <div className={styles.tableHeader}>
                <div className={styles.headerCell}>패널명</div>
                <div className={styles.headerCell}>크기 (W×H)</div>
                <div className={styles.headerCell}>두께</div>
                <div className={styles.headerCell}>재질</div>
                <div className={styles.headerCell}>수량</div>
              </div>
              <div className={styles.tableBody}>
                {panels.map((panel, index) => (
                  <div key={index} className={styles.tableRow}>
                    <div className={styles.cell}>{panel.name}</div>
                    <div className={styles.cell}>{panel.width} × {panel.height}</div>
                    <div className={styles.cell}>{panel.thickness}mm</div>
                    <div className={styles.cell}>{panel.material}</div>
                    <div className={styles.cell}>{panel.quantity}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default FurnitureInfoModal;