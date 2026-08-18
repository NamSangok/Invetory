@echo off
chcp 65001 > nul
title Netlify 웹 사이트 배포 도구

echo ================================================================
echo.
echo     [ Netlify 웹 사이트 원클릭 배포 도구 ]
echo.
echo ================================================================
echo.

cd /d "C:\Users\JMT1\.gemini\antigravity\scratch\inventory_system"

echo Netlify 배포를 시작합니다... (브라우저에서 로그인 창이 뜰 수 있습니다)
echo.

cmd.exe /c "npx netlify deploy --dir=static --prod"

if %errorlevel% equ 0 (
    echo.
    echo ================================================================
    echo   ★ Netlify 배포가 완료되었습니다!
    echo   위 안내된 Website URL로 어디서나 접속하실 수 있습니다.
    echo ================================================================
) else (
    echo.
    echo [!] 배포 중 오류가 발생했습니다.
)

pause
