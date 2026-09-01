"""Run umbra in a real pseudo-terminal and watch what it does."""

import codecs
import fcntl
import os
import pty
import select
import signal
import struct
import subprocess
import sys
import termios
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Session:

    def __init__(self, args, cols=100, rows=30, env=None):
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ,
                    struct.pack("HHHH", rows, cols, 0, 0))
        environ = dict(os.environ)
        environ.update({"COLORTERM": "truecolor", "TERM": "xterm-256color",
                        "PYTHONPATH": ROOT})
        # Deliberately not COLUMNS/LINES: the program should ask the terminal.
        environ.pop("COLUMNS", None)
        environ.pop("LINES", None)
        environ.pop("NO_COLOR", None)
        environ.update(env or {})
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "umbra"] + list(args),
            stdin=slave, stdout=slave, stderr=slave,
            cwd=ROOT, env=environ, close_fds=True)
        os.close(slave)
        self.buffer = ""
        # Reads land mid-character often enough to matter: a half block glyph
        # is three bytes and the picture is nothing but half blocks.
        self._decoder = codecs.getincrementaldecoder("utf-8")("replace")

    def read(self, seconds=0.4):
        """Drain whatever the program has written, for up to this long."""
        chunk = ""
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            left = deadline - time.monotonic()
            if not select.select([self.master], [], [], max(0.02, left))[0]:
                continue
            try:
                data = os.read(self.master, 65536)
            except OSError:
                break
            if not data:
                break
            chunk += self._decoder.decode(data)
        self.buffer += chunk
        return chunk

    def read_until(self, needle, seconds=15.0):
        """Read until the text shows up, or give up.  Returns True if found."""
        deadline = time.monotonic() + seconds
        if needle in self.buffer:
            return True
        while time.monotonic() < deadline:
            self.read(0.3)
            if needle in self.buffer:
                return True
        return False

    def resize(self, cols, rows):
        fcntl.ioctl(self.master, termios.TIOCSWINSZ,
                    struct.pack("HHHH", rows, cols, 0, 0))
        self.proc.send_signal(signal.SIGWINCH)

    def press(self, keys):
        os.write(self.master, keys)

    def wait(self, seconds=6.0):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            self.read(0.2)
            if self.proc.poll() is not None:
                self.read(0.3)
                return self.proc.returncode
        return None

    def close(self):
        if self.proc.poll() is None:
            self.proc.send_signal(signal.SIGKILL)
            self.proc.wait()
        try:
            os.close(self.master)
        except OSError:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False
