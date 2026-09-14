param([int]$Port = 8080, [string]$PhpPath = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $PhpPath) {
    $phpCommand = Get-Command php -ErrorAction SilentlyContinue
    if ($phpCommand) { $PhpPath = $phpCommand.Source }
    else {
        $candidate = Get-ChildItem 'C:\laragon\bin\php\*\php.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
        if ($candidate) { $PhpPath = $candidate.FullName }
    }
}
if (-not $PhpPath -or -not (Test-Path -LiteralPath $PhpPath)) { throw 'PHP was not found. Specify -PhpPath.' }
& $PhpPath (Join-Path $PSScriptRoot 'setup-db.php')
if ($LASTEXITCODE -ne 0) { throw 'Database setup failed.' }
Write-Host "Game: http://127.0.0.1:$Port/ (Ctrl+C to stop)"
& $PhpPath -S "127.0.0.1:$Port" -t $projectRoot (Join-Path $PSScriptRoot 'router.php')
