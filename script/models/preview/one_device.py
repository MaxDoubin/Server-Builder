"""Build one device on its own and export it, for the preview harness."""
import importlib, sys, os
sys.path.insert(0, 'script/models')
sys.path.insert(0, 'script/models/devices')
from build_mikrotik_isp_rack import MikroTikIspRack
from build_unifi_hero_rack_clean_aligned import export_glb
from pathlib import Path

mod_name, cls_name, out = sys.argv[1], sys.argv[2], sys.argv[3]
mod = importlib.import_module(mod_name)
dev = getattr(mod, cls_name)()

rack = MikroTikIspRack()          # only for its primitives and material table
rack.parts.clear()
dev.build(rack, 0.0)
scene = rack.to_scene()
export_glb(scene, Path(out))
faces = sum(len(g.faces) for g in scene.geometry.values())
print(f'{out}  {faces:,} triangles, {len(scene.geometry)} groups')
