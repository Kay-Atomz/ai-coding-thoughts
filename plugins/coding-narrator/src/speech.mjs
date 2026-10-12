import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function runWindowsSpeech(request, { timeoutMs = 120000 } = {}) {
  if (process.platform !== 'win32') throw new Error('Coding Narrator requires Windows.');
  const child = spawn('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', fileURLToPath(new URL('../scripts/speech.ps1', import.meta.url)),
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let cancelled = false;
  let timer;
  const done = new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const fail = (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(message));
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 16384) {
        child.kill();
        fail('Windows speech returned an oversized response.');
      }
    });
    // Drain diagnostics without recording private request or exception content.
    child.stderr.resume();
    child.on('error', () => fail('Could not start Windows speech.'));
    child.stdin.on('error', () => fail('Could not send a request to Windows speech.'));
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (cancelled) return resolve({ cancelled: true });
      if (code !== 0) return reject(new Error('Windows speech failed. Check installed voices and the default audio device.'));
      try { resolve(JSON.parse(output)); }
      catch { reject(new Error('Windows speech returned an invalid response.')); }
    });
    timer = setTimeout(() => {
      child.kill();
      fail('Windows speech timed out.');
    }, timeoutMs);
    child.stdin.end(JSON.stringify(request));
  });
  return {
    done,
    cancel: () => { cancelled = true; child.kill(); },
  };
}
