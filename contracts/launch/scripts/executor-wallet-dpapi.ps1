param([ValidateSet('protect','unprotect')][string]$Mode)
$ErrorActionPreference='Stop'
try {
 Add-Type -AssemblyName System.Security
 $inputText=[Console]::In.ReadToEnd()
 $entropy=[Text.Encoding]::UTF8.GetBytes('ECHO Launch automatic distributor v1')
 if($Mode -eq 'protect'){
  if($inputText -notmatch '^0x[0-9a-fA-F]{64}$'){throw 'KEY_FORMAT'}
  $clear=[Text.Encoding]::UTF8.GetBytes($inputText)
  $encrypted=[Security.Cryptography.ProtectedData]::Protect($clear,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Convert]::ToBase64String($encrypted))
 }else{
  $clear=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($inputText),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Text.Encoding]::UTF8.GetString($clear))
 }
 if($clear){[Array]::Clear($clear,0,$clear.Length)}
 $inputText=$null
}catch{[Console]::Error.Write('EXECUTOR_KEY_VAULT_FAILED');exit 1}
