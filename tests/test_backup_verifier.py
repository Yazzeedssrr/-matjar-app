import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('backup', 'scripts/verify-backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

class BackupTest(unittest.TestCase):
    def archive(self, root, corrupt=False, unsafe=False):
        data = {'database.dump': b'PGDMPfixture', 'images/photo.jpg': b'image-fixture'}
        if unsafe:
            data['../outside'] = b'bad'
        manifest = {'format': 'makhraj-full-backup-v1', 'project': backup.PROJECT,
                    'files': [{'path': p, 'sha256': hashlib.sha256(v).hexdigest(), 'bytes': len(v)} for p, v in data.items()]}
        target = root / 'private.zip'
        with zipfile.ZipFile(target, 'w') as z:
            z.writestr('manifest.json', json.dumps(manifest))
            for p,v in data.items():
                z.writestr(p, b'wrong-fixture' if corrupt and p=='database.dump' else v)
        return target

    def test_restore_files_preserves_bytes_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); a=self.archive(root); destination=root/'restored'
            backup.restore_files(a,destination)
            self.assertEqual((destination/'images/photo.jpg').read_bytes(),b'image-fixture')
            with self.assertRaises(FileExistsError): backup.restore_files(a,destination)

    def test_corruption_rejected_before_extraction(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); a=self.archive(root,corrupt=True)
            with self.assertRaises(ValueError): backup.restore_files(a,root/'restored')
            self.assertFalse((root/'restored').exists())

    def test_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            a=self.archive(Path(d),unsafe=True)
            with self.assertRaises(ValueError): backup.verify(a)

if __name__=='__main__': unittest.main()
