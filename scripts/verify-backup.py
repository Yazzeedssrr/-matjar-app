"""Verify and extract a private backup without touching Supabase.

Required archive entries: database.dump, manifest.json, and all manifest files.
Manifest: {format: 'makhraj-full-backup-v1', project: <ref>, files:
  [{path: <relative path>, sha256: <digest>, bytes: <size>}]}
This checks integrity and restores files to a NEW local directory only.
It does not prove PostgreSQL restoration, account usability or payment readiness.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile

PROJECT = 'fskfwngswatbetgxkmei'
MAX_BYTES = 10 * 1024**3


def verify(archive):
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        names = [e.filename for e in entries]
        if len(names) != len(set(names)):
            raise ValueError('Duplicate archive entries')
        if sum(e.file_size for e in entries) > MAX_BYTES:
            raise ValueError('Archive exceeds verification size limit')
        for e in entries:
            p = PurePosixPath(e.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in e.filename or ':' in e.filename or e.is_dir():
                raise ValueError('Unsafe archive path')
            if (e.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Symlink entries are not allowed')
        if 'manifest.json' not in names or 'database.dump' not in names:
            raise ValueError('Missing database dump or manifest')
        if z.getinfo('manifest.json').file_size > 4 * 1024**2:
            raise ValueError('Oversized manifest')
        manifest = json.loads(z.read('manifest.json'))
        if manifest.get('format') != 'makhraj-full-backup-v1' or manifest.get('project') != PROJECT:
            raise ValueError('Wrong backup format/project')
        files = manifest.get('files')
        if not isinstance(files, list) or not files:
            raise ValueError('Missing file inventory')
        paths = [f['path'] for f in files]
        if len(paths) != len(set(paths)) or set(names) != set(paths) | {'manifest.json'}:
            raise ValueError('Manifest/archive inventory mismatch')
        for f in files:
            info = z.getinfo(f['path'])
            if info.file_size != f['bytes']:
                raise ValueError('File size mismatch')
            digest = hashlib.sha256()
            with z.open(info) as stream:
                while chunk := stream.read(1024**2):
                    digest.update(chunk)
            if digest.hexdigest() != f['sha256']:
                raise ValueError('File checksum mismatch')
        with z.open('database.dump') as dump:
            signature=dump.read(5)
        if signature != b'PGDMP':
            raise ValueError('Expected PostgreSQL custom dump')
        return manifest


def restore_files(archive, destination):
    manifest = verify(archive)
    destination = Path(destination)
    # Never overwrite a prior backup, existing folder or any production data.
    destination.mkdir(parents=True, exist_ok=False, mode=0o700)
    with zipfile.ZipFile(archive) as z:
        for name in ['manifest.json'] + [f['path'] for f in manifest['files']]:
            path = destination / name
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with z.open(name) as src, path.open('xb') as dst:
                while chunk := src.read(1024**2):
                    dst.write(chunk)
            path.chmod(0o600)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive')
    parser.add_argument('--restore-files-to', type=Path)
    args = parser.parse_args()
    result = restore_files(args.archive, args.restore_files_to) if args.restore_files_to else verify(args.archive)
    print(f"Verified {len(result['files'])} files. Database restore remains a separate required test.")
