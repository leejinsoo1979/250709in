import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import StepContainer from './components/StepContainer';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { getProject } from '@/firebase/projects';
import styles from './style.module.css';

// onClose prop 타입 추가
interface Step1Props {
  onClose?: () => void;
  projectId?: string;
  projectTitle?: string;
}

const Step1: React.FC<Step1Props> = ({ onClose, projectId, projectTitle }) => {
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

  // Step1 컴포넌트 마운트 시 처리
  useEffect(() => {
    // Step1은 항상 새 디자인을 생성하는 것이므로 store 초기화
    console.log('🧹 Step1 마운트: 새 디자인 생성을 위해 store 초기화');
    resetProject();
    resetSpaceConfig();
    clearAllModules();

    // projectId와 projectTitle은 prop으로 전달되어 헤더에 표시됨
    // basicInfo.title은 비워서 사용자가 디자인 제목을 직접 입력하도록 함
    console.log('📝 Step1: 디자인 제목 입력 필드 초기화 (빈 상태)');
  }, []);

  // 로딩 중일 때 표시할 UI
  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <LoadingSpinner 
          message="프로젝트를 불러오는 중..."
          size="large"
          type="spinner"
        />
        <p className={styles.loadingSubtext}>잠시만 기다려주세요.</p>
      </div>
    );
  }

  // X 버튼 핸들러
  const handleClose = () => {
    if (onClose) onClose();
    else navigate('/dashboard');
  };

  return (
    <div data-theme="light" style={{ colorScheme: 'light' }}>
      <StepContainer onClose={handleClose} projectId={projectId} projectTitle={projectTitle} />
    </div>
  );
};

export default Step1;