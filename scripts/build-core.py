"""Build/test the browser-independent core using this project's Rust toolchain."""
from pathlib import Path
import os, subprocess

root=Path(__file__).resolve().parents[1]
env=os.environ.copy()
cargo='cargo'
if (root/'tools/rust/cargo/bin/cargo').exists():
    env['RUSTUP_HOME']=str(root/'tools/rust/rustup')
    env['CARGO_HOME']=str(root/'tools/rust/cargo')
    env['PATH']=str(root/'tools/rust/cargo/bin')+os.pathsep+env['PATH']
    cargo=str(root/'tools/rust/cargo/bin/cargo')
for args in [['fmt','--all','--','--check'],['test','--offline'],['clippy','--all-targets','--offline','--','-D','warnings'],['build','--release','--target','wasm32-unknown-unknown','--offline']]:
    subprocess.run([cargo,*args],cwd=root,env=env,check=True)
(root/'probe/physics-core.wasm').write_bytes((root/'target/wasm32-unknown-unknown/release/sportheads_core.wasm').read_bytes())
