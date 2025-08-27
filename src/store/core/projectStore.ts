import { create } from 'zustand';

// 기본 정보 타입
export interface BasicInfo {
  title: string;
  location: string;
}

// 프로젝트 상태 타입
interface ProjectState {
  // 상태
  projectId: string | null;
  projectTitle: string | null;  // 프로젝트명 추가
  basicInfo: BasicInfo;
  isDirty: boolean;  // 변경사항 있음을 표시
  
  // 프로젝트 ID 액션
  setProjectId: (id: string | null) => void;
  setProjectTitle: (title: string | null) => void;  // 프로젝트명 설정 액션 추가
  
  // 기본 정보 액션
  setBasicInfo: (info: Partial<BasicInfo>) => void;
  resetBasicInfo: () => void;
  
  // 전체 상태 관리
  resetAll: () => void;
  markAsSaved: () => void;
}

// 초기 상태
const initialState: Omit<ProjectState, 'setProjectId' | 'setProjectTitle' | 'setBasicInfo' | 'resetBasicInfo' | 'resetAll' | 'markAsSaved'> = {
  projectId: null,
  projectTitle: null,
  basicInfo: {
    title: '',
    location: '',
  },
  isDirty: false,
};

export const useProjectStore = create<ProjectState>()((set) => ({
  ...initialState,
  
  // 프로젝트 ID 설정
  setProjectId: (id) =>
    set({ projectId: id }),
  
  // 프로젝트 제목 설정
  setProjectTitle: (title) =>
    set({ projectTitle: title }),
  
  // 기본 정보 설정
  setBasicInfo: (info) =>
    set((state) => ({
      basicInfo: { ...state.basicInfo, ...info },
      isDirty: true,
    })),
  
  // 기본 정보 초기화
  resetBasicInfo: () =>
    set({
      basicInfo: initialState.basicInfo,
      isDirty: false,  // 초기화할 때는 변경사항이 없음
    }),
  
  // 전체 상태 초기화
  resetAll: () => set({ ...initialState, isDirty: false }),
  
  // 저장 상태로 마킹
  markAsSaved: () => set({ isDirty: false }),
})); 