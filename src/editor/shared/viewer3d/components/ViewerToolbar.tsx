import React from 'react';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import styles from './ViewerToolbar.module.css';

interface ViewerToolbarProps {
  viewMode: '2D' | '3D';
  isReadOnly?: boolean; // 읽기 전용 모드 (독립적인 도어 상태 관리용)
  onDoorsToggle?: () => void; // 읽기 전용 모드에서 사용할 도어 토글 함수
  doorsOpen?: boolean; // 읽기 전용 모드에서 사용할 도어 상태
}

const ViewerToolbar: React.FC<ViewerToolbarProps> = ({ 
  viewMode, 
  isReadOnly = false,
  onDoorsToggle: propDoorsToggle,
  doorsOpen: propDoorsOpen 
}) => {
  const { indirectLightEnabled, toggleIndirectLight, doorsOpen: storeDoorsOpen, toggleDoors: storeToggleDoors } = useUIStore();
  const placedModules = useFurnitureStore((state) => state.placedModules);
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);
  
  // 읽기 전용 모드면 prop 사용, 아니면 store 사용
  const doorsOpen = isReadOnly ? propDoorsOpen : storeDoorsOpen;
  const toggleDoors = isReadOnly ? propDoorsToggle : storeToggleDoors;
  
  // 띄워서 배치 설정 확인
  const isFloatingMode = spaceInfo?.baseConfig?.placementType === 'float' && 
                         (spaceInfo?.baseConfig?.floatHeight || 0) > 0;
  
  // 상부장이 있는지 확인
  const hasUpperCabinet = placedModules.some(module => 
    module.moduleId.includes('upper-cabinet') || module.moduleId.includes('upper')
  );
  
  // 도어가 있는 가구가 있는지 확인
  const hasDoorsInstalled = placedModules.some(module => 
    module.hasDoor !== false // 도어가 있는 가구만 (도어가 없는 가구 제외)
  );
  
  // 3D 모드가 아니거나 표시할 요소가 없으면 null 반환
  const showIndirectLight = viewMode === '3D' && (hasUpperCabinet || isFloatingMode);
  const showDoorButton = hasDoorsInstalled && toggleDoors; // 도어가 있고 토글 함수가 있을 때만
  
  if (!showIndirectLight && !showDoorButton) {
    return null;
  }
  
  return (
    <div className={styles.toolbar}>
      {/* 도어 열기/닫기 버튼 */}
      {showDoorButton && (
        <div
          className={`${styles.toolbarButton} ${doorsOpen ? styles.active : ''}`}
          onClick={toggleDoors}
          title={doorsOpen ? '도어 닫기' : '도어 열기'}
          role="button"
          tabIndex={0}
        >
          {/* 도어 아이콘 SVG */}
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
            {doorsOpen ? (
              // 도어 열림 상태
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
                <circle cx="7" cy="12" r="0.5" fill="currentColor" />
              </>
            ) : (
              // 도어 닫힘 상태
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="12" y1="3" x2="12" y2="21" />
                <circle cx="14" cy="12" r="0.5" fill="currentColor" />
              </>
            )}
          </svg>
        </div>
      )}
      
      {/* 간접조명 버튼 */}
      {showIndirectLight && (
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
      )}
    </div>
  );
};

export default ViewerToolbar;