import React, { useState } from 'react';
import { TouchGestureHandler } from './TouchGestureHandler';
import { TouchNumberInput } from './TouchNumberInput';
import { TouchSlider } from './TouchSlider';
import styles from './TouchOptimizationExample.module.css';

export const TouchOptimizationExample: React.FC = () => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [value, setValue] = useState(50);

  return (
    <div className={styles.touchOptimizationExample}>
      <h2>태블릿/터치패드 최적화 예시</h2>
      
      {/* 제스처 핸들러 예시 */}
      <div className={styles.gestureSection}>
        <h3>터치 제스처</h3>
        <TouchGestureHandler
          onPinch={(scale) => setScale(scale)}
          onRotate={(angle) => setRotation(angle)}
          onPan={(deltaX, deltaY) => {
            setPosition(prev => ({
              x: prev.x + deltaX,
              y: prev.y + deltaY
            }));
          }}
          onTap={() => console.log('탭됨')}
          onDoubleTap={() => console.log('더블탭됨')}
          onLongPress={() => console.log('롱프레스됨')}
          enableHapticFeedback={true}
          className={styles.gestureArea}
        >
          <div 
            className={styles.gestureTarget}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
              width: '200px',
              height: '200px',
              background: 'linear-gradient(45deg, #646cff, #535bf2)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '18px',
              cursor: 'grab'
            }}
          >
            터치하여 조작하세요
          </div>
        </TouchGestureHandler>
        
        <div className={styles.gestureInfo}>
          <p>스케일: {scale.toFixed(2)}</p>
          <p>회전: {rotation.toFixed(1)}°</p>
          <p>위치: ({position.x.toFixed(0)}, {position.y.toFixed(0)})</p>
        </div>
      </div>

      {/* 터치 최적화 입력 컴포넌트 */}
      <div className={styles.inputSection}>
        <h3>터치 최적화 입력</h3>
        
        <div className={styles.inputGroup}>
          <label>숫자 입력 (터치 최적화)</label>
          <TouchNumberInput
            value={value}
            min={0}
            max={100}
            onChange={setValue}
            label="값"
            unit="%"
          />
        </div>

        <div className={styles.inputGroup}>
          <label>슬라이더 (터치 최적화)</label>
          <TouchSlider
            value={value}
            min={0}
            max={100}
            onChange={setValue}
            label="슬라이더"
            unit="%"
          />
        </div>
      </div>

      {/* 터치 최적화 버튼들 */}
      <div className={styles.buttonSection}>
        <h3>터치 최적화 버튼</h3>
        
        <div className={styles.buttonGrid}>
          <button className="touch-target touch-feedback">
            기본 버튼
          </button>
          
          <button className="touch-target touch-feedback tablet-optimized">
            태블릿 최적화
          </button>
          
          <button className="touch-target touch-feedback gesture-hint">
            제스처 힌트
          </button>
        </div>
      </div>

      {/* 스크롤 최적화 */}
      <div className={styles.scrollSection}>
        <h3>스크롤 최적화</h3>
        
        <div className="scrollable" style={{ height: '200px', overflow: 'auto' }}>
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} className={styles.scrollItem}>
              스크롤 아이템 {i + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}; 