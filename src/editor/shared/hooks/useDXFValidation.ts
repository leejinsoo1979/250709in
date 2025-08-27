import { useMemo } from 'react';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import type { PlacedModule } from '../furniture/types';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../viewer3d/utils/geometry';

export interface DXFValidationError {
  type: 'error' | 'warning';
  code: string;
  message: string;
  details?: string;
}

export interface DXFValidationResult {
  isValid: boolean;
  errors: DXFValidationError[];
  warnings: DXFValidationError[];
}

/**
 * Hook for validating DXF export compatibility
 * Checks for common issues that may prevent proper DXF generation
 */
export const useDXFValidation = () => {
  /**
   * Validates the space and furniture configuration for DXF export
   */
  const validateDXFExport = (
    spaceInfo: SpaceInfo | null,
    placedModules: PlacedModule[]
  ): DXFValidationResult => {
    const errors: DXFValidationError[] = [];
    const warnings: DXFValidationError[] = [];

    // Check if space info exists
    if (!spaceInfo) {
      errors.push({
        type: 'error',
        code: 'MISSING_SPACE_INFO',
        message: '공간 정보가 없습니다',
        details: '공간 크기를 먼저 설정해주세요'
      });
      return { isValid: false, errors, warnings };
    }

    // Check space dimensions
    if (spaceInfo.width <= 0 || spaceInfo.height <= 0 || spaceInfo.depth <= 0) {
      errors.push({
        type: 'error',
        code: 'INVALID_SPACE_DIMENSIONS',
        message: '유효하지 않은 공간 크기',
        details: `너비: ${spaceInfo.width}mm, 높이: ${spaceInfo.height}mm, 깊이: ${spaceInfo.depth}mm`
      });
    }

    // Check minimum space dimensions
    if (spaceInfo.width < 100 || spaceInfo.height < 100 || spaceInfo.depth < 100) {
      warnings.push({
        type: 'warning',
        code: 'SMALL_SPACE_DIMENSIONS',
        message: '공간 크기가 너무 작습니다',
        details: '최소 100mm 이상을 권장합니다'
      });
    }

    // Check maximum space dimensions
    if (spaceInfo.width > 100000 || spaceInfo.height > 100000 || spaceInfo.depth > 100000) {
      warnings.push({
        type: 'warning',
        code: 'LARGE_SPACE_DIMENSIONS',
        message: '공간 크기가 너무 큽니다',
        details: '100,000mm 이하를 권장합니다'
      });
    }

    const internalSpace = spaceInfo ? calculateInternalSpace(spaceInfo) : null;

    // Check furniture modules
    placedModules.forEach((module, index) => {
      const moduleData = internalSpace ? getModuleById(module.moduleId, internalSpace, spaceInfo) : null;
      
      // For validation purposes, use default dimensions if module data is not found
      // This can happen in test environments or with custom modules
      const dimensions = moduleData?.dimensions || { 
        width: 400, 
        height: 400, 
        depth: 300 
      };
      const moduleName = moduleData?.name || `모듈-${module.moduleId}`;

      // Check furniture position
      if (!module.position || 
          typeof module.position.x !== 'number' || 
          typeof module.position.y !== 'number' || 
          typeof module.position.z !== 'number') {
        errors.push({
          type: 'error',
          code: 'INVALID_FURNITURE_POSITION',
          message: `가구 ${index + 1}: 유효하지 않은 위치`,
          details: `${moduleName} (${module.id})`
        });
      }

      // Check if furniture is outside space bounds
      if (module.position) {
        const furnitureWidth = module.customWidth || module.adjustedWidth || dimensions.width;
        const furnitureDepth = module.customDepth || dimensions.depth;
        
        // Check X bounds
        if (module.position.x < 0 || module.position.x + furnitureWidth > spaceInfo.width) {
          errors.push({
            type: 'error',
            code: 'FURNITURE_OUT_OF_BOUNDS_X',
            message: `가구 ${index + 1}: 공간 경계를 벗어남 (가로)`,
            details: `${moduleName}: X=${module.position.x}, 너비=${furnitureWidth}mm`
          });
        }

        // Check Z bounds
        if (module.position.z < 0 || module.position.z + furnitureDepth > spaceInfo.depth) {
          errors.push({
            type: 'error',
            code: 'FURNITURE_OUT_OF_BOUNDS_Z',
            message: `가구 ${index + 1}: 공간 경계를 벗어남 (깊이)`,
            details: `${moduleName}: Z=${module.position.z}, 깊이=${furnitureDepth}mm`
          });
        }

        // Check Y bounds
        if (module.position.y < 0 || module.position.y + dimensions.height > spaceInfo.height) {
          warnings.push({
            type: 'warning',
            code: 'FURNITURE_HEIGHT_WARNING',
            message: `가구 ${index + 1}: 높이 확인 필요`,
            details: `${moduleName}: Y=${module.position.y}, 높이=${dimensions.height}mm`
          });
        }
      }

      // Check for overlapping furniture
      for (let j = index + 1; j < placedModules.length; j++) {
        const otherModule = placedModules[j];
        if (module.position && otherModule.position) {
          const otherModuleData = internalSpace ? getModuleById(otherModule.moduleId, internalSpace, spaceInfo) : null;
          const otherDimensions = otherModuleData?.dimensions || { width: 400, height: 400, depth: 300 };
          const otherModuleName = otherModuleData?.name || `모듈-${otherModule.moduleId}`;

          const width1 = module.customWidth || module.adjustedWidth || dimensions.width;
          const depth1 = module.customDepth || dimensions.depth;
          const width2 = otherModule.customWidth || otherModule.adjustedWidth || otherDimensions.width;
          const depth2 = otherModule.customDepth || otherDimensions.depth;

          // Simple AABB collision detection
          const overlap = 
            module.position.x < otherModule.position.x + width2 &&
            module.position.x + width1 > otherModule.position.x &&
            module.position.z < otherModule.position.z + depth2 &&
            module.position.z + depth1 > otherModule.position.z;

          if (overlap) {
            warnings.push({
              type: 'warning',
              code: 'FURNITURE_OVERLAP',
              message: `가구 겹침 감지`,
              details: `${moduleName}와 ${otherModuleName}가 겹쳐있을 수 있습니다`
            });
          }
        }
      }
    });

    // Check if no furniture is placed
    if (placedModules.length === 0) {
      warnings.push({
        type: 'warning',
        code: 'NO_FURNITURE',
        message: '배치된 가구가 없습니다',
        details: '공간 도면만 생성됩니다'
      });
    }

    const isValid = errors.length === 0;
    return { isValid, errors, warnings };
  };

  /**
   * Gets the first error message for display
   */
  const getFirstErrorMessage = (result: DXFValidationResult): string | null => {
    if (result.errors.length > 0) {
      const firstError = result.errors[0];
      return `${firstError.message}${firstError.details ? `: ${firstError.details}` : ''}`;
    }
    return null;
  };

  /**
   * Gets all error messages formatted for display
   */
  const getErrorMessages = (result: DXFValidationResult): string[] => {
    return result.errors.map(error => 
      `${error.message}${error.details ? `: ${error.details}` : ''}`
    );
  };

  /**
   * Gets validation summary
   */
  const getValidationSummary = (result: DXFValidationResult): string => {
    if (result.isValid && result.warnings.length === 0) {
      return '검증 통과: DXF 내보내기 준비 완료';
    } else if (result.isValid && result.warnings.length > 0) {
      return `경고 ${result.warnings.length}개: 내보내기 가능하나 확인 필요`;
    } else {
      return `오류 ${result.errors.length}개: 내보내기 불가능`;
    }
  };

  return {
    validateDXFExport,
    getFirstErrorMessage,
    getErrorMessages,
    getValidationSummary
  };
};