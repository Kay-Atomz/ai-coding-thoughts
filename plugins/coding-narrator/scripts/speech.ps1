$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$taskSynth = $null
try {
    $taskRequest = [Console]::In.ReadToEnd() | ConvertFrom-Json
    Add-Type -AssemblyName System.Speech
    $taskSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    if ($taskRequest.action -eq 'voices') {
        $taskVoices = @($taskSynth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {
            @{ name = $_.VoiceInfo.Name; culture = $_.VoiceInfo.Culture.Name }
        })
        @{ voices = $taskVoices } | ConvertTo-Json -Compress -Depth 4
    } elseif ($taskRequest.action -eq 'speak') {
        if ([string]::IsNullOrWhiteSpace($taskRequest.text) -or $taskRequest.text.Length -gt 600) {
            throw 'Invalid speech request'
        }
        $taskSynth.Volume = [int]$taskRequest.volume
        $taskSynth.Rate = [int]$taskRequest.rate
        if ($taskRequest.voice) { $taskSynth.SelectVoice([string]$taskRequest.voice) }
        if ($taskRequest.wavePath) {
            $taskSynth.SetOutputToWaveFile([string]$taskRequest.wavePath)
        } else {
            Add-Type -AssemblyName System.Web.Extensions
            Add-Type -Path (Join-Path $PSScriptRoot 'AudioGate.cs') -ReferencedAssemblies @([System.Speech.Synthesis.SpeechSynthesizer].Assembly.Location, [System.Media.SoundPlayer].Assembly.Location, [System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location)
        }
        # Plain text only: never evaluate input as PowerShell or SSML.
        if ($taskRequest.wavePath) { $taskSynth.Speak([string]$taskRequest.text) }
        else { [NarratorAudioGate]::Speak($taskSynth, [string]$taskRequest.text, $null) }
        @{ completed = $true } | ConvertTo-Json -Compress
    } else {
        throw 'Unknown action'
    }
} catch {
    # Never print exception content, which could include user text or paths.
    [Console]::Error.WriteLine('Windows speech failed. Check installed voices and the default audio device.')
    exit 1
} finally {
    if ($null -ne $taskSynth) { $taskSynth.Dispose() }
}
