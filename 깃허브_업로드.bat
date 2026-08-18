@echo off
chcp 65001 > nul
title GitHub 저장소 연결 및 푸시 (Upload to GitHub)

echo ================================================================
echo.
echo     [ GitHub 저장소 연결 및 코드 푸시 도구 ]
echo.
echo ================================================================
echo.

cd /d "C:\Users\JMT1\.gemini\antigravity\scratch\inventory_system"

echo 1. GitHub (https://github.com/new) 에서 새 저장소를 생성하세요.
echo 2. 생성된 저장소의 HTTPS 주소를 복사하세요.
echo    (예: https://github.com/내아이디/내저장소.git)
echo.
set /p REPO_URL="GitHub 저장소 URL을 입력하세요: "

if "%REPO_URL%"=="" (
    echo [!] URL이 입력되지 않았습니다. 취소합니다.
    pause
    exit /b
)

git remote remove origin 2>nul
git remote add origin %REPO_URL%
git branch -M main

echo.
echo [!] GitHub로 코드를 전송(push)합니다...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ================================================================
    echo   ★ GitHub에 성공적으로 업로드되었습니다!
    echo ================================================================
) else (
    echo.
    echo [!] 업로드 중 오류가 발생했습니다.
    echo     GitHub 로그인 상태 및 저장소 주소를 확인해주세요.
)

pause
