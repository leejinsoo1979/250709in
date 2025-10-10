import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import { getThemeHex } from '@/theme';

interface EditableDimensionTextProps {
  // 위치 및 표시
  position: [number, number, number];
  fontSize: number;
  color: string;
  rotation?: [number, number, number];

  // 치수 값
  value: number;
  onValueChange: (newValue: number) => void;

  // 식별자
  sectionIndex: number;
  furnitureId?: string;

  // 렌더 설정
  renderOrder?: number;
  depthTest?: boolean;

  // Hover 상태 전파
  onHoverChange?: (isHovered: boolean) => void;
}

/**
 * 편집 가능한 치수 텍스트 컴포넌트
 * - 클릭으로 편집 모드 활성화
 * - 마우스 오버 시 텍스트와 가이드선이 테마 색상으로 강조
 * - Enter로 값 확정, ESC로 취소
 */
const EditableDimensionText: React.FC<EditableDimensionTextProps> = ({
  position,
  fontSize,
  color,
  rotation = [0, 0, Math.PI / 2],
  value,
  onValueChange,
  sectionIndex,
  furnitureId,
  renderOrder = 1000,
  depthTest = false,
  onHoverChange
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(Math.round(value * 100) / 100));
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  // 테마 색상 가져오기
  const themeColor = getThemeHex();

  // 편집 모드 진입 (클릭으로 변경)
  const handleClick = useCallback((e: any) => {
    e.stopPropagation();
    setEditValue(String(Math.round(value * 100) / 100));
    setIsEditing(true);
  }, [value]);

  // 입력창에 포커스
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 값 확정
  const handleConfirm = useCallback(() => {
    const newValue = parseFloat(editValue);

    // 유효성 검사
    if (isNaN(newValue) || newValue <= 0) {
      alert('유효한 숫자를 입력해주세요 (0보다 큰 값)');
      return;
    }

    // 최소/최대값 검증 (200mm ~ 3000mm)
    if (newValue < 200 || newValue > 3000) {
      alert('치수는 200mm ~ 3000mm 범위 내로 입력해주세요');
      return;
    }

    console.log('✅ 치수 변경 확정:', {
      furnitureId,
      sectionIndex,
      oldValue: Math.round(value * 100) / 100,
      newValue: Math.round(newValue * 100) / 100
    });

    onValueChange(newValue);
    setIsEditing(false);
  }, [editValue, value, onValueChange, furnitureId, sectionIndex]);

  // 취소
  const handleCancel = useCallback(() => {
    console.log('❌ 치수 변경 취소');
    setEditValue(String(Math.round(value * 100) / 100));
    setIsEditing(false);
  }, [value]);

  // 키보드 이벤트
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  }, [handleConfirm, handleCancel]);

  // Hover 이벤트
  const handlePointerOver = useCallback((e: any) => {
    e.stopPropagation();
    setIsHovered(true);
    if (onHoverChange) {
      onHoverChange(true);
    }
  }, [onHoverChange]);

  const handlePointerOut = useCallback((e: any) => {
    e.stopPropagation();
    setIsHovered(false);
    if (onHoverChange) {
      onHoverChange(false);
    }
  }, [onHoverChange]);

  // 현재 색상 결정 (hover 시 테마 색상)
  const currentColor = isHovered ? themeColor : color;

  return (
    <>
      {/* 편집 모드 */}
      {isEditing && (
        <Html
          position={position}
          center
          distanceFactor={10}
          style={{
            pointerEvents: 'auto',
            userSelect: 'none'
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              background: 'rgba(255, 255, 255, 0.95)',
              padding: '8px',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              border: '1px solid #ddd'
            }}
          >
            <input
              ref={inputRef}
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleCancel}
              style={{
                width: '80px',
                padding: '4px 8px',
                fontSize: '14px',
                border: '1px solid #999',
                borderRadius: '2px',
                textAlign: 'center'
              }}
              step="1"
              min="200"
              max="3000"
            />
            <div style={{ fontSize: '10px', color: '#666', textAlign: 'center' }}>
              Enter: 확정 / ESC: 취소
            </div>
          </div>
        </Html>
      )}

      {/* 일반 표시 모드 */}
      {!isEditing && (
        <group>
          {/* 치수 텍스트 (hover 시 테마 색상으로 변경) - 이벤트 없음 */}
          <Text
            position={position}
            fontSize={fontSize}
            color={currentColor}
            anchorX="center"
            anchorY="middle"
            rotation={rotation}
            renderOrder={renderOrder}
            depthTest={depthTest}
          >
            {Math.round(value * 100) / 100}
          </Text>

          {/* 클릭 영역 - 투명 메시 */}
          <mesh
            ref={meshRef}
            position={position}
            rotation={rotation}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
          >
            <planeGeometry args={[1.0, 0.5]} />
            <meshBasicMaterial
              transparent
              opacity={0.01}
              depthTest={false}
              side={2}
            />
          </mesh>
        </group>
      )}
    </>
  );
};

export default EditableDimensionText;
