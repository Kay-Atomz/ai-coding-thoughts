# Open-source voice candidates

Researched 11 October 2026 from the publishers' repositories and model cards. Coding Narrator 0.2.3 adds the user's selected Kokoro Heart/Bella, Kitten Nano Bruno and Piper LJ Speech to its Windows local runtime. Models are optional downloads; see [setup](LOCAL-VOICES.md). The [voice trial](VOICE-TRIAL.md) also includes Kitten Jasper and Luna as comparison clips; those two are not integrated voices. Trial timings do not establish human-rated sound quality.

## Recommendation

Start a listening trial with **Kokoro-82M v1.0**, using `af_heart` and `af_bella` (American English female voices). This is my recommendation based on the published model size, licensing and voice documentation, not a measured quality ranking. The code and weights are Apache-2.0. The publisher lists `af_heart` and `af_bella` highly in its voice guide, but those grades estimate training-data quality and quantity; they do not replace listening tests. [Model card](https://huggingface.co/hexgrad/Kokoro-82M), [voice guide](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).

For a much smaller model download, test **KittenTTS Nano 0.8 int8**, particularly `Jasper`, `Luna` and `Bruno`. Its model card identifies Apache-2.0 weights, 15 million parameters and approximately 25 MB. That is model size, not the complete installed runtime. Its eight voices are Bella, Jasper, Luna, Bruno, Rosie, Hugo, Kiki and Leo. [Exact model and usage](https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8), [lightweight runtime documentation](https://github.com/KittenML/KittenTTS/blob/main/docs/onnx-models.md).

| Candidate | Local use | Integration tradeoff |
| --- | --- | --- |
| Kokoro-82M v1.0 | Download weights and voice files, then synthesize locally through its Python pipeline. | Larger runtime than a tiny ONNX model; pronunciation fallback uses eSpeak NG. The publisher warns that very short utterances under roughly 10–20 tokens may sound weaker. |
| KittenTTS Nano 0.8 int8 | Lightweight ONNX models run on CPU without a GPU. | Small model, but runtime and phonemizer dependencies add size. Explicitly select this model: current library defaults can load a different, larger model. |
| Piper | Local engine with ONNX voice models and a reusable HTTP server. | Current engine is GPL-3.0; each voice has its own model card. A voice's dataset terms must be checked independently of the engine license. |

Sources: [Kokoro Python and Windows instructions](https://github.com/hexgrad/kokoro), [Kitten ONNX runtime](https://github.com/KittenML/KittenTTS/blob/main/docs/onnx-models.md), [Piper engine](https://github.com/OHF-Voice/piper1-gpl), [Piper voices](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md).

## License and version distinctions

The Windows voices already installed on this PC are an offline fallback, but are not open-source models. OpenAI remains a paid remote provider. None of these local candidates needs a cloud API key for local synthesis after its files have been downloaded.

**Do not substitute KittenTTS 2 for Nano 0.8 when choosing an Apache-licensed model.** The current Kitten repository identifies its code as Apache-2.0, but the KittenTTS 2 weights use the separate Stellon Labs Community License. The Nano 0.8 int8 card identifies Apache-2.0. [Publisher's license distinction](https://github.com/KittenML/KittenTTS#license), [Nano card](https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8).

Piper's `en_US-ljspeech-high` voice is a candidate to investigate: its model card identifies US English, one female speaker and a public-domain training dataset. This dataset statement alone does not establish every redistribution condition for the exported model. Avoid treating the frequently demonstrated `en_US-lessac-medium` as unrestricted: its card points to a research dataset license that excludes commercial use of the dataset. Clarify the model's applicable terms before bundling it. [LJ Speech model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/high/MODEL_CARD), [Lessac model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD), [dataset license](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html).

If distributing a runtime, retain notices for every dependency, not just the model. Kokoro and Kitten phonemization can involve eSpeak NG; Piper also embeds it. Its GPL license is separate from Apache model licensing. Researching candidate models is not a license review of a complete distributable. [eSpeak NG license](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING), [Piper repository](https://github.com/OHF-Voice/piper1-gpl).

## Trial and integration checklist

1. Use an isolated environment and explicitly pinned package/model revisions. Follow the selected publisher's Windows instructions; do not install Linux commands copied from notebook examples.
2. Compare the same representative progress sentences, including technical names, numbers and short updates. Listen for truncation, repetition and pronunciation errors. Measure cold startup, warm time to audio, memory and installed size on this PC. The [initial trial](VOICE-TRIAL.md) records one demo sentence and full-generation times, not a comprehensive latency, memory or quality benchmark.
3. Keep one model worker warm. Reloading model weights on every update adds avoidable latency. Piper explicitly recommends its server for repeated use. [Piper CLI guidance](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/CLI.md).
4. Add a bounded adapter behind the existing provider interface: text limit, queue bound, timeout, cancellation, audio-size cap and cleanup. Any local service must bind loopback and restrict requests. Never fall back to cloud speech without the user choosing it.
5. Only show a new provider after real synthesis and cancellation have passed. Preserve Windows as the immediate offline fallback. Open-source model setup is separate from an agent's MCP connection or speaking-style skill.

Choose **Open-source · offline** after installing the models and restarting the local narrator. The hosted ChatGPT runtime still uses OpenAI. Source packages exclude model weights and Python dependencies; redistribution of a complete runtime requires reviewing and retaining their separate notices.
