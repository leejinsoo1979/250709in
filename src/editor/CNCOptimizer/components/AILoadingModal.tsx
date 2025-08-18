import React, { useEffect, useState } from 'react';
import styles from './AILoadingModal.module.css';

interface AILoadingModalProps {
  isOpen: boolean;
  progress?: number;
  message?: string;
}

const AILoadingModal: React.FC<AILoadingModalProps> = ({ 
  isOpen, 
  progress = 0,
  message = "AI 최적화 계산 중..." 
}) => {
  const [dots, setDots] = useState(0);
  const [currentPhase, setCurrentPhase] = useState(0);
  
  // AI 계산 단계 메시지
  const phases = [
    "패널 데이터 분석 중",
    "최적 배치 알고리즘 실행",
    "공간 효율성 계산",
    "절단 경로 최적화",
    "결과 검증 중"
  ];

  useEffect(() => {
    if (!isOpen) return;
    
    // 점 애니메이션
    const dotsInterval = setInterval(() => {
      setDots(prev => (prev + 1) % 4);
    }, 500);
    
    // 단계 변경 - adjusted for 4 second duration
    const phaseInterval = setInterval(() => {
      setCurrentPhase(prev => (prev + 1) % phases.length);
    }, 800); // Show each phase for 800ms (5 phases in 4 seconds)
    
    return () => {
      clearInterval(dotsInterval);
      clearInterval(phaseInterval);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* AI 아이콘 애니메이션 */}
        <div className={styles.aiIconContainer}>
          <div className={styles.aiIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div className={styles.pulseRing}></div>
          <div className={styles.pulseRing2}></div>
        </div>
        
        {/* 메인 메시지 */}
        <h3 className={styles.title}>
          {message}
          <span className={styles.dots}>
            {'.'.repeat(dots)}
          </span>
        </h3>
        
        {/* 현재 단계 표시 */}
        <p className={styles.phase}>{phases[currentPhase]}</p>
        
        {/* 진행률 바 */}
        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
            <div className={styles.progressGlow} />
          </div>
          <span className={styles.progressText}>{Math.round(progress)}%</span>
        </div>
        
        {/* 데이터 스트림 효과 */}
        <div className={styles.dataStream}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.dataLine} style={{ animationDelay: `${i * 0.2}s` }}>
              {Array.from({ length: 20 }).map((_, j) => (
                <span key={j} className={styles.dataChar}>
                  {Math.random() > 0.5 ? '1' : '0'}
                </span>
              ))}
            </div>
          ))}
        </div>
        
        {/* 뉴럴 네트워크 비주얼 */}
        <div className={styles.neuralNetwork}>
          <svg viewBox="0 0 200 100" className={styles.networkSvg}>
            {/* 입력 노드 */}
            {[20, 50, 80].map((y, i) => (
              <circle key={`input-${i}`} cx="30" cy={y} r="4" className={styles.node} />
            ))}
            
            {/* 히든 레이어 노드 */}
            {[15, 35, 50, 65, 85].map((y, i) => (
              <circle key={`hidden1-${i}`} cx="70" cy={y} r="4" className={styles.node} />
            ))}
            {[20, 40, 60, 80].map((y, i) => (
              <circle key={`hidden2-${i}`} cx="110" cy={y} r="4" className={styles.node} />
            ))}
            
            {/* 출력 노드 */}
            {[35, 65].map((y, i) => (
              <circle key={`output-${i}`} cx="150" cy={y} r="4" className={styles.node} />
            ))}
            
            {/* 연결선 */}
            {[20, 50, 80].map((y1) => 
              [15, 35, 50, 65, 85].map((y2) => (
                <line 
                  key={`line1-${y1}-${y2}`} 
                  x1="30" y1={y1} 
                  x2="70" y2={y2} 
                  className={styles.connection} 
                />
              ))
            )}
            {[15, 35, 50, 65, 85].map((y1) => 
              [20, 40, 60, 80].map((y2) => (
                <line 
                  key={`line2-${y1}-${y2}`} 
                  x1="70" y1={y1} 
                  x2="110" y2={y2} 
                  className={styles.connection} 
                />
              ))
            )}
            {[20, 40, 60, 80].map((y1) => 
              [35, 65].map((y2) => (
                <line 
                  key={`line3-${y1}-${y2}`} 
                  x1="110" y1={y1} 
                  x2="150" y2={y2} 
                  className={styles.connection} 
                />
              ))
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};

export default AILoadingModal;