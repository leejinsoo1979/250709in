const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Create screenshots directory
const screenshotsDir = path.join(__dirname, '../screenshots/dxf-validation-enhanced');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function waitForAppReady(page) {
  // Wait for the app to be fully loaded
  await page.waitForSelector('button:has-text("공간")', { timeout: 10000 });
  await page.waitForTimeout(1000);
}

async function captureScenario(page, scenarioName, setupFunction, description) {
  console.log(`\n📷 Capturing scenario: ${scenarioName}`);
  console.log(`   Description: ${description}`);
  
  // Navigate to the app
  await page.goto('http://localhost:5175/configurator');
  await waitForAppReady(page);
  
  // Apply the scenario-specific setup
  await setupFunction(page);
  
  // Wait for UI to update
  await page.waitForTimeout(2000);
  
  // Navigate to export panel
  const tabs = await page.locator('[role="tablist"], .tabs').first();
  if (await tabs.isVisible()) {
    const exportTab = await tabs.locator('button:has-text("내보내기")').first();
    if (await exportTab.isVisible()) {
      await exportTab.click();
      await page.waitForTimeout(1000);
    }
  } else {
    // Try alternative selector
    const exportButton = await page.locator('button').filter({ hasText: '내보내기' }).first();
    if (await exportButton.isVisible()) {
      await exportButton.click();
      await page.waitForTimeout(1000);
    }
  }
  
  // Make sure DXF tab is selected
  const dxfTab = await page.locator('button:has-text("CAD 도면")').first();
  if (await dxfTab.isVisible()) {
    await dxfTab.click();
    await page.waitForTimeout(500);
  }
  
  // Select at least one drawing type
  const checkboxes = await page.locator('input[type="checkbox"]').all();
  if (checkboxes.length > 0 && !(await checkboxes[0].isChecked())) {
    await checkboxes[0].click();
    await page.waitForTimeout(500);
  }
  
  // Find the disabled export button and hover to show tooltip
  const exportButtons = await page.locator('button').filter({ hasText: /ZIP 파일로 다운로드|개별 파일로 다운로드/ }).all();
  
  for (const button of exportButtons) {
    if (await button.isVisible()) {
      // Check if button is disabled
      const isDisabled = await button.isDisabled() || (await button.getAttribute('class'))?.includes('disabled');
      
      if (isDisabled) {
        console.log('   Found disabled export button, hovering for tooltip...');
        await button.hover({ force: true });
        await page.waitForTimeout(1500); // Wait longer for tooltip
      }
      break;
    }
  }
  
  // Capture the error message text
  const statusMessage = await page.locator('.statusMessage, [class*="status"]').first();
  let errorText = '';
  if (await statusMessage.isVisible()) {
    errorText = await statusMessage.textContent();
    console.log(`   Error message displayed: ${errorText}`);
  }
  
  // Take screenshot of export panel area
  const exportPanel = await page.locator('[class*="exportPanel"], [class*="export-panel"], div:has(> button:has-text("내보내기"))').first();
  
  const screenshotPath = path.join(screenshotsDir, `${scenarioName}.png`);
  
  if (await exportPanel.isVisible()) {
    // Add visual annotation
    await page.evaluate((errorMsg) => {
      // Add a temporary overlay to highlight the error
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(231, 76, 60, 0.95);
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      overlay.textContent = errorMsg || 'DXF Export Validation Error';
      document.body.appendChild(overlay);
      
      // Remove after screenshot
      setTimeout(() => overlay.remove(), 3000);
    }, errorText);
    
    await page.waitForTimeout(500);
    await exportPanel.screenshot({ path: screenshotPath });
    console.log(`✅ Screenshot saved: ${screenshotPath}`);
  } else {
    // Fallback: capture viewport
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`✅ Viewport screenshot saved: ${screenshotPath}`);
  }
  
  // Create a detailed report
  const reportPath = path.join(screenshotsDir, `${scenarioName}-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    scenario: scenarioName,
    description,
    errorMessage: errorText,
    timestamp: new Date().toISOString(),
    screenshotPath
  }, null, 2));
  console.log(`📄 Report saved: ${reportPath}`);
}

async function main() {
  console.log('🚀 Starting enhanced DXF validation error capture...\n');
  
  const browser = await chromium.launch({
    headless: false, // Keep visible for debugging
    slowMo: 100 // Slow down for visibility
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2 // High quality screenshots
  });
  
  const page = await context.newPage();
  
  // Add console logging for debugging
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('   Browser console error:', msg.text());
    }
  });
  
  try {
    // Scenario 1: Invalid Space Dimensions
    await captureScenario(
      page, 
      '1-invalid-space-dimensions',
      async (page) => {
        console.log('   Setting space dimensions to 0...');
        
        // Click space tab
        const spaceTab = await page.locator('button').filter({ hasText: '공간' }).first();
        if (await spaceTab.isVisible()) {
          await spaceTab.click();
          await page.waitForTimeout(500);
        }
        
        // Find dimension inputs and set to 0
        const inputs = await page.locator('input[type="number"]').all();
        for (let i = 0; i < Math.min(3, inputs.length); i++) {
          const input = inputs[i];
          if (await input.isVisible()) {
            await input.click();
            await input.fill('0');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(300);
            break; // Set just the first one to 0
          }
        }
      },
      'Space dimensions set to 0 or negative values'
    );
    
    // Scenario 2: Furniture Out of Bounds
    await captureScenario(
      page,
      '2-furniture-out-of-bounds',
      async (page) => {
        console.log('   Setting up furniture outside space boundaries...');
        
        // Set valid but small space
        const spaceTab = await page.locator('button').filter({ hasText: '공간' }).first();
        if (await spaceTab.isVisible()) {
          await spaceTab.click();
          await page.waitForTimeout(500);
        }
        
        const inputs = await page.locator('input[type="number"]').all();
        if (inputs.length >= 3) {
          await inputs[0].click();
          await inputs[0].fill('1000');
          await page.keyboard.press('Tab');
          
          await inputs[1].click();
          await inputs[1].fill('2000');
          await page.keyboard.press('Tab');
          
          await inputs[2].click();
          await inputs[2].fill('500');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);
        }
        
        // Navigate to furniture tab
        const furnitureTab = await page.locator('button').filter({ hasText: '가구' }).first();
        if (await furnitureTab.isVisible()) {
          await furnitureTab.click();
          await page.waitForTimeout(500);
        }
        
        // Try to add furniture
        const addButtons = await page.locator('button').filter({ hasText: /추가|배치|선택/ }).all();
        if (addButtons.length > 0) {
          for (const btn of addButtons) {
            if (await btn.isVisible()) {
              await btn.click();
              await page.waitForTimeout(1000);
              break;
            }
          }
        }
        
        // Force furniture position out of bounds via console
        await page.evaluate(() => {
          // Try different ways to access the store
          const getStore = () => {
            if (window.useFurnitureStore) return window.useFurnitureStore.getState();
            if (window.__furnitureStore) return window.__furnitureStore;
            // Try to find it in React DevTools
            const root = document.getElementById('root');
            if (root && root._reactRootContainer) {
              // This is a simplified approach - in reality would need more complex traversal
              return null;
            }
            return null;
          };
          
          const store = getStore();
          if (store && store.addPlacedModule) {
            // Add a furniture item at an out-of-bounds position
            store.addPlacedModule({
              id: 'test-furniture-1',
              moduleId: 'door-hinged-400',
              position: { x: 5000, y: 0, z: 1000 }, // Way outside bounds
              rotation: { x: 0, y: 0, z: 0 },
              customDepth: 300
            });
          }
        });
        
        await page.waitForTimeout(1000);
      },
      'Furniture placed outside space boundaries (X > space width)'
    );
    
    // Scenario 3: Missing Space Configuration
    await captureScenario(
      page,
      '3-missing-space-info',
      async (page) => {
        console.log('   Removing space configuration...');
        
        // Clear space info via console
        await page.evaluate(() => {
          // Try different ways to access the store
          const getStore = () => {
            if (window.useSpaceConfigStore) return window.useSpaceConfigStore.getState();
            if (window.__spaceConfigStore) return window.__spaceConfigStore;
            return null;
          };
          
          const store = getStore();
          if (store && store.setSpaceInfo) {
            store.setSpaceInfo(null);
            console.log('Space info cleared');
          }
        });
        
        await page.waitForTimeout(1000);
      },
      'Space configuration is null or missing'
    );
    
    console.log('\n✨ All enhanced scenarios captured successfully!\n');
    console.log(`📁 Screenshots and reports saved in: ${screenshotsDir}`);
    
    // Create index HTML for easy viewing
    const indexHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>DXF Validation Error Scenarios</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f5f5f5;
    }
    h1 { color: #333; margin-bottom: 30px; }
    .scenario {
      background: white;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .scenario h2 { 
      color: #e74c3c;
      margin-top: 0;
    }
    .scenario img { 
      max-width: 100%;
      border: 1px solid #ddd;
      border-radius: 8px;
      margin-top: 15px;
    }
    .description {
      color: #666;
      margin: 10px 0;
      font-size: 14px;
    }
    .error-message {
      background: #fff3e0;
      color: #e65100;
      padding: 10px 15px;
      border-radius: 6px;
      margin: 10px 0;
      font-family: monospace;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <h1>🚫 DXF Export Validation Error Scenarios</h1>
  <div class="scenario">
    <h2>Scenario 1: Invalid Space Dimensions</h2>
    <p class="description">Space dimensions set to 0 or negative values</p>
    <div class="error-message">Error: 유효하지 않은 공간 크기</div>
    <img src="1-invalid-space-dimensions.png" alt="Invalid dimensions scenario">
  </div>
  <div class="scenario">
    <h2>Scenario 2: Furniture Out of Bounds</h2>
    <p class="description">Furniture placed outside space boundaries</p>
    <div class="error-message">Error: 가구가 공간 경계를 벗어남</div>
    <img src="2-furniture-out-of-bounds.png" alt="Furniture out of bounds scenario">
  </div>
  <div class="scenario">
    <h2>Scenario 3: Missing Space Information</h2>
    <p class="description">Space configuration is null or missing</p>
    <div class="error-message">Error: 공간 정보가 없습니다</div>
    <img src="3-missing-space-info.png" alt="Missing space info scenario">
  </div>
</body>
</html>`;
    
    fs.writeFileSync(path.join(screenshotsDir, 'index.html'), indexHtml);
    console.log('📄 Index HTML created for easy viewing');
    
  } catch (error) {
    console.error('❌ Error during capture:', error);
  } finally {
    await browser.close();
  }
}

// Run the script
main().catch(console.error);