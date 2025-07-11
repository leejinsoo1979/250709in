import { Object3DStyles } from '../types';

/**
 * 3D 오브젝트 기본 스타일 생성
 */
export const createObject3DStyles = (): Object3DStyles => {
  return {
    room: {
      floor: {
        color: '#e2e8f0', // 기존 2D 뷰어와 동일한 바닥 색상
        roughness: 0.5
      },
      walls: {
        color: '#f8fafc', 
        roughness: 0.3
      }
    },
    furniture: {
      color: '#64748b',
      roughness: 0.2
    }
  };
}; 