# Template System - TaskSpec Relay Document

## Overview
This document contains specific implementation tasks for each specialist agent to execute the template MVP system.

---

## BUILDER-BE TaskSpec

### Mission
Implement backend services and data repositories for the template system.

### Tasks

#### Task 1: Implement Repository Layer
**Priority**: Critical  
**Dependencies**: Type definitions must exist  

**Steps**:
1. Create `/src/repositories/template.repo.ts`
   - Implement all CRUD operations
   - Add query methods with filters
   - Handle Firebase Timestamp conversions
   - Implement usage count tracking

2. Create `/src/repositories/templateStorage.repo.ts`
   - Implement thumbnail upload/download
   - Add storage quota management
   - Handle cleanup operations

3. Setup Firebase configuration
   ```javascript
   // Firestore rules
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /teams/{teamId}/templates/{templateId} {
         allow read: if request.auth != null && 
                     (resource.data.isPublic == true || 
                      resource.data.userId == request.auth.uid ||
                      request.auth.token.teamId == teamId);
         allow write: if request.auth != null && 
                      request.auth.uid == resource.data.userId;
         allow create: if request.auth != null;
       }
     }
   }
   ```

**Acceptance Criteria**:
- [ ] All repository methods return correct types
- [ ] Error handling with specific error codes
- [ ] Firebase operations optimized for performance
- [ ] Storage operations handle failures gracefully

#### Task 2: Implement Service Layer
**Priority**: Critical  
**Dependencies**: Repository layer complete  

**Steps**:
1. Create `/src/services/template/templateService.ts`
   - Implement business logic for all operations
   - Add validation and quota management
   - Integrate with existing stores
   - Handle permissions and access control

2. Create `/src/services/template/thumbnailService.ts`
   - Integrate with canvas capture utilities
   - Implement image optimization
   - Add fallback placeholder generation

**Acceptance Criteria**:
- [ ] Service methods enforce business rules
- [ ] Thumbnail generation works with 3D canvas
- [ ] Apply template updates stores correctly
- [ ] Error messages are user-friendly

#### Task 3: Create Service Integration Points
**Priority**: High  
**Dependencies**: Service layer complete  

**Steps**:
1. Export services from index files
2. Add service instances to dependency injection (if applicable)
3. Configure environment variables for quotas/limits
4. Setup monitoring and logging

**Acceptance Criteria**:
- [ ] Services accessible from UI layer
- [ ] Configuration externalized
- [ ] Logging captures all operations
- [ ] Performance metrics collected

---

## BUILDER-UI TaskSpec

### Mission
Create React components and hooks for template user interface.

### Tasks

#### Task 1: Create Template Manager Components
**Priority**: Critical  
**Dependencies**: Service layer available  

**File Structure**:
```
src/components/template/
├── TemplateManager/
│   ├── TemplateManager.tsx
│   ├── TemplateManager.module.css
│   └── index.ts
├── TemplateList/
│   ├── TemplateList.tsx
│   ├── TemplateGrid.tsx
│   ├── TemplateCard.tsx
│   └── TemplateList.module.css
├── TemplateModals/
│   ├── CreateTemplateModal.tsx
│   ├── TemplateDetailsModal.tsx
│   └── ConfirmApplyModal.tsx
└── hooks/
    ├── useTemplates.ts
    ├── useTemplateFilters.ts
    └── useTemplateThumbnail.ts
```

**Implementation Details**:

```typescript
// useTemplates.ts
export function useTemplates() {
  const [templates, setTemplates] = useState<TemplateListItemDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTemplate = async (dto: CreateTemplateDTO) => {
    // Call templateService.create()
    // Handle loading states
    // Update local state
  };

  const applyTemplate = async (templateId: string) => {
    // Show confirmation modal
    // Call templateService.apply()
    // Update workspace
  };

  return {
    templates,
    loading,
    error,
    createTemplate,
    applyTemplate,
    // ... other methods
  };
}
```

**Acceptance Criteria**:
- [ ] Components follow existing design system
- [ ] Responsive layout for mobile/tablet
- [ ] Loading and error states handled
- [ ] Keyboard navigation supported

#### Task 2: Integrate with Configurator
**Priority**: High  
**Dependencies**: Template components complete  

**Integration Points**:
1. Add "Save as Template" button in toolbar
   - Location: `/src/editor/Configurator/components/Toolbar.tsx`
   - Trigger: Opens CreateTemplateModal

2. Add "Templates" tab in sidebar
   - Location: `/src/editor/Configurator/components/Sidebar.tsx`
   - Content: TemplateList component

3. Add template apply confirmation
   - Show current vs template preview
   - Warn about data loss

**Acceptance Criteria**:
- [ ] Integration doesn't break existing features
- [ ] UI elements match existing style
- [ ] Smooth transitions and animations
- [ ] Undo/redo works after template apply

#### Task 3: Implement Thumbnail Capture Integration
**Priority**: Medium  
**Dependencies**: Canvas available  

**Steps**:
1. Integrate with existing thumbnail capture
2. Add manual thumbnail regeneration
3. Implement lazy loading for gallery
4. Add progressive image loading

```typescript
// Thumbnail capture integration
const captureThumbnail = async (): Promise<string> => {
  const canvas = findThreeCanvas();
  if (!canvas) throw new Error('Canvas not found');
  
  return thumbnailService.captureWorkspace({
    width: 400,
    height: 300,
    quality: 0.8,
    format: 'jpeg'
  });
};
```

**Acceptance Criteria**:
- [ ] Thumbnails generate reliably
- [ ] Fallback to placeholder on failure
- [ ] Images optimize for web display
- [ ] Memory efficient loading

---

## VALIDATOR TaskSpec

### Mission
Create comprehensive test suite for template system validation.

### Tasks

#### Task 1: Unit Tests
**Priority**: High  
**Files to Test**:
- `templateService.test.ts`
- `thumbnailService.test.ts`
- `template.repo.test.ts`
- `useTemplates.test.ts`

**Test Coverage Requirements**:
```typescript
// templateService.test.ts
describe('TemplateService', () => {
  describe('create', () => {
    it('should create template with valid data');
    it('should reject invalid template name');
    it('should enforce quota limits');
    it('should handle thumbnail upload failure');
  });
  
  describe('apply', () => {
    it('should update workspace with template data');
    it('should preserve existing furniture when requested');
    it('should increment usage count');
  });
});
```

**Acceptance Criteria**:
- [ ] >80% code coverage
- [ ] All edge cases tested
- [ ] Mock Firebase operations
- [ ] Test error scenarios

#### Task 2: Integration Tests
**Priority**: High  
**Test Scenarios**:

1. **End-to-end Template Flow**
   ```typescript
   it('should complete full template lifecycle', async () => {
     // Create template
     // List templates
     // Apply template
     // Delete template
   });
   ```

2. **Permission Testing**
   - Test private template access
   - Test public template sharing
   - Test team template access

3. **Performance Testing**
   - Load 50 templates < 2 seconds
   - Apply template < 2 seconds
   - Concurrent operations handling

**Acceptance Criteria**:
- [ ] All user flows tested
- [ ] Performance benchmarks met
- [ ] Data consistency verified
- [ ] Error recovery tested

#### Task 3: E2E Tests
**Priority**: Medium  
**Tools**: Playwright  

**Test Scripts**:
```typescript
// template.e2e.test.ts
test('User can save and apply template', async ({ page }) => {
  // Navigate to configurator
  // Setup a workspace
  // Save as template
  // Clear workspace
  // Apply template
  // Verify workspace restored
});
```

**Acceptance Criteria**:
- [ ] Critical paths covered
- [ ] Cross-browser testing
- [ ] Visual regression tests
- [ ] Accessibility validation

---

## SCRIBE-DOCS TaskSpec

### Mission
Create comprehensive documentation for the template system.

### Tasks

#### Task 1: User Documentation
**Priority**: High  
**Location**: `/docs/user-guide/templates.md`

**Content Structure**:
```markdown
# Template System User Guide

## Overview
Save and reuse your furniture configurations...

## Getting Started
### Creating Your First Template
1. Design your space
2. Click "Save as Template"
3. Enter template details...

### Applying Templates
1. Open template gallery
2. Browse or search
3. Click apply...

## Advanced Features
- Template categories
- Sharing templates
- Bulk operations
```

**Acceptance Criteria**:
- [ ] Step-by-step instructions with screenshots
- [ ] Common use cases covered
- [ ] Troubleshooting section
- [ ] Video tutorials linked

#### Task 2: Developer Documentation
**Priority**: High  
**Location**: `/docs/dev-guide/template-architecture.md`

**Content Outline**:
1. Architecture overview with diagrams
2. API reference for all services
3. Database schema documentation
4. Extension points for future features
5. Performance considerations
6. Security model

**Acceptance Criteria**:
- [ ] Code examples included
- [ ] Sequence diagrams for workflows
- [ ] API documentation complete
- [ ] Migration guide included

#### Task 3: Release Notes
**Priority**: Medium  
**Location**: `/CHANGELOG.md`

**Template**:
```markdown
## [1.0.0] - 2024-01-XX

### Added
- Template system for saving and reusing configurations
- Automatic thumbnail generation from 3D workspace
- Template gallery with search and filters
- Public/private template sharing
- Template categories and tags

### Technical Details
- New Firestore collection: `teams/{teamId}/templates`
- Storage integration for thumbnails
- Service layer architecture pattern
- 50 template per user quota

### Migration Notes
- Feature flag: ENABLE_TEMPLATES
- No breaking changes to existing features
```

**Acceptance Criteria**:
- [ ] User-facing changes documented
- [ ] Technical changes noted
- [ ] Migration steps clear
- [ ] Known issues listed

---

## Coordination Matrix

| Component | Owner | Dependencies | Status |
|-----------|-------|--------------|--------|
| Type Definitions | ARCHITECT | None | ✅ Complete |
| Repository Layer | BUILDER-BE | Types | 🔄 Ready |
| Service Layer | BUILDER-BE | Repository | ⏳ Blocked |
| UI Components | BUILDER-UI | Service | ⏳ Blocked |
| Integration | BUILDER-UI | Components | ⏳ Blocked |
| Unit Tests | VALIDATOR | All Code | ⏳ Blocked |
| Documentation | SCRIBE | Implementation | ⏳ Blocked |

## Success Metrics

### Technical Metrics
- [ ] Zero breaking changes to existing features
- [ ] All acceptance criteria met
- [ ] Performance targets achieved
- [ ] >80% test coverage

### Quality Metrics
- [ ] No critical bugs in production
- [ ] <5% error rate for operations
- [ ] User satisfaction >4/5
- [ ] Documentation completeness 100%

---

## Risk Register

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Firebase quota exceeded | High | Low | Implement rate limiting |
| Thumbnail generation fails | Medium | Medium | Fallback placeholders |
| Performance degradation | High | Low | Lazy loading, pagination |
| Data migration issues | High | Low | Feature flag, rollback plan |

---

## Communication Protocol

1. **Daily Sync**: Status updates via TaskSpec tracking
2. **Blockers**: Immediate escalation to ARCHITECT
3. **Completion**: Update coordination matrix
4. **Issues**: Document in risk register

---

## Next Actions

1. **BUILDER-BE**: Start with repository implementation
2. **BUILDER-UI**: Review designs, prepare component structure
3. **VALIDATOR**: Setup test environment and mocks
4. **SCRIBE**: Begin user guide outline

**Deadline**: MVP Complete in 5 days
**Review**: Daily progress check at coordination matrix