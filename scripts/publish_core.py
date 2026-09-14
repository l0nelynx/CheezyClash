"""Resume core publication without treating GitHub outages as missing releases."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time


class GithubError(RuntimeError):
    def __init__(self, message):
        super().__init__(message)
        match = re.search(r'HTTP (\d{3})', message)
        self.status = int(match[1]) if match else None


def gh(*args):
    result = subprocess.run(['gh', *args], capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise GithubError(result.stderr)
    return result.stdout


def retry(operation, wait=time.sleep):
    for attempt in range(4):
        try:
            return operation()
        except (GithubError, subprocess.TimeoutExpired) as error:
            status = getattr(error, 'status', None)
            transient = isinstance(error, subprocess.TimeoutExpired) or status in (408, 429) or (status is not None and status >= 500)
            transient |= status is None and bool(re.search(r'timeout|timed out|connection|TLS|EOF|no such host', str(error), re.I))
            if not transient or attempt == 3:
                raise
            print(f'::warning::GitHub request failed temporarily; retry {attempt + 1}/3', flush=True)
            wait(2 ** (attempt + 1))


def publish(repo, tag, paths, command=gh):
    endpoint = f'repos/{repo}/releases'

    def lookup():
        try:
            return json.loads(command('api', f'{endpoint}/tags/{tag}'))
        except GithubError as error:
            if error.status == 404:
                return None
            raise

    def ensure_release():
        release = lookup()
        if release is None:
            command('release', 'create', tag, '--repo', repo, '--draft', '--prerelease',
                    '--target', os.environ.get('GITHUB_SHA', 'main'), '--title', tag,
                    '--notes', 'Prebuilt Android and desktop cores from the same Go sources.')
            release = lookup()
        if release is None:
            raise GithubError('Release not visible after creation; connection may be delayed')
        return release

    release = retry(ensure_release)
    for path in paths:
        path = Path(path)
        with path.open('rb') as stream:
            digest = 'sha256:' + hashlib.file_digest(stream, 'sha256').hexdigest()
        size = path.stat().st_size
        if not size:
            raise ValueError(f'Empty asset: {path}')

        def upload():
            # Recheck on EVERY retry: an upload may have succeeded before a timeout.
            assets = json.loads(command('api', f"{endpoint}/{release['id']}/assets?per_page=100"))
            existing = next((item for item in assets if item['name'] == path.name), None)
            if existing and existing.get('state') == 'uploaded' and existing.get('size') == size and existing.get('digest') == digest:
                return
            command('release', 'upload', tag, str(path), '--repo', repo, '--clobber')

        retry(upload)
        print(f'Uploaded/verified {path.name}', flush=True)

    # Verify the complete set before exposing a newly-created draft to consumers.
    assets = retry(lambda: json.loads(command('api', f"{endpoint}/{release['id']}/assets?per_page=100")))
    for path in map(Path, paths):
        item = next((item for item in assets if item['name'] == path.name), None)
        if not item or item.get('state') != 'uploaded' or item.get('size') != path.stat().st_size:
            raise RuntimeError(f'Incomplete release asset: {path.name}')
        if item.get('digest'):
            with path.open('rb') as stream:
                if item['digest'] != 'sha256:' + hashlib.file_digest(stream, 'sha256').hexdigest():
                    raise RuntimeError(f'Release checksum mismatch: {path.name}')
    if release.get('draft'):
        retry(lambda: command('release', 'edit', tag, '--repo', repo, '--draft=false'))


if __name__ == '__main__':
    publish(os.environ['GITHUB_REPOSITORY'], sys.argv[1], sys.argv[2:])
