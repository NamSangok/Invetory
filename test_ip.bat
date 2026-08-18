@echo off
chcp 65001 > nul
set IP=127.0.0.1
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4" /c:"IP Address" /c:"IPv4 주소"') do (
    set IP=%%i
)
set IP=%IP: =%
echo 접속 주소: http://%IP%:8000
