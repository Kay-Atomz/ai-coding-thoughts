"""Download public trial models without credentials or modifying the plugin."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / '.voice-lab' / 'models'
KITTEN_REV = '84781d74e29ee25217551556398b42f80593a813'


def download(item):
    name, url, limit = item
    path = MODELS / name
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        temp = path.with_suffix(path.suffix + '.partial')
        started = time.monotonic()
        total = 0
        with urlopen(url, timeout=45) as response, temp.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > limit or time.monotonic() - started > 600:
                    raise RuntimeError('Model download exceeded its size/time bound.')
                output.write(chunk)
        if not total:
            raise RuntimeError('Empty download.')
        temp.replace(path)
    digest = sha256()
    with path.open('rb') as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    result = {'file': name, 'url': url, 'bytes': path.stat().st_size, 'sha256': digest.hexdigest()}
    print(f"Downloaded {name}: {result['bytes']} bytes", flush=True)
    return result


if __name__ == '__main__':
    MODELS.mkdir(parents=True, exist_ok=True)
    # Fixed release assets from the documented community Kokoro ONNX runtime.
    kokoro = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/'
    kitten = f'https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8/resolve/{KITTEN_REV}/'
    # The model card identifies a public-domain dataset; no Lessac model is used.
    with urlopen('https://huggingface.co/api/models/rhasspy/piper-voices', timeout=30) as response:
        piper_rev = json.load(response)['sha']
    piper = f'https://huggingface.co/rhasspy/piper-voices/resolve/{piper_rev}/en/en_US/ljspeech/high/'
    items = [
        ('kokoro-v1.0.onnx', kokoro + 'kokoro-v1.0.onnx', 400_000_000),
        ('voices-v1.0.bin', kokoro + 'voices-v1.0.bin', 50_000_000),
        ('kitten/config.json', kitten + 'config.json', 20_000),
        ('kitten/kitten_tts_nano_v0_8.onnx', kitten + 'kitten_tts_nano_v0_8.onnx', 40_000_000),
        ('kitten/voices.npz', kitten + 'voices.npz', 20_000_000),
        ('en_US-ljspeech-high.onnx', piper + 'en_US-ljspeech-high.onnx', 150_000_000),
        ('en_US-ljspeech-high.onnx.json', piper + 'en_US-ljspeech-high.onnx.json', 100_000),
        ('piper-MODEL_CARD.txt', piper + 'MODEL_CARD', 20_000),
    ]
    with ThreadPoolExecutor(max_workers=3) as pool:
        records = list(pool.map(download, items))
    (MODELS / 'downloads.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
