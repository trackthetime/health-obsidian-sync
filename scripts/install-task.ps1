param(
    [Parameter(Mandatory = $true)][string]$PythonPath,
    [string]$ConfigPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'config.json'),
    [string]$TaskName = 'HealthObsidianSync_0930'
)

$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$python = (Resolve-Path -LiteralPath $PythonPath).Path
$config = (Resolve-Path -LiteralPath $ConfigPath).Path
$script = (Resolve-Path -LiteralPath (Join-Path $project 'refresh.py')).Path
$settings = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
$scheduledTime = [datetime]::ParseExact($settings.schedule_time, 'HH:mm', $null)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    throw "任务 $TaskName 已存在。请换一个名称或先自行检查现有任务。"
}

$action = New-ScheduledTaskAction -Execute $python -Argument "`"$script`" --config `"$config`" --scheduled" -WorkingDirectory $project
$daily = New-ScheduledTaskTrigger -Daily -At $scheduledTime
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$options = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($daily, $logon) -Principal $principal -Settings $options -Description '每天整理本地健康数据到 Obsidian' | Out-Null
Write-Output "已创建任务 $TaskName；计划时间 $($settings.schedule_time)。"
