const fs = require('fs');
const path = require('path');

// Function to convert Line component to native Three.js line
function convertLineToNative(lineMatch, index) {
  // Extract props from the Line component
  const keyMatch = lineMatch.match(/key={([^}]+)}/);
  const pointsMatch = lineMatch.match(/points={\[([\s\S]*?)\]}/);
  const colorMatch = lineMatch.match(/color={([^}]+)}/);
  const lineWidthMatch = lineMatch.match(/lineWidth={([^}]+)}/);
  const dashedMatch = lineMatch.match(/dashed/);
  const dashSizeMatch = lineMatch.match(/dashSize={([^}]+)}/);
  const gapSizeMatch = lineMatch.match(/gapSize={([^}]+)}/);
  const opacityMatch = lineMatch.match(/opacity={([^}]+)}/);
  const transparentMatch = lineMatch.match(/transparent/);
  
  const key = keyMatch ? keyMatch[1] : `'line-${index}'`;
  const points = pointsMatch ? pointsMatch[1] : '';
  const color = colorMatch ? colorMatch[1] : "'#000000'";
  const opacity = opacityMatch ? opacityMatch[1] : '1';
  const dashSize = dashSizeMatch ? dashSizeMatch[1] : '1';
  const gapSize = gapSizeMatch ? gapSizeMatch[1] : '1';
  
  // Parse points to extract coordinates
  const pointsArray = points.split(',').map(p => p.trim());
  const vectors = [];
  
  // Extract Vector3 coordinates
  const vector3Matches = points.match(/new THREE\.Vector3\([^)]+\)/g);
  if (vector3Matches && vector3Matches.length >= 2) {
    const coords = [];
    vector3Matches.forEach(v => {
      const coordMatch = v.match(/Vector3\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
      if (coordMatch) {
        coords.push(coordMatch[1].trim(), coordMatch[2].trim(), coordMatch[3].trim());
      }
    });
    
    if (coords.length >= 6) {
      const varName = `lineGeometry${index}`;
      const materialType = dashedMatch ? 'lineDashedMaterial' : 'lineBasicMaterial';
      
      let result = `(() => {
        const ${varName} = new THREE.BufferGeometry();
        const points${index} = new Float32Array([
          ${coords.slice(0, 3).join(', ')},
          ${coords.slice(3, 6).join(', ')}
        ]);
        ${varName}.setAttribute('position', new THREE.BufferAttribute(points${index}, 3));
        ${dashedMatch ? `${varName}.computeLineDistances();` : ''}
        
        return (
          <line key=${key} geometry={${varName}}>
            <${materialType}
              color=${color}${dashedMatch ? `
              dashSize=${dashSize}
              gapSize=${gapSize}` : ''}
              opacity=${opacity}
              transparent${transparentMatch ? '={true}' : ''}
            />
          </line>
        );
      })()`;
      
      return result;
    }
  }
  
  // Fallback if parsing fails
  return lineMatch;
}

// Read the files
const files = [
  '/Users/jinsoolee/Desktop/250709in/src/editor/shared/viewer3d/components/elements/CleanCAD2D.tsx',
  '/Users/jinsoolee/Desktop/250709in/src/editor/shared/viewer3d/components/elements/CADDimensions2D.tsx'
];

files.forEach(filePath => {
  console.log(`Processing ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Remove Line from imports
  content = content.replace(
    /import\s*{\s*([^}]*)\s*}\s*from\s*['"]@react-three\/drei['"]/,
    (match, imports) => {
      const importList = imports.split(',').map(i => i.trim()).filter(i => i !== 'Line');
      return importList.length > 0 
        ? `import { ${importList.join(', ')} } from '@react-three/drei'`
        : '';
    }
  );
  
  // Counter for unique keys
  let lineIndex = 0;
  
  // Replace Line components with native three.js lines
  // Match multi-line Line components
  content = content.replace(
    /<Line[\s\S]*?\/>/g,
    (match) => {
      lineIndex++;
      return convertLineToNative(match, lineIndex);
    }
  );
  
  // Save the modified content
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Processed ${filePath}`);
});

console.log('✅ All files processed successfully!');