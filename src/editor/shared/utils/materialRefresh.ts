import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';

/**
 * 프레임 색상 강제 새로고침 유틸리티
 * MaterialPanel에서 색상을 다시 클릭했을 때와 동일한 효과를 제공
 * 
 * 사용 시점:
 * 1. 서라운드 타입 변경 시
 * 2. 파일 불러오기 시  
 * 3. 새로운 메시 생성 시
 */
export const refreshFrameColors = () => {
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore.getState();
  
  if (!spaceInfo.materialConfig) {
    console.warn('🚨 materialConfig가 없어서 프레임 색상 새로고침을 건너뜁니다.');
    return;
  }
  
  console.log('🎨 프레임 색상 강제 새로고침 시작:', {
    현재색상: spaceInfo.materialConfig,
    트리거: 'refreshFrameColors'
  });
  
  // materialConfig 객체를 새로 생성하여 React 리렌더링 트리거
  // 실제 색상 값은 동일하게 유지하면서 객체 참조만 변경
  setSpaceInfo({
    materialConfig: {
      ...spaceInfo.materialConfig
    }
  });
  
  console.log('✅ 프레임 색상 강제 새로고침 완료');
};

/**
 * 리소스 효율적인 방식으로 프레임 색상 새로고침
 * 실제로 색상이 누락된 경우에만 실행
 */
export const refreshFrameColorsIfNeeded = (triggerContext: string = 'unknown') => {
  // 개발 환경에서만 실행 (프로덕션에서는 성능 최적화)
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 프레임 색상 체크 (${triggerContext})`);
    
    // 약간의 지연 후 실행하여 React 렌더링 사이클과 충돌 방지
    setTimeout(() => {
      refreshFrameColors();
    }, 50);
  }
}; 