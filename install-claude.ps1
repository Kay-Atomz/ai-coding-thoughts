param([ValidateSet('user', 'local')][string]$Scope = 'user')
$ErrorActionPreference = 'Stop'
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { throw 'Install Claude Code before running this installer.' }
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskServer = Join-Path $PSScriptRoot 'plugins/coding-narrator/src/server.mjs'
if (-not (Test-Path -LiteralPath $taskServer)) { throw 'Narrator source was not found.' }
$taskDeps = Join-Path $PSScriptRoot 'plugins/coding-narrator/node_modules/@modelcontextprotocol/sdk'
if (-not (Test-Path -LiteralPath $taskDeps)) { throw 'Install the narrator dependencies first; see README.' }
# The CLI refuses a duplicate name rather than replacing existing configuration.
claude mcp add --transport stdio --scope $Scope coding-narrator -- $taskNode $taskServer
if ($LASTEXITCODE -ne 0) { throw 'Claude MCP registration did not complete. Existing configuration was not overwritten.' }
Write-Output 'Coding Narrator registered. Start a new Claude Code session and check /mcp.'
