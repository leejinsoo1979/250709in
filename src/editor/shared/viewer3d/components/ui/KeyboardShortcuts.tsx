import React, { useState } from 'react';
import styles from './KeyboardShortcuts.module.css';

/**
 * 키보드 단축키 안내 컴포넌트
 * 뷰어 우측에 접었다 펼쳤다 할 수 있는 형태로 표시됩니다.
 */
const KeyboardShortcuts: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const shortcuts = [
    { key: '좌클릭', action: '가구 선택/이동' },
    { key: '더블클릭', action: '가구 편집모드' },
    { key: '휠클릭', action: '화면 이동' },
    { key: 'Option+드래그', action: '화면 이동' },
    { key: '우클릭', action: '카메라 회전' },
    { key: '휠스크롤', action: '줌 인/아웃' },
    { key: '←/→', action: '가구 이동' },
    { key: 'Del', action: '가구 삭제' },
    { key: 'Esc', action: '편집 종료' }
  ];

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={`${styles.shortcutsPanel} ${isExpanded ? styles.expanded : styles.collapsed}`}>
      {!isExpanded ? (
        // 접힌 상태: 작은 버튼만 표시
        <button 
          className={styles.expandButton}
          onClick={handleToggle}
          aria-label="조작법 보기"
          title="조작법 보기"
        >
          <span className={styles.expandIcon}>↓</span>
        </button>
      ) : (
        // 펼친 상태: 전체 조작법 표시
        <>
          <div className={styles.header}>
            <div className={styles.title}>조작법</div>
            <button 
              className={styles.collapseButton}
              onClick={handleToggle}
              aria-label="조작법 접기"
              title="접기"
            >
              ↑
            </button>
          </div>
          <div className={styles.shortcuts}>
            {shortcuts.map((shortcut, index) => (
              <div key={index} className={styles.shortcutItem}>
                <span className={styles.key}>{shortcut.key}</span>
                <span className={styles.action}>{shortcut.action}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default KeyboardShortcuts; 