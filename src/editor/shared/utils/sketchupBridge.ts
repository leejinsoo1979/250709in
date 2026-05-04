/**
 * SketchUp HtmlDialog 환경 감지 및 통신 브릿지
 *
 * SketchUp 루비 플러그인이 띄운 HtmlDialog 안에서 tttcraft 웹앱이 실행될 때,
 * 이 유틸이 환경을 감지하고 DAE/이미지 등을 루비 콜백으로 직접 전송한다.
 *
 * 루비 측 콜백:
 *   - import_dae(base64Data, filename)   : DAE 파일을 SketchUp 모델에 즉시 import
 *   - sketchup_ready()                    : 환경 확인용 핑
 *
 * 일반 브라우저 환경에서는 sketchup 객체가 없으므로 모든 함수가 false를 반환한다.
 */

export interface SketchUpBridge {
  import_dae?: (base64Data: string, filename: string) => void;
  sketchup_ready?: () => void;
}

declare global {
  interface Window {
    sketchup?: SketchUpBridge;
    __sketchupImportDone?: (success: boolean) => void;
  }
}

/**
 * 현재 페이지가 SketchUp HtmlDialog 안에서 실행 중인지 판별.
 *
 * 1) window.sketchup 객체가 주입되어 있으면 확정
 * 2) URL 쿼리에 ?sketchup=1 이 있으면 강제 활성화 (개발/테스트용)
 */
export const isSketchUpEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;

  if (window.sketchup && typeof window.sketchup === 'object') {
    return true;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('sketchup') === '1') return true;
  } catch {
    // ignore
  }

  return false;
};

/**
 * 루비 플러그인이 import_dae 콜백을 등록했는지 확인.
 */
export const canImportDaeToSketchUp = (): boolean => {
  return Boolean(window.sketchup?.import_dae);
};

/**
 * Blob → Base64 문자열 (data URL prefix 제외) 변환.
 */
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader result is not a string'));
        return;
      }
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });

/**
 * DAE Blob을 SketchUp 루비로 전송하여 즉시 active model에 import.
 *
 * 루비 측에서 add_action_callback("import_dae") 핸들러가 등록되어 있어야 한다.
 *
 * @returns 루비로 전송 성공 여부 (실제 SketchUp 임포트 결과는 비동기로 __sketchupImportDone 콜백에서 받음)
 */
export const sendDaeToSketchUp = async (
  blob: Blob,
  filename: string
): Promise<boolean> => {
  if (!canImportDaeToSketchUp()) return false;

  try {
    const base64 = await blobToBase64(blob);
    window.sketchup!.import_dae!(base64, filename);
    return true;
  } catch (err) {
    console.error('❌ SketchUp 전송 실패:', err);
    return false;
  }
};
