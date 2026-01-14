"""
3D 뷰에서 기둥 앞 공간 고스트 확인
"""
from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page(viewport={'width': 1400, 'height': 900})

    print("1. Configurator로 이동...")
    page.goto('http://localhost:5173/configurator', timeout=60000)
    time.sleep(3)

    print("2. 3D 뷰로 전환...")
    try:
        view_3d_btn = page.locator('button:has-text("3D")').first
        view_3d_btn.click()
        time.sleep(2)
    except:
        print("   3D 버튼 클릭 실패")

    print("3. 기둥 탭 → 기둥 C 배치...")
    column_tab = page.locator('text=기둥').first
    column_tab.click()
    time.sleep(1)

    thumbnails = page.locator('[draggable="true"]').all()
    for thumb in thumbnails:
        title = thumb.get_attribute('title') or ''
        if '기둥C' in title or '기둥 C' in title or '300×300' in title:
            thumb.dblclick()
            time.sleep(2)
            break

    page.screenshot(path='/tmp/3d_after_column.png')
    print("   기둥 배치 후: /tmp/3d_after_column.png")

    print("4. 모듈 탭 → 싱글장 선택...")
    module_tab = page.locator('text=모듈').first
    module_tab.click()
    time.sleep(1)

    single_tab = page.locator('text=싱글').first
    single_tab.click()
    time.sleep(1)

    thumbnails = page.locator('[draggable="true"]').all()
    if thumbnails:
        thumbnails[0].click()
        time.sleep(2)

    page.screenshot(path='/tmp/3d_single_selected.png')
    print("   싱글장 선택 후: /tmp/3d_single_selected.png")

    print("5. 상단 뷰 확인...")
    try:
        top_btn = page.locator('button:has-text("상부")').first
        top_btn.click()
        time.sleep(2)
        page.screenshot(path='/tmp/top_view.png')
        print("   상단 뷰: /tmp/top_view.png")
    except:
        print("   상단 뷰 전환 실패")

    print("\n10초간 브라우저 유지...")
    time.sleep(10)
    browser.close()
