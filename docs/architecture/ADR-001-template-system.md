# ADR-001: Template System Architecture

## Status
Proposed

## Context
가구 편집기에서 사용자가 생성한 공간 구성과 가구 배치를 템플릿으로 저장하고 재사용할 수 있는 기능이 필요함.

## Decision
3계층 아키텍처를 채택하여 UI, Service, Infrastructure 계층을 명확히 분리하고, 기존 코드베이스의 패턴을 따름.

## Architecture Overview

### Layer Boundaries
```
UI Layer (React Components)
    ↓ [DTOs/Interfaces]
Service Layer (Business Logic)
    ↓ [Repository Interface]
Infrastructure Layer (Firebase)
```

### Core Principles
- **NO** direct `firebase/*` imports in UI/Service layers
- Repository pattern for all data access
- Service layer orchestrates business logic
- UI layer only handles presentation

## Components

### 1. UI Layer
- `TemplateManager.tsx` - Main template UI component
- `TemplateList.tsx` - Display template gallery
- `TemplateCard.tsx` - Individual template display
- `useTemplates.ts` - React hook for template operations

### 2. Service Layer
- `templateService.ts` - Business logic orchestration
- `thumbnailService.ts` - Thumbnail generation logic
- DTOs for data transformation

### 3. Infrastructure Layer
- `templates.repo.ts` - Firebase data access
- `templateStorage.repo.ts` - Firebase Storage operations
- Collection: `teams/{teamId}/templates`

## Data Flow

### Create Template
```
UI → captureCanvas() → templateService.create() → repo.save() → Firebase
```

### List Templates
```
UI → useTemplates() → templateService.list() → repo.query() → Firebase
```

### Apply Template
```
UI → selectTemplate() → templateService.apply() → stores.update() → State
```

## Rollback Strategy
1. Feature flag control
2. Data backward compatibility
3. Graceful degradation if template system unavailable

## Consequences
- **Positive**: Clean separation, testable, maintainable
- **Negative**: Additional abstraction layers
- **Risk**: Performance overhead from thumbnail generation

## Migration Plan
Phase 1: Infrastructure setup (repos, collections)
Phase 2: Service layer implementation
Phase 3: UI components integration
Phase 4: Testing and validation