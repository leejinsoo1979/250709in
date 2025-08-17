import { describe, it, expect } from 'vitest';
import { deriveGuillotineForPanel, buildSequenceForPanel } from '../simulate';
import type { Placement } from '@/types/cutlist';

describe('Cut Simulation', () => {
  it('should generate correct guillotine sequence for panel placement', () => {
    // Given sheet 2440x1220 and a panel placement at (x=0,y=240,w=400,h=485)
    const sheetW = 2440;
    const sheetH = 1220;
    const placement: Placement = {
      sheetId: 'sheet-1',
      panelId: 'panel-1',
      x: 0,
      y: 240,
      width: 400,
      height: 485
    };
    
    const cuts = buildSequenceForPanel({
      mode: 'guillotine',
      sheetW,
      sheetH,
      kerf: 5,
      placement
    });
    
    // Should generate cuts for y=240, y=725, x=0, x=400
    expect(cuts.length).toBeGreaterThanOrEqual(2); // At least 2 cuts (may skip edges at 0)
    
    // Find the y=240 cut (bottom of panel)
    const bottomCut = cuts.find(c => c.axis === 'y' && Math.abs(c.pos - 240) < 3);
    expect(bottomCut).toBeDefined();
    if (bottomCut) {
      expect(bottomCut.spanStart).toBe(0);
      expect(bottomCut.spanEnd).toBe(sheetW);
      expect(bottomCut.label).toContain('240');
    }
    
    // Find the y=725 cut (top of panel)
    const topCut = cuts.find(c => c.axis === 'y' && Math.abs(c.pos - 725) < 3);
    expect(topCut).toBeDefined();
    if (topCut) {
      expect(topCut.spanStart).toBe(0);
      expect(topCut.spanEnd).toBe(sheetW);
      expect(topCut.label).toContain('725');
    }
    
    // x=0 might be skipped if panel is at edge
    // But x=400 should exist
    const rightCut = cuts.find(c => c.axis === 'x' && Math.abs(c.pos - 400) < 3);
    expect(rightCut).toBeDefined();
    if (rightCut) {
      expect(rightCut.spanStart).toBeGreaterThanOrEqual(0);
      expect(rightCut.spanEnd).toBeLessThanOrEqual(sheetH);
    }
    
    // All cuts should be within sheet bounds
    cuts.forEach(cut => {
      if (cut.axis === 'x') {
        expect(cut.pos).toBeGreaterThanOrEqual(0);
        expect(cut.pos).toBeLessThanOrEqual(sheetW);
        expect(cut.spanStart).toBeGreaterThanOrEqual(0);
        expect(cut.spanEnd).toBeLessThanOrEqual(sheetH);
      } else {
        expect(cut.pos).toBeGreaterThanOrEqual(0);
        expect(cut.pos).toBeLessThanOrEqual(sheetH);
        expect(cut.spanStart).toBeGreaterThanOrEqual(0);
        expect(cut.spanEnd).toBeLessThanOrEqual(sheetW);
      }
    });
  });
  
  it('should handle edge panels correctly', () => {
    const sheetW = 2440;
    const sheetH = 1220;
    
    // Panel at origin - should skip x=0 and y=0 cuts
    const edgePlacement: Placement = {
      sheetId: 'sheet-1',
      panelId: 'panel-2',
      x: 0,
      y: 0,
      width: 500,
      height: 600
    };
    
    const cuts = buildSequenceForPanel({
      mode: 'guillotine',
      sheetW,
      sheetH,
      kerf: 5,
      placement: edgePlacement
    });
    
    // Should not have cuts at x=0 or y=0
    const zeroXCut = cuts.find(c => c.axis === 'x' && c.pos === 0);
    const zeroYCut = cuts.find(c => c.axis === 'y' && c.pos === 0);
    expect(zeroXCut).toBeUndefined();
    expect(zeroYCut).toBeUndefined();
    
    // Should have cuts at x=500 and y=600
    const rightCut = cuts.find(c => c.axis === 'x' && Math.abs(c.pos - 500) < 3);
    const topCut = cuts.find(c => c.axis === 'y' && Math.abs(c.pos - 600) < 3);
    expect(rightCut).toBeDefined();
    expect(topCut).toBeDefined();
  });
});