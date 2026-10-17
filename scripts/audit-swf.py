"""Read-only inventory and decompilation-integrity checks."""
from pathlib import Path
import collections, hashlib, json, re, struct, zlib

root = Path(__file__).resolve().parents[1]
raw = (root/'reference/original.swf').read_bytes()
data = zlib.decompress(raw[8:]) if raw[:3] == b'CWS' else raw[8:]
rect_bytes = (5 + 4 * (data[0] >> 3) + 7) // 8
pos = rect_bytes + 4
tags = collections.Counter()
while pos + 2 <= len(data):
    value = struct.unpack_from('<H', data, pos)[0]
    pos += 2
    tag, length = value >> 6, value & 63
    if length == 63:
        length = struct.unpack_from('<I', data, pos)[0]
        pos += 4
    tags[tag] += 1
    pos += length
    if tag == 0:
        break

scripts = root/'evidence/decompiled/scripts'
files = list(scripts.rglob('*.as'))
counts = collections.Counter()
for f in files:
    prefix = 'box2d' if 'Box2D' in f.relative_to(scripts).parts else 'game_and_display'
    counts[prefix+'_classes'] += 1
    counts[prefix+'_lines'] += len(f.read_text().splitlines())
other = root/'evidence/instrumented-decompiled/scripts'
changed = [str(f.relative_to(scripts)) for f in files
           if not (other/f.relative_to(scripts)).exists()
           or f.read_bytes() != (other/f.relative_to(scripts)).read_bytes()]
report = {
    'sha256': hashlib.sha256(raw).hexdigest(),
    'compressed_bytes': len(raw),
    'uncompressed_bytes': len(data)+8,
    'swf_version': raw[3],
    'frame_rate': struct.unpack_from('<H',data,rect_bytes)[0]/256,
    'root_frames': struct.unpack_from('<H',data,rect_bytes+2)[0],
    'doabc_tags': tags[82],
    'sprite_definitions': tags[39],
    'decompiled_classes': len(files),
    'source_counts': dict(counts),
    'changed_classes_in_minimal_instrumented_variant': changed,
    'assets': {kind: len(list((root/'evidence/assets'/kind).rglob('*.*')))
               for kind in ['images','shapes','sounds','fonts']},
}
assert len(files) == 220
assert changed == ['KeyPoll.as'], changed
(root/'evidence/audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
