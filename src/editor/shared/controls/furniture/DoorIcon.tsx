import React from 'react';

interface DoorIconProps {
  isActive: boolean;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
}

const DoorIcon: React.FC<DoorIconProps> = ({ isActive, onClick, disabled = false, className = '' }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`door-icon-button ${className}`}
      style={{
        width: '24px',
        height: '28px',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: disabled ? '#9ca3af' : (isActive ? '#10b981' : '#d1d5db'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s ease',
        padding: '0',
      }}
      title={disabled ? '비활성화됨' : (isActive ? '도어 있음' : '도어 없음')}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 도어 프레임 - 항상 표시 */}
        <rect
          x="1"
          y="1"
          width="12"
          height="12"
          rx="1"
          stroke={isActive ? "white" : "#9ca3af"}
          strokeWidth="1"
          fill="none"
        />
        
        {/* 도어 패널 - 항상 표시하되 색상으로 구분 */}
        <rect
          x="2"
          y="2"
          width="10"
          height="10"
          rx="0.5"
          fill={isActive ? "white" : "#9ca3af"}
          fillOpacity={isActive ? "0.3" : "0.2"}
        />
        
        {/* 도어 손잡이 - 항상 표시하되 색상으로 구분 */}
        <circle
          cx="10"
          cy="7"
          r="0.9"
          fill={isActive ? "white" : "#9ca3af"}
        />
      </svg>
    </button>
  );
};

export default DoorIcon; 