import { describe, expect, it } from 'vitest'
import type { UIState } from '@/store/uiStore'
import { captureExportUiState, createExportViewUiPatch, shouldApplyExportUiPatch } from '../exportStateSnapshot'

const createState = (overrides: Partial<UIState> = {}) => ({
  viewMode: '3D',
  view2DDirection: 'front',
  renderMode: 'solid',
  showGuides: true,
  showAxis: true,
  showDimensions: false,
  showDimensionsText: false,
  showFurniture: false,
  selectedSlotIndex: 3,
  ...overrides
}) as UIState

describe('exportStateSnapshot', () => {
  it('내보내기 전 화면 상태 복원에 필요한 값을 모두 저장한다', () => {
    const snapshot = captureExportUiState(createState())

    expect(snapshot).toEqual({
      viewMode: '3D',
      view2DDirection: 'front',
      renderMode: 'solid',
      showGuides: true,
      showAxis: true,
      showDimensions: false,
      showDimensionsText: false,
      showFurniture: false,
      selectedSlotIndex: 3
    })
  })

  it('PDF/DXF 추출용 2D 패치는 그리드/축만 끄고 치수와 가구는 켠다', () => {
    expect(createExportViewUiPatch('left', 2)).toEqual({
      viewMode: '2D',
      view2DDirection: 'left',
      renderMode: 'wireframe',
      showGuides: false,
      showAxis: false,
      showDimensions: true,
      showDimensionsText: true,
      showFurniture: true,
      selectedSlotIndex: 2
    })
  })

  it('슬롯 지정이 없으면 기존 selectedSlotIndex를 패치하지 않는다', () => {
    expect(createExportViewUiPatch('front')).not.toHaveProperty('selectedSlotIndex')
  })

  it('export UI 패치는 실제 값이 바뀔 때만 적용 대상으로 판단한다', () => {
    const exportState = createState({
      viewMode: '2D',
      view2DDirection: 'left',
      renderMode: 'wireframe',
      showGuides: false,
      showAxis: false,
      showDimensions: true,
      showDimensionsText: true,
      showFurniture: true,
      selectedSlotIndex: 2
    })

    expect(shouldApplyExportUiPatch(exportState, createExportViewUiPatch('left', 2))).toBe(false)
    expect(shouldApplyExportUiPatch(exportState, createExportViewUiPatch('left', 3))).toBe(true)
    expect(shouldApplyExportUiPatch(exportState, createExportViewUiPatch('front', 2))).toBe(true)
  })
})
