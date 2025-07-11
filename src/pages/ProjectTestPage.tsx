import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { LoginForm } from '@/components/auth/LoginForm';
import { signOutUser } from '@/firebase/auth';
import { createProject, getUserProjects, getProject, deleteProject } from '@/firebase/projects';
import { CreateProjectData, ProjectSummary } from '@/firebase/types';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import styles from './ProjectTestPage.module.css';

// 프로젝트 관리 컴포넌트
const ProjectManager: React.FC = () => {
  const { user, loading } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 프로젝트 목록 불러오기
  const loadProjects = async () => {
    setIsLoading(true);
    setError(null);
    
    const result = await getUserProjects();
    if (result.error) {
      setError(result.error);
    } else {
      setProjects(result.projects);
      console.log('📋 프로젝트 목록:', result.projects);
    }
    
    setIsLoading(false);
  };

  // 새 프로젝트 생성
  const handleCreateProject = async () => {
    if (!newProjectTitle.trim()) {
      setError('프로젝트 제목을 입력하세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    // 테스트용 프로젝트 데이터
    const testProjectData: CreateProjectData = {
      title: newProjectTitle,
      projectData: {
        title: newProjectTitle,
        location: '테스트 위치'
      },
      spaceConfig: {
        width: 2400,
        height: 2400,
        depth: 580,
        installType: 'built-in',
        wallConfig: { left: true, right: true },
        hasFloorFinish: false,
        floorFinish: { height: 50 },
        surroundType: 'surround',
        frameSize: { left: 50, right: 50, top: 50 },
        baseConfig: { type: 'floor', height: 65, placementType: 'ground' },
        materialConfig: { interiorColor: '#FFFFFF', doorColor: '#FFFFFF' }
      },
      furniture: {
        placedModules: [
          {
            id: 'test-module-1',
            moduleId: 'box-shelf-single-400',
            position: { x: 0, y: 0, z: 0 },
            rotation: 0,
            slotIndex: 0,
            hasDoor: false,
            hingePosition: 'left'
          }
        ]
      }
    };

    const result = await createProject(testProjectData);
    
    if (result.error) {
      setError(result.error);
    } else {
      console.log('✅ 프로젝트 생성 성공:', result.id);
      setNewProjectTitle('');
      await loadProjects(); // 목록 새로고침
    }

    setIsLoading(false);
  };

  // 프로젝트 삭제
  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    setIsLoading(true);
    const result = await deleteProject(projectId);
    
    if (result.error) {
      setError(result.error);
    } else {
      console.log('✅ 프로젝트 삭제 성공');
      await loadProjects(); // 목록 새로고침
    }
    
    setIsLoading(false);
  };

  // 프로젝트 상세 정보 보기
  const handleViewProject = async (projectId: string) => {
    setIsLoading(true);
    const result = await getProject(projectId);
    
    if (result.error) {
      setError(result.error);
    } else {
      console.log('📄 프로젝트 상세:', result.project);
      alert(`프로젝트 로드 성공!\n제목: ${result.project?.title}\n가구 수: ${result.project?.furniture.placedModules.length}`);
    }
    
    setIsLoading(false);
  };

  // 로그아웃
  const handleLogout = async () => {
    const result = await signOutUser();
    if (result.error) {
      console.error('로그아웃 에러:', result.error);
    }
  };

  // 컴포넌트 마운트 시 프로젝트 목록 로드
  useEffect(() => {
    if (user) {
      loadProjects();
    }
  }, [user]);

  if (loading) {
    return (
      <div className={styles.loading}>
        🔄 로딩 중...
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className={styles.container}>
      {/* 헤더 */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <h1>🏠 가구 프로젝트 관리</h1>
          <p>안녕하세요, {user.displayName || user.email}님!</p>
        </div>
        <Button onClick={handleLogout}>로그아웃</Button>
      </div>

      {/* 새 프로젝트 생성 */}
      <div className={styles.createSection}>
        <h3>새 프로젝트 생성</h3>
        <div className={styles.createForm}>
          <Input
            type="text"
            placeholder="프로젝트 제목을 입력하세요"
            value={newProjectTitle}
            onChange={(e) => setNewProjectTitle(e.target.value)}
            className={styles.createInput}
          />
          <Button 
            onClick={handleCreateProject}
            disabled={isLoading}
          >
            {isLoading ? '생성 중...' : '프로젝트 생성'}
          </Button>
        </div>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      {/* 프로젝트 목록 */}
      <div>
        <div className={styles.projectsHeader}>
          <h3>내 프로젝트 ({projects.length}개)</h3>
          <Button onClick={loadProjects} disabled={isLoading}>
            새로고침
          </Button>
        </div>

        {projects.length === 0 ? (
          <div className={styles.emptyState}>
            아직 프로젝트가 없습니다.<br />
            위에서 새 프로젝트를 생성해보세요!
          </div>
        ) : (
          <div className={styles.projectsList}>
            {projects.map((project) => (
              <div key={project.id} className={styles.projectCard}>
                <div className={styles.projectInfo}>
                  <h4>{project.title}</h4>
                  <p>
                    크기: {project.spaceSize.width}×{project.spaceSize.height}×{project.spaceSize.depth}mm<br />
                    가구: {project.furnitureCount}개 | 
                    수정: {new Date(project.updatedAt.seconds * 1000).toLocaleDateString()}
                  </p>
                </div>
                <div className={styles.projectActions}>
                  <Button onClick={() => handleViewProject(project.id)}>
                    보기
                  </Button>
                  <button 
                    onClick={() => handleDeleteProject(project.id)}
                    className={styles.deleteButton}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 테스트 완료 상태 */}
      <div className={styles.testStatus}>
        <h4>🧪 Firebase 테스트 진행 상황:</h4>
        <p>✅ 1. 구글 로그인</p>
        <p>✅ 2. 사용자 정보 표시</p>
        <p>✅ 3. 프로젝트 생성</p>
        <p>✅ 4. 프로젝트 목록 조회</p>
        <p>✅ 5. 프로젝트 상세 조회</p>
        <p>✅ 6. 프로젝트 삭제</p>
        <p>🎯 다음: 기존 에디터와 연동</p>
      </div>
    </div>
  );
};

// 메인 테스트 페이지
const ProjectTestPage: React.FC = () => {
  return (
    <AuthProvider>
      <ProjectManager />
    </AuthProvider>
  );
};

export default ProjectTestPage; 