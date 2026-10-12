$ErrorActionPreference = 'Stop'
$taskPluginRoot = Join-Path $PSScriptRoot 'plugins/coding-narrator'
$taskServerPath = (Join-Path $taskPluginRoot 'src/server.mjs').Replace('\', '/')
$taskConfig = @{ mcpServers = @{ narrator = @{ command = 'node'; args = @($taskServerPath) } } }
[System.IO.File]::WriteAllText((Join-Path $taskPluginRoot '.mcp.json'), ($taskConfig | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
Push-Location $taskPluginRoot
try {
    npm.cmd ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Narrator tests failed.' }
    npm.cmd run check:windows
    if ($LASTEXITCODE -ne 0) { throw 'Windows speech validation failed.' }
} finally { Pop-Location }
codex plugin marketplace add $PSScriptRoot
if ($LASTEXITCODE -ne 0) { throw 'Marketplace registration failed.' }
codex plugin add 'coding-narrator@coding-narrator-local'
if ($LASTEXITCODE -ne 0) { throw 'Plugin installation failed.' }
Write-Output 'Installed Coding Narrator. Restart Codex when convenient, then request narration in a new chat.'
