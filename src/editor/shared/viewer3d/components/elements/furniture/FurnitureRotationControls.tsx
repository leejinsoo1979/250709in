import React, { useState, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { useFurnitureStore } from '@/store';
import { useUIStore } from '@/store/uiStore';
import { TouchGestureHandler } from '@/components/TouchUI/TouchGestureHandler';
import styles from './FurnitureRotationControls.module.css';

interface FurnitureRotationControlsProps {
  placedModuleId: string;
  position: [number, number, number];
  currentRotation: number;
  onRotationChange: (rotation: number) => void;
}

export const FurnitureRotationControls: React.FC<FurnitureRotationControlsProps> = ({
  placedModuleId,
  position,
  currentRotation,
  onRotationChange
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(currentRotation);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
  const { activePopup } = useUIStore();

  // 회전 각도 변경 처리
  const handleRotationChange = useCallback((newRotation: number) => {
    setRotationAngle(newRotation);
    onRotationChange(newRotation);
    
    // 스토어 업데이트
    updatePlacedModule(placedModuleId, {
      rotation: newRotation
    });
  }, [placedModuleId, onRotationChange, updatePlacedModule]);

  // 회전 제스처 처리
  const handleRotate = useCallback((angle: number) => {
    const newRotation = (rotationAngle + angle) % 360;
    handleRotationChange(newRotation);
  }, [rotationAngle, handleRotationChange]);

  // 회전 리셋
  const handleResetRotation = useCallback(() => {
    handleRotationChange(0);
  }, [handleRotationChange]);

  // 90도 단위 회전
  const handleRotate90 = useCallback(() => {
    const newRotation = (rotationAngle + 90) % 360;
    handleRotationChange(newRotation);
  }, [rotationAngle, handleRotationChange]);

  // 회전 방향 토글
  const handleRotateDirection = useCallback((direction: 'left' | 'right') => {
    const increment = direction === 'left' ? -90 : 90;
    const newRotation = (rotationAngle + increment + 360) % 360;
    handleRotationChange(newRotation);
  }, [rotationAngle, handleRotationChange]);

  // 가구가 선택되었을 때만 표시
  const isSelected = activePopup?.type === 'furnitureEdit' && activePopup.id === placedModuleId;

  if (!isSelected) return null;

  return (
    <Html
      position={[position[0], position[1] + 1, position[2]]}
      center
      style={{
        userSelect: 'none',
        pointerEvents: 'auto',
        zIndex: 1000,
        background: 'transparent'
      }}
    >
      <div className={styles.furnitureRotationControls}>
        {/* 회전 컨트롤 패널 */}
        <div className={styles.rotationPanel}>
          <div className={styles.rotationDisplay}>
            <span className={styles.rotationAngle}>{rotationAngle.toFixed(0)}°</span>
          </div>
          
          <div className={styles.rotationButtons}>
            <button 
              className={styles.rotationBtnLeft}
              onClick={() => handleRotateDirection('left')}
              title="90도 왼쪽 회전"
            >
              ↶
            </button>
            
            <button 
              className={styles.rotationBtnReset}
              onClick={handleResetRotation}
              title="회전 리셋"
            >
              ↺
            </button>
            
            <button 
              className={styles.rotationBtnRight}
              onClick={() => handleRotateDirection('right')}
              title="90도 오른쪽 회전"
            >
              ↷
            </button>
          </div>
          
          {/* 터치 회전 영역 */}
          <TouchGestureHandler
            onRotate={handleRotate}
            onTap={() => setIsVisible(!isVisible)}
            enableHapticFeedback={true}
            className={styles.rotationGestureArea}
          >
            <div className={styles.rotationGestureHint}>
              <span>터치하여 회전</span>
              <div className={styles.gestureIcon}>🔄</div>
            </div>
          </TouchGestureHandler>
        </div>
      </div>
    </Html>
  );
}; 