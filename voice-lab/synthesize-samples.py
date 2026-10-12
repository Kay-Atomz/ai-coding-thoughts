"""Generate labeled local comparison clips; no plugin provider configuration changes."""
import argparse
import json
import os
from pathlib import Path
from time import perf_counter
import wave

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / '.voice-lab'
MODELS = LAB / 'models'
SAMPLES = LAB / 'samples'
# The trial needs local files only; suppress implicit account credentials/downloads.
os.environ['HF_HOME'] = str(LAB / 'hf-cache')
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'

TEXT = ('This is a voice demo for Coding Narrator. Here is a sample progress update: '
        'I am checking the code, reviewing the tests, and preparing the next change. '
        'You can keep working while this update plays.')


def save(name, samples, rate, elapsed, loading):
    import numpy as np
    import soundfile as sf
    samples = np.asarray(samples).reshape(-1)
    if not len(samples) or not np.isfinite(samples).all() or not 1 <= len(samples) / rate <= 90:
        raise RuntimeError('Generated audio failed sample/duration validation.')
    if np.max(np.abs(samples)) < 0.0001:
        raise RuntimeError('Generated audio was silent.')
    if np.max(np.abs(samples)) > 1:
        samples = samples / np.max(np.abs(samples)) * 0.98
    path = SAMPLES / (name + '.wav')
    sf.write(path, samples, rate, subtype='PCM_16')
    with wave.open(str(path), 'rb') as stream:
        assert stream.getnchannels() == 1 and stream.getsampwidth() == 2
        assert stream.getnframes() > 0 and stream.getframerate() == rate
    result = {'name': name, 'file': path.name, 'sample_rate': rate,
              'duration_seconds': round(len(samples) / rate, 2),
              'generation_seconds': round(elapsed, 3), 'load_seconds': round(loading, 3)}
    print(json.dumps(result), flush=True)
    return result


def synthesize(engine):
    import soundfile as sf
    SAMPLES.mkdir(parents=True, exist_ok=True)
    results = []
    started = perf_counter()
    print('Loading ' + engine + ' local model.', flush=True)
    if engine == 'kokoro':
        from kokoro_onnx import Kokoro
        import onnxruntime as ort
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        options.inter_op_num_threads = 1
        session = ort.InferenceSession(str(MODELS / 'kokoro-v1.0.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
        model = Kokoro.from_session(session, str(MODELS / 'voices-v1.0.bin'))
        loading = perf_counter() - started
        for voice, name in [('af_heart', 'kokoro-heart'), ('af_bella', 'kokoro-bella')]:
            started = perf_counter()
            samples, rate = model.create(TEXT, voice=voice, speed=1.0, lang='en-us')
            results.append(save(name, samples, rate, perf_counter() - started, loading))
    elif engine == 'kitten':
        from kittenml.kittentts_legacy.onnx_model import KittenTTS_1_Onnx
        config = json.loads((MODELS / 'kitten/config.json').read_text(encoding='utf-8'))
        model = KittenTTS_1_Onnx(
            model_path=str(MODELS / 'kitten' / config['model_file']),
            voices_path=str(MODELS / 'kitten' / config['voices']),
            speed_priors=config['speed_priors'], voice_aliases=config['voice_aliases'], backend='cpu')
        loading = perf_counter() - started
        for voice in ['Jasper', 'Luna', 'Bruno']:
            started = perf_counter()
            samples = model.generate(TEXT, voice=voice, speed=1.0)
            results.append(save('kitten-' + voice.lower(), samples, 24000, perf_counter() - started, loading))
    else:
        from piper import PiperVoice
        model = PiperVoice.load(str(MODELS / 'en_US-ljspeech-high.onnx'), use_cuda=False)
        loading = perf_counter() - started
        temp = SAMPLES / 'piper-render.partial.wav'
        started = perf_counter()
        with wave.open(str(temp), 'wb') as output:
            model.synthesize_wav(TEXT, output)
        elapsed = perf_counter() - started
        samples, rate = sf.read(temp)
        results.append(save('piper-ljspeech', samples, rate, elapsed, loading))
        temp.unlink()
    report = SAMPLES / (engine + '-results.json')
    report.write_text(json.dumps({'demo_text': TEXT, 'results': results}, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('engine', choices=['kokoro', 'kitten', 'piper'])
    synthesize(parser.parse_args().engine)
