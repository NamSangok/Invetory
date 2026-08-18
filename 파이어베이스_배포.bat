@echo off
chcp 65001 > nul
title Firebase 웹 호스팅 원클릭 배포 (Deploy to Firebase)

echo ================================================================
echo.
echo     [ Firebase 클라우드 웹 호스팅 배포 도구 ]
echo.
echo     다른 장소의 PC에서도 브라우저로 접속할 수 있도록
echo     Firebase Hosting(https://내프로젝트.web.app)에 배포합니다.
echo.
echo ================================================================
echo.

cd /d "C:\Users\JMT1\.gemini\antigravity\scratch\inventory_system"

echo [1/3] Firebase 로그인 확인 중...
cmd.exe /c "npx firebase-tools login"

echo.
echo [2/3] Firebase 프로젝트 목록 조회 및 선택...
cmd.exe /c "npx firebase-tools use --add"

echo.
echo [3/3] Firebase Hosting으로 웹 앱 배포 시작...
cmd.exe /c "npx firebase-tools deploy --only hosting"

if %errorlevel% equ 0 (
    echo.
    echo ================================================================
    echo   ★ Firebase 배포가 성공적으로 완료되었습니다!
    echo   위 안내된 Hosting URL로 전 세계 어디서나 접속하실 수 있습니다.
    echo ================================================================
) else (
    echo.
    echo [!] 배포 중 문제가 발생했습니다. 안내 메시지를 확인해주세요.
)

pause
