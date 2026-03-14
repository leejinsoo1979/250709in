/**
 * 서라운드 프레임 패널 모듈 데이터
 * 기타 탭에서 가구처럼 개별 배치하는 서라운드 패널 정의
 */

export type SurroundPanelType = 'left' | 'right' | 'top';

export interface SurroundPanelModuleData {
  id: string;           // 'surround-left', 'surround-right', 'surround-top'
  name: string;         // '좌측 패널', '우측 패널', '상단 패널'
  panelType: SurroundPanelType;
  thickness: number;    // 고정 18mm
  defaultWidth: number; // 기본 폭 (mm) - 좌/우: 40, 상단: 0 (공간너비 자동)
}

export const SURROUND_PANEL_THICKNESS = 18; // mm 고정

export const surroundPanelModules: SurroundPanelModuleData[] = [
  { id: 'surround-left',  name: '좌측 패널', panelType: 'left',  thickness: 18, defaultWidth: 40 },
  { id: 'surround-right', name: '우측 패널', panelType: 'right', thickness: 18, defaultWidth: 40 },
  { id: 'surround-top',   name: '상단 패널', panelType: 'top',   thickness: 18, defaultWidth: 0 }, // 0 = 공간너비 자동
];

/**
 * moduleId가 서라운드 패널인지 확인
 */
export function isSurroundPanelId(moduleId: string): boolean {
  return moduleId.startsWith('surround-');
}

/**
 * moduleId에서 서라운드 패널 타입 추출
 */
export function getSurroundPanelType(moduleId: string): SurroundPanelType | null {
  if (!isSurroundPanelId(moduleId)) return null;
  const type = moduleId.replace('surround-', '') as SurroundPanelType;
  if (['left', 'right', 'top'].includes(type)) return type;
  return null;
}
