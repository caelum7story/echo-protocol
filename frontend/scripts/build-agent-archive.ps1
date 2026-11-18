$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = Split-Path -Parent $PSScriptRoot
$archivePath = Join-Path $projectRoot 'dist\agent\echo-agent.zip'
$sourcePath = Join-Path $projectRoot 'dist\chain.mjs'
$manifestPath = Join-Path $projectRoot 'dist\agent.json'
$temporaryArchive = [IO.Path]::GetTempFileName()
try {
    Copy-Item -LiteralPath $archivePath -Destination $temporaryArchive -Force
    $archive = [IO.Compression.ZipFile]::Open($temporaryArchive, [IO.Compression.ZipArchiveMode]::Update)
    try {
        $archive.GetEntry('chain.mjs').Delete()
        $entry = $archive.CreateEntry('chain.mjs', [IO.Compression.CompressionLevel]::Optimal)
        $stream = $entry.Open()
        try { $bytes = [IO.File]::ReadAllBytes($sourcePath); $stream.Write($bytes, 0, $bytes.Length) }
        finally { $stream.Dispose() }
    } finally { $archive.Dispose() }
    $hash = (Get-FileHash -LiteralPath $temporaryArchive -Algorithm SHA256).Hash.ToLowerInvariant()
    Move-Item -LiteralPath $temporaryArchive -Destination $archivePath -Force
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $manifest.cliArchiveSha256 = $hash
    $manifest | ConvertTo-Json -Depth 35 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    Write-Output "Agent archive rebuilt; manifest SHA-256 updated."
} finally {
    if (Test-Path -LiteralPath $temporaryArchive) { Remove-Item -LiteralPath $temporaryArchive }
}
