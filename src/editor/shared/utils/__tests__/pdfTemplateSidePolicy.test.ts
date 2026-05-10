import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const previewSourcePath = resolve(
  currentDir,
  '../../components/PDFTemplatePreview/PDFTemplatePreview.tsx'
)

describe('PDF template side-view policy', () => {
  it('기본 템플릿 메뉴와 슬롯에 우측뷰를 노출하지 않는다', () => {
    const source = readFileSync(previewSourcePath, 'utf8')

    expect(source).not.toContain("label: 'Right VIEW'")
    expect(source).not.toContain("target: 'right'")
    expect(source).not.toContain('right?: string')
    expect(source).not.toContain("viewType === 'right'")
    expect(source).not.toContain("['all', 'front', 'top', 'left', 'right']")
    expect(source).not.toContain("t('viewer.right')")
    expect(source).toMatch(/target === 'right'\s*\?\s*'side'\s*:\s*target/)
    expect(source).toContain("const PDF_TEMPLATE_VIEW_DIRECTIONS = ['all', 'front', 'top', 'left'] as const")
  })
})
