@echo off
chcp 65001 > nul
title 생산 부품 및 완제품 입출고 관리 시스템

echo ================================================================
echo.
echo     [ 생산 부품 및 완제품 입출고 관리 대시보드 시스템 ]
echo.
echo     프로그램을 시작하는 중입니다...
echo.
echo ================================================================

cd /d "C:\Users\JMT1\.gemini\antigravity\scratch\inventory_system"

:: Python executable check
set PYTHON_EXE=python
where python >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Users\JMT1\AppData\Local\Programs\Python\Python314\python.exe" (
        set PYTHON_EXE="C:\Users\JMT1\AppData\Local\Programs\Python\Python314\python.exe"
    ) else (
        where py >nul 2>nul
        if %errorlevel% equ 0 (
            set PYTHON_EXE=py
        )
    )
)

echo [1/3] 파이썬 환경 확인: %PYTHON_EXE%
echo [2/3] 웹 브라우저(http://localhost:8000)를 자동으로 엽니다...

:: Wait 1 second then open browser
start "" http://localhost:8000

echo [3/3] 재고 관리 서버 가동 중...
echo.
echo ================================================================
echo   * 프로그램 접속 주소: http://localhost:8000
echo   * 사내 태블릿/모바일: 대시보드 내 QR코드 스캔
echo.
echo   ※ 주의: 이 검은색 창을 닫으면 프로그램이 종료됩니다.
echo            사용하시는 동안 창을 최소화해 두세요.
echo ================================================================
echo.

%PYTHON_EXE% -m uvicorn main:app --host 0.0.0.0 --port 8000

if %errorlevel% neq 0 (
    echo.
    echo [!] 서버 실행 중 오류가 발생했습니다.
    echo     오류 내용을 확인하신 후 창을 닫아주세요.
    pause
)
