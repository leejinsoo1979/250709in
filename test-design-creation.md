# Design Creation Flow Test Report

## Session 2 Updates - HOTFIX-DESIGN-VISIBILITY

### Latest Fixes (2025-01-23)

#### 1. ✅ Restored Step1-2 Modal Flow for Design Creation
- **File**: `src/pages/SimpleDashboard.tsx`
- **Fix**: Changed back to open Step1 modal instead of direct navigation
- **Reason**: Designs need title and space info input through Step1-2 modals
- **Current**: Opens Step1 modal → Step2 modal → Navigate to Configurator

#### 2. ✅ Fixed Nested Design Storage Structure
- **File**: `src/services/designs.repo.ts`
- **Implementation**: 
  - Enforces projectId requirement (throws error if missing)
  - Saves to nested path: `teams/{teamId}/projects/{projectId}/designs/{designId}`
  - Dual-write enabled for backward compatibility
  - Returns `pathUsed` for debugging

#### 3. ✅ Fixed Design List with 3-Level Fallback
- **File**: `src/services/designs.repo.ts`
- **Implementation**: `listDesignFiles` function with fallback:
  1. Try nested project path first (if FLAGS.nestedDesigns enabled)
  2. Fallback to team-scoped path
  3. Final fallback to legacy path
- **Result**: Ensures all designs are visible regardless of storage location

#### 4. ✅ Added Auto-Refresh After Design Creation
- **Files**: 
  - `src/pages/SimpleDashboard.tsx` - Added refresh on modal close
  - `src/editor/Step1/components/Step2SpaceAndCustomization.tsx` - Added BroadcastChannel
- **Implementation**:
  - BroadcastChannel broadcasts `DESIGN_FILE_UPDATED` when design created
  - Dashboard refreshes design list on modal close
  - Window focus also triggers refresh

#### 5. ✅ Fixed Loading Overlay Background
- **Files**: Step1BasicInfo.module.css, Step2SpaceAndCustomization.module.css
- **Fix**: Changed loading overlay background from white to transparent
- **Result**: Cleaner Step1 to Step2 transition without white flash

## Testing Steps

1. **Open the application**: http://localhost:5174/
2. **Login** if not already logged in
3. **Select a project** from the project list
4. **Click "새 디자인 생성"** (Create New Design) button
5. **Verify Step1 Modal**:
   - Should show "디자인 정보" title (not "프로젝트 정보")
   - Enter design title and location
   - Click "다음" to proceed
6. **Verify Step2 Modal**:
   - Should transition smoothly without white flash
   - Configure space dimensions and customization
   - Click "확인" to create design
7. **Verify Navigation**:
   - Should navigate to `/configurator?projectId={id}&designId={id}&skipLoad=true`
   - Design should be saved to nested path
8. **Return to Dashboard**:
   - Navigate back to dashboard
   - **Verify design appears immediately in the project list**

## Expected Behavior

### Design Creation Flow:
1. ✅ Click "새 디자인 생성" → Opens Step1 modal
2. ✅ Step1: Input design title and location
3. ✅ Step2: Configure space dimensions
4. ✅ Save to nested path: `teams/{teamId}/projects/{projectId}/designs/{designId}`
5. ✅ Navigate to Configurator with design loaded
6. ✅ Design appears immediately in dashboard after creation

### Console Logs to Check:
- `🚀 handleCreateDesign 호출됨: {projectId, user}`
- `✅ Saved to nested project path: teams/{teamId}/projects/{projectId}/designs/{designId}`
- `🎨 Found designs in nested project path: {count}`
- `📡 프로젝트 업데이트 알림 수신: DESIGN_FILE_UPDATED`

## Firestore Structure

### Nested Design Path (Primary):
```
teams/
  {teamId}/
    projects/
      {projectId}/
        designs/
          {designId}
```

### Fallback Paths:
1. Team-scoped: `teams/{teamId}/designs/{designId}`
2. Legacy: `designFiles/{designId}`

## Feature Flags

All enabled in `/src/flags.ts`:
- `teamScope: true`
- `dualWrite: true` 
- `newReadsFirst: true`
- `nestedDesigns: true`

## Status

✅ **HOTFIX-DESIGN-VISIBILITY COMPLETED**
- Designs now save to nested project paths
- Designs appear immediately in dashboard after creation
- 3-level fallback ensures backward compatibility
- Auto-refresh implemented via BroadcastChannel and modal close

## Session 3 Updates - Firebase Integration Fixes

### Latest Fixes (2025-08-23)

#### 1. ✅ Fixed Project Deletion Error
- **Problem**: "프로젝트를 찾을 수 없습니다" error when deleting projects
- **Root Cause**: Projects created in `teams/{teamId}/projects` but deletion only checked `projects` collection
- **Fix**: Modified `deleteProject` in `/src/firebase/projects.ts` to check both team-scoped and legacy paths
- **User Feedback**: "왜 프로젝트 삭제 권한이 없다고 나오고"

#### 2. ✅ Fixed Trash/Recycle Bin
- **Problem**: Deleted projects not showing in trash
- **Root Cause**: `moveToTrash` only deleted from Firebase without updating UI state
- **Fix**: Modified `/src/pages/SimpleDashboard.tsx` to add deleted projects to `deletedProjects` state and localStorage
- **User Feedback**: "왜 삭제했는데 휴지통에 삭제한 프로젝트가 없는거야"

#### 3. ✅ Fixed Design File Update Logic
- **Problem**: `updateDesignFile` had incomplete path search logic
- **Fix**: Implemented 3-level path search in `/src/firebase/projects.ts`:
  1. Check Legacy path (`designFiles` collection)
  2. Check Team-scoped path (`teams/{teamId}/designs`)
  3. Check Nested path (`teams/{teamId}/projects/{projectId}/designs`)
- **Added**: Dual-write to all paths for consistency

#### 4. ✅ Fixed Design Files Not Displaying
- **Problem**: Design files saved but not visible in projects
- **Root Cause**: `getDisplayedItems` in SimpleDashboard was showing dummy data instead of real Firebase designs
- **Fix**: Modified to display actual `projectDesignFiles` from Firebase
- **User Feedback**: "왜 프로젝트안에 저장한 디자인 파일이 없는데 왜?"

### Data Flow Summary

#### Create Operations:
- Save to Legacy path first
- Dual-write to all paths (team-scoped, nested)

#### Read Operations:
- Try Nested path first
- Fallback to Team-scoped
- Final fallback to Legacy

#### Update Operations:
- Search all paths to find document
- Update found path
- Dual-write to sync other paths

#### Delete Operations:
- Check Team-scoped path
- Fallback to Legacy path

## Known Issues

- Build has TypeScript errors (pre-existing, doesn't affect runtime)
- Team structure forced on individual users (works but confusing UX)