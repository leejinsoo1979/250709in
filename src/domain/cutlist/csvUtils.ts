/**
 * CSV 생성 유틸리티 함수
 */

/**
 * CSV 이스케이프 처리
 */
export function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) return '';
  
  const str = String(value);
  
  // 특수문자가 있으면 따옴표로 감싸기
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * 배열을 CSV 행으로 변환
 */
export function arrayToCSVRow(values: any[]): string {
  return values.map(escapeCSVValue).join(',');
}

/**
 * 객체 배열을 CSV로 변환
 */
export function objectsToCSV(
  objects: any[],
  headers: string[],
  fieldMapping?: { [key: string]: string }
): string {
  const lines: string[] = [];
  
  // 헤더 추가
  lines.push(arrayToCSVRow(headers));
  
  // 데이터 행 추가
  objects.forEach(obj => {
    const row = headers.map(header => {
      const field = fieldMapping?.[header] || header.toLowerCase();
      return obj[field];
    });
    lines.push(arrayToCSVRow(row));
  });
  
  return lines.join('\n');
}

/**
 * CSV 다운로드
 */
export function downloadCSV(
  content: string,
  fileName: string = 'data.csv'
): void {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([BOM + content], { 
    type: 'text/csv;charset=utf-8;' 
  });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // 메모리 정리
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * 여러 파일 순차 다운로드
 */
export async function downloadMultipleFiles(
  files: { content: string; fileName: string; type?: string }[]
): Promise<void> {
  for (const file of files) {
    const blob = new Blob([file.content], { 
      type: file.type || 'text/plain;charset=utf-8;' 
    });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    
    // 다음 다운로드까지 약간의 지연
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

/**
 * CSV 파싱 (간단한 파서)
 */
export function parseCSV(csv: string): string[][] {
  const lines = csv.split(/\r?\n/);
  const result: string[][] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const nextChar = line[j + 1];
      
      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"';
          j++; // Skip next quote
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          values.push(current);
          current = '';
        } else {
          current += char;
        }
      }
    }
    
    values.push(current);
    result.push(values);
  }
  
  return result;
}

/**
 * CSV를 객체 배열로 변환
 */
export function csvToObjects(csv: string): any[] {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];
  
  const headers = rows[0];
  const objects: any[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    const obj: any = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = rows[i][j];
    }
    objects.push(obj);
  }
  
  return objects;
}