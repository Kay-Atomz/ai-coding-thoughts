"""Bounded JSON-lines worker for the user's selected offline ONNX voices."""
import base64
import contextlib
import gc
import io
import importlib.util
import json
import os
from pathlib import Path
import sys
import wave
from inference_qos import responsive_inference


def reuse_kokoro_phonemizer(model):
    # The upstream convenience function reconstructs the eSpeak backend on
    # every call. Reuse its public backend with identical English options.
    from phonemizer.backend import EspeakBackend
    from phonemizer.utils import str2list, list2str
    from kokoro_onnx.tokenizer import _espeak_lock
    tokenizer = model.tokenizer
    with _espeak_lock:
        backend = EspeakBackend('en-us', preserve_punctuation=True, with_stress=True)

    def phonemize(text, lang='en-us', norm=True):
        if lang != 'en-us':
            raise ValueError('Unsupported language.')
        if norm:
            text = tokenizer.normalize_text(text)
        lines = [line.strip(os.linesep) for line in str2list(text) if line.strip()]
        with _espeak_lock:
            value = list2str(backend.phonemize(lines, strip=False, njobs=1))
        return ''.join(p for p in value if p in tokenizer.vocab).strip()

    tokenizer.phonemize = phonemize

MODELS = Path(sys.argv[1]).resolve()
os.environ['HF_HOME'] = str(MODELS.parent / 'hf-cache')
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['ORT_DISABLE_TELEMETRY'] = '1'
sys.stdout.reconfigure(encoding='utf-8')
sys.stdin.reconfigure(encoding='utf-8')

VOICES = {
    'kokoro-heart': ('Kokoro · Heart', 'kokoro'),
    'kokoro-bella': ('Kokoro · Bella', 'kokoro'),
    'kitten-bruno': ('Kitten · Bruno', 'kitten'),
    'piper-ljspeech': ('Piper · LJ Speech', 'piper'),
}
FILES = {
    'kokoro': ['kokoro-v1.0.onnx', 'voices-v1.0.bin'],
    'kitten': ['kitten/config.json', 'kitten/kitten_tts_nano_v0_8.onnx', 'kitten/voices.npz'],
    'piper': ['en_US-ljspeech-high.onnx', 'en_US-ljspeech-high.onnx.json'],
}


def emit(value):
    sys.stdout.write(json.dumps(value, ensure_ascii=True) + '\n')
    sys.stdout.flush()


def main():
    dependencies = ['numpy', 'onnxruntime', 'soundfile', 'kokoro_onnx', 'kittenml', 'piper', 'phonemizer', 'espeakng_loader']
    if any(importlib.util.find_spec(name) is None for name in dependencies):
        raise RuntimeError('Missing local dependencies.')
    available = {key: value for key, value in VOICES.items()
                 if all((MODELS / name).is_file() for name in FILES[value[1]])}
    emit({'type': 'ready', 'kokoroPrecision': 'fp32', 'voices': [{'name': key, 'label': value[0], 'culture': 'en-US'} for key, value in available.items()]})
    model = None
    loaded_engine = None

    while line := sys.stdin.readline(10001):
        request = {}
        try:
            if len(line) > 10000 or not line.endswith('\n'):
                raise ValueError('Invalid request size.')
            request = json.loads(line)
            voice = request['voice']
            text = request['text']
            volume = request['volume']
            rate = request['rate']
            if voice not in available or not isinstance(text, str) or not text.strip() or len(text) > 600:
                raise ValueError('Invalid voice or text.')
            if type(volume) is not int or not 0 <= volume <= 100 or type(rate) is not int or not -10 <= rate <= 10:
                raise ValueError('Invalid volume or rate.')
            engine = available[voice][1]
            speed = 2 ** (rate / 10)
            # Library output cannot contaminate the JSON protocol or leak request text.
            with responsive_inference(), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                # Discovery stays fast; inference dependencies load only on use.
                import numpy as np
                import onnxruntime as ort
                ort.disable_telemetry_events()
                import soundfile as sf
                options = ort.SessionOptions()
                options.intra_op_num_threads = 4
                options.inter_op_num_threads = 1
                # Idle narrator sessions should not compete by spinning CPU pools.
                options.add_session_config_entry('session.intra_op.allow_spinning', '0')
                if loaded_engine != engine:
                    model = None
                    loaded_engine = None
                    gc.collect()
                    if engine == 'kokoro':
                        from kokoro_onnx import Kokoro
                        session = ort.InferenceSession(str(MODELS / 'kokoro-v1.0.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
                        try:
                            model = Kokoro.from_session(session, str(MODELS / 'voices-v1.0.bin'))
                            reuse_kokoro_phonemizer(model)
                        finally:
                            session = None
                    elif engine == 'kitten':
                        from kittenml.kittentts_legacy.onnx_model import KittenTTS_1_Onnx
                        config = json.loads((MODELS / 'kitten/config.json').read_text(encoding='utf-8'))
                        # Fixed filenames: imported configuration cannot choose file paths.
                        # Upstream has no session-options argument. Limit its one session
                        # during synchronous construction, then restore the module API.
                        original_session = ort.InferenceSession
                        try:
                            ort.InferenceSession = lambda path, **kwargs: original_session(path, sess_options=options, **kwargs)
                            model = KittenTTS_1_Onnx(
                                str(MODELS / 'kitten/kitten_tts_nano_v0_8.onnx'), str(MODELS / 'kitten/voices.npz'),
                                speed_priors=config.get('speed_priors', {}), voice_aliases=config.get('voice_aliases', {}), backend='cpu')
                        finally:
                            ort.InferenceSession = original_session
                    else:
                        from piper import PiperVoice
                        original_session = ort.InferenceSession
                        try:
                            ort.InferenceSession = lambda path, **kwargs: original_session(path, **{**kwargs, 'sess_options': options})
                            model = PiperVoice.load(str(MODELS / 'en_US-ljspeech-high.onnx'), use_cuda=False)
                        finally:
                            ort.InferenceSession = original_session
                    loaded_engine = engine
                if engine == 'kokoro':
                    samples, sample_rate = model.create(text, voice='af_heart' if voice == 'kokoro-heart' else 'af_bella', speed=speed, lang='en-us')
                elif engine == 'kitten':
                    samples, sample_rate = model.generate(text, voice='Bruno', speed=speed), 24000
                else:
                    from piper import SynthesisConfig
                    buffer = io.BytesIO()
                    with wave.open(buffer, 'wb') as output:
                        model.synthesize_wav(text, output, syn_config=SynthesisConfig(length_scale=1 / speed))
                    buffer.seek(0)
                    samples, sample_rate = sf.read(buffer)
                samples = np.asarray(samples).reshape(-1)
                if not samples.size or not np.isfinite(samples).all() or samples.size / sample_rate > 65:
                    raise ValueError('Invalid or excessive generated audio.')
                peak = np.max(np.abs(samples))
                if peak < 0.0001:
                    raise ValueError('Generated audio is silent.')
                samples = samples / max(1, peak) * (volume / 100)
                buffer = io.BytesIO()
                sf.write(buffer, samples, sample_rate, format='WAV', subtype='PCM_16')
                audio = buffer.getvalue()
                if len(audio) > 3 * 1024 * 1024:
                    raise ValueError('Audio is too large.')
            emit({'id': request['id'], 'audio': base64.b64encode(audio).decode('ascii'), 'engine': engine})
            samples = audio = buffer = None
        except Exception:
            emit({'id': request.get('id'), 'error': 'Local voice synthesis failed. Check installed models or use a shorter update.'})
        finally:
            request = line = None
            samples = audio = buffer = None


if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.stderr.write('Local voice worker could not start. Check the optional voice installation.\n')
        sys.exit(1)
