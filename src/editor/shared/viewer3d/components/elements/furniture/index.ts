// 메인 컴포넌트
export { default as PlacedFurnitureContainer } from './PlacedFurnitureContainer';
export { default as FurnitureItem } from './FurnitureItem';

// 훅들
export { useFurnitureDrag } from './hooks/useFurnitureDrag';
export { useFurnitureKeyboard } from './hooks/useFurnitureKeyboard';
export { useFurnitureCollision } from './hooks/useFurnitureCollision';
export { useFurnitureSelection } from './hooks/useFurnitureSelection';

// 기본 Export (기존 호환성)
export { default } from './PlacedFurnitureContainer'; 