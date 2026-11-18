param([ValidateSet('protect','unprotect')][string]$Action)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$payload = [Console]::In.ReadToEnd().Trim()
$entropy = [Text.Encoding]::UTF8.GetBytes('ECHO-LAUNCH-BSC97-TEST-WALLET-V1')
if ($Action -eq 'protect') {
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  try {
    $protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Convert]::ToBase64String($protected))
  } finally { [Array]::Clear($bytes, 0, $bytes.Length) }
} else {
  $bytes = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($payload), $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  try { [Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes)) }
  finally { [Array]::Clear($bytes, 0, $bytes.Length) }
}
