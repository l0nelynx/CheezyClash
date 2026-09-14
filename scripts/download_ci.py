"""Bounded release downloads; preserve the distinction between 404 and outages."""
import os
from pathlib import Path
import subprocess
import sys
import time


def download(url, destination, run=subprocess.run, wait=time.sleep):
    target = Path(destination)
    partial = target.with_name(target.name + '.part')
    try:
        for attempt in range(4):
            result = run(['curl', '--silent', '--show-error', '--location',
                          '--connect-timeout', '30', '--max-time', '180',
                          '--output', str(partial), '--write-out', '%{http_code}', url],
                         capture_output=True, text=True)
            status = result.stdout.strip()
            if result.returncode == 0 and status == '200':
                os.replace(partial, target)
                return True
            if result.returncode == 0 and status == '404':
                print(f'Release asset does not exist (HTTP 404): {url}')
                return False
            transient = result.returncode in (5, 6, 7, 18, 28, 35, 52, 55, 56, 92) or status in ('408', '429') or status.startswith('5')
            if not transient or attempt == 3:
                raise RuntimeError(f'Download failed: HTTP {status}, curl exit {result.returncode}: {result.stderr}')
            print(f'Temporary download failure (HTTP {status}, curl {result.returncode}); retry {attempt + 1}/3')
            wait(2 ** (attempt + 1))
    finally:
        partial.unlink(missing_ok=True)


if __name__ == '__main__':
    found = download(sys.argv[1], sys.argv[2])
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf8') as output:
        output.write(f'found={str(found).lower()}\n')
