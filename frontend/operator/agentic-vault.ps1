param([ValidateSet('protect','unprotect')][string]$Mode)
$ErrorActionPreference='Stop'
try {
 Add-Type -AssemblyName System.Security
 $inputText=[Console]::In.ReadToEnd()
 $entropy=[Text.Encoding]::UTF8.GetBytes('ECHO Agentic operator queue signing v1')
 if($Mode -eq 'protect'){
  $clear=[Convert]::FromBase64String($inputText)
  $result=[Security.Cryptography.ProtectedData]::Protect($clear,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 }else{
  $result=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($inputText),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 }
 [Console]::Out.Write([Convert]::ToBase64String($result))
 if($clear){[Array]::Clear($clear,0,$clear.Length)}
 if($result){[Array]::Clear($result,0,$result.Length)}
}catch{[Console]::Error.Write('AGENTIC_KEY_VAULT_FAILED');exit 1}
