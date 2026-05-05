# 생성: 2026-05-04
# Windows 작업 스케줄러 등록 — 매주 토요일 11:00 admin.py --auto-run
#
# 사용:
#   PowerShell> cd admin
#   PowerShell> .\setup_scheduler.ps1
#
# 실행 후 검증:
#   Get-ScheduledTask -TaskName "ExpenseTracker_AutoRun"

$ErrorActionPreference = "Stop"

$TaskName = "ExpenseTracker_AutoRun"

# pythonw.exe (콘솔 미표시) — 없으면 python.exe 폴백
$Pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue)
if ($null -eq $Pythonw) {
    Write-Warning "pythonw.exe 를 찾을 수 없습니다. python.exe로 폴백합니다."
    $Pythonw = (Get-Command python.exe -ErrorAction Stop)
}
$PythonExe = $Pythonw.Source

# admin.py 절대경로 (이 스크립트 위치 기준)
$Script = Join-Path -Path $PSScriptRoot -ChildPath "admin.py"
if (-not (Test-Path $Script)) {
    throw "admin.py 를 찾을 수 없습니다: $Script"
}

# 작업 정의
$Action = New-ScheduledTaskAction -Execute $PythonExe -Argument "`"$Script`" --auto-run" -WorkingDirectory $PSScriptRoot

$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Saturday -At 11:00am

$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 10) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

# 현재 사용자로 로그온 시 실행 (관리자 권한 불필요)
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

# 이미 있다면 덮어쓰기
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "기존 작업 '$TaskName' 을 덮어씁니다."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Expense Tracker 매주 토요일 11시 자동 OCR 일괄 처리" | Out-Null

Write-Host ""
Write-Host "[OK] 작업 등록 완료: $TaskName" -ForegroundColor Green
Write-Host "  실행 파일: $PythonExe"
Write-Host "  스크립트 : $Script"
Write-Host "  스케줄   : 매주 토요일 11:00 (Start-when-available)"
Write-Host ""
Write-Host "검증:"
Write-Host "  Get-ScheduledTask -TaskName $TaskName"
Write-Host "  Get-ScheduledTaskInfo -TaskName $TaskName"
Write-Host ""
Write-Host "수동 실행 테스트:"
Write-Host "  Start-ScheduledTask -TaskName $TaskName"
