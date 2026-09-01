@echo off
rem Concept Tree Launcher (Desktop App Mode)
rem 使用 %~dp0（bat 自身所在目录），clone 到任意路径都能运行
cd /d "%~dp0"

rem Kill leftover process on port 8930 first
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /C:":8930" ^| findstr /C:"LISTENING"') do taskkill /F /PID %%p >nul 2>&1

rem Build if not built yet
if not exist "%~dp0dist\index.html" (
  echo First run: building frontend...
  call npm run build
)

rem Launch as Electron desktop app (independent window, no browser)
call npx electron electron/main.js
