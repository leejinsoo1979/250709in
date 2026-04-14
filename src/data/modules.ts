// 새로운 모듈 구조를 re-export
// 기존 imports는 이제 모두 modules/index.ts를 통해 처리됩니다.
export {
  type ModuleData,
  type SectionConfig,
  generateDynamicModules,
  STATIC_MODULES,
  getModulesByCategory,
  getModuleById,
  validateModuleForInternalSpace,
  getValidModulesForInternalSpace,
  buildModuleDataFromPlacedModule,
  calculateEvenShelfPositions
} from './modules/index';