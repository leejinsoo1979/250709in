import React, { useState } from 'react';
import { TouchGestureHandler } from './TouchGestureHandler';
import styles from './TouchTestPage.module.css';

export const TouchTestPage: React.FC = () => {
  const [events, setEvents] = useState<string[]>([]);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const addEvent = (eventName: string, data?: any) => {
    const timestamp = new Date().toLocaleTimeString();
    const eventText = `${timestamp}: ${eventName}${data ? ` - ${JSON.stringify(data)}` : ''}`;
    setEvents(prev => [eventText, ...prev.slice(0, 9)]); // 최근 10개만 유지
  };

  return (
    <div className={styles.container}>
      <h1>터치/터치패드 테스트 페이지</h1>
      
      <div className={styles.testArea}>
        <TouchGestureHandler
          onPinch={(scale) => {
            setScale(scale);
            addEvent('핀치', { scale: scale.toFixed(2) });
          }}
          onRotate={(angle) => {
            setRotation(angle);
            addEvent('회전', { angle: angle.toFixed(1) });
          }}
          onPan={(deltaX, deltaY) => {
            setPosition(prev => ({
              x: prev.x + deltaX,
              y: prev.y + deltaY
            }));
            addEvent('팬', { deltaX: deltaX.toFixed(0), deltaY: deltaY.toFixed(0) });
          }}
          onTap={() => addEvent('탭')}
          onDoubleTap={() => addEvent('더블탭')}
          onLongPress={() => addEvent('롱프레스')}
          onSwipe={(direction, velocity) => {
            addEvent('스와이프', { direction, velocity: velocity.toFixed(2) });
          }}
          onFlick={(direction, velocity) => {
            addEvent('플릭', { direction, velocity: velocity.toFixed(2) });
          }}
          enableHapticFeedback={true}
          className={styles.gestureArea}
        >
          <div 
            className={styles.testTarget}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            }}
          >
            <div className={styles.targetContent}>
              <h3>터치 테스트 영역</h3>
              <p>터치패드로 다양한 제스처를 시도해보세요</p>
              <ul>
                <li>한 손가락 드래그: 이동</li>
                <li>두 손가락 핀치: 확대/축소</li>
                <li>두 손가락 회전: 회전</li>
                <li>탭/더블탭: 선택</li>
                <li>롱프레스: 컨텍스트 메뉴</li>
              </ul>
            </div>
          </div>
        </TouchGestureHandler>
      </div>

      <div className={styles.infoPanel}>
        <div className={styles.currentState}>
          <h3>현재 상태</h3>
          <p>스케일: {scale.toFixed(2)}</p>
          <p>회전: {rotation.toFixed(1)}°</p>
          <p>위치: ({position.x.toFixed(0)}, {position.y.toFixed(0)})</p>
        </div>

        <div className={styles.eventLog}>
          <h3>이벤트 로그</h3>
          <div className={styles.logContainer}>
            {events.map((event, index) => (
              <div key={index} className={styles.logEntry}>
                {event}
              </div>
            ))}
            {events.length === 0 && (
              <div className={styles.noEvents}>아직 이벤트가 없습니다</div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.instructions}>
        <h3>테스트 방법</h3>
        <div className={styles.instructionGrid}>
          <div className={styles.instruction}>
            <h4>터치패드 제스처</h4>
            <ul>
              <li>한 손가락 드래그: 마우스 이동</li>
              <li>두 손가락 스크롤: 수직/수평 스크롤</li>
              <li>두 손가락 핀치: 확대/축소</li>
              <li>두 손가락 회전: 회전</li>
            </ul>
          </div>
          
          <div className={styles.instruction}>
            <h4>개발자 도구 시뮬레이션</h4>
            <ol>
              <li>F12 또는 Cmd+Option+I로 개발자 도구 열기</li>
              <li>Device Toolbar 클릭 (📱 아이콘)</li>
              <li>Responsive 모드 선택</li>
              <li>More tools → Sensors → Touch 활성화</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}; 