import React from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../../viewer3d/utils/geometry';
import styles from './ModulePropertiesPanel.module.css';

const ModulePropertiesPanel: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const { activePopup, closeAllPopups } = useUIStore();
  
  // 가구 팝업이 활성화되지 않았으면 렌더링하지 않음
  if (activePopup.type !== 'furniture' || !activePopup.id) {
    return null;
  }
  
  const internalSpace = calculateInternalSpace(spaceInfo);
  const moduleData = getModuleById(activePopup.id, internalSpace, spaceInfo);
  
  if (!moduleData) {
    return null;
  }
  
  const handleClose = () => {
    closeAllPopups();
  };
  
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };
  
  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>가구 속성</h3>
          <button className={styles.closeButton} onClick={handleClose}>
            ✕
          </button>
        </div>
        
        <div className={styles.content}>
          <div className={styles.moduleInfo}>
            <div className={styles.modulePreview}>
              <div 
                className={styles.moduleBox}
                style={{ 
                  backgroundColor: moduleData.color,
                  aspectRatio: `${moduleData.dimensions.width} / ${moduleData.dimensions.height}`
                }}
              />
            </div>
            
            <div className={styles.moduleDetails}>
              <h4 className={styles.moduleName}>{moduleData.name}</h4>
              
              <div className={styles.property}>
                <span className={styles.propertyLabel}>크기:</span>
                <span className={styles.propertyValue}>
                  {moduleData.dimensions.width} × {moduleData.dimensions.height} × {moduleData.dimensions.depth}mm
                </span>
              </div>
              
              <div className={styles.property}>
                <span className={styles.propertyLabel}>타입:</span>
                <span className={styles.propertyValue}>{moduleData.type || '기본'}</span>
              </div>
              
              <div className={styles.property}>
                <span className={styles.propertyLabel}>도어:</span>
                <span className={styles.propertyValue}>{moduleData.hasDoor ? '있음' : '없음'}</span>
              </div>
              
              {moduleData.description && (
                <div className={styles.property}>
                  <span className={styles.propertyLabel}>설명:</span>
                  <span className={styles.propertyValue}>{moduleData.description}</span>
                </div>
              )}
              
              {moduleData.isDynamic && (
                <div className={styles.property}>
                  <span className={styles.propertyLabel}>맞춤형:</span>
                  <span className={styles.propertyValue}>예</span>
                </div>
              )}
            </div>
          </div>
          
          {/* 추후 추가될 속성들을 위한 플레이스홀더 */}
          <div className={styles.placeholder}>
            <p>추가 속성 설정은 곧 추가될 예정입니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModulePropertiesPanel; 