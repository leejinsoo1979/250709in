export const isDummyModuleId = (moduleId?: string | null): boolean =>
  typeof moduleId === 'string' && moduleId.includes('dummy')
