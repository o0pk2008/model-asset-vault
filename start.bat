@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment...
  python -m venv .venv
)

".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
".venv\Scripts\python.exe" -m pip install --quiet -r requirements-dev.txt

if "%ADMIN_USERNAME%"=="" set ADMIN_USERNAME=admin
if "%ADMIN_PASSWORD%"=="" set ADMIN_PASSWORD=admin12345

".venv\Scripts\python.exe" app.py
pause
