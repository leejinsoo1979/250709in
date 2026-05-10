import { describe, expect, it } from 'vitest'
import { PDF_VIEW_TYPES, normalizePdfSelectedViews } from '../pdfViewSelection'

describe('pdfViewSelection', () => {
  it('PDF 측면도는 좌측뷰 타입만 제공한다', () => {
    const sideViews = PDF_VIEW_TYPES.filter(view => view.name.includes('측면도'))

    expect(sideViews).toHaveLength(1)
    expect(sideViews[0]).toMatchObject({
      id: '2d-left',
      viewDirection: 'left'
    })
  })

  it('우측뷰 문자열이 런타임에 들어오면 좌측뷰로 정규화하고 중복 제거한다', () => {
    const selectedViews = normalizePdfSelectedViews([
      '2d-front',
      '2d-right',
      'right',
      '2d-left',
      '2d-door'
    ])

    expect(selectedViews).toEqual(['2d-front', '2d-left', '2d-door'])
  })

  it('기존 저장값이 우측뷰만 갖고 있어도 측면도는 좌측뷰로 내보낸다', () => {
    expect(normalizePdfSelectedViews(['2d-right'])).toEqual(['2d-left'])
    expect(normalizePdfSelectedViews(['right-side'])).toEqual(['2d-left'])
  })

  it('ConvertModal의 기존 door-only 저장값은 PDF hook 도어도면 값으로 정규화한다', () => {
    expect(normalizePdfSelectedViews(['2d-door-only'])).toEqual(['2d-door'])
    expect(normalizePdfSelectedViews(['door-only', '2d-door'])).toEqual(['2d-door'])
  })

  it('정의된 PDF 뷰 타입 중 right 방향은 존재하지 않는다', () => {
    expect(PDF_VIEW_TYPES.some(view => view.viewDirection === 'right')).toBe(false)
    expect(PDF_VIEW_TYPES.map(view => view.id)).not.toContain('2d-right')
  })

  it('PDF export 뷰 타입에는 3D 투시도가 없다', () => {
    expect(PDF_VIEW_TYPES.some(view => view.viewMode === '3D')).toBe(false)
    expect(PDF_VIEW_TYPES.map(view => view.id)).not.toContain('3d-front')
    expect(PDF_VIEW_TYPES.map(view => view.name)).not.toContain('3D 투시도 (Perspective)')
    expect(normalizePdfSelectedViews(['3d-front'])).toEqual([])
  })
})
