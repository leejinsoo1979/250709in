import React, { useState, useEffect, useRef } from 'react';
import { Text, Html } from '@react-three/drei';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useTheme } from '@/contexts/ThemeContext';
import { Column } from '@/types/space';

interface ColumnDistanceLabelsProps {
  column: Column;
  spaceInfo: any;
  onPositionChange?: (columnId: string, newPosition: [number, number, number]) => void;
  onColumnUpdate?: (columnId: string, updates: Partial<Column>) => void;
  showLabels?: boolean;
}

const ColumnDistanceLabels: React.FC<ColumnDistanceLabelsProps> = ({ column, spaceInfo, onPositionChange, onColumnUpdate, showLabels = true }) => {
  const { viewMode } = useSpace3DView();
  const { theme } = useTheme();
  const [editingDistance, setEditingDistance] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  // CSS 변수에서 실제 테마 색상 가져오기
  const getThemeColorFromCSS = (variableName: string, fallback: string) => {
    if (typeof window !== 'undefined') {
      const computedColor = getComputedStyle(document.documentElement)
        .getPropertyValue(variableName).trim();
      return computedColor || fallback;
    }
    return fallback;
  };

  // 테마 기반 색상 설정 - 3D 모드에서는 항상 밝은 색상 사용
  const themeColors = viewMode === '3D' ? {
    primary: '#10b981',          // 항상 밝은 초록색
    background: '#ffffff',       // 항상 흰색 배경
    text: '#111827',            // 항상 어두운 텍스트
    border: '#10b981',          // 항상 밝은 초록색 테두리
    hoverBg: '#d1fae5',         // 항상 밝은 호버 배경
    textSecondary: '#6b7280'    // 항상 회색 보조 텍스트
  } : {
    primary: getThemeColorFromCSS('--theme-primary', '#10b981'),          // 테마 메인 색상
    background: getThemeColorFromCSS('--theme-surface', '#ffffff'),       // 테마 표면 색상
    text: getThemeColorFromCSS('--theme-text', '#111827'),               // 테마 텍스트 색상
    border: getThemeColorFromCSS('--theme-primary', '#10b981'),          // 테마 테두리 색상
    hoverBg: getThemeColorFromCSS('--theme-primary-light', '#d1fae5'),   // 테마 호버 배경색
    textSecondary: getThemeColorFromCSS('--theme-text-secondary', '#6b7280') // 보조 텍스트
  };
  
  // 통일된 입력 필드 스타일
  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: `2px solid ${themeColors.border}`,
    borderRadius: '6px',
    fontSize: '16px',
    textAlign: 'center' as const,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontWeight: '600',
    outline: 'none',
    backgroundColor: '#ffffff',
    color: '#000000'
  };
  
  const containerStyle = {
    background: '#ffffff',
    border: `2px solid ${themeColors.border}`,
    borderRadius: '8px',
    padding: '12px 16px',
    minWidth: '140px',
    boxShadow: viewMode === '3D' 
      ? '0 4px 20px rgba(16,185,129,0.3)'  // 3D 모드에서는 항상 초록색 그림자
      : theme?.mode === 'dark' 
        ? '0 4px 20px rgba(100,181,246,0.2)' 
        : '0 4px 20px rgba(255,87,34,0.2)',
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#000000'
  };
  
  const labelStyle = {
    color: '#10b981',
    fontSize: '12px',
    marginBottom: '8px',
    fontWeight: '600' as const
  };
  
  // 스토어에서 실시간으로 기둥 정보를 가져옵니다 (선택적 구독)
  const storeColumn = useSpaceConfigStore(state => 
    state.spaceInfo.columns?.find(col => col.id === column.id)
  );
  const currentColumn = storeColumn || column;

  // 편집 모드가 활성화되면 입력 필드에 포커스
  useEffect(() => {
    if (editingDistance && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [editingDistance]);

  // 컴포넌트 렌더링 디버그 로그 (개발 모드에서만)
  // console.log('🏛️ ColumnDistanceLabels 렌더링:', {
  //   columnId: currentColumn.id,
  //   showLabels,
  //   editingDistance,
  //   spaceInfo: {width: spaceInfo?.width, depth: spaceInfo?.depth}
  // });

  // 라벨을 숨기는 경우에만 null 반환
  if (!showLabels) {
    return null;
  }

  // 공간 크기 (mm를 Three.js 단위로 변환)
  const spaceWidthM = (spaceInfo?.width || 3600) * 0.01;
  const spaceDepthM = (spaceInfo?.depth || 1500) * 0.01;

  // 실시간 기둥 정보 사용 (스토어에서 가져온 최신 정보)
  const columnWidthM = currentColumn.width * 0.01;
  const columnDepthM = currentColumn.depth * 0.01;
  const columnHeightM = currentColumn.height * 0.01;

  // 벽면과의 거리 계산 (mm) - 실시간 위치 정보 사용
  const distanceToLeft = Math.round((spaceWidthM / 2 + currentColumn.position[0] - columnWidthM / 2) * 100);
  const distanceToRight = Math.round((spaceWidthM / 2 - currentColumn.position[0] - columnWidthM / 2) * 100);
  const distanceToFront = Math.round((spaceDepthM / 2 + currentColumn.position[2] - columnDepthM / 2) * 100);
  const distanceToBack = Math.round((spaceDepthM / 2 - currentColumn.position[2] - columnDepthM / 2) * 100);

  // 거리 변경 핸들러 - 개선된 로직
  const handleDistanceChange = (direction: 'left' | 'right', newDistance: number) => {
    // console.log('📏 거리 변경 시도:', { direction, newDistance, columnId: currentColumn.id });
    
    if (!onPositionChange) {
      // console.error('❌ onPositionChange 함수가 없습니다');
      return;
    }
    
    // 유효한 거리 범위 검증
    if (newDistance < 10 || newDistance > (spaceInfo?.width || 3600) / 2) {
      // console.warn('⚠️ 유효하지 않은 거리:', newDistance);
      return;
    }
    
    const spaceWidthUnits = spaceWidthM;
    const columnWidthUnits = columnWidthM;
    let newX = currentColumn.position[0];
    
    if (direction === 'left') {
      // 왼쪽 벽과 기둥 좌측면 사이의 간격
      newX = -(spaceWidthUnits / 2) + (newDistance * 0.01) + (columnWidthUnits / 2);
    } else if (direction === 'right') {
      // 오른쪽 벽과 기둥 우측면 사이의 간격
      newX = (spaceWidthUnits / 2) - (newDistance * 0.01) - (columnWidthUnits / 2);
    }
    
    const newPosition: [number, number, number] = [newX, 0, currentColumn.position[2]];
    
    // console.log('📍 새로운 위치 계산:', {
    //   이전위치: currentColumn.position,
    //   새위치: newPosition,
    //   간격: newDistance
    // });
    
    onPositionChange(currentColumn.id, newPosition);
  };

  // 기둥 너비 변경 핸들러 - 개선된 로직
  const handleWidthChange = (newWidth: number) => {
    // console.log('📐 너비 변경 시도:', { newWidth, columnId: currentColumn.id });
    
    if (!onColumnUpdate) {
      // console.error('❌ onColumnUpdate 함수가 없습니다');
      return;
    }
    
    // 유효한 너비 범위 검증 (800mm ~ 3000mm)
    if (newWidth < 800 || newWidth > 3000) {
      // console.warn('⚠️ 유효하지 않은 너비:', newWidth);
      return;
    }
    
    // 현재 위치 유지하면서 너비만 변경
    onColumnUpdate(currentColumn.id, { 
      width: newWidth
    });
  };

  // 클릭 핸들러 - 즉시 편집 모드 활성화
  const handleClick = (direction: 'left' | 'right' | 'width', event?: any) => {
    if (event) {
      event.stopPropagation();
    }
    
    // console.log('🖱️ 편집 모드 활성화:', direction, '기둥 ID:', currentColumn.id);
    
    setEditingDistance(direction);
    
    // 현재 값을 편집 값으로 설정
    if (direction === 'left') {
      setEditingValue(Math.max(0, distanceToLeft).toString());
    } else if (direction === 'right') {
      setEditingValue(Math.max(0, distanceToRight).toString());
    } else if (direction === 'width') {
      setEditingValue(currentColumn.width.toString());
    } else if (direction === 'height') {
      setEditingValue(currentColumn.height.toString());
    }
  };

  // 편집 완료 핸들러 - 개선된 로직
  const handleEditComplete = () => {
    const value = parseInt(editingValue) || 0;
    
    // console.log('✅ 편집 완료:', { direction: editingDistance, value });
    
    if (editingDistance === 'left') {
      handleDistanceChange('left', value);
    } else if (editingDistance === 'right') {
      handleDistanceChange('right', value);
    } else if (editingDistance === 'width') {
      handleWidthChange(value);
    }
    
    setEditingDistance(null);
    setEditingValue('');
  };

  // 편집 취소 핸들러
  const handleEditCancel = () => {
    // console.log('❌ 편집 취소');
    setEditingDistance(null);
    setEditingValue('');
  };

  return (
    <group>
      {/* 왼쪽 벽과 기둥 사이 가이드 라인과 거리 표시 */}
      <group>
        {/* 왼쪽 가이드 라인 */}
        <mesh position={[
          (-spaceWidthM / 2 + currentColumn.position[0] - columnWidthM / 2) / 2, 
          columnHeightM / 2, 
          currentColumn.position[2] + (viewMode === '2D' ? 0.1 : 0)
        ]}>
          <boxGeometry args={[Math.abs(currentColumn.position[0] - columnWidthM / 2 - (-spaceWidthM / 2)), 0.02, 0.02]} />
          <meshBasicMaterial color={themeColors.primary} transparent opacity={0.8} />
        </mesh>

        {/* 왼쪽 화살표 - 벽 쪽 */}
        <mesh position={[
          -spaceWidthM / 2, 
          columnHeightM / 2, 
          currentColumn.position[2] + (viewMode === '2D' ? 0.1 : 0)
        ]}>
          <coneGeometry args={[0.05, 0.2, 3]} />
          <meshBasicMaterial color={themeColors.primary} />
        </mesh>

        {/* 왼쪽 화살표 - 기둥 쪽 */}
        <mesh position={[
          currentColumn.position[0] - columnWidthM / 2, 
          columnHeightM / 2, 
          currentColumn.position[2] + (viewMode === '2D' ? 0.1 : 0)
        ]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.05, 0.2, 3]} />
          <meshBasicMaterial color={themeColors.primary} />
        </mesh>

        {/* 왼쪽 거리 숫자 - 편집 가능한 라벨 */}
        <group position={[
          (-spaceWidthM / 2 + currentColumn.position[0] - columnWidthM / 2) / 2, 
          columnHeightM / 2 + 0.3, 
          currentColumn.position[2] + (viewMode === '2D' ? 0.1 : 0)
        ]}>
          {editingDistance === 'left' ? (
            <Html
              transform
              distanceFactor={10}
              position={[0, 0, 0.1]}
              style={{ pointerEvents: 'auto' }}
            >
              <style>
                {`
                  .column-distance-input > div > input[type="number"] {
                    color: #000000 !important;
                    background-color: #ffffff !important;
                    -webkit-text-fill-color: #000000 !important;
                  }
                `}
              </style>
              <div 
                className="column-distance-input"
                style={{
                  background: '#ffffff',
                  border: '2px solid #10b981',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  minWidth: '140px',
                  boxShadow: '0 4px 20px rgba(16,185,129,0.3)',
                  fontSize: '14px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  color: '#000000'
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div style={{
                  color: '#10b981',
                  fontSize: '12px',
                  marginBottom: '8px',
                  fontWeight: '600'
                }}>
                  왼쪽 간격 (mm)
                </div>
                <input
                  ref={inputRef}
                  type="number"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      handleEditComplete();
                    }
                    if (e.key === 'Escape') {
                      handleEditCancel();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #10b981',
                    borderRadius: '6px',
                    fontSize: '16px',
                    textAlign: 'center',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontWeight: '600',
                    outline: 'none',
                    backgroundColor: '#ffffff !important',
                    color: '#000000 !important',
                    WebkitAppearance: 'none',
                    MozAppearance: 'textfield'
                  }}
                  onBlur={() => handleEditComplete()}
                  autoFocus
                  min="0"
                  step="10"
                />
              </div>
            </Html>
          ) : (
            <>
              <mesh 
                position={[0, 0, -0.01]} 
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick('left', e);
                }}
                onPointerOver={(e) => {
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={(e) => {
                  document.body.style.cursor = 'default';
                }}
              >
                <planeGeometry args={[2.8, 1.2]} />
                <meshBasicMaterial 
                  color={themeColors.hoverBg} 
                  transparent 
                  opacity={0.9}
                />
              </mesh>
              <mesh 
                position={[0, 0, -0.005]} 
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick('left', e);
                }}
              >
                <planeGeometry args={[2.6, 1.0]} />
                <meshBasicMaterial 
                  color={themeColors.background} 
                  transparent 
                  opacity={0.95}
                />
              </mesh>
              <Text
                position={[0, 0, 0.2]}
                fontSize={0.8}
                color="#000000"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.1}
                outlineColor="#ffffff"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick('left', e);
                }}
                onPointerOver={() => {
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={() => {
                  document.body.style.cursor = 'default';
                }}
              >
                {Math.max(0, distanceToLeft)}
              </Text>
            </>
          )}
        </group>
      </group>

      {/* 오른쪽 벽과 기둥 사이 가이드 라인과 거리 표시 */}
      <group>
        {/* 오른쪽 가이드 라인 */}
        <mesh position={[
          (spaceWidthM / 2 + currentColumn.position[0] + columnWidthM / 2) / 2, 
          columnHeightM / 2, 
          currentColumn.position[2] + (viewMode === '2D' ? 0.1 : 0)
        ]}>
          <boxGeometry args={[Math.abs(spaceWidthM / 2 - (currentColumn.position[0] + columnWidthM / 2)), 0.02, 0.02]} />
          <meshBasicMaterial color={themeColors.primary} transparent opacity={0.8} />
        </mesh>

        {/* 오른쪽 화살표 - 벽 쪽 */}
        <mesh position={[
          spaceWidthM / 2, 
          columnHeightM / 2, 
          currentColumn.position[2] + (viewMode === '2D' ? 0.1 : 0)
        ]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.05, 0.2, 3]} />
          <meshBasicMaterial color={themeColors.primary} />
        </mesh>

        {/* 오른쪽 화살표 - 기둥 쪽 */}
        <mesh position={[
          currentColumn.position[0] + columnWidthM / 2, 
          columnHeightM / 2, 
          currentColumn.position[2] + (viewMode === '2D' ? 0.1 : 0)
        ]}>
          <coneGeometry args={[0.05, 0.2, 3]} />
          <meshBasicMaterial color={themeColors.primary} />
        </mesh>

        {/* 오른쪽 거리 숫자 - 편집 가능한 라벨 */}
        <group position={[
          (spaceWidthM / 2 + currentColumn.position[0] + columnWidthM / 2) / 2, 
          columnHeightM / 2 + 0.3, 
          currentColumn.position[2] + (viewMode === '2D' ? 0.1 : 0)
        ]}>
          {editingDistance === 'right' ? (
            <Html
              transform
              distanceFactor={10}
              position={[0, 0, 0.1]}
              style={{ pointerEvents: 'auto' }}
            >
              <style>
                {`
                  .column-distance-input > div > input[type="number"] {
                    color: #000000 !important;
                    background-color: #ffffff !important;
                    -webkit-text-fill-color: #000000 !important;
                  }
                `}
              </style>
              <div 
                className="column-distance-input"
                style={{
                  background: '#ffffff',
                  border: '2px solid #10b981',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  minWidth: '140px',
                  boxShadow: '0 4px 20px rgba(16,185,129,0.3)',
                  fontSize: '14px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  color: '#000000'
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div style={{
                  color: '#10b981',
                  fontSize: '12px',
                  marginBottom: '8px',
                  fontWeight: '600'
                }}>
                  오른쪽 간격 (mm)
                </div>
                <input
                  ref={inputRef}
                  type="number"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      handleEditComplete();
                    }
                    if (e.key === 'Escape') {
                      handleEditCancel();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #10b981',
                    borderRadius: '6px',
                    fontSize: '16px',
                    textAlign: 'center',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontWeight: '600',
                    outline: 'none',
                    backgroundColor: '#ffffff !important',
                    color: '#000000 !important',
                    WebkitAppearance: 'none',
                    MozAppearance: 'textfield'
                  }}
                  onBlur={() => handleEditComplete()}
                  autoFocus
                  min="0"
                  step="10"
                />
              </div>
            </Html>
          ) : (
            <>
              <mesh 
                position={[0, 0, -0.01]} 
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick('right', e);
                }}
                onPointerOver={(e) => {
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={(e) => {
                  document.body.style.cursor = 'default';
                }}
              >
                <planeGeometry args={[2.8, 1.2]} />
                <meshBasicMaterial 
                  color={themeColors.hoverBg} 
                  transparent 
                  opacity={0.9}
                />
              </mesh>
              <mesh 
                position={[0, 0, -0.005]} 
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick('right', e);
                }}
              >
                <planeGeometry args={[2.6, 1.0]} />
                <meshBasicMaterial 
                  color={themeColors.background} 
                  transparent 
                  opacity={0.95}
                />
              </mesh>
              <Text
                position={[0, 0, 0.2]}
                fontSize={0.8}
                color="#000000"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.1}
                outlineColor="#ffffff"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick('right', e);
                }}
                onPointerOver={() => {
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={() => {
                  document.body.style.cursor = 'default';
                }}
              >
                {Math.max(0, distanceToRight)}
              </Text>
            </>
          )}
        </group>
      </group>

      {/* 기둥 너비 표시 (3D 모드에서만, 2D는 상단에 표시) */}
      {viewMode === '3D' && (
        <group position={[
          currentColumn.position[0], 
          columnHeightM + 0.8, 
          currentColumn.position[2]
        ]}>
          {editingDistance === 'width' ? (
            <Html
              transform
              distanceFactor={10}
              position={[0, 0, 0.1]}
              style={{ pointerEvents: 'auto' }}
            >
              <style>
                {`
                  .column-distance-input > div > input[type="number"] {
                    color: #000000 !important;
                    background-color: #ffffff !important;
                    -webkit-text-fill-color: #000000 !important;
                  }
                `}
              </style>
              <div 
                className="column-distance-input"
                style={{
                  background: '#ffffff',
                  border: '2px solid #10b981',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  minWidth: '140px',
                  boxShadow: '0 4px 20px rgba(16,185,129,0.3)',
                  fontSize: '14px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  color: '#000000'
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div style={{
                  color: '#10b981',
                  fontSize: '12px',
                  marginBottom: '8px',
                  fontWeight: '600'
                }}>
                  기둥 폭 (mm)
                </div>
                <input
                  ref={inputRef}
                  type="number"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      handleEditComplete();
                    }
                    if (e.key === 'Escape') {
                      handleEditCancel();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={inputStyle}
                  onBlur={() => handleEditComplete()}
                  autoFocus
                  min="800"
                  max="3000"
                  step="200"
                />
              </div>
            </Html>
          ) : (
            <>
              <mesh 
                position={[0, 0, -0.01]} 
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick('width', e);
                }}
                onPointerOver={(e) => {
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={(e) => {
                  document.body.style.cursor = 'default';
                }}
              >
                <planeGeometry args={[2.8, 1.2]} />
                <meshBasicMaterial 
                  color={themeColors.hoverBg} 
                  transparent 
                  opacity={0.9}
                />
              </mesh>
              <mesh 
                position={[0, 0, -0.005]} 
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick('width', e);
                }}
              >
                <planeGeometry args={[2.6, 1.0]} />
                <meshBasicMaterial 
                  color={themeColors.background} 
                  transparent 
                  opacity={0.95}
                />
              </mesh>
              <Text
                position={[0, 0, 0.2]}
                fontSize={0.8}
                color="#000000"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.1}
                outlineColor="#ffffff"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick('width', e);
                }}
                onPointerOver={() => {
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={() => {
                  document.body.style.cursor = 'default';
                }}
              >
                {currentColumn.width}
              </Text>
            </>
          )}
        </group>
      )}

      {/* 기둥 정면 중앙에 깊이 표시 */}
      <group position={[currentColumn.position[0], columnHeightM / 2, currentColumn.position[2] + columnDepthM / 2 + 0.1]}>
        <Text
          fontSize={0.4}
          color="#000000"
          anchorX="center"
          anchorY="middle"
          rotation={[0, 0, 0]}
        >
          D {currentColumn.depth}
        </Text>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[3.0, 1.0]} />
          <meshBasicMaterial color={themeColors.background} transparent opacity={0.95} />
        </mesh>
        <mesh position={[0, 0, -0.005]}>
          <planeGeometry args={[3.2, 1.2]} />
          <meshBasicMaterial color={theme?.mode === 'dark' ? '#555555' : '#cccccc'} transparent opacity={0.8} />
        </mesh>
      </group>

      {/* 정면뷰(2D)에서는 기둥 상단에 가로폭 표시 */}
      {viewMode === '2D' ? (
        <group position={[currentColumn.position[0], columnHeightM + 0.8, currentColumn.position[2]]}>
          <Text
            fontSize={0.5}
            color="#000000"
            anchorX="center"
            anchorY="middle"
            rotation={[0, 0, 0]}
          >
            {currentColumn.width}
          </Text>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[2.6, 0.9]} />
            <meshBasicMaterial color={themeColors.background} transparent opacity={0.95} />
          </mesh>
          <mesh position={[0, 0, -0.005]}>
            <planeGeometry args={[2.8, 1.1]} />
            <meshBasicMaterial color={themeColors.primary} transparent opacity={0.3} />
          </mesh>
        </group>
      ) : null}

    </group>
  );
};

export default React.memo(ColumnDistanceLabels);