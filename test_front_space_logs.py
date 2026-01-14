"""기둥 앞 공간 Front Space Filter 로그 확인"""
from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # 콘솔 로그 수집
    console_logs = []
    def handle_console(msg):
        text = msg.text
        console_logs.append(text)

    page.on('console', handle_console)

    # Configurator로 직접 이동
    page.goto('http://localhost:5173/configurator', timeout=60000)
    time.sleep(5)  # 로드 대기

    print(f"현재 URL: {page.url}")

    # Front Space 관련 로그 필터링
    print("\n=== Front Space Debug 로그 ===")
    for log in console_logs:
        if 'Front Space' in log:
            print(log[:500])

    print("\n=== 기둥 정보 로그 ===")
    for log in console_logs:
        if 'spaceInfo 기둥 정보' in log or 'columnsCount' in log:
            print(log[:500])

    print("\n=== Front Space Filter 로그 ===")
    filter_logs = [log for log in console_logs if 'Front Space Filter' in log]
    if filter_logs:
        for log in filter_logs:
            print(log[:500])
    else:
        print("Front Space Filter 로그 없음 - 기둥이 없거나 싱글장이 선택되지 않음")

    print("\n=== 기둥 슬롯 분석 로그 ===")
    for log in console_logs:
        if 'slotsWithColumn' in log or '기둥 슬롯 분석' in log:
            print(log[:500])

    browser.close()
