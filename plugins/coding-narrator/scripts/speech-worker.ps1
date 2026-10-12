$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$taskSynth = $null
try {
    Add-Type -AssemblyName System.Speech
    Add-Type -Path (Join-Path $PSScriptRoot 'AudioGate.cs') -ReferencedAssemblies @([System.Speech.Synthesis.SpeechSynthesizer].Assembly.Location, [System.Media.SoundPlayer].Assembly.Location)
    $taskSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $taskVoices = @($taskSynth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {
        @{ name = $_.VoiceInfo.Name; culture = $_.VoiceInfo.Culture.Name }
    })
    @{ type = 'ready'; voices = $taskVoices } | ConvertTo-Json -Compress -Depth 4
    while ($null -ne ($taskLine = [Console]::In.ReadLine())) {
        $taskRequest = $null
        $taskStream = $null
        $taskPlayer = $null
        try {
            $taskRequest = $taskLine | ConvertFrom-Json
            if ($taskRequest.action -eq 'ping') {
                # Used for worker health and command-latency checks.
            } elseif ($taskRequest.action -eq 'speak') {
                if ([string]::IsNullOrWhiteSpace($taskRequest.text) -or $taskRequest.text.Length -gt 600) {
                    throw 'Invalid speech request'
                }
                $taskSynth.Volume = [int]$taskRequest.volume
                $taskSynth.Rate = [int]$taskRequest.rate
                $taskSynth.SelectVoice([string]$taskRequest.voice)
                [NarratorAudioGate]::Speak($taskSynth, [string]$taskRequest.text, [long]$taskRequest.id)
            } elseif ($taskRequest.action -eq 'play') {
                if ($taskRequest.audio.Length -gt 4500000) { throw 'Audio too large' }
                $taskBytes = [Convert]::FromBase64String([string]$taskRequest.audio)
                $taskStream = New-Object System.IO.MemoryStream(,$taskBytes)
                $taskPlayer = New-Object System.Media.SoundPlayer($taskStream)
                [NarratorAudioGate]::Play($taskPlayer, [long]$taskRequest.id)
            } else { throw 'Unknown action' }
            @{ id = $taskRequest.id; completed = $true } | ConvertTo-Json -Compress
        } catch {
            @{ id = $taskRequest.id; error = 'Windows playback failed. Check the audio device and voice.' } | ConvertTo-Json -Compress
        } finally {
            if ($null -ne $taskPlayer) { $taskPlayer.Dispose() }
            if ($null -ne $taskStream) { $taskStream.Dispose() }
            $taskRequest = $null
            $taskLine = $null
            $taskBytes = $null
        }
    }
} catch {
    [Console]::Error.WriteLine('Windows speech worker could not start.')
    exit 1
} finally {
    if ($null -ne $taskSynth) { $taskSynth.Dispose() }
}
