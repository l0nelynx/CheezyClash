import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import download_ci
import publish_core
import validate_native_cache
import verify_release_assets


class ResilienceTests(unittest.TestCase):
    def test_download_retries_504_and_preserves_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'core.zip'
            target.write_bytes(b'previous')
            results = iter([(0, '504'), (28, '000'), (0, '200')])
            delays = []
            def run(args, **kwargs):
                code, status = next(results)
                Path(args[args.index('--output') + 1]).write_bytes(b'complete' if status == '200' else b'partial')
                return subprocess.CompletedProcess(args, code, status, 'timeout')
            self.assertTrue(download_ci.download('https://example.invalid', target, run, delays.append))
            self.assertEqual(target.read_bytes(), b'complete')
            self.assertEqual(delays, [2, 4])
            self.assertEqual(list(Path(directory).iterdir()), [target])

    def test_download_404_and_permanent_error(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'core.zip'
            target.write_bytes(b'previous')
            def result(status):
                return lambda args, **kw: subprocess.CompletedProcess(args, 0, status, '')
            self.assertFalse(download_ci.download('url', target, result('404')))
            with self.assertRaisesRegex(RuntimeError, '403'):
                download_ci.download('url', target, result('403'))
            self.assertEqual(target.read_bytes(), b'previous')

    def test_cache_validation_and_safe_cleanup(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            target = Path(directory) / 'native'
            target.mkdir()
            (target / 'partial.so').write_bytes(b'bad')
            with patch.object(validate_native_cache.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1)):
                self.assertFalse(validate_native_cache.validate(target, __file__))
            self.assertFalse(target.exists())
            target.mkdir()
            with patch.object(validate_native_cache.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
                self.assertTrue(validate_native_cache.validate(target, __file__))
            self.assertTrue(target.exists())
            with self.assertRaises(ValueError):
                validate_native_cache.validate(Path.cwd(), __file__)

    def test_complete_release_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for folder, patterns in verify_release_assets.REQUIRED.items():
                (root / folder).mkdir()
                for index, pattern in enumerate(patterns):
                    (root / folder / pattern.replace('*', f'{folder}-{index}')).write_bytes(b'asset')
            verify_release_assets.verify(root)
            next((root / 'CheezyClash-desktop-mac-arm64').glob('*.dmg')).unlink()
            with self.assertRaisesRegex(RuntimeError, 'mac-arm64'):
                verify_release_assets.verify(root)

    def test_publication_recovers_uncertain_create_and_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'core.zip'
            path.write_bytes(b'core')
            release = None
            assets = []
            uploads = 0
            views = 0
            published = False
            def command(*args):
                nonlocal release, uploads, views, published
                if args[0] == 'api' and '/tags/' in args[1]:
                    views += 1
                    if views == 1:
                        raise publish_core.GithubError('HTTP 504')
                    if release is None:
                        raise publish_core.GithubError('HTTP 404')
                    return json.dumps(release)
                if args[:2] == ('release', 'create'):
                    release = {'id': 1, 'draft': True}
                    raise publish_core.GithubError('connection reset after create')
                if args[0] == 'api':
                    return json.dumps(assets)
                if args[:2] == ('release', 'upload'):
                    uploads += 1
                    assets.append({'name': 'core.zip', 'size': 4, 'state': 'uploaded',
                                   'digest': 'sha256:' + hashlib.sha256(b'core').hexdigest()})
                    raise publish_core.GithubError('HTTP 502')
                if args[:2] == ('release', 'edit'):
                    published = True
                    return ''
                self.fail(args)
            original_retry = publish_core.retry
            with patch.object(publish_core, 'retry', lambda fn: original_retry(fn, wait=lambda _: None)):
                publish_core.publish('owner/repo', 'tag', [path], command)
            self.assertEqual(uploads, 1)
            self.assertTrue(published)

    def test_api_permission_errors_are_not_retried(self):
        calls = []
        def denied():
            calls.append(1)
            raise publish_core.GithubError('HTTP 403')
        with self.assertRaises(publish_core.GithubError):
            publish_core.retry(denied, wait=lambda _: self.fail('unexpected retry'))
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
