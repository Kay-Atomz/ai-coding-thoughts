using System;
using System.Diagnostics;
using System.Globalization;
using System.Media;
using System.Security.Principal;
using System.Speech.Synthesis;
using System.Threading;
using System.IO;
using System.Web.Script.Serialization;
using System.Collections.Generic;

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

    // Keep the same OS-thread turn across every segment and generation gap.
    // Node sends at most one queued segment; stdin is an in-memory pipe only.
    public static void PlayStream(string first, long id)
    {
        Run(delegate
        {
            string encoded = first;
            long bytes = 0;
            int count = 0;
            double duration = 0;
            JavaScriptSerializer json = new JavaScriptSerializer();
            json.MaxJsonLength = 4500000;
            while (true)
            {
                if (encoded == null || encoded.Length > 4194304 || ++count > 32) throw new InvalidDataException();
                byte[] audio = Convert.FromBase64String(encoded);
                bytes += audio.Length;
                if (bytes > 3 * 1024 * 1024) throw new InvalidDataException();
                // Node already verifies every RIFF/fmt/data chunk. Independently
                // bound the total device duration before playing each segment.
                if (audio.Length < 46 || System.Text.Encoding.ASCII.GetString(audio, 0, 4) != "RIFF") throw new InvalidDataException();
                int rate = 0;
                for (int offset = 12; offset + 8 <= audio.Length; )
                {
                    int size = checked((int)BitConverter.ToUInt32(audio, offset + 4));
                    int start = offset + 8;
                    if (size < 0 || size > audio.Length - start) throw new InvalidDataException();
                    string name = System.Text.Encoding.ASCII.GetString(audio, offset, 4);
                    if (name == "fmt " && size >= 16) rate = checked((int)BitConverter.ToUInt32(audio, start + 8));
                    if (name == "data") { if (rate <= 0) throw new InvalidDataException(); duration += (double)size / rate; }
                    offset = checked(start + size + size % 2);
                }
                if (duration > 65) throw new InvalidDataException();
                using (MemoryStream stream = new MemoryStream(audio))
                using (SoundPlayer player = new SoundPlayer(stream)) { player.PlaySync(); }
                audio = null;
                Console.WriteLine("{\"type\":\"segment\",\"id\":" + id.ToString(CultureInfo.InvariantCulture) + "}");
                Console.Out.Flush();
                string line = Console.In.ReadLine();
                if (line == null || line.Length > 4500000) throw new InvalidDataException();
                Dictionary<string, object> next = json.Deserialize<Dictionary<string, object>>(line);
                if (Convert.ToInt64(next["id"]) != id) throw new InvalidDataException();
                string action = Convert.ToString(next["action"]);
                if (action == "stream_end") break;
                if (action != "stream_chunk") throw new InvalidDataException();
                encoded = Convert.ToString(next["audio"]);
            }
        }, id);
    }
}
