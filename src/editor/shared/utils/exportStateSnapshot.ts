import type { UIState, View2DDirection } from '@/store/uiStore'

export interface ExportUiStateSnapshot {
  viewMode: UIState['viewMode']
  view2DDirection: UIState['view2DDirection']
  renderMode: UIState['renderMode']
  showGuides: UIState['showGuides']
  showAxis: UIState['showAxis']
  showDimensions: UIState['showDimensions']
  showDimensionsText: UIState['showDimensionsText']
  showFurniture: UIState['showFurniture']
  selectedSlotIndex: UIState['selectedSlotIndex']
}

export const captureExportUiState = (
  state: Pick<UIState, keyof ExportUiStateSnapshot>
): ExportUiStateSnapshot => ({
  viewMode: state.viewMode,
  view2DDirection: state.view2DDirection,
  renderMode: state.renderMode,
  showGuides: state.showGuides,
  showAxis: state.showAxis,
  showDimensions: state.showDimensions,
  showDimensionsText: state.showDimensionsText,
  showFurniture: state.showFurniture,
  selectedSlotIndex: state.selectedSlotIndex
})

export const createExportViewUiPatch = (
  view2DDirection: Extract<View2DDirection, 'front' | 'left' | 'top'>,
  selectedSlotIndex?: number | null
): Partial<UIState> => ({
  viewMode: '2D',
  view2DDirection,
  renderMode: 'wireframe',
  showGuides: false,
  showAxis: false,
  showDimensions: true,
  showDimensionsText: true,
  showFurniture: true,
  ...(selectedSlotIndex !== undefined ? { selectedSlotIndex } : {})
})

export const shouldApplyExportUiPatch = (
  state: Pick<UIState, keyof ExportUiStateSnapshot>,
  patch: Partial<UIState>
): boolean => Object.entries(patch).some(([key, value]) =>
  state[key as keyof ExportUiStateSnapshot] !== value
)
