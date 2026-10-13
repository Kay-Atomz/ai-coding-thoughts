# Narration latency

Version 0.2.5 measures preparation and playback separately. A spoken update may last ten seconds; it cannot finish in milliseconds without shortening or speeding up the message. The useful latency is the time from submitting an update until its playback starts.

The local model path now starts with a short sentence or clause, then synthesizes the next segment while the current segment plays. The Windows worker holds the same shared turn for the whole update, including generation gaps. Segments are not allowed to interrupt another agent or release the turn early. Backpressure permits one generated segment ahead of playback. Across all segments the existing 3 MiB/65-second limit remains, with at most 32 segments and a two-minute stream deadline after acquiring the turn.

Heart silently warms when its unmuted session first checks narrator status or opens the controls, without playing or saving the warmup clip. Unused MCP connections keep only a small catalog worker, so unrelated chats do not load duplicate models automatically. User requests arriving during warmup wait for it. Stop during that wait cancels the owning process; later work needs a cold restart. Switching engines also evicts the previous engine. A full-quality Heart worker keeps the public eSpeak backend warm rather than reconstructing it for every segment. Four inference threads remain bounded, and their idle spinning is disabled. No arbitrary narration cache or history is added.

`narrator_status.lastTimings` reports:

| Field | Meaning |
| --- | --- |
| `firstChunkMs` | Time from that job starting generation to the first prepared clip. Includes unfinished warmup. |
| `generationMs` | Sum of generation waits; playback may overlap this work. |
| `playbackStartMs` | Time from job generation start to the Windows playback call, including the shared-turn wait. |
| `queueWaitMs` | Time spent waiting behind that agent's pending jobs. |
| `requestToPlaybackMs` | Queue wait plus playback-start latency. |
| `audioMs` | Combined synthesized audio length. |
| `chunks` | Segments played. |

`lastDurationMs` retains full active-job duration, including actual speech. The settings panel displays the last request-to-playback latency, audio duration and total duration including queue wait. The playback timestamp is a call-boundary measurement; no microphone or system audio capture proves audible onset.

For a local hardware check, run `node scripts/benchmark-local-latency.mjs` from `plugins/coding-narrator`. It generates real Heart clips and silences only the device PCM. Run it separately from tests: they deliberately share the same playback gate. `npm.cmd test` runs test files serially to prevent the audio regressions contending with one another.

The final local run measured warmed playback-call starts of **795 ms**, **990 ms** and **671 ms** for a short update, a longer three-segment update and a short repeat. The longer update contained 10,071 ms of speech and finished in 13,847 ms. Actual silent startup warmup took 3,459 ms. These results describe this laptop and workload, not every update or machine. The earlier 26,027 ms status value included full speech duration and is not a comparable silent-delay baseline.

Cold startup, CPU/RAM pressure and another speaking agent still add latency. Sub-second results are a measured target rather than a guarantee. See [validation](../VALIDATION.md) for observed results and corrected trials. Changing thread count or model precision alone does not establish a speed improvement; [ONNX Runtime threading](https://onnxruntime.ai/docs/performance/tune-performance/threading.html) documents the resource tradeoffs.

During inference only, the Windows worker requests responsive scheduling for its own process and restores its prior power policy afterward. This can use more power during the short generation burst; it does not change the system power plan, other apps or thread count. Set `NARRATOR_CPU_QOS=automatic` before starting the narrator to retain Windows' automatic scheduling throughout. Unsupported APIs leave the policy unchanged. [Microsoft process QoS documentation](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-setprocessinformation).
