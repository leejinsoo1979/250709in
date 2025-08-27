# DXF Export Validation Error Scenarios

This directory contains screenshots demonstrating the DXF export button disabled state when validation errors occur.

## Captured Scenarios

### Scenario 1: Invalid Space Dimensions
**File**: `scenario-1-invalid-dimensions.png`
- **Error Condition**: Space width set to 0mm (invalid value)
- **Error Message**: "최소 1200mm 이상이어야 합니다" (Must be at least 1200mm)
- **Result**: DXF export button is disabled
- **Visual Indicators**:
  - Red error message below the width input field
  - Export dropdown menu shows DXF and PDF options
  - Width field shows "0" with validation error

### Scenario 2: Furniture Out of Bounds (Attempted)
**Status**: Partially demonstrated
- **Intended Setup**: Furniture placed at position X=5000mm (outside 1200mm space width)
- **Expected Error**: "가구가 공간 경계를 벗어남" (Furniture is out of space boundaries)
- **Note**: Due to the application's validation, furniture cannot be placed outside bounds through normal interaction

### Scenario 3: Missing Space Information  
**Status**: To be captured
- **Setup**: Space configuration set to null
- **Expected Error**: "공간 정보가 없습니다" (Space information is missing)
- **Result**: DXF export button disabled until space is configured

## Implementation Details

The validation system (`useDXFValidation` hook) checks for:

1. **Space Validation**:
   - Space info exists
   - Dimensions are positive values
   - Dimensions are within valid ranges (100mm - 100,000mm recommended)

2. **Furniture Validation**:
   - Valid position coordinates
   - Furniture within space boundaries (X, Y, Z)
   - No overlapping furniture (warning level)

3. **Export Control**:
   - Export button disabled when `dxfValidation.isValid === false`
   - Tooltip shows first error message on hover
   - Error message displayed in status area

## Technical Implementation

```tsx
// ExportPanel.tsx validation logic
const dxfValidation = useMemo(() => {
  return validateDXFExport(spaceInfo, placedModules);
}, [spaceInfo, placedModules, validateDXFExport]);

const isExportEnabled = spaceInfo && 
  canExportDXF(spaceInfo, placedModules) && 
  selectedDrawingTypes.length > 0 && 
  dxfValidation.isValid; // ← Validation check

// Button with error tooltip
<button
  disabled={!isExportEnabled || isExporting}
  title={!isExportEnabled && dxfErrorMessage ? dxfErrorMessage : ''}
>
  ZIP 파일로 다운로드
</button>
```

## Validation Error Codes

- `MISSING_SPACE_INFO`: Space configuration is null or missing
- `INVALID_SPACE_DIMENSIONS`: Space dimensions are 0 or negative
- `SMALL_SPACE_DIMENSIONS`: Space dimensions < 100mm (warning)
- `LARGE_SPACE_DIMENSIONS`: Space dimensions > 100,000mm (warning)
- `INVALID_FURNITURE_POSITION`: Furniture has invalid position data
- `FURNITURE_OUT_OF_BOUNDS_X`: Furniture exceeds width boundaries
- `FURNITURE_OUT_OF_BOUNDS_Z`: Furniture exceeds depth boundaries
- `FURNITURE_HEIGHT_WARNING`: Furniture exceeds height (warning)
- `FURNITURE_OVERLAP`: Furniture pieces overlap (warning)

## Viewing the Screenshots

Open `scenario-1-invalid-dimensions.png` to see the validation error UI in action. The screenshot clearly shows:
- The invalid input (0mm width)
- The error message in Korean
- The export dropdown menu state
- The overall UI context

These validation scenarios ensure data integrity before DXF export, preventing invalid CAD file generation.