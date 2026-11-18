param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$logs=[IO.Path]::GetFullPath((Join-Path $root '..\..\echo-agentic-connect-20261118\.private\production-operator\logs'))
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$networkFile=Join-Path (Split-Path -Parent $logs) 'network.dpapi'
if(Test-Path -LiteralPath $networkFile){
 Add-Type -AssemblyName System.Security
 $entropy=[Text.Encoding]::UTF8.GetBytes('ECHO Agentic operator queue signing v1')
 $clear=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String((Get-Content -LiteralPath $networkFile -Raw)),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 try{
  $network=[Text.Encoding]::UTF8.GetString($clear) | ConvertFrom-Json
  foreach($entry in $network.PSObject.Properties){if(@('HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NO_PROXY','https_proxy','http_proxy','all_proxy','no_proxy') -contains $entry.Name){[Environment]::SetEnvironmentVariable($entry.Name,[string]$entry.Value,'Process')}}
 }finally{[Array]::Clear($clear,0,$clear.Length);$network=$null}
}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$script=Join-Path $root 'operator\agentic-service.mjs'
$process=Start-Process -FilePath $NodePath -ArgumentList ('--use-env-proxy "'+$script+'" --run') -WorkingDirectory $root -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $logs ($stamp+'-out.txt')) -RedirectStandardError (Join-Path $logs ($stamp+'-error.txt'))
exit $process.ExitCode
