/**
 * Canvas2D 기반 캐비닛 섬네일 생성기
 * 투명 배경 PNG로 캐비닛 내부 구조를 렌더링
 */

import { CustomFurnitureConfig, CustomSection, CustomElement } from '@/editor/shared/furniture/types';

interface GenerateOptions {
  width?: number;   // 캔버스 너비 (px, 기본: 200)
  height?: number;  // 캔버스 높이 (px, 기본: 267 → 3:4 비율)
  padding?: number; // 패딩 (px, 기본: 12)
}

/**
 * 캐비닛 구성을 Canvas2D로 렌더링하여 투명 배경 PNG dataURL 반환
 */
export function generateCabinetThumbnail(
  config: CustomFurnitureConfig,
  furnitureWidth: number,
  furnitureHeight: number,
  options: GenerateOptions = {},
): string {
  const canvasW = options.width || 200;
  const canvasH = options.height || 267;
  const pad = options.padding || 12;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return '';

  // 투명 배경 (clear)
  ctx.clearRect(0, 0, canvasW, canvasH);

  // 가구 비율 계산
  const maxW = canvasW - pad * 2;
  const maxH = canvasH - pad * 2;
  const aspect = furnitureWidth / furnitureHeight;
  let drawW: number, drawH: number;
  if (aspect > maxW / maxH) {
    drawW = maxW;
    drawH = maxW / aspect;
  } else {
    drawH = maxH;
    drawW = maxH * aspect;
  }
  const ox = (canvasW - drawW) / 2;
  const oy = (canvasH - drawH) / 2;

  const panelT = Math.max(2, drawW * 0.025); // 패널 두께 (px)

  // ── 외곽 박스 (둥근 모서리) ──
  ctx.save();
  ctx.fillStyle = '#EDE4D6';
  ctx.strokeStyle = '#8B7355';
  ctx.lineWidth = panelT;
  roundRect(ctx, ox, oy, drawW, drawH, 3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // ── 섹션 렌더 ──
  const sections = config.sections || [];
  const totalSectionH = sections.reduce((s, sec) => s + sec.height, 0);
  if (totalSectionH === 0) return canvas.toDataURL('image/png');

  let accH = 0;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sy = oy + panelT + (accH / totalSectionH) * (drawH - panelT * 2);
    const sh = (section.height / totalSectionH) * (drawH - panelT * 2);
    const sx = ox + panelT;
    const sw = drawW - panelT * 2;

    // 섹션 구분선
    if (i > 0) {
      ctx.save();
      ctx.strokeStyle = '#9B8B75';
      ctx.lineWidth = Math.max(1.5, panelT * 0.7);
      ctx.beginPath();
      ctx.moveTo(ox + 2, sy);
      ctx.lineTo(ox + drawW - 2, sy);
      ctx.stroke();
      ctx.restore();
    }

    renderSection(ctx, section, sx, sy, sw, sh, furnitureWidth, furnitureHeight, config, drawW);
    accH += section.height;
  }

  return canvas.toDataURL('image/png');
}

function renderSection(
  ctx: CanvasRenderingContext2D,
  section: CustomSection,
  sx: number, sy: number, sw: number, sh: number,
  furW: number, furH: number,
  config: CustomFurnitureConfig,
  drawW: number,
) {
  if (section.hasPartition && section.partitionPosition != null) {
    const totalW = furW - (config.panelThickness || 18) * 2;
    const ratio = section.partitionPosition / totalW;
    const partX = sx + ratio * sw;

    // 칸막이 선
    ctx.save();
    ctx.strokeStyle = '#9B8B75';
    ctx.lineWidth = Math.max(1.5, drawW * 0.015);
    ctx.beginPath();
    ctx.moveTo(partX, sy);
    ctx.lineTo(partX, sy + sh);
    ctx.stroke();
    ctx.restore();

    renderElements(ctx, section.leftElements, sx, sy, partX - sx, sh, furH);
    renderElements(ctx, section.rightElements, partX, sy, sx + sw - partX, sh, furH);
  } else {
    renderElements(ctx, section.elements, sx, sy, sw, sh, furH);
  }
}

function renderElements(
  ctx: CanvasRenderingContext2D,
  elements: CustomElement[] | undefined,
  x: number, y: number, w: number, h: number,
  furH: number,
) {
  if (!elements || elements.length === 0) return;
  const el = elements[0];
  const inset = 3;

  if (el.type === 'shelf') {
    // 선반 라인
    for (const shelfH of el.heights) {
      const ratio = shelfH / furH;
      const sy = y + h - ratio * h;
      ctx.save();
      ctx.strokeStyle = '#9B8B75';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + inset, sy);
      ctx.lineTo(x + w - inset, sy);
      ctx.stroke();
      ctx.restore();
    }
    // 옷봉
    if (el.hasRod) {
      const cx = x + w / 2;
      const cy = y + h * 0.25;
      ctx.save();
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(4, w * 0.06), 0, Math.PI * 2);
      ctx.stroke();
      // 가로선
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 0.7;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x + inset + 2, cy);
      ctx.lineTo(x + w - inset - 2, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  } else if (el.type === 'drawer') {
    const totalH = el.heights.reduce((s, v) => s + v, 0);
    const gap = 2;
    let cy = y + h;
    for (let i = el.heights.length - 1; i >= 0; i--) {
      const dh = (el.heights[i] / totalH) * (h - gap * (el.heights.length - 1));
      cy -= dh;
      // 서랍 박스
      ctx.save();
      ctx.fillStyle = '#DDD0BA';
      ctx.strokeStyle = '#9B8B75';
      ctx.lineWidth = 1;
      roundRect(ctx, x + inset, cy, w - inset * 2, dh - gap, 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 손잡이
      const handleY = cy + (dh - gap) / 2;
      ctx.save();
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.35, handleY);
      ctx.lineTo(x + w * 0.65, handleY);
      ctx.stroke();
      ctx.restore();

      cy -= gap;
    }
  } else if (el.type === 'rod') {
    const cx = x + w / 2;
    const cy = y + h * 0.3;
    ctx.save();
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(5, w * 0.08), 0, Math.PI * 2);
    ctx.stroke();
    // 가로선
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 0.7;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x + inset + 2, cy);
    ctx.lineTo(x + w - inset - 2, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else if (el.type === 'pants') {
    for (let i = 0; i < 3; i++) {
      const lx = x + w * 0.2 + i * (w * 0.3);
      ctx.save();
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, y + inset);
      ctx.lineTo(lx, y + h - inset);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
