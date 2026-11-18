param([Parameter(Mandatory=$true)][string]$Directory,[Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$networkFile=Join-Path $Directory 'network-environment.json'
if(Test-Path -LiteralPath $networkFile){
 $network=Get-Content -LiteralPath $networkFile -Raw | ConvertFrom-Json
 foreach($entry in $network.PSObject.Properties){
  if($entry.Name -notin @('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY')){throw 'DISTRIBUTOR_NETWORK_KEY_INVALID'}
  $value=[string]$entry.Value
  if($value.Length -gt 8192 -or $value.Contains("`r") -or $value.Contains("`n")){throw 'DISTRIBUTOR_NETWORK_VALUE_INVALID'}
  if($entry.Name -ne 'NO_PROXY'){$uri=[Uri]$value;if($uri.Scheme -notin @('http','https') -or $uri.UserInfo){throw 'DISTRIBUTOR_NETWORK_PROXY_INVALID'}}
  [Environment]::SetEnvironmentVariable($entry.Name,$value,'Process')
 }
}
$logPath=Join-Path $Directory 'logs'
New-Item -ItemType Directory -Path $logPath -Force | Out-Null
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$scriptPath=Join-Path $root 'scripts\automatic-distributor.mjs'
$argsText='--use-env-proxy "'+$scriptPath+'" --directory "'+$Directory+'"'
$process=Start-Process -FilePath $NodePath -ArgumentList $argsText -WorkingDirectory $root -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $logPath ($stamp+'-out.txt')) -RedirectStandardError (Join-Path $logPath ($stamp+'-error.txt'))
exit $process.ExitCode
