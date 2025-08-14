import { OptimizedResult } from '../types';

export const generateDXF = (results: OptimizedResult[]): string => {
  let dxf = '';
  
  // DXF 헤더
  dxf += '0\nSECTION\n';
  dxf += '2\nHEADER\n';
  dxf += '9\n$ACADVER\n1\nAC1014\n';
  dxf += '9\n$INSBASE\n10\n0.0\n20\n0.0\n30\n0.0\n';
  dxf += '9\n$EXTMIN\n10\n0.0\n20\n0.0\n30\n0.0\n';
  dxf += '9\n$EXTMAX\n10\n2440.0\n20\n1220.0\n30\n0.0\n';
  dxf += '0\nENDSEC\n';
  
  // 테이블 섹션
  dxf += '0\nSECTION\n';
  dxf += '2\nTABLES\n';
  dxf += '0\nTABLE\n';
  dxf += '2\nLTYPE\n';
  dxf += '0\nLTYPE\n';
  dxf += '2\nCONTINUOUS\n';
  dxf += '70\n0\n';
  dxf += '0\nENDTAB\n';
  dxf += '0\nTABLE\n';
  dxf += '2\nLAYER\n';
  dxf += '0\nLAYER\n';
  dxf += '2\n0\n';
  dxf += '70\n0\n';
  dxf += '62\n7\n';
  dxf += '6\nCONTINUOUS\n';
  dxf += '0\nENDTAB\n';
  dxf += '0\nENDSEC\n';
  
  // 블록 섹션
  dxf += '0\nSECTION\n';
  dxf += '2\nBLOCKS\n';
  dxf += '0\nENDSEC\n';
  
  // 엔티티 섹션
  dxf += '0\nSECTION\n';
  dxf += '2\nENTITIES\n';
  
  // 각 최적화 결과에 대해 도형 생성
  let yOffset = 0;
  results.forEach((result, sheetIndex) => {
    // 원장 외곽선
    dxf += createRectangle(
      0,
      yOffset,
      result.stockPanel.width,
      result.stockPanel.height,
      '0'
    );
    
    // 배치된 패널들
    result.panels.forEach(panel => {
      const width = panel.rotated ? panel.height : panel.width;
      const height = panel.rotated ? panel.width : panel.height;
      
      dxf += createRectangle(
        panel.x,
        yOffset + panel.y,
        width,
        height,
        '0'
      );
      
      // 패널 이름 텍스트
      dxf += createText(
        panel.x + width / 2,
        yOffset + panel.y + height / 2,
        panel.name,
        height > 100 ? 20 : 10
      );
    });
    
    yOffset += result.stockPanel.height + 100; // 다음 시트와 간격
  });
  
  dxf += '0\nENDSEC\n';
  dxf += '0\nEOF\n';
  
  return dxf;
};

// 사각형 생성
const createRectangle = (
  x: number,
  y: number,
  width: number,
  height: number,
  layer: string
): string => {
  let dxf = '';
  
  // POLYLINE으로 사각형 생성
  dxf += '0\nPOLYLINE\n';
  dxf += '8\n' + layer + '\n';
  dxf += '70\n1\n'; // 닫힌 폴리라인
  
  // 꼭짓점들
  dxf += '0\nVERTEX\n';
  dxf += '8\n' + layer + '\n';
  dxf += '10\n' + x + '\n';
  dxf += '20\n' + y + '\n';
  
  dxf += '0\nVERTEX\n';
  dxf += '8\n' + layer + '\n';
  dxf += '10\n' + (x + width) + '\n';
  dxf += '20\n' + y + '\n';
  
  dxf += '0\nVERTEX\n';
  dxf += '8\n' + layer + '\n';
  dxf += '10\n' + (x + width) + '\n';
  dxf += '20\n' + (y + height) + '\n';
  
  dxf += '0\nVERTEX\n';
  dxf += '8\n' + layer + '\n';
  dxf += '10\n' + x + '\n';
  dxf += '20\n' + (y + height) + '\n';
  
  dxf += '0\nSEQEND\n';
  
  return dxf;
};

// 텍스트 생성
const createText = (
  x: number,
  y: number,
  text: string,
  height: number
): string => {
  let dxf = '';
  
  dxf += '0\nTEXT\n';
  dxf += '8\n0\n'; // 레이어
  dxf += '10\n' + x + '\n';
  dxf += '20\n' + y + '\n';
  dxf += '40\n' + height + '\n'; // 텍스트 높이
  dxf += '1\n' + text + '\n';
  dxf += '72\n1\n'; // 수평 중앙 정렬
  dxf += '73\n2\n'; // 수직 중앙 정렬
  
  return dxf;
};