import React, { useState, useMemo } from 'react';
import { FileSpreadsheet, Download, Settings, Info } from 'lucide-react';
import { Panel, StockPanel } from '../types';
import { 
  CutSettings, 
  Unit, 
  ExportOptions,
  ConversionResult 
} from '@/domain/cutlist/types';
import { 
  convertToCutListFormat,
  quickExport 
} from '@/domain/cutlist/exporters';
import { 
  downloadCSV, 
  downloadMultipleFiles 
} from '@/domain/cutlist/csvUtils';
import styles from '../style.module.css';

interface CutlistExportPanelProps {
  panels: Panel[];
  stockPanels: StockPanel[];
  selectedPanels: Panel[];
  projectName?: string;
}

const CutlistExportPanel: React.FC<CutlistExportPanelProps> = ({
  panels,
  stockPanels,
  selectedPanels,
  projectName = 'cutlist'
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [cutSettings, setCutSettings] = useState<CutSettings>({
    unit: 'mm',
    kerf: 5,
    trimTop: 0,
    trimBottom: 0,
    trimLeft: 0,
    trimRight: 0,
    allowGrainRotation: false,
    edgeBanding: false,
    minimizeWaste: true
  });
  
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeSettings: true,
    includeStock: true,
    includePanels: true,
    fileName: projectName,
    separateFiles: true
  });

  // 변환 결과 미리보기
  const conversionResult = useMemo(() => {
    const panelsToExport = selectedPanels.length > 0 ? selectedPanels : panels;
    if (panelsToExport.length === 0) return null;
    
    return convertToCutListFormat(panelsToExport, stockPanels, cutSettings);
  }, [panels, selectedPanels, stockPanels, cutSettings]);

  // 빠른 내보내기
  const handleQuickExport = async () => {
    const panelsToExport = selectedPanels.length > 0 ? selectedPanels : panels;
    if (panelsToExport.length === 0) {
      alert('내보낼 패널이 없습니다.');
      return;
    }

    const result = quickExport(panelsToExport, stockPanels);
    
    // 패널 CSV 다운로드
    downloadCSV(result.panelsCSV, `${projectName}_panels.csv`);
  };

  // 전체 내보내기
  const handleFullExport = async () => {
    if (!conversionResult) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    const files: { content: string; fileName: string; type?: string }[] = [];

    if (exportOptions.includePanels) {
      files.push({
        content: conversionResult.panelsCSV,
        fileName: `${exportOptions.fileName}_panels.csv`,
        type: 'text/csv;charset=utf-8;'
      });
    }

    if (exportOptions.includeStock) {
      files.push({
        content: conversionResult.stockCSV,
        fileName: `${exportOptions.fileName}_stock.csv`,
        type: 'text/csv;charset=utf-8;'
      });
    }

    if (exportOptions.includeSettings) {
      files.push({
        content: conversionResult.settingsINI,
        fileName: `${exportOptions.fileName}_settings.ini`,
        type: 'text/plain;charset=utf-8;'
      });
    }

    if (exportOptions.separateFiles) {
      await downloadMultipleFiles(files);
    } else {
      // 단일 파일로 합치기 (CSV만)
      const combined = [
        '# PANELS',
        conversionResult.panelsCSV,
        '',
        '# STOCK',
        conversionResult.stockCSV
      ].join('\n');
      
      downloadCSV(combined, `${exportOptions.fileName}_combined.csv`);
    }
  };

  return (
    <div className={styles.exportPanel}>
      <div className={styles.exportHeader}>
        <h3 className={styles.exportTitle}>
          <FileSpreadsheet size={20} />
          CutList Optimizer 내보내기
        </h3>
        <button
          className={styles.settingsToggle}
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings size={16} />
          설정
        </button>
      </div>

      {/* 요약 정보 */}
      {conversionResult && (
        <div className={styles.exportSummary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>패널 수:</span>
            <span className={styles.summaryValue}>
              {conversionResult.summary.totalPanels}개
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>총 면적:</span>
            <span className={styles.summaryValue}>
              {conversionResult.summary.totalArea}m²
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>예상 원장:</span>
            <span className={styles.summaryValue}>
              {conversionResult.summary.estimatedSheets}장
            </span>
          </div>
        </div>
      )}

      {/* 설정 패널 */}
      {showSettings && (
        <div className={styles.exportSettings}>
          <div className={styles.settingsSection}>
            <h4>절단 설정</h4>
            
            <div className={styles.settingRow}>
              <label>단위:</label>
              <select
                value={cutSettings.unit}
                onChange={(e) => setCutSettings({
                  ...cutSettings,
                  unit: e.target.value as Unit
                })}
              >
                <option value="mm">밀리미터 (mm)</option>
                <option value="cm">센티미터 (cm)</option>
                <option value="in">인치 (in)</option>
              </select>
            </div>

            <div className={styles.settingRow}>
              <label>톱날 두께 (Kerf):</label>
              <input
                type="number"
                min="0"
                max="20"
                step="0.5"
                value={cutSettings.kerf}
                onChange={(e) => setCutSettings({
                  ...cutSettings,
                  kerf: Number(e.target.value)
                })}
              />
              <span className={styles.unit}>{cutSettings.unit}</span>
            </div>

            <div className={styles.settingRow}>
              <label>트리밍 (상/하/좌/우):</label>
              <div className={styles.trimInputs}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={cutSettings.trimTop}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setCutSettings({
                      ...cutSettings,
                      trimTop: value,
                      trimBottom: value,
                      trimLeft: value,
                      trimRight: value
                    });
                  }}
                  placeholder="전체"
                />
                <span className={styles.unit}>{cutSettings.unit}</span>
              </div>
            </div>

            <div className={styles.settingRow}>
              <label>
                <input
                  type="checkbox"
                  checked={cutSettings.allowGrainRotation}
                  onChange={(e) => setCutSettings({
                    ...cutSettings,
                    allowGrainRotation: e.target.checked
                  })}
                />
                결 방향 무시 (회전 허용)
              </label>
            </div>

            <div className={styles.settingRow}>
              <label>
                <input
                  type="checkbox"
                  checked={cutSettings.edgeBanding}
                  onChange={(e) => setCutSettings({
                    ...cutSettings,
                    edgeBanding: e.target.checked
                  })}
                />
                엣지밴딩 고려
              </label>
            </div>

            <div className={styles.settingRow}>
              <label>
                <input
                  type="checkbox"
                  checked={cutSettings.minimizeWaste}
                  onChange={(e) => setCutSettings({
                    ...cutSettings,
                    minimizeWaste: e.target.checked
                  })}
                />
                폐기물 최소화 우선
              </label>
            </div>
          </div>

          <div className={styles.settingsSection}>
            <h4>내보내기 옵션</h4>
            
            <div className={styles.settingRow}>
              <label>파일 이름:</label>
              <input
                type="text"
                value={exportOptions.fileName}
                onChange={(e) => setExportOptions({
                  ...exportOptions,
                  fileName: e.target.value
                })}
              />
            </div>

            <div className={styles.settingRow}>
              <label>
                <input
                  type="checkbox"
                  checked={exportOptions.separateFiles}
                  onChange={(e) => setExportOptions({
                    ...exportOptions,
                    separateFiles: e.target.checked
                  })}
                />
                개별 파일로 저장
              </label>
            </div>

            <div className={styles.settingRow}>
              <label>
                <input
                  type="checkbox"
                  checked={exportOptions.includePanels}
                  onChange={(e) => setExportOptions({
                    ...exportOptions,
                    includePanels: e.target.checked
                  })}
                />
                패널 CSV 포함
              </label>
            </div>

            <div className={styles.settingRow}>
              <label>
                <input
                  type="checkbox"
                  checked={exportOptions.includeStock}
                  onChange={(e) => setExportOptions({
                    ...exportOptions,
                    includeStock: e.target.checked
                  })}
                />
                재고 CSV 포함
              </label>
            </div>

            <div className={styles.settingRow}>
              <label>
                <input
                  type="checkbox"
                  checked={exportOptions.includeSettings}
                  onChange={(e) => setExportOptions({
                    ...exportOptions,
                    includeSettings: e.target.checked
                  })}
                />
                설정 INI 포함
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 내보내기 버튼 */}
      <div className={styles.exportActions}>
        <button
          className={styles.quickExportButton}
          onClick={handleQuickExport}
          disabled={!conversionResult}
        >
          <Download size={16} />
          빠른 내보내기 (패널만)
        </button>
        
        <button
          className={styles.fullExportButton}
          onClick={handleFullExport}
          disabled={!conversionResult}
        >
          <FileSpreadsheet size={16} />
          전체 내보내기
        </button>
      </div>

      {/* 도움말 */}
      <div className={styles.exportHelp}>
        <Info size={14} />
        <span>
          CutList Optimizer에서 CSV 파일을 Import하여 사용하세요.
          패널 CSV는 필수, 재고와 설정은 선택사항입니다.
        </span>
      </div>
    </div>
  );
};

export default CutlistExportPanel;