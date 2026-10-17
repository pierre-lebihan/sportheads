"""Rebuild local Flash references with pinned, checksum-verified tools."""
from pathlib import Path
import argparse, hashlib, shutil, subprocess, sys, tarfile, zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('swf', nargs='?', default=str(Path.home()/'Documents/Jeux/Sports_Heads_Football_European_Edition.swf'))
args = parser.parse_args()
original_hash = '6a8b371667a9f06da787301814f74afc7d6e80b5b8b0d9fb9b89e1982a559950'
source = Path(args.swf)
assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash, 'Unexpected source SWF'
for folder in ['reference','evidence','tools/cache','probe/vendor']:
    (root/folder).mkdir(parents=True, exist_ok=True)
shutil.copy2(source, root/'reference/original.swf')

def archive(name, url, checksum):
    path = root/'tools/cache'/name
    if not path.exists():
        subprocess.run(['curl','-L','--fail','--silent','--show-error',url,'-o',str(path)],check=True)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == checksum, 'Tool checksum mismatch: '+name
    return path

ffdec = archive('ffdec_26.3.0.zip',
    'https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.3.0/ffdec_26.3.0.zip',
    '35f4930eb7c380afe66f2117f90b006deac0631473ad7500bb39c78f68645ecd')
with zipfile.ZipFile(ffdec) as z:
    assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in z.namelist())
    z.extractall(root/'tools/ffdec')
ruffle = archive('ruffle-0.7.1.tgz',
    'https://registry.npmjs.org/@ruffle-rs/ruffle/-/ruffle-0.7.1.tgz',
    'dc9e7407549a91accc41a14932b0b9d9a9d51a3742ce6f020888c8a76682b157')
with tarfile.open(ruffle) as t:
    for member in t.getmembers():
        relative = Path(member.name.removeprefix('package/'))
        assert not relative.is_absolute() and '..' not in relative.parts
        if member.isfile():
            target = root/'probe/vendor'/relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(t.extractfile(member).read())

def ffdec_run(log_name, *command):
    with (root/'evidence'/log_name).open('w') as log:
        subprocess.run(['java','-Djava.awt.headless=true','-jar','tools/ffdec/ffdec.jar',*command],cwd=root,stdout=log,stderr=subprocess.STDOUT,check=True)
    print(log_name)

ffdec_run('decompile.log','-export','script','evidence/decompiled','reference/original.swf')
ffdec_run('assets-export.log','-export','image,shape,sound,font,symbolClass','evidence/assets','reference/original.swf')
subprocess.run([sys.executable,'scripts/prepare-instrumentation.py'],cwd=root,check=True)
ffdec_run('instrumentation.log','-replace','reference/original.swf','reference/instrumented.swf','KeyPoll','evidence/instrumentation/KeyPoll.as')
ffdec_run('seeded-instrumentation.log','-replace','reference/instrumented.swf','reference/seeded.swf','SPL_2012_7_fla.MainTimeline','evidence/instrumentation/MainTimeline.as')
ffdec_run('instrumented-decompile.log','-export','script','evidence/instrumented-decompiled','reference/instrumented.swf')
subprocess.run([sys.executable,'scripts/audit-swf.py'],cwd=root,check=True)
