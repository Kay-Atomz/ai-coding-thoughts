using System;
using System.Diagnostics;
using System.Globalization;
using System.Media;
using System.Security.Principal;
using System.Speech.Synthesis;
using System.Threading;

// All acquisition, audio and release run on one OS thread. The name is
// independent of plugin version/path, shared by this user's Windows session.
public static class NarratorAudioGate
{
    private static readonly string Name = @"Local\CodingNarrator.Playback." + WindowsIdentity.GetCurrent().User.Value + ".v1";

    private static void State(long? id, string phase)
    {
        if (!id.HasValue) return;
        Console.WriteLine("{\"type\":\"state\",\"id\":" + id.Value.ToString(CultureInfo.InvariantCulture) +
            ",\"phase\":\"" + phase + "\",\"timestamp\":\"" + Stopwatch.GetTimestamp().ToString(CultureInfo.InvariantCulture) + "\"}");
        Console.Out.Flush();
    }

    private static void Run(Action audio, long? id)
    {
        using (Mutex mutex = new Mutex(false, Name))
        {
            bool owned = false;
            bool started = false;
            try
            {
                try
                {
                    owned = mutex.WaitOne(0);
                    if (!owned)
                    {
                        State(id, "waiting");
                        owned = mutex.WaitOne(180000);
                    }
                }
                catch (AbandonedMutexException) { owned = true; }
                if (!owned) throw new TimeoutException("Narrator playback turn timed out.");
                started = true;
                State(id, "playing");
                audio();
            }
            finally
            {
                if (owned)
                {
                    try { if (started) State(id, "finished"); }
                    finally { mutex.ReleaseMutex(); }
                }
            }
        }
    }

    public static void Speak(SpeechSynthesizer synth, string text, long? id)
    {
        Run(delegate { synth.SetOutputToDefaultAudioDevice(); synth.Speak(text); }, id);
    }

    public static void Play(SoundPlayer player, long id)
    {
        Run(delegate { player.PlaySync(); }, id);
    }
}
