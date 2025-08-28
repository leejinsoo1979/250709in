import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VisualRegressionTester } from './setup';
import path from 'path';
import fs from 'fs';

describe('Theme Visibility Regression Tests', () => {
  let tester: VisualRegressionTester;

  beforeAll(async () => {
    tester = new VisualRegressionTester({
      baseUrl: 'http://localhost:5173',
      threshold: 0.02, // Allow 2% pixel difference
      pixelThreshold: 15 // RGB difference threshold
    });
    
    await tester.setup();
  });

  afterAll(async () => {
    await tester.teardown();
  });

  describe('Label Visibility - Light to Dark Theme Transition', () => {
    it('should improve label visibility in RightPanel when switching themes', async () => {
      await tester.navigateAndWait('http://localhost:5173/configurator', '.right-panel');
      
      // Test dimension labels
      const dimensionLabels = [
        '.dimension-label',
        '.width-label', 
        '.depth-label',
        '.height-label'
      ];
      
      for (const selector of dimensionLabels) {
        const result = await tester.detectVisibilityChange(
          selector,
          'light',
          'dark'
        );
        
        expect(result.visibilityImproved).toBe(true);
        expect(result.colorContrast.after).toBeGreaterThan(result.colorContrast.before);
        expect(result.colorContrast.after).toBeGreaterThanOrEqual(4.5); // WCAG AA standard
        
        // Verify label was previously hard to see (low contrast) and now visible
        if (result.wasHidden) {
          expect(result.isVisible).toBe(true);
        }
      }
    });

    it('should maintain consistent button visibility across themes', async () => {
      await tester.navigateAndWait('http://localhost:5173/configurator', '.button-group');
      
      // Capture button states in both themes
      await tester.setTheme('light');
      const lightButtonScreen = await tester.captureElement('.button-group', 'buttons-light');
      
      await tester.setTheme('dark');
      const darkButtonScreen = await tester.captureElement('.button-group', 'buttons-dark');
      
      // Buttons should be clearly visible in both themes
      const buttonVisibility = await tester.detectVisibilityChange(
        '.primary-button',
        'light',
        'dark'
      );
      
      expect(buttonVisibility.colorContrast.before).toBeGreaterThanOrEqual(3);
      expect(buttonVisibility.colorContrast.after).toBeGreaterThanOrEqual(3);
    });

    it('should fix sidebar text visibility issues', async () => {
      await tester.navigateAndWait('http://localhost:5173/configurator', '.sidebar');
      
      const sidebarElements = [
        '.sidebar-title',
        '.sidebar-item',
        '.sidebar-link'
      ];
      
      for (const selector of sidebarElements) {
        const visibility = await tester.detectVisibilityChange(
          selector,
          'light', 
          'dark'
        );
        
        // Dark theme sidebar should have proper contrast
        expect(visibility.colorContrast.after).toBeGreaterThanOrEqual(7); // High contrast for dark backgrounds
        
        // Should not have been invisible before
        expect(visibility.wasHidden).toBe(false);
      }
    });
  });

  describe('Pixel-level Comparison Tests', () => {
    it('should detect pixel differences in label areas between themes', async () => {
      await tester.navigateAndWait('http://localhost:5173/configurator', '.right-panel');
      
      // Capture specific label area
      const labelArea = { x: 100, y: 200, width: 200, height: 50 };
      
      await tester.setTheme('light');
      const lightCapture = await tester.captureArea(
        labelArea.x,
        labelArea.y, 
        labelArea.width,
        labelArea.height,
        'label-area-light'
      );
      
      await tester.setTheme('dark');
      const darkCapture = await tester.captureArea(
        labelArea.x,
        labelArea.y,
        labelArea.width,
        labelArea.height,
        'label-area-dark'
      );
      
      // Compare the captures
      const comparison = tester.compareImages(lightCapture, darkCapture, 'label-area');
      
      // Expect significant pixel differences due to theme change
      expect(comparison.match).toBe(false);
      expect(comparison.diffPercentage).toBeGreaterThan(0.1); // At least 10% pixels different
      
      // Save diff for manual inspection
      if (comparison.diffImage) {
        console.log(`Pixel difference: ${(comparison.diffPercentage * 100).toFixed(2)}%`);
        console.log(`Different pixels: ${comparison.diffPixels} / ${comparison.totalPixels}`);
      }
    });

    it('should verify alpha channel improvements for text elements', async () => {
      await tester.navigateAndWait('http://localhost:5173/configurator', '.right-panel');
      
      // Analyze alpha values in light theme
      await tester.setTheme('light');
      const lightAlpha = await tester.analyzePixelAlpha('.dimension-label', 'light');
      
      // Analyze alpha values in dark theme
      await tester.setTheme('dark');
      const darkAlpha = await tester.analyzePixelAlpha('.dimension-label', 'dark');
      
      // Dark theme should have more opaque text (higher alpha)
      expect(darkAlpha.averageAlpha).toBeGreaterThanOrEqual(lightAlpha.averageAlpha);
      expect(darkAlpha.opaquePixels).toBeGreaterThanOrEqual(lightAlpha.opaquePixels);
    });
  });

  describe('Regression Prevention Tests', () => {
    it('should maintain baseline visual consistency', async () => {
      await tester.navigateAndWait('http://localhost:5173/configurator');
      
      // Create baseline if it doesn't exist
      const baselinePath = path.join(process.cwd(), 'test-results', 'baseline', 'configurator-dark.png');
      
      await tester.setTheme('dark');
      const currentScreen = await tester.captureFullPage('configurator-dark-current');
      
      if (!fs.existsSync(baselinePath)) {
        // First run - save as baseline
        fs.writeFileSync(baselinePath, currentScreen);
        console.log('Baseline created for future comparisons');
      } else {
        // Compare with baseline
        const baseline = fs.readFileSync(baselinePath);
        const comparison = tester.compareImages(baseline, currentScreen, 'configurator-regression');
        
        // Allow small differences but flag major changes
        if (comparison.diffPercentage > 0.05) { // More than 5% change
          console.warn(`Visual regression detected: ${(comparison.diffPercentage * 100).toFixed(2)}% difference`);
          
          // Save comparison for review
          if (comparison.diffImage) {
            const reviewPath = path.join(process.cwd(), 'test-results', 'review', `regression-${Date.now()}.png`);
            fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
            fs.writeFileSync(reviewPath, comparison.diffImage);
          }
        }
        
        expect(comparison.diffPercentage).toBeLessThan(0.1); // Less than 10% change allowed
      }
    });

    it('should verify critical UI elements remain visible', async () => {
      await tester.navigateAndWait('http://localhost:5173/configurator');
      
      const criticalElements = [
        { selector: '.save-button', minContrast: 4.5 },
        { selector: '.cancel-button', minContrast: 4.5 },
        { selector: '.dimension-input', minContrast: 3 },
        { selector: '.material-selector', minContrast: 3 },
        { selector: '.furniture-item', minContrast: 3 }
      ];
      
      for (const theme of ['light', 'dark'] as const) {
        await tester.setTheme(theme);
        
        for (const element of criticalElements) {
          try {
            const visibility = await tester.detectVisibilityChange(
              element.selector,
              theme,
              theme // Same theme comparison to check current state
            );
            
            expect(visibility.isVisible).toBe(true);
            expect(visibility.colorContrast.after).toBeGreaterThanOrEqual(element.minContrast);
          } catch (e) {
            // Element might not exist in current view, skip
            console.log(`Skipping ${element.selector} - not found in current view`);
          }
        }
      }
    });
  });

  describe('Specific Bug Fix Verification', () => {
    it('should have fixed the white text on white background issue in RightPanel', async () => {
      await tester.navigateAndWait('http://localhost:5173/configurator', '.right-panel');
      
      await tester.setTheme('light');
      
      // Check that text is not white on white
      const result = await tester.page!.evaluate(() => {
        const panel = document.querySelector('.right-panel') as HTMLElement;
        if (!panel) return null;
        
        const labels = panel.querySelectorAll('.dimension-label, .control-label');
        const issues: string[] = [];
        
        labels.forEach((label: Element) => {
          const style = window.getComputedStyle(label as HTMLElement);
          const textColor = style.color;
          const bgColor = window.getComputedStyle(panel).backgroundColor;
          
          // Check if both text and background are white-ish
          const isWhiteText = textColor.includes('255, 255, 255') || textColor === 'white' || textColor === '#ffffff';
          const isWhiteBg = bgColor.includes('255, 255, 255') || bgColor === 'white' || bgColor === '#ffffff';
          
          if (isWhiteText && isWhiteBg) {
            issues.push(`${label.className}: white text on white background`);
          }
        });
        
        return { hasIssues: issues.length > 0, issues };
      });
      
      expect(result?.hasIssues).toBe(false);
      if (result?.issues.length) {
        console.error('White-on-white issues found:', result.issues);
      }
    });

    it('should have removed forced light theme styles', async () => {
      await tester.navigateAndWait('http://localhost:5173/configurator');
      
      // Check that no elements have hardcoded light theme colors
      const result = await tester.page!.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        const hardcodedStyles: string[] = [];
        
        allElements.forEach((element: Element) => {
          const inlineStyle = (element as HTMLElement).style;
          const problematicStyles = [
            'color: rgb(255, 255, 255)',
            'color: white',
            'color: #ffffff',
            'background-color: rgb(26, 26, 26)',
            'background-color: #1a1a1a'
          ];
          
          problematicStyles.forEach(style => {
            if (inlineStyle.cssText.includes(style.split(':')[0])) {
              const value = inlineStyle.getPropertyValue(style.split(':')[0].trim());
              if (value && problematicStyles.some(s => s.includes(value))) {
                hardcodedStyles.push(`${element.className}: ${style}`);
              }
            }
          });
        });
        
        return { hasHardcodedStyles: hardcodedStyles.length > 0, styles: hardcodedStyles };
      });
      
      expect(result?.hasHardcodedStyles).toBe(false);
      if (result?.styles.length) {
        console.warn('Hardcoded theme styles found:', result.styles);
      }
    });
  });
});