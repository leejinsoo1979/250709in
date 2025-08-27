import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useDXFValidation } from '../useDXFValidation';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import type { PlacedModule } from '../../furniture/types';

describe('useDXFValidation', () => {
  const mockSpaceInfo: SpaceInfo = {
    width: 3000,
    height: 2400,
    depth: 600,
    leftWallVisible: true,
    rightWallVisible: true,
    surroundType: 'none',
    wallThickness: 20,
    topThickness: 20,
    bottomThickness: 20,
    middleShelfThickness: 20,
    middleShelfVisible: false,
    middleShelfHeight: null,
    backPanelVisible: true,
    backPanelThickness: 20,
    legsHeight: 0,
    legsType: null,
    baseBoardHeight: 0,
    customColumnCount: null,
    fillerLeft: 0,
    fillerRight: 0,
    topFillerHeight: 0,
    bottomFillerHeight: 0
  };

  const mockPlacedModule: PlacedModule = {
    id: 'module-1',
    moduleId: 'drawer-600',
    position: { x: 100, y: 0, z: 0 },
    rotation: 0,
    slotIndex: 0,
    isDualSlot: false
  };

  it('should return valid when space and furniture are properly configured', () => {
    const { result } = renderHook(() => useDXFValidation());
    
    const validation = result.current.validateDXFExport(mockSpaceInfo, [mockPlacedModule]);
    
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should return error when space info is null', () => {
    const { result } = renderHook(() => useDXFValidation());
    
    const validation = result.current.validateDXFExport(null, []);
    
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toHaveLength(1);
    expect(validation.errors[0].code).toBe('MISSING_SPACE_INFO');
  });

  it('should return error when space dimensions are invalid', () => {
    const { result } = renderHook(() => useDXFValidation());
    
    const invalidSpace: SpaceInfo = {
      ...mockSpaceInfo,
      width: 0,
      height: -100
    };
    
    const validation = result.current.validateDXFExport(invalidSpace, []);
    
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some(e => e.code === 'INVALID_SPACE_DIMENSIONS')).toBe(true);
  });

  it('should return error when furniture is out of bounds', () => {
    const { result } = renderHook(() => useDXFValidation());
    
    const outOfBoundsModule: PlacedModule = {
      ...mockPlacedModule,
      position: { x: 5000, y: 0, z: 0 } // Beyond space width
    };
    
    const validation = result.current.validateDXFExport(mockSpaceInfo, [outOfBoundsModule]);
    
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some(e => e.code === 'FURNITURE_OUT_OF_BOUNDS_X')).toBe(true);
  });

  it('should return warning when furniture overlaps', () => {
    const { result } = renderHook(() => useDXFValidation());
    
    const module1: PlacedModule = {
      ...mockPlacedModule,
      id: 'module-1',
      position: { x: 100, y: 0, z: 100 }
    };
    
    const module2: PlacedModule = {
      ...mockPlacedModule,
      id: 'module-2',
      position: { x: 150, y: 0, z: 150 } // Overlapping position
    };
    
    const validation = result.current.validateDXFExport(mockSpaceInfo, [module1, module2]);
    
    expect(validation.warnings.some(w => w.code === 'FURNITURE_OVERLAP')).toBe(true);
  });

  it('should return warning when no furniture is placed', () => {
    const { result } = renderHook(() => useDXFValidation());
    
    const validation = result.current.validateDXFExport(mockSpaceInfo, []);
    
    expect(validation.isValid).toBe(true);
    expect(validation.warnings.some(w => w.code === 'NO_FURNITURE')).toBe(true);
  });

  it('should get first error message correctly', () => {
    const { result } = renderHook(() => useDXFValidation());
    
    const validation = result.current.validateDXFExport(null, []);
    const errorMessage = result.current.getFirstErrorMessage(validation);
    
    expect(errorMessage).toContain('공간 정보가 없습니다');
  });

  it('should get validation summary correctly', () => {
    const { result } = renderHook(() => useDXFValidation());
    
    const validation = result.current.validateDXFExport(mockSpaceInfo, [mockPlacedModule]);
    const summary = result.current.getValidationSummary(validation);
    
    expect(summary).toBe('검증 통과: DXF 내보내기 준비 완료');
  });
});