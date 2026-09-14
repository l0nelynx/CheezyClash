"""Fail before publishing when any promised platform/format is absent."""
from pathlib import Path
import sys

REQUIRED = {
    'CheezyClash-APKs': ['*universal*.apk', '*arm64-v8a*.apk', '*armeabi-v7a*.apk', '*x86_64*.apk'],
    'CheezyClash-symbols': ['*.zip'],
    'CheezyClash-desktop-win': ['*.exe', '*.zip'],
    'CheezyClash-desktop-linux': ['*.AppImage', '*.deb'],
    'CheezyClash-desktop-mac-arm64': ['*.dmg', '*.zip'],
    'CheezyClash-desktop-mac-x64': ['*.dmg', '*.zip'],
}


def verify(root):
    root = Path(root)
    for directory, patterns in REQUIRED.items():
        for pattern in patterns:
            if not any(p.is_file() and p.stat().st_size > 0 for p in (root / directory).glob(pattern)):
                raise RuntimeError(f'Missing or empty release artifact: {directory}/{pattern}')
    names = set()
    for directory in REQUIRED:
        for path in (root / directory).iterdir():
            if path.is_file():
                if path.name in names:
                    raise RuntimeError(f'Duplicate release asset name: {path.name}')
                names.add(path.name)


if __name__ == '__main__':
    verify(sys.argv[1])
    print('All release platforms and formats verified')
