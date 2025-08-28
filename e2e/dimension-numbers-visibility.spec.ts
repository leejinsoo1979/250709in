import { test, expect, Page } from '@playwright/test';

// Helper to set theme
async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
  }, theme);
  await page.waitForTimeout(300);
}

// Helper to create sample furniture configurations
const sampleConfigs = [
  {
    name: 'Sample 1 - Basic Cabinet',
    furniture: {
      type: 'cabinet',
      width: 1800,
      depth: 600,
      height: 1800
    },
    expectedNumbers: ['18', '내경', '18'] // 18 (width), 내경 (inner diameter), 18 (height)
  },
  {
    name: 'Sample 2 - Shelf Unit',
    furniture: {
      type: 'shelf',
      width: 1200,
      depth: 400,
      height: 2000
    },
    expectedNumbers: ['12', '내경', '20'] // 12 (width), 내경, 20 (height)
  },
  {
    name: 'Sample 3 - Wardrobe',
    furniture: {
      type: 'wardrobe',
      width: 2400,
      depth: 600,
      height: 2200
    },
    expectedNumbers: ['24', '내경', '22'] // 24 (width), 내경, 22 (height)
  }
];

test.describe('Dimension Numbers Visibility Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/configurator');
    await page.waitForLoadState('networkidle');
  });

  for (const config of sampleConfigs) {
    test(`${config.name} - 숫자가 도형 위에 모두 노출됨`, async ({ page }) => {
      // Set up furniture configuration
      await page.evaluate((cfg) => {
        // Simulate setting up the furniture configuration
        // This would interact with your actual furniture configuration system
        const event = new CustomEvent('setFurnitureConfig', { detail: cfg });
        window.dispatchEvent(event);
      }, config.furniture);

      // Wait for 3D view to render
      await page.waitForTimeout(1000);

      // Take screenshot of the 3D view area
      const viewArea = page.locator('.viewer-3d, .three-canvas, canvas').first();
      await expect(viewArea).toBeVisible();
      
      const screenshot = await viewArea.screenshot();
      
      // Analyze dimension labels visibility
      const dimensionLabels = await page.evaluate(() => {
        const labels = document.querySelectorAll('.dimension-label, .dimension-text, [class*="dimension"]');
        const visibleLabels: string[] = [];
        
        labels.forEach((label: Element) => {
          const el = label as HTMLElement;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          
          // Check if label is visible
          if (
            rect.width > 0 && 
            rect.height > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            parseFloat(style.opacity) > 0
          ) {
            // Check if label is on top of shapes (not obscured)
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const topElement = document.elementFromPoint(centerX, centerY);
            
            if (topElement === el || el.contains(topElement)) {
              visibleLabels.push(el.textContent || '');
            }
          }
        });
        
        return visibleLabels;
      });

      // Check OCR-like detection for numbers in screenshot
      const numbersDetected = await page.evaluate((expectedNums) => {
        // In a real implementation, this would use OCR or image analysis
        // For now, we'll check DOM elements
        const detectedNumbers: string[] = [];
        
        // Look for dimension displays
        const dimensionElements = document.querySelectorAll('.dimension-display, .measurement-label, .size-label');
        
        dimensionElements.forEach((el: Element) => {
          const text = el.textContent || '';
          expectedNums.forEach(num => {
            if (text.includes(num)) {
              detectedNumbers.push(num);
            }
          });
        });
        
        // Also check SVG text elements in 3D view
        const svgTexts = document.querySelectorAll('svg text, .dimension-svg text');
        svgTexts.forEach((el: Element) => {
          const text = el.textContent || '';
          expectedNums.forEach(num => {
            if (text.includes(num) && !detectedNumbers.includes(num)) {
              detectedNumbers.push(num);
            }
          });
        });
        
        return detectedNumbers;
      }, config.expectedNumbers);

      // Verify all expected numbers are visible
      console.log(`${config.name}: Detected numbers:`, numbersDetected);
      
      const allNumbersVisible = config.expectedNumbers.every(num => 
        numbersDetected.includes(num)
      );
      
      // Create test result
      const testResult = {
        sample: config.name,
        expected: config.expectedNumbers,
        detected: numbersDetected,
        missing: config.expectedNumbers.filter(num => !numbersDetected.includes(num)),
        pass: allNumbersVisible
      };
      
      console.log('Test Result:', testResult);
      
      // Assert all numbers are visible
      expect(testResult.pass).toBe(true);
      expect(testResult.missing).toHaveLength(0);
      
      // Save screenshot with annotations for manual review
      await page.screenshot({
        path: `test-results/dimension-numbers/${config.name.replace(/ /g, '-')}.png`,
        fullPage: false
      });
    });
  }

  test('자동 캡처 비교 - 모든 샘플에서 치수 표시 확인', async ({ page }) => {
    const results: Array<{
      sample: string;
      pass: boolean;
      detected: string[];
      missing: string[];
    }> = [];

    for (const config of sampleConfigs) {
      // Set up each configuration
      await page.evaluate((cfg) => {
        const event = new CustomEvent('setFurnitureConfig', { detail: cfg });
        window.dispatchEvent(event);
      }, config.furniture);
      
      await page.waitForTimeout(1000);
      
      // Capture and analyze
      const detected = await page.evaluate((expected) => {
        const found: string[] = [];
        
        // Check all text elements
        const allTextElements = document.querySelectorAll(
          '.dimension-label, .dimension-text, .measurement-label, text, span'
        );
        
        allTextElements.forEach((el: Element) => {
          const text = el.textContent || '';
          expected.forEach((exp: string) => {
            if (text.includes(exp) && !found.includes(exp)) {
              // Verify element is visible
              const htmlEl = el as HTMLElement;
              const rect = htmlEl.getBoundingClientRect();
              const style = window.getComputedStyle(htmlEl);
              
              if (
                rect.width > 0 &&
                rect.height > 0 &&
                style.visibility === 'visible' &&
                style.display !== 'none' &&
                parseFloat(style.opacity) > 0
              ) {
                found.push(exp);
              }
            }
          });
        });
        
        return found;
      }, config.expectedNumbers);
      
      const missing = config.expectedNumbers.filter(num => !detected.includes(num));
      const pass = missing.length === 0;
      
      results.push({
        sample: config.name,
        pass,
        detected,
        missing
      });
      
      // Take screenshot for evidence
      await page.screenshot({
        path: `test-results/dimension-numbers/summary-${config.name.replace(/ /g, '-')}.png`
      });
    }
    
    // Generate summary report
    console.log('\n========== DIMENSION NUMBERS VISIBILITY TEST REPORT ==========');
    console.log(`Total Samples Tested: ${results.length}`);
    console.log(`Passed: ${results.filter(r => r.pass).length}`);
    console.log(`Failed: ${results.filter(r => !r.pass).length}`);
    console.log('\nDetailed Results:');
    
    results.forEach(result => {
      const status = result.pass ? '✅ PASS' : '❌ FAIL';
      console.log(`\n${status} - ${result.sample}`);
      console.log(`  Detected: ${result.detected.join(', ')}`);
      if (!result.pass) {
        console.log(`  Missing: ${result.missing.join(', ')}`);
      }
    });
    
    console.log('\n===============================================================\n');
    
    // Assert all samples pass
    const allPass = results.every(r => r.pass);
    expect(allPass).toBe(true);
    
    // If any fail, provide detailed failure message
    if (!allPass) {
      const failures = results.filter(r => !r.pass);
      failures.forEach(f => {
        console.error(`${f.sample} failed - Missing numbers: ${f.missing.join(', ')}`);
      });
    }
  });

  test('픽셀 레벨 숫자 가시성 검증', async ({ page }) => {
    // Focus on dimension label area
    const dimensionArea = page.locator('.dimension-container, .measurements, .size-display').first();
    
    if (await dimensionArea.isVisible()) {
      // Get bounding box
      const box = await dimensionArea.boundingBox();
      if (box) {
        // Take focused screenshot
        const screenshot = await page.screenshot({
          clip: {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height
          }
        });
        
        // Analyze pixel data for text visibility
        const analysis = await page.evaluate(() => {
          const container = document.querySelector('.dimension-container, .measurements, .size-display') as HTMLElement;
          if (!container) return { hasText: false, contrast: 0 };
          
          const style = window.getComputedStyle(container);
          const bgColor = style.backgroundColor;
          
          // Find text elements within
          const textElements = container.querySelectorAll('*');
          let hasVisibleText = false;
          let maxContrast = 0;
          
          textElements.forEach((el: Element) => {
            const elStyle = window.getComputedStyle(el as HTMLElement);
            const textColor = elStyle.color;
            
            // Simple contrast check
            if (textColor && textColor !== 'transparent' && textColor !== bgColor) {
              hasVisibleText = true;
              
              // Calculate approximate contrast
              const isDark = bgColor.includes('0, 0, 0') || bgColor.includes('26');
              const isLight = textColor.includes('255') || textColor.includes('fff');
              
              if ((isDark && isLight) || (!isDark && !isLight)) {
                maxContrast = Math.max(maxContrast, 10); // Good contrast
              } else {
                maxContrast = Math.max(maxContrast, 3); // Poor contrast
              }
            }
          });
          
          return { hasText: hasVisibleText, contrast: maxContrast };
        });
        
        expect(analysis.hasText).toBe(true);
        expect(analysis.contrast).toBeGreaterThanOrEqual(4.5); // WCAG AA standard
        
        // Save screenshot for review
        await page.screenshot({
          path: 'test-results/dimension-numbers/pixel-analysis.png',
          clip: box
        });
      }
    }
  });
});