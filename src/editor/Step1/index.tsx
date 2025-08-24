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
    const projectId = searchParams.get('projectId');
    
    if (projectId) {
      // URL에 프로젝트 ID가 있으면 해당 프로젝트 로드
      loadProject(projectId);
    } else {
      // 새 프로젝트 시작 - 모든 데이터 초기화
      // 모달로 열린 경우에는 항상 초기화
      resetProject();
      resetSpaceConfig();
      clearAllModules();
    }
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