param([string]$PythonCommand = 'python')
$ErrorActionPreference = 'Stop'
$taskLab = Join-Path $PSScriptRoot '.voice-lab'
$taskPython = Join-Path $taskLab 'venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
    & $PythonCommand -m venv (Join-Path $taskLab 'venv')
    if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed. Supply a working Python 3.12 executable with -PythonCommand.' }
}
& $taskPython -m pip --isolated install --disable-pip-version-check 'kokoro-onnx==0.6.1' 'soundfile==0.13.1' 'piper-tts==1.8.0' 'huggingface_hub==2.2.0'
if ($LASTEXITCODE -ne 0) { throw 'Local voice dependencies could not be installed.' }
& $taskPython -m pip --isolated install --disable-pip-version-check --no-deps 'kittenml==0.9.4'
if ($LASTEXITCODE -ne 0) { throw 'Kitten ONNX runtime could not be installed.' }
& $taskPython (Join-Path $PSScriptRoot 'voice-lab/download-models.py')
if ($LASTEXITCODE -ne 0) { throw 'Public model download failed.' }
Write-Output 'Local voice assets installed. Restart the narrator, then select Open-source offline and a voice. Model weights remain outside the plugin package.'
