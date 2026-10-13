"""Request responsive scheduling only for this worker's inference burst."""
from contextlib import contextmanager
import os
import sys


@contextmanager
def responsive_inference():
    if os.name != 'nt' or os.environ.get('NARRATOR_CPU_QOS') == 'automatic':
        yield
        return
    import ctypes
    from ctypes import wintypes

    class Policy(ctypes.Structure):
        _fields_ = [('Version', wintypes.DWORD), ('ControlMask', wintypes.DWORD), ('StateMask', wintypes.DWORD)]

    api = ctypes.WinDLL('kernel32', use_last_error=True)
    api.GetCurrentProcess.restype = wintypes.HANDLE
    api.GetProcessInformation.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    api.SetProcessInformation.argtypes = api.GetProcessInformation.argtypes
    handle = api.GetCurrentProcess()
    original = Policy(1, 0, 0)
    changed = False
    if api.GetProcessInformation(handle, 4, ctypes.byref(original), ctypes.sizeof(original)):
        active = Policy(1, original.ControlMask | 1, original.StateMask & ~1)
        changed = bool(api.SetProcessInformation(handle, 4, ctypes.byref(active), ctypes.sizeof(active)))
    try:
        yield
    finally:
        if changed:
            if not api.SetProcessInformation(handle, 4, ctypes.byref(original), ctypes.sizeof(original)):
                # Do not retain a policy we could not restore beyond inference.
                sys.stderr.write('Narrator scheduling policy could not be restored.\n')
                raise SystemExit(1)
