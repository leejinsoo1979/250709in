export type PdfExportViewType = '2d-front' | '2d-top' | '2d-left' | '2d-door'

export interface PdfExportViewInfo {
  id: PdfExportViewType
  name: string
  viewMode: '2D'
  viewDirection?: 'front' | 'top' | 'left'
  isDoorDrawing?: boolean
}

export const PDF_VIEW_TYPES: PdfExportViewInfo[] = [
  { id: '2d-front', name: '입면도 (Front View)', viewMode: '2D', viewDirection: 'front' },
  { id: '2d-top', name: '평면도 (Top View)', viewMode: '2D', viewDirection: 'top' },
  { id: '2d-left', name: '측면도 (Side View)', viewMode: '2D', viewDirection: 'left' },
  { id: '2d-door', name: '도어도면 (Door Drawing)', viewMode: '2D', viewDirection: 'front', isDoorDrawing: true }
]

const PDF_VIEW_TYPE_IDS = new Set(PDF_VIEW_TYPES.map(view => view.id))
const LEGACY_RIGHT_SIDE_VIEW_IDS = new Set(['2d-right', 'right', 'right-side', 'side-right'])
const LEGACY_DOOR_ONLY_VIEW_IDS = new Set(['2d-door-only', 'door-only'])

const normalizeLegacyPdfView = (view: string): PdfExportViewType | null => {
  if (LEGACY_RIGHT_SIDE_VIEW_IDS.has(view)) {
    return '2d-left'
  }

  if (LEGACY_DOOR_ONLY_VIEW_IDS.has(view)) {
    return '2d-door'
  }

  return PDF_VIEW_TYPE_IDS.has(view as PdfExportViewType)
    ? view as PdfExportViewType
    : null
}

export const normalizePdfSelectedViews = (
  selectedViews: readonly string[]
): PdfExportViewType[] => {
  const normalizedViews: PdfExportViewType[] = []

  selectedViews.forEach(view => {
    const normalized = normalizeLegacyPdfView(view)
    if (!normalized || normalizedViews.includes(normalized)) return
    normalizedViews.push(normalized)
  })

  return normalizedViews
}
