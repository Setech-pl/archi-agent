$ErrorActionPreference = 'Stop'
$project = (Get-Item -LiteralPath $PSScriptRoot).FullName
$directory = Join-Path $project '.vscode'
$settings = Join-Path $directory 'settings.json'
[System.IO.Directory]::CreateDirectory($directory) | Out-Null
$config = @{ 'archiAgent.architectureSource' = @{ kind = 'structurizr-json'; sourceId = 'retail-checkout'; modelPath = (Join-Path $project 'architecture/workspace.json'); overlayPath = (Join-Path $project 'architecture/overlay') } } | ConvertTo-Json
$stream = [System.IO.File]::Open($settings, [System.IO.FileMode]::CreateNew)
try { $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($config); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
Write-Host 'Ready. Open this folder in VS Code and inputs/pl/01-good.puml or inputs/en/01-good.puml.'
