import React from 'react';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import styles from './ViewerToolbar.module.css';

interface ViewerToolbarProps {
  viewMode: '2D' | '3D';
}

const ViewerToolbar: React.FC<ViewerToolbarProps> = ({ viewMode }) => {
  const { indirectLightEnabled, toggleIndirectLight } = useUIStore();
  const placedModules = useFurnitureStore((state) => state.placedModules);
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);
  
  // 띄워서 배치 설정 확인
  const isFloatingMode = spaceInfo?.baseConfig?.placementType === 'float' && 
                         (spaceInfo?.baseConfig?.floatHeight || 0) > 0;
  
  // 상부장이 있는지 확인
  const hasUpperCabinet = placedModules.some(module => 
    module.moduleId.includes('upper-cabinet') || module.moduleId.includes('upper')
  );
  
  // 3D 모드가 아니거나 (상부장이 없고 띄워서 배치가 아닌 경우) 표시하지 않음
  if (viewMode !== '3D' || (!hasUpperCabinet && !isFloatingMode)) {
    return null;
  }
  
  return (
    <div className={styles.toolbar}>
      <div
        className={`${styles.toolbarButton} ${indirectLightEnabled ? styles.active : ''}`}
        onClick={toggleIndirectLight}
        title={indirectLightEnabled ? '간접조명 끄기' : '간접조명 켜기'}
        role="button"
        tabIndex={0}
      >
        {/* 전구 아이콘 SVG */}
        <svg 
          width="24" 
          height="24" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="1.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          {indirectLightEnabled ? (
            // 전구 켜진 상태 - 빛이 발산하는 아이콘 (180도 뒤집힘)
            <>
              {/* 빛 발산 효과 - 짧은 선으로 표현 */}
              <line x1="12" y1="2" x2="12" y2="0" strokeWidth="1.5"></line>
              <line x1="19" y1="5" x2="20.5" y2="3.5" strokeWidth="1.5"></line>
              <line x1="22" y1="12" x2="24" y2="12" strokeWidth="1.5"></line>
              <line x1="19" y1="19" x2="20.5" y2="20.5" strokeWidth="1.5"></line>
              <line x1="12" y1="22" x2="12" y2="24" strokeWidth="1.5"></line>
              <line x1="5" y1="19" x2="3.5" y2="20.5" strokeWidth="1.5"></line>
              <line x1="2" y1="12" x2="0" y2="12" strokeWidth="1.5"></line>
              <line x1="5" y1="5" x2="3.5" y2="3.5" strokeWidth="1.5"></line>
              
              {/* 소켓 부분 (위쪽) */}
              <rect x="10" y="4" width="4" height="3" fill="currentColor" fillOpacity="0.3"></rect>
              <line x1="10" y1="5" x2="14" y2="5" strokeWidth="0.5"></line>
              <line x1="10" y1="6" x2="14" y2="6" strokeWidth="0.5"></line>
              {/* 전구 모양 (아래쪽) */}
              <circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity="0.3"></circle>
              <circle cx="12" cy="12" r="6"></circle>
              {/* 필라멘트 표현 */}
              <path d="M10 12 L12 14 L14 12 L12 10 Z" stroke="currentColor" strokeWidth="0.5" fill="none"></path>
            </>
          ) : (
            // 전구 꺼진 상태 - 빛 발산 없음 (180도 뒤집힘)
            <>
              {/* 소켓 부분 (위쪽) */}
              <rect x="10" y="4" width="4" height="3" fill="currentColor" fillOpacity="0.3"></rect>
              <line x1="10" y1="5" x2="14" y2="5" strokeWidth="0.5"></line>
              <line x1="10" y1="6" x2="14" y2="6" strokeWidth="0.5"></line>
              {/* 전구 모양만 (아래쪽) */}
              <circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity="0.3"></circle>
              <circle cx="12" cy="12" r="6"></circle>
            </>
          )}
        </svg>
      </div>
    </div>
  );
};

export default ViewerToolbar;