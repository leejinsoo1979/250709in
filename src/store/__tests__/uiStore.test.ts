import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../uiStore'

describe('UIStore', () => {
  beforeEach(() => {
    // 각 테스트 전에 스토어 초기화
    useUIStore.getState().resetUI()
  })

  describe('초기 상태', () => {
    it('기본값들이 올바르게 설정되어야 한다', () => {
      const state = useUIStore.getState()
      
      // 실제 초기값과 일치하도록 수정
      expect(state.viewMode).toBe('3D')
      expect(state.doorsOpen).toBe(false)  // 실제 초기값은 false
      expect(state.selectedModuleForPlacement).toBeNull()
    })
  })

  describe('뷰 모드 상태', () => {
    it('viewMode가 올바르게 변경되어야 한다', () => {
      const store = useUIStore
      
      // 실제 초기값은 3D
      expect(store.getState().viewMode).toBe('3D')
      
      store.getState().setViewMode('2D')
      
      expect(store.getState().viewMode).toBe('2D')
    })

    it('2D와 3D 모드 간 전환이 정상 작동해야 한다', () => {
      const store = useUIStore
      
      store.getState().setViewMode('3D')
      expect(store.getState().viewMode).toBe('3D')
      
      store.getState().setViewMode('2D')
      expect(store.getState().viewMode).toBe('2D')
    })
  })

  describe('문 상태 관리', () => {
    it('문 열림/닫힘 토글이 정상 작동해야 한다', () => {
      const store = useUIStore
      
      // 실제 초기값은 false
      expect(store.getState().doorsOpen).toBe(false)
      
      store.getState().toggleDoors()
      expect(store.getState().doorsOpen).toBe(true)
      
      store.getState().toggleDoors()
      expect(store.getState().doorsOpen).toBe(false)
    })
  })

  describe('모듈 선택 상태', () => {
    it('모듈 선택이 올바르게 설정되어야 한다', () => {
      const store = useUIStore
      
      // selectedModuleForPlacement로 변경
      expect(store.getState().selectedModuleForPlacement).toBeNull()
      
      store.getState().setSelectedModuleForPlacement('module-123')
      expect(store.getState().selectedModuleForPlacement).toBe('module-123')
      
      store.getState().setSelectedModuleForPlacement(null)
      expect(store.getState().selectedModuleForPlacement).toBeNull()
    })

    it('다른 모듈로 변경이 정상 작동해야 한다', () => {
      const store = useUIStore
      
      store.getState().setSelectedModuleForPlacement('module-1')
      expect(store.getState().selectedModuleForPlacement).toBe('module-1')
      
      store.getState().setSelectedModuleForPlacement('module-2')
      expect(store.getState().selectedModuleForPlacement).toBe('module-2')
    })
  })

  describe('리셋 기능', () => {
    it('resetUI가 모든 UI 상태를 초기값으로 되돌려야 한다', () => {
      const store = useUIStore
      
      // 상태 변경
      store.getState().setViewMode('2D')
      store.getState().toggleDoors()  // false -> true
      store.getState().setSelectedModuleForPlacement('module-123')
      
      // 변경 확인
      expect(store.getState().viewMode).toBe('2D')
      expect(store.getState().doorsOpen).toBe(true)
      expect(store.getState().selectedModuleForPlacement).toBe('module-123')
      
      // 리셋
      store.getState().resetUI()
      
      // 초기값 확인
      const state = store.getState()
      expect(state.viewMode).toBe('3D')
      expect(state.doorsOpen).toBe(false)  // 실제 초기값은 false
      expect(state.selectedModuleForPlacement).toBeNull()
    })
  })

  describe('상태 독립성', () => {
    it('UI 상태 변경이 다른 상태에 영향을 주지 않아야 한다', () => {
      const store = useUIStore
      
      const initialState = { ...store.getState() }
      
      // 하나의 상태만 변경
      store.getState().setViewMode('3D')
      
      const newState = store.getState()
      expect(newState.viewMode).toBe('3D')
      expect(newState.doorsOpen).toBe(initialState.doorsOpen)
      expect(newState.selectedModuleForPlacement).toBe(initialState.selectedModuleForPlacement)
    })
  })
}) 