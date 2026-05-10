import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const exportPanelSourcePath = resolve(
  currentDir,
  '../../../Configurator/components/controls/ExportPanel.tsx'
)
const convertModalSourcePath = resolve(
  currentDir,
  '../../../Configurator/components/ConvertModal.tsx'
)
const headerSourcePath = resolve(
  currentDir,
  '../../../Configurator/components/Header.tsx'
)
const configuratorSourcePath = resolve(
  currentDir,
  '../../../Configurator/index.tsx'
)

describe('ExportPanel export UX', () => {
  it('PDF export does not show debug alerts or render-loop debug logs', () => {
    const source = readFileSync(exportPanelSourcePath, 'utf8')

    expect(source).not.toContain('PDF Export 시작')
    expect(source).not.toContain('PDF Button State')
    expect(source).not.toMatch(/alert\(`PDF Export/)
  })

  it('ExportPanel PDF preview capture does not switch to 3D', () => {
    const source = readFileSync(exportPanelSourcePath, 'utf8')

    expect(source).not.toContain("setViewMode('3D')")
    expect(source).toContain('도어뷰 캡처도 2D 정면 와이어프레임 기준으로 유지')
  })

  it('ConvertModal PDF export exposes 2D production drawings, not 3D perspective', () => {
    const source = readFileSync(convertModalSourcePath, 'utf8')

    expect(source).not.toContain("'3d': true")
    expect(source).not.toContain('3D 투시도 (Perspective)')
    expect(source).not.toContain('3D/2D 뷰')
    expect(source).toContain("'2d-front': true")
    expect(source).toContain("'2d-top': true")
    expect(source).toContain("'2d-left': true")
    expect(source).toContain("'2d-door-only': true")
  })

  it('Header export button opens the ConvertModal-controlled export path', () => {
    const headerSource = readFileSync(headerSourcePath, 'utf8')
    const configuratorSource = readFileSync(configuratorSourcePath, 'utf8')

    expect(headerSource).toContain('onExportPDF?: () => void')
    expect(headerSource).toMatch(/onClick=\{\(\) => \{\s*console\.log\('내보내기 버튼 클릭됨'\);\s*onExportPDF\(\);\s*setIsConvertMenuOpen\(false\);/s)
    expect(configuratorSource).toContain('const [isConvertModalOpen, setIsConvertModalOpen] = useState(false)')
    expect(configuratorSource).toContain('onExportPDF={() => setIsConvertModalOpen(true)}')
    expect(configuratorSource).toContain('<ConvertModal')
    expect(configuratorSource).toContain('isOpen={isConvertModalOpen}')
  })

  it('ConvertModal export selections keep side output left-only', () => {
    const source = readFileSync(convertModalSourcePath, 'utf8')

    expect(source).toContain("const [selectedDXFTypes, setSelectedDXFTypes] = useState<DrawingType[]>(['front', 'plan', 'sideLeft', 'door'])")
    expect(source).toContain("const allDxfTypes: DrawingType[] = ['front', 'plan', 'sideLeft', 'door']")
    expect(source).toContain("if (selectedViews['2d-left']) pdfViews.push('left')")
    expect(source).not.toContain("'2d-right'")
    expect(source).not.toContain("pdfViews.push('right')")
    expect(source).not.toContain("'sideRight'")
  })
})
