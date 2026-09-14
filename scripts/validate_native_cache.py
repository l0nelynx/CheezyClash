"""Reject incomplete native caches before deciding whether to download/build."""
import os
from pathlib import Path
import shutil
import subprocess
import sys


def validate(path, verifier):
    if not Path(verifier).is_file():
        raise FileNotFoundError(f'Native cache verifier is missing: {verifier}')
    root = Path.cwd().resolve()
    target = Path(path).resolve()
    if target == root or root not in target.parents:
        raise ValueError('Native cache must be a child directory of the workspace')
    valid = target.is_dir() and subprocess.run(
        [sys.executable, str(verifier), 'verify-core', '--input', str(target)],
        check=False,
    ).returncode == 0
    if not valid and target.exists():
        print('::warning::Invalid native cache discarded; downloading or rebuilding instead')
        shutil.rmtree(target)
    return bool(valid)


if __name__ == '__main__':
    valid = validate(sys.argv[1], sys.argv[2])
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf8') as output:
        output.write(f'valid={str(valid).lower()}\n')
