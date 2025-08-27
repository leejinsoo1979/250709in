# Step1 ProjectId/Title Persistence Test Plan

## Test Scenario
Test that projectId and projectTitle persist correctly when creating a new design file in an existing project.

## Fixed Issues
1. ✅ Step1BasicInfo now shows "디자인파일 명" instead of "프로젝트 제목" when projectId exists
2. ✅ Step2SpaceAndCustomization displays the actual project title instead of "새 프로젝트"
3. ✅ State persistence using useRef to prevent reset on re-renders
4. ✅ Props properly passed from SimpleDashboard → Step1 → StepContainer → Step1BasicInfo/Step2

## Key Changes Made

### 1. Step1BasicInfo.tsx
- Added `useMemo` import for optimized value computation
- Implemented proper useRef initialization with null values
- Initial values set only once on mount (empty dependency array)
- Store updates properly sync with refs
- Final values computed with useMemo for stability
- Label always shows "디자인파일 명" when projectId exists

### 2. Step2SpaceAndCustomization.tsx  
- Added missing `useRef` and `useMemo` imports
- Same ref pattern as Step1BasicInfo for consistency
- Project title display conditional on actual projectTitle value
- Removed fallback to "새 프로젝트" in header display

### 3. SimpleDashboard.tsx
- Already correctly passes projectId and projectTitle to Step1 modal
- Uses `useProjectStore.getState()` to get current values
- Properly sets both values in store before opening modal

## Test Steps

1. **Initial Setup**
   - Open SimpleDashboard
   - Select an existing project
   - Click "새 디자인" button

2. **Step1 Verification**
   - ✅ Label should show "디자인파일 명" (not "프로젝트 제목")
   - ✅ Placeholder should be "디자인파일 명을 입력해주세요"
   - ✅ Header should show "프로젝트: [actual project name]"

3. **Interaction Test**
   - Enter a design file name
   - Select installation location (설치 위치)
   - ✅ Label should STILL show "디자인파일 명" (not reset to "프로젝트 제목")
   - ✅ Project name in header should remain unchanged

4. **Step2 Verification**
   - Click "다음 단계" to go to Step2
   - ✅ Header should show "프로젝트: [actual project name]" (not "새 프로젝트")
   - ✅ Design name should be displayed correctly

5. **Back Navigation Test**
   - Click "이전" to go back to Step1
   - ✅ Label should STILL show "디자인파일 명"
   - ✅ All entered values should be preserved
   - ✅ Project information should remain intact

## Implementation Details

### useRef Pattern
```typescript
// Initialize refs with null
const projectIdRef = useRef<string | null>(null);
const projectTitleRef = useRef<string | null>(null);

// Set initial values only once on mount
useEffect(() => {
  if (!projectIdRef.current) {
    projectIdRef.current = storeProjectId || propsProjectId || null;
  }
  if (!projectTitleRef.current) {
    projectTitleRef.current = storeProjectTitle || propsProjectTitle || null;
  }
}, []); // Empty dependency - runs once

// Update refs when store changes (store has priority)
useEffect(() => {
  if (storeProjectId) {
    projectIdRef.current = storeProjectId;
  }
  if (storeProjectTitle) {
    projectTitleRef.current = storeProjectTitle;
  }
}, [storeProjectId, storeProjectTitle]);

// Compute final values with useMemo
const projectId = useMemo(() => 
  projectIdRef.current || storeProjectId || propsProjectId || null,
  [storeProjectId, propsProjectId, projectIdRef.current]
);
```

This pattern ensures:
- Values persist across re-renders
- Store updates are properly synchronized
- Props serve as fallback when store is empty
- No unnecessary re-computations

## Expected Console Logs

Step1BasicInfo mount/update log should show:
- `finalProjectId`: Should always have the project ID
- `finalProjectTitle`: Should always have the project title
- These values should NOT reset when interacting with form fields

Step2 projectId/Title verification log should show:
- `finalProjectId`: Matching the Step1 value
- `finalProjectTitle`: Actual project name (not "새 프로젝트")

## Success Criteria
✅ All test steps pass without issues
✅ ProjectId and projectTitle persist through all interactions
✅ Labels remain correct throughout the flow
✅ No resets or data loss when navigating between steps