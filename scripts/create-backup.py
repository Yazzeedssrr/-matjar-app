"""Read-only database + Storage backup. No production writes or financial calls.

Run only in a trusted environment with existing PostgreSQL connection variables
PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD and SUPABASE_SERVICE_ROLE_KEY.
Never put these secrets in chat, GitHub, frontend code or command arguments.
Requires compatible pg_dump, pg_restore and psql. Archive contains private data;
store with restricted access and encrypt before transferring to offsite storage.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.parse
import urllib.request
import zipfile
import argparse

PROJECT='fskfwngswatbetgxkmei'
ORIGIN=f'https://{PROJECT}.supabase.co'


def command(args, **kwargs):
    result=subprocess.run(args, stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        # Provider errors may contain connection details; don't print them.
        raise RuntimeError(f'{args[0]} failed; inspect privately in your trusted environment')
    return result


def create(destination):
    required=('PGHOST','PGDATABASE','PGUSER','PGPASSWORD','SUPABASE_SERVICE_ROLE_KEY')
    if any(not os.environ.get(k) for k in required):
        raise RuntimeError('Configure existing database and storage credentials in secure environment variables')
    if PROJECT not in os.environ['PGHOST'] and not os.environ['PGUSER'].endswith('.'+PROJECT):
        raise RuntimeError('Connection must identify the existing Makhraj project')
    destination=Path(destination)
    if destination.exists():
        raise FileExistsError('Refusing to overwrite existing backup')
    with tempfile.TemporaryDirectory(prefix='makhraj-private-backup-') as temp:
        root=Path(temp)
        command(['pg_dump','--format=custom','--no-owner','--no-acl','--file',str(root/'database.dump')])
        command(['pg_restore','--list',str(root/'database.dump')],stdout=subprocess.DEVNULL)
        query="select coalesce(json_agg(json_build_object('bucket',bucket_id,'name',name) order by bucket_id,name),'[]'::json) from storage.objects;"
        result=command(['psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',query],stdout=subprocess.PIPE)
        objects=json.loads(result.stdout)
        inventory=[]
        for index,item in enumerate(objects):
            # Never turn remote object names into local file paths.
            relative=f'images/{index:08d}.bin'
            path=root/relative;path.parent.mkdir(exist_ok=True,mode=0o700)
            bucket=urllib.parse.quote(item['bucket'],safe='')
            name=urllib.parse.quote(item['name'],safe='/')
            request=urllib.request.Request(f'{ORIGIN}/storage/v1/object/authenticated/{bucket}/{name}',
                headers={'Authorization':'Bearer '+os.environ['SUPABASE_SERVICE_ROLE_KEY'],'apikey':os.environ['SUPABASE_SERVICE_ROLE_KEY']})
            try:
                with urllib.request.urlopen(request,timeout=60) as response,path.open('xb') as out:
                    while chunk:=response.read(1024**2):out.write(chunk)
            except Exception:
                raise RuntimeError('Storage download failed; backup was not completed') from None
            inventory.append({'path':relative,'bucket':item['bucket'],'object':item['name']})
        # Verify storage membership stayed stable while copying. Writes must be paused by owner for a consistent backup.
        second=command(['psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',query],stdout=subprocess.PIPE)
        if json.loads(second.stdout)!=objects:
            raise RuntimeError('Storage inventory changed; retry during a quiet window')
        (root/'storage-index.json').write_text(json.dumps(inventory,ensure_ascii=False))
        files=[]
        for path in sorted(root.rglob('*')):
            if not path.is_file():continue
            digest=hashlib.sha256()
            with path.open('rb') as stream:
                while chunk:=stream.read(1024**2):digest.update(chunk)
            files.append({'path':path.relative_to(root).as_posix(),'bytes':path.stat().st_size,'sha256':digest.hexdigest()})
        manifest={'format':'makhraj-full-backup-v1','project':PROJECT,'files':files,
                  'storage_objects':len(objects),'consistency':'database snapshot + storage copy; pause writes for cross-system consistency',
                  'excluded':['external Stripe account/secrets','browser-only drafts','provider configuration outside PostgreSQL'],
                  'database_restore_tested':False}
        (root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
        # Exclusive create, so a race cannot overwrite another backup.
        with destination.open('xb') as output:
            destination.chmod(0o600)
            with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as archive:
                for path in sorted(root.rglob('*')):
                    if path.is_file():archive.write(path,path.relative_to(root))
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('destination',type=Path)
    args=parser.parse_args()
    result=create(args.destination)
    print(f"Created private backup with {result['storage_objects']} Storage objects. Verify integrity and test database restoration separately.")
