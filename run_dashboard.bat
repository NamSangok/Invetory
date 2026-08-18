@echo off
chcp 65001 > nul
title Production & Finished Goods Inventory Hub

echo ================================================================
echo.
echo     Starting Production & Inventory Management Hub...
echo.
echo     - Local URL: http://localhost:8000
echo.
echo ================================================================

cd /d "%~dp0"
start "" http://localhost:8000
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
