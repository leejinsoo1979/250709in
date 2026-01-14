"""
기둥 앞 공간 위치 디버깅 테스트
"""
from playwright.sync_api import sync_playwright
import time

console_logs = []

def handle_console(msg):
    text = msg.text
    console_logs.append({'type': msg.type, 'text': text})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on('console', handle_console)

    print("1. Configurator로 이동...")
    page.goto('http://localhost:5173/configurator', timeout=60000)
    time.sleep(3)

    print("\n2. 기둥 탭 클릭...")
    try:
        column_tab = page.locator('text=기둥').first
        column_tab.click()
        time.sleep(1)
    except Exception as e:
        print(f"   기둥 탭 클릭 실패: {e}")

    print("\n3. 기둥 C 배치...")
    try:
        thumbnails = page.locator('[draggable="true"]').all()
        for thumb in thumbnails:
            title = thumb.get_attribute('title') or ''
            if '기둥 C' in title or '300×300' in title:
                thumb.dblclick()
                time.sleep(2)
                break
    except Exception as e:
        print(f"   기둥 배치 실패: {e}")

    print("\n4. 모듈 탭 → 싱글장 선택...")
    try:
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
    except Exception as e:
        print(f"   싱글장 선택 실패: {e}")

    # 스크린샷 저장
    page.screenshot(path='/tmp/front_space_debug.png')
    print("   스크린샷: /tmp/front_space_debug.png")

    print("\n=== Front Space Render 로그 ===")
    for log in console_logs:
        if 'Front Space Render' in log['text']:
            print(log['text'][:800])

    print("\n=== 기둥 앞 공간 계산 로그 ===")
    for log in console_logs:
        if '기둥 앞 공간 계산' in log['text']:
            print(log['text'][:800])

    print("\n=== Front Space Ghost 로그 ===")
    for log in console_logs:
        if 'Front Space Ghost' in log['text']:
            print(log['text'][:800])

    print("\n=== 기둥 위치 로그 ===")
    for log in console_logs:
        if 'columnCenterX' in log['text'] or 'column.position' in log['text']:
            print(log['text'][:500])

    browser.close()
    print("\n완료!")
