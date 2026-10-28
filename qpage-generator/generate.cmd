@echo off
chcp 65001 >nul
where node >nul 2>nul || (echo Нужен Node.js 18 или новее: https://nodejs.org ^(версия LTS^) & pause & exit /b 1)
node "%~dp0generate.js" %*
if "%~1"=="" pause
