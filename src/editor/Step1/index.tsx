import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import StepContainer from './components/StepContainer';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { getProject } from '@/firebase/projects';
import { getSpaceConfigDefaults } from '@/firebase/userProfiles';
import styles from './style.module.css';

// onClose prop 타입 추가
interface Step1Props {
  onClose?: () => void;
  projectId?: string;
  projectTitle?: string;
  initialStep?: 1 | 2;
}

const Step1: React.FC<Step1Props> = ({ onClose, projectId, projectTitle, initialStep }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  
  const { 
    setBasicInfo,
    resetAll: resetProject
  } = useProjectStore();
  
  const { 
    setSpaceInfo,
    resetAll: resetSpaceConfig
  } = useSpaceConfigStore();

  const { 
    clearAllModules,
    setPlacedModules
  } = useFurnitureStore();

  // 프로젝트 데이터 로드
  const loadProject = async (projectId: string) => {
    setLoading(true);
    try {
      const { project, error } = await getProject(projectId);
      if (error) {
        console.error('프로젝트 로드 에러:', error);
        alert('프로젝트를 불러오는데 실패했습니다: ' + error);
        navigate('/dashboard');
        return;
      }

      if (project) {
        // Store에 데이터 설정
        setBasicInfo(project.projectData);
        setSpaceInfo(project.spaceConfig);
        setPlacedModules(project.furniture.placedModules);
        console.log('✅ 프로젝트 로드 성공:', project.title);
      }
    } catch (error) {
      console.error('프로젝트 로드 실패:', error);
      alert('프로젝트 로드 중 오류가 발생했습니다.');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  // 유저 디폴트 공간설정 적용
  const applyUserDefaults = async () => {
    try {
      const defaults = await getSpaceConfigDefaults();
      if (defaults) {
        const current = useSpaceConfigStore.getState().spaceInfo;
        setSpaceInfo({
          ...current,
          width: defaults.width ?? current.width,
          height: defaults.height ?? current.height,
          gapConfig: {
            left: defaults.gapLeft ?? current.gapConfig?.left ?? 1.5,
            right: defaults.gapRight ?? current.gapConfig?.right ?? 1.5,
          },
          frameSize: {
            ...current.frameSize!,
            top: defaults.frameTop ?? current.frameSize?.top ?? 30,
          },
          baseConfig: {
            ...current.baseConfig!,
            height: defaults.baseHeight ?? current.baseConfig?.height ?? 65,
          },
          furnitureSingleWidth: defaults.furnitureSingleWidth ?? current.furnitureSingleWidth,
          furnitureDualWidth: defaults.furnitureDualWidth ?? current.furnitureDualWidth,
          // 프레임 설정 (surroundMode)
          ...(defaults.surroundMode ? {
            surroundType: defaults.surroundMode === 'no-surround' ? 'no-surround' as const : 'surround' as const,
            frameConfig: defaults.surroundMode === 'full-surround'
              ? { left: true, right: true, top: true, bottom: true }
              : defaults.surroundMode === 'sides-only'
                ? { left: true, right: true, top: false, bottom: false }
                : { left: false, right: false, top: true, bottom: false },
          } : {}),
        });
        console.log('✅ 유저 공간설정 기본값 적용:', defaults);
      }
    } catch (error) {
      console.error('유저 공간설정 기본값 로드 실패:', error);
    }
  };

  // Step1 컴포넌트 마운트 시 처리
  useEffect(() => {
    if (initialStep === 2) {
      // Step2부터 시작 (이름은 이미 설정됨) - spaceConfig와 furniture만 초기화
      console.log('🧹 Step1 마운트: Step2부터 시작 - spaceConfig/furniture 초기화');
      resetSpaceConfig();
      clearAllModules();
      applyUserDefaults();
    } else {
      // Step1부터 시작 - 전체 초기화
      console.log('🧹 Step1 마운트: 새 디자인 생성을 위해 store 초기화');
      resetProject();
      resetSpaceConfig();
      clearAllModules();
      applyUserDefaults();
      console.log('📝 Step1: 디자인 제목 입력 필드 초기화 (빈 상태)');
    }
  }, []);

  // 로딩 중일 때 표시할 UI
  if (loading) {
    return (
      <LoadingSpinner
        fullscreen
        message="프로젝트를 불러오는 중..."
      />
    );
  }

  // X 버튼 핸들러
  const handleClose = () => {
    if (onClose) onClose();
    else navigate('/dashboard');
  };

  return (
    <div data-theme="light" style={{ colorScheme: 'light' }}>
      <StepContainer onClose={handleClose} projectId={projectId} projectTitle={projectTitle} initialStep={initialStep} />
    </div>
  );
};

export default Step1;