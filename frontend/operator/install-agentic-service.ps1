param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script=Join-Path $root 'operator\agentic-service.mjs'
if(-not (Test-Path -LiteralPath $script)){throw 'AGENTIC_SERVICE_MISSING'}
$taskName='ECHO Agentic Wallet Connector'
$powerShellPath='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$argsText='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $root 'operator\run-agentic-service.ps1')+'" -NodePath "'+$NodePath+'"'
$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$old=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($old){if($old.Actions.Count -ne 1 -or $old.Actions[0].Execute -ne $powerShellPath -or $old.Actions[0].Arguments -ne $argsText){throw 'EXISTING_TASK_SCOPE_CHANGED'}}
else{
 $action=New-ScheduledTaskAction -Execute $powerShellPath -Argument $argsText -WorkingDirectory $root
 $trigger=New-ScheduledTaskTrigger -AtLogOn -User $account
 $principal=New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
 Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'ECHO visitor-isolated Binance Agentic Wallet QR connection and explicitly confirmed ECHO Genesis Mint; no project owner wallet; PC must remain online and logged in.' | Out-Null
}
Start-ScheduledTask -TaskName $taskName
$current=Get-ScheduledTask -TaskName $taskName
[pscustomobject]@{TaskName=$current.TaskName;State=[string]$current.State;Scope='Visitor-confirmed ECHO Genesis Mint only';RequiresPcOnline=$true} | ConvertTo-Json -Compress
