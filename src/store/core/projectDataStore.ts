/**
 * 프로젝트 전체 데이터를 관리하는 통합 스토어
 * Step1-3의 모든 데이터를 체계적으로 관리
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  ProjectData, 
  ProjectBasicInfo, 
  SpaceConfiguration, 
  CustomLayoutConfiguration,
  DEFAULT_SPACE_CONFIG,
  DEFAULT_CUSTOM_LAYOUT,
  DEFAULT_PROJECT_METADATA,
  DEFAULT_PROJECT_STATS,
  UpdateProjectData 
} from '@/types/project';
import { serverTimestamp, Timestamp } from 'firebase/firestore';

// ========================
// 스토어 상태 인터페이스
// ========================

interface ProjectDataState {
  /** 현재 프로젝트 데이터 */
  currentProject: ProjectData | null;
  /** 데이터 로딩 상태 */
  isLoading: boolean;
  /** 저장 중 상태 */
  isSaving: boolean;
  /** 데이터 변경 상태 */
  isDirty: boolean;
  /** 에러 상태 */
  error: string | null;
  /** 현재 Step (1, 2, 3) */
  currentStep: 1 | 2 | 3;
  
  // ========================
  // 액션 메서드들
  // ========================
  
  /** 새 프로젝트 초기화 */
  initializeNewProject: (userId: string) => void;
  
  /** 프로젝트 로드 */
  loadProject: (projectData: ProjectData) => void;
  
  /** STEP 1: 기본 정보 업데이트 */
  updateBasicInfo: (updates: Partial<ProjectBasicInfo>) => void;
  
  /** STEP 2: 공간 설정 업데이트 */
  updateSpaceConfig: (updates: Partial<SpaceConfiguration>) => void;
  
  /** STEP 3: 맞춤 배치 설정 업데이트 */
  updateCustomLayout: (updates: Partial<CustomLayoutConfiguration>) => void;
  
  /** 현재 Step 설정 */
  setCurrentStep: (step: 1 | 2 | 3) => void;
  
  /** 프로젝트 완료 상태로 설정 */
  markAsCompleted: () => void;
  
  /** 데이터 저장 완료 표시 */
  markAsSaved: () => void;
  
  /** 에러 설정 */
  setError: (error: string | null) => void;
  
  /** 로딩 상태 설정 */
  setLoading: (loading: boolean) => void;
  
  /** 저장 중 상태 설정 */
  setSaving: (saving: boolean) => void;
  
  /** 프로젝트 초기화 */
  resetProject: () => void;
  
  /** 데이터 검증 */
  validateCurrentStep: () => { isValid: boolean; errors: string[] };
  
  /** Step별 완료 상태 확인 */
  getStepCompletionStatus: () => {
    step1: boolean;
    step2: boolean;
    step3: boolean;
    allCompleted: boolean;
  };
}

// ========================
// 유틸리티 함수들
// ========================

/** 새 프로젝트 기본 데이터 생성 */
const createNewProjectData = (userId: string): ProjectData => {
  const now = serverTimestamp() as Timestamp;
  
  return {
    id: '', // Firebase에서 생성될 ID
    userId,
    basicInfo: {
      title: '',
      location: '',
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
    },
    spaceConfig: { ...DEFAULT_SPACE_CONFIG },
    customLayout: { ...DEFAULT_CUSTOM_LAYOUT },
    metadata: { ...DEFAULT_PROJECT_METADATA },
    stats: { ...DEFAULT_PROJECT_STATS },
  };
};

/** Step 1 데이터 검증 */
const validateStep1 = (basicInfo: ProjectBasicInfo): string[] => {
  const errors: string[] = [];
  
  if (!basicInfo.title?.trim()) {
    errors.push('디자인 제목을 입력해주세요.');
  }
  
  if (!basicInfo.location?.trim()) {
    errors.push('설치 위치를 입력해주세요.');
  }
  
  return errors;
};

/** Step 2 데이터 검증 */
const validateStep2 = (spaceConfig: SpaceConfiguration): string[] => {
  const errors: string[] = [];
  
  if (spaceConfig.dimensions.width <= 0) {
    errors.push('공간 폭을 올바르게 입력해주세요.');
  }
  
  if (spaceConfig.dimensions.height <= 0) {
    errors.push('공간 높이를 올바르게 입력해주세요.');
  }
  
  if (spaceConfig.installType === 'standalone' && !spaceConfig.wallPosition) {
    errors.push('세미스탠딩의 경우 벽 위치를 선택해주세요.');
  }
  
  return errors;
};

/** Step 3 데이터 검증 */
const validateStep3 = (customLayout: CustomLayoutConfiguration): string[] => {
  const errors: string[] = [];
  
  // 필수 설정들이 완료되었는지 확인
  if (!customLayout.wall.completed) {
    errors.push('맞춤 방듯 설정을 완료해주세요.');
  }
  
  if (!customLayout.ventilation.completed) {
    errors.push('방충대 설정을 완료해주세요.');
  }
  
  if (!customLayout.exhaust.completed) {
    errors.push('배기 설정을 완료해주세요.');
  }
  
  return errors;
};

// ========================
// 스토어 생성
// ========================

export const useProjectDataStore = create<ProjectDataState>()(
  subscribeWithSelector((set, get) => ({
    // 초기 상태
    currentProject: null,
    isLoading: false,
    isSaving: false,
    isDirty: false,
    error: null,
    currentStep: 1,
    
    // 새 프로젝트 초기화
    initializeNewProject: (userId: string) => {
      const newProject = createNewProjectData(userId);
      set({
        currentProject: newProject,
        isDirty: true,
        error: null,
        currentStep: 1,
      });
    },
    
    // 프로젝트 로드
    loadProject: (projectData: ProjectData) => {
      set({
        currentProject: projectData,
        isDirty: false,
        error: null,
        isLoading: false,
      });
    },
    
    // STEP 1: 기본 정보 업데이트
    updateBasicInfo: (updates: Partial<ProjectBasicInfo>) => {
      const current = get().currentProject;
      if (!current) return;
      
      const updatedProject: ProjectData = {
        ...current,
        basicInfo: {
          ...current.basicInfo,
          ...updates,
          updatedAt: serverTimestamp() as Timestamp,
        },
      };
      
      set({
        currentProject: updatedProject,
        isDirty: true,
        error: null,
      });
    },
    
    // STEP 2: 공간 설정 업데이트
    updateSpaceConfig: (updates: Partial<SpaceConfiguration>) => {
      const current = get().currentProject;
      if (!current) return;
      
      const updatedProject: ProjectData = {
        ...current,
        spaceConfig: {
          ...current.spaceConfig,
          ...updates,
          // 중첩된 객체들 병합
          dimensions: {
            ...current.spaceConfig.dimensions,
            ...(updates.dimensions || {}),
          },
          damper: {
            ...current.spaceConfig.damper,
            ...(updates.damper || {}),
            size: {
              ...current.spaceConfig.damper.size,
              ...(updates.damper?.size || {}),
            },
          },
          floorFinish: {
            ...current.spaceConfig.floorFinish,
            ...(updates.floorFinish || {}),
          },
        },
        basicInfo: {
          ...current.basicInfo,
          updatedAt: serverTimestamp() as Timestamp,
        },
      };
      
      set({
        currentProject: updatedProject,
        isDirty: true,
        error: null,
      });
    },
    
    // STEP 3: 맞춤 배치 설정 업데이트
    updateCustomLayout: (updates: Partial<CustomLayoutConfiguration>) => {
      const current = get().currentProject;
      if (!current) return;
      
      const updatedProject: ProjectData = {
        ...current,
        customLayout: {
          ...current.customLayout,
          ...updates,
          // 중첩된 객체들 병합
          wall: {
            ...current.customLayout.wall,
            ...(updates.wall || {}),
          },
          rack: {
            ...current.customLayout.rack,
            ...(updates.rack || {}),
            options: {
              isComposite: false,
              ...current.customLayout.rack.options,
              ...(updates.rack?.options || {}),
            },
          },
          motor: {
            ...current.customLayout.motor,
            ...(updates.motor || {}),
          },
          ventilation: {
            ...current.customLayout.ventilation,
            ...(updates.ventilation || {}),
          },
          exhaust: {
            ...current.customLayout.exhaust,
            ...(updates.exhaust || {}),
          },
        },
        basicInfo: {
          ...current.basicInfo,
          updatedAt: serverTimestamp() as Timestamp,
        },
      };
      
      set({
        currentProject: updatedProject,
        isDirty: true,
        error: null,
      });
    },
    
    // 현재 Step 설정
    setCurrentStep: (step: 1 | 2 | 3) => {
      set({ currentStep: step });
    },
    
    // 프로젝트 완료 상태로 설정
    markAsCompleted: () => {
      const current = get().currentProject;
      if (!current) return;
      
      const updatedProject: ProjectData = {
        ...current,
        metadata: {
          ...current.metadata,
          status: 'completed',
        },
        stats: {
          ...current.stats,
          completionRate: 100,
        },
        basicInfo: {
          ...current.basicInfo,
          updatedAt: serverTimestamp() as Timestamp,
        },
      };
      
      set({
        currentProject: updatedProject,
        isDirty: true,
      });
    },
    
    // 데이터 저장 완료 표시
    markAsSaved: () => {
      set({
        isDirty: false,
        isSaving: false,
        error: null,
      });
    },
    
    // 에러 설정
    setError: (error: string | null) => {
      set({ error, isLoading: false, isSaving: false });
    },
    
    // 로딩 상태 설정
    setLoading: (loading: boolean) => {
      set({ isLoading: loading });
    },
    
    // 저장 중 상태 설정
    setSaving: (saving: boolean) => {
      set({ isSaving: saving });
    },
    
    // 프로젝트 초기화
    resetProject: () => {
      set({
        currentProject: null,
        isLoading: false,
        isSaving: false,
        isDirty: false,
        error: null,
        currentStep: 1,
      });
    },
    
    // 데이터 검증
    validateCurrentStep: (): { isValid: boolean; errors: string[] } => {
      const { currentProject, currentStep } = get();
      if (!currentProject) {
        return { isValid: false, errors: ['프로젝트 데이터가 없습니다.'] };
      }
      
      let errors: string[] = [];
      
      switch (currentStep) {
        case 1:
          errors = validateStep1(currentProject.basicInfo);
          break;
        case 2:
          errors = validateStep2(currentProject.spaceConfig);
          break;
        case 3:
          errors = validateStep3(currentProject.customLayout);
          break;
      }
      
      return {
        isValid: errors.length === 0,
        errors,
      };
    },
    
    // Step별 완료 상태 확인
    getStepCompletionStatus: () => {
      const { currentProject } = get();
      if (!currentProject) {
        return { step1: false, step2: false, step3: false, allCompleted: false };
      }
      
      const step1Valid = validateStep1(currentProject.basicInfo).length === 0;
      const step2Valid = validateStep2(currentProject.spaceConfig).length === 0;
      const step3Valid = validateStep3(currentProject.customLayout).length === 0;
      
      return {
        step1: step1Valid,
        step2: step2Valid,
        step3: step3Valid,
        allCompleted: step1Valid && step2Valid && step3Valid,
      };
    },
  }))
);

// ========================
// 선택자 훅들 (성능 최적화)
// ========================

/** 현재 프로젝트의 기본 정보만 선택 */
export const useProjectBasicInfo = () => 
  useProjectDataStore(state => state.currentProject?.basicInfo);

/** 현재 프로젝트의 공간 설정만 선택 */
export const useProjectSpaceConfig = () => 
  useProjectDataStore(state => state.currentProject?.spaceConfig);

/** 현재 프로젝트의 맞춤 배치 설정만 선택 */
export const useProjectCustomLayout = () => 
  useProjectDataStore(state => state.currentProject?.customLayout);

/** 현재 Step 상태만 선택 */
export const useCurrentStep = () => 
  useProjectDataStore(state => state.currentStep);

/** 프로젝트 상태 정보만 선택 */
export const useProjectStatus = () => 
  useProjectDataStore(state => ({
    isLoading: state.isLoading,
    isSaving: state.isSaving,
    isDirty: state.isDirty,
    error: state.error,
  }));