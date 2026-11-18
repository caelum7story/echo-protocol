param([Parameter(Mandatory=$true)][string]$Directory,[Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$directoryPath=[IO.Path]::GetFullPath($Directory)
if(-not $directoryPath.StartsWith('D:\Codex\2026-10-27\files-mentioned-by-the-user-agent\work\echo-launch-production-20261115\',[StringComparison]::OrdinalIgnoreCase)){throw 'DISTRIBUTOR_DIRECTORY_SCOPE'}
$authority=Get-Content -LiteralPath (Join-Path $directoryPath 'authority.json') -Raw | ConvertFrom-Json
if($authority.confirmedByUser -ne $true -or $authority.enabled -ne $true){throw 'DISTRIBUTOR_CONFIRMED_AUTHORITY_REQUIRED'}
$taskName='ECHO Launch Automatic Distributor'
$scriptPath=Join-Path $root 'scripts\run-automatic-distributor.ps1'
$powerShellPath=Join-Path $PSHOME 'powershell.exe'
$argumentText='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$scriptPath+'" -Directory "'+$directoryPath+'" -NodePath "'+$NodePath+'"'
$old=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($old){if($old.Actions.Count -ne 1 -or $old.Actions[0].Execute -ne $powerShellPath -or $old.Actions[0].Arguments -ne $argumentText){throw 'DISTRIBUTOR_EXISTING_TASK_SCOPE_CHANGED'}}
else{
 $account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
 $action=New-ScheduledTaskAction -Execute $powerShellPath -Argument $argumentText -WorkingDirectory $root
 $trigger=New-ScheduledTaskTrigger -AtLogOn -User $account
 $principal=New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
 Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Bounded zero-value token distribution to original on-chain recipients; encrypted isolated Gas wallet;requires PC online and user logged in.' | Out-Null
}
Start-ScheduledTask -TaskName $taskName
$current=Get-ScheduledTask -TaskName $taskName
[pscustomobject]@{TaskName=$current.TaskName;State=[string]$current.State;MultipleInstances=[string]$current.Settings.MultipleInstances;AutomaticSigningScope='Original-wallet distribute only';RequiresLoggedInWindowsSession=$true} | ConvertTo-Json -Compress
