import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import QRCode from 'qrcode';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useProjectStore } from '@/store/core/projectStore';
import styles from './QRCodeGenerator.module.css';

interface QRCodeGeneratorProps {
  onClose: () => void;
}

const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({ onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [arUrl, setArUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  
  const { placedModules } = useFurnitureStore();
  const { spaceInfo } = useSpaceConfigStore();
  const { projectId } = useProjectStore();

  useEffect(() => {
    generateQRCode();
  }, []);

  const generateQRCode = async () => {
    try {
      setError(null);
      setIsGenerating(true);
      // AR 데이터 준비
      const arData = {
        projectId,
        spaceInfo: {
          width: spaceInfo.width,
          height: spaceInfo.height,
          depth: spaceInfo.depth,
          materialConfig: spaceInfo.materialConfig,
          baseConfig: spaceInfo.baseConfig,
          frameSize: spaceInfo.frameSize,
          surroundType: spaceInfo.surroundType,
        },
        placedModules: placedModules.map(module => ({
          id: module.id,
          moduleId: module.moduleId,
          position: module.position,
          rotation: module.rotation,
          slotIndex: module.slotIndex,
          customDepth: module.customDepth,
          hasDoor: module.hasDoor,
          hingePosition: module.hingePosition,
          adjustedWidth: module.adjustedWidth,
          adjustedPosition: module.adjustedPosition
        })),
        timestamp: Date.now()
      };

      // 데이터를 서버에 저장하고 고유 ID 받기 (실제 구현 시)
      // const response = await saveARData(arData);
      // const arId = response.id;
      
      // 임시로 로컬 스토리지에 저장
      const arId = `ar_${Date.now()}`;
      localStorage.setItem(`ar_data_${arId}`, JSON.stringify(arData));

      // AR 뷰어 URL 생성
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/ar-viewer?id=${arId}`;
      setArUrl(url);
      
      // 개발 환경에서 localhost 경고
      if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
        console.warn('AR requires HTTPS. Use ngrok or deploy to a server with HTTPS.');
      }

      // QR 코드 생성 - 두 가지 방법 시도
      try {
        // 방법 1: Canvas에 직접 그리기
        if (canvasRef.current) {
          // 캔버스 크기 명시적 설정
          canvasRef.current.width = 300;
          canvasRef.current.height = 300;
          
          await QRCode.toCanvas(canvasRef.current, url, {
            width: 300,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            },
            errorCorrectionLevel: 'M'
          });
          
          console.log('QR Code generated on canvas for URL:', url);
        }
        
        // 방법 2: Data URL로 생성 (백업)
        const dataUrl = await QRCode.toDataURL(url, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          },
          errorCorrectionLevel: 'M'
        });
        
        setQrImageUrl(dataUrl);
        console.log('QR Code data URL generated');
        
      } catch (qrError) {
        console.error('QR code generation error:', qrError);
        throw qrError;
      }

      setIsGenerating(false);
    } catch (error) {
      console.error('QR 코드 생성 오류:', error);
      setError('QR 코드 생성에 실패했습니다. 다시 시도해주세요.');
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(arUrl);
    alert('URL이 클립보드에 복사되었습니다.');
  };

  return ReactDOM.createPortal(
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>AR 뷰어 QR 코드</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.content}>
          {isGenerating ? (
            <div className={styles.loading}>QR 코드 생성 중...</div>
          ) : error ? (
            <div className={styles.error}>
              <p>{error}</p>
              <button onClick={generateQRCode} className={styles.retryButton}>
                다시 시도
              </button>
            </div>
          ) : (
            <>
              <div className={styles.qrContainer}>
                {qrImageUrl ? (
                  <img 
                    src={qrImageUrl} 
                    alt="AR QR Code"
                    style={{ 
                      display: 'block',
                      width: '300px',
                      height: '300px'
                    }}
                  />
                ) : (
                  <canvas 
                    ref={canvasRef} 
                    style={{ 
                      display: 'block',
                      width: '300px',
                      height: '300px'
                    }}
                  />
                )}
              </div>
              
              <div className={styles.instructions}>
                <h3>사용 방법</h3>
                <ol>
                  <li>모바일 기기의 카메라로 QR 코드를 스캔하세요</li>
                  <li>AR 뷰어가 자동으로 열립니다</li>
                  <li>카메라 권한을 허용하세요</li>
                  <li>평평한 바닥을 찾아 탭하여 가구를 배치하세요</li>
                </ol>
                
                {(arUrl.includes('localhost') || arUrl.includes('127.0.0.1')) && (
                  <div className={styles.warning}>
                    <strong>⚠️ 주의:</strong> AR 기능은 HTTPS가 필요합니다. 
                    로컬 개발 환경에서는 작동하지 않을 수 있습니다.
                    <br />
                    <strong>해결 방법:</strong>
                    <ul>
                      <li>배포된 서버에서 사용하세요</li>
                      <li>또는 ngrok 등으로 HTTPS 터널을 만드세요</li>
                    </ul>
                  </div>
                )}
              </div>

              <div className={styles.urlSection}>
                <input 
                  type="text" 
                  value={arUrl} 
                  readOnly 
                  className={styles.urlInput}
                />
                <button 
                  className={styles.copyButton}
                  onClick={copyToClipboard}
                >
                  복사
                </button>
              </div>

              <div className={styles.requirements}>
                <h4>지원 기기</h4>
                <ul>
                  <li>iOS: AR Quick Look (USDZ 파일) - 개발 중</li>
                  <li>Android 7+ (Chrome) - WebXR 지원</li>
                </ul>
                <div className={styles.iosNotice}>
                  <strong>📱 iOS 사용자 안내:</strong>
                  <p>현재 iOS Safari는 WebXR을 지원하지 않습니다.</p>
                  <p>대신 3D 뷰어로 가구 배치를 확인하실 수 있습니다.</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default QRCodeGenerator;