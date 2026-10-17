"""Build with the isolated toolchain installed under tools/rust/."""
from pathlib import Path
import os, subprocess

root = Path(__file__).resolve().parents[1]
env = os.environ.copy()
env['RUSTUP_HOME'] = str(root/'tools/rust/rustup')
env['CARGO_HOME'] = str(root/'tools/rust/cargo')
rustc = str(root/'tools/rust/cargo/bin/rustc')
source = str(root/'spikes/rust-parity/src/lib.rs')
subprocess.run([rustc, '--version'], env=env, check=True)
subprocess.run([rustc, '--edition=2021', '--test', source, '-o', str(root/'tools/rust-spike-tests')], env=env, check=True)
subprocess.run([str(root/'tools/rust-spike-tests')], check=True)
subprocess.run([rustc, '--edition=2021', '--crate-type=cdylib', '--target', 'wasm32-unknown-unknown', '-O', '-C', 'strip=symbols', source, '-o', str(root/'probe/physics-spike.wasm')], env=env, check=True)
