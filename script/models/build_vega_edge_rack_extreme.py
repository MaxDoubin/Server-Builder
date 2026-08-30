#!/usr/bin/env python3
"""Generate an original, low-poly, UniFi-inspired network rack.

The model is designed from scratch and does not copy any commercial mesh or
include third-party logos. It exports GLB, OBJ/MTL, STL, and a component list.

Dependencies: trimesh, numpy
"""
from __future__ import annotations

import argparse
import math
from collections import defaultdict
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial


# 5x7 block font used for tiny raised labels. Each string is one row.
FONT: dict[str, tuple[str, ...]] = {
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01111", "10000", "10000", "10111", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
    "J": ("00111", "00010", "00010", "00010", "00010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "11011", "10001"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "10000", "11110", "00001", "00001", "11110"),
    "6": ("01111", "10000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00001", "11110"),
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    "/": ("00001", "00010", "00010", "00100", "01000", "01000", "10000"),
    ".": ("00000", "00000", "00000", "00000", "00000", "00110", "00110"),
    " ": ("000", "000", "000", "000", "000", "000", "000"),
}


class Builder:
    def __init__(self, detail: str = "high") -> None:
        self.detail = detail
        self.parts: dict[str, dict[str, list[trimesh.Trimesh]]] = defaultdict(lambda: defaultdict(list))
        self.materials = self._make_materials()
        self.front_y = -0.350
        self.u = 0.04445
        self.cyl_sections = 36 if detail == "extreme" else (24 if detail == "ultra" else (12 if detail == "high" else 8))
        self.cable_sections = 28 if detail == "extreme" else (18 if detail == "ultra" else (10 if detail == "high" else 6))
        self.cable_steps = 44 if detail == "extreme" else (28 if detail == "ultra" else (14 if detail == "high" else 8))

    @staticmethod
    def _make_materials() -> dict[str, PBRMaterial]:
        def mat(name: str, rgba: Sequence[int], metallic: float, roughness: float,
                emissive: Sequence[int] | None = None) -> PBRMaterial:
            kwargs = {
                "name": name,
                "baseColorFactor": list(rgba),
                "metallicFactor": metallic,
                "roughnessFactor": roughness,
            }
            if emissive is not None:
                kwargs["emissiveFactor"] = [c / 255.0 for c in emissive[:3]]
            return PBRMaterial(**kwargs)

        return {
            "powder_white": mat("Powder White", (224, 228, 232, 255), 0.45, 0.24),
            "aluminum": mat("Brushed Aluminum", (171, 178, 184, 255), 0.84, 0.28),
            "aluminum_dark": mat("Dark Aluminum", (102, 110, 118, 255), 0.78, 0.32),
            "graphite": mat("Graphite", (22, 25, 29, 255), 0.28, 0.54),
            "black": mat("Black Plastic", (6, 8, 10, 255), 0.05, 0.62),
            "rubber": mat("Caster Rubber", (24, 27, 32, 255), 0.0, 0.86),
            "wheel_blue": mat("Wheel Blue Gray", (83, 104, 124, 255), 0.10, 0.62),
            "cable_white": mat("Cable White", (238, 241, 243, 255), 0.0, 0.46),
            "cable_dark": mat("Cable Dark", (15, 17, 20, 255), 0.0, 0.74),
            "cable_cyan": mat("Cable Cyan", (66, 195, 224, 255), 0.0, 0.40),
            "screen": mat("Display Glass", (5, 18, 28, 255), 0.10, 0.18, emissive=(4, 42, 66)),
            "cyan": mat("Cyan Emissive", (69, 213, 244, 255), 0.0, 0.25, emissive=(69, 213, 244)),
            "green": mat("Green LED", (56, 232, 139, 255), 0.0, 0.20, emissive=(56, 232, 139)),
            "amber": mat("Amber LED", (255, 173, 61, 255), 0.0, 0.20, emissive=(255, 173, 61)),
            "red": mat("Red LED", (255, 76, 76, 255), 0.0, 0.22, emissive=(255, 76, 76)),
            "label": mat("Raised Labels", (39, 45, 51, 255), 0.22, 0.36),
            "floor": mat("Studio Floor", (42, 46, 54, 255), 0.05, 0.74),
        }

    def add(self, mesh: trimesh.Trimesh, group: str, material: str) -> None:
        if mesh is None or len(mesh.vertices) == 0:
            return
        self.parts[group][material].append(mesh)

    def box(self, group: str, material: str, center: Sequence[float], extents: Sequence[float]) -> trimesh.Trimesh:
        mesh = trimesh.creation.box(extents=np.asarray(extents, dtype=float))
        mesh.apply_translation(np.asarray(center, dtype=float))
        self.add(mesh, group, material)
        return mesh

    def cylinder_between(self, group: str, material: str, p0: Sequence[float], p1: Sequence[float],
                         radius: float, sections: int | None = None) -> trimesh.Trimesh | None:
        p0a = np.asarray(p0, dtype=float)
        p1a = np.asarray(p1, dtype=float)
        vec = p1a - p0a
        length = float(np.linalg.norm(vec))
        if length < 1e-7:
            return None
        mesh = trimesh.creation.cylinder(radius=radius, height=length, sections=sections or self.cyl_sections)
        transform = trimesh.geometry.align_vectors([0.0, 0.0, 1.0], vec / length)
        if transform is None:
            transform = np.eye(4)
        transform[:3, 3] = (p0a + p1a) * 0.5
        mesh.apply_transform(transform)
        self.add(mesh, group, material)
        return mesh

    def sphere(self, group: str, material: str, center: Sequence[float], radius: float,
               subdivisions: int = 1) -> trimesh.Trimesh:
        mesh = trimesh.creation.icosphere(subdivisions=subdivisions, radius=radius)
        mesh.apply_translation(np.asarray(center, dtype=float))
        self.add(mesh, group, material)
        return mesh

    def tube(self, group: str, material: str, points: Sequence[Sequence[float]], radius: float,
             joint_spheres: bool = True) -> None:
        pts = [np.asarray(p, dtype=float) for p in points]
        for a, b in zip(pts[:-1], pts[1:]):
            self.cylinder_between(group, material, a, b, radius, sections=self.cable_sections)
        if joint_spheres:
            subdivisions = 1
            for p in pts[1:-1]:
                self.sphere(group, material, p, radius * 1.04, subdivisions=subdivisions)

    def bezier_tube(self, group: str, material: str, p0: Sequence[float], p1: Sequence[float],
                    p2: Sequence[float], p3: Sequence[float], radius: float) -> None:
        points: list[np.ndarray] = []
        for t in np.linspace(0.0, 1.0, self.cable_steps):
            a = (1 - t) ** 3
            b = 3 * (1 - t) ** 2 * t
            c = 3 * (1 - t) * t ** 2
            d = t ** 3
            p = a * np.asarray(p0) + b * np.asarray(p1) + c * np.asarray(p2) + d * np.asarray(p3)
            points.append(p)
        self.tube(group, material, points, radius, joint_spheres=self.detail == "high")

    def pixel_text(self, group: str, material: str, text: str, center_x: float, center_z: float,
                   y: float, pixel: float, depth: float = 0.0022) -> None:
        text = text.upper()
        widths: list[int] = []
        for ch in text:
            glyph = FONT.get(ch, FONT[" "])
            widths.append(len(glyph[0]))
        total_cols = sum(widths) + max(0, len(text) - 1)
        width_m = total_cols * pixel
        start_x = center_x - width_m * 0.5
        cursor = 0
        for ch, glyph_width in zip(text, widths):
            glyph = FONT.get(ch, FONT[" "])
            for row, bits in enumerate(glyph):
                for col, bit in enumerate(bits):
                    if bit != "1":
                        continue
                    x = start_x + (cursor + col + 0.5) * pixel
                    z = center_z + (3.0 - row) * pixel
                    self.box(group, material, (x, y, z), (pixel * 0.78, depth, pixel * 0.78))
            cursor += glyph_width + 1

    def screen(self, group: str, center_x: float, center_z: float, width: float = 0.034,
               height: float = 0.024) -> None:
        y = self.front_y - 0.0080
        self.box(group, "graphite", (center_x, y + 0.0008, center_z), (width + 0.005, 0.0030, height + 0.005))
        self.box(group, "screen", (center_x, y - 0.0008, center_z), (width, 0.0024, height))
        # simple UI glyphs
        self.box(group, "cyan", (center_x - width * 0.24, y - 0.0022, center_z + height * 0.18),
                 (width * 0.30, 0.0016, height * 0.08))
        self.box(group, "cyan", (center_x - width * 0.12, y - 0.0022, center_z),
                 (width * 0.54, 0.0016, height * 0.07))
        self.box(group, "green", (center_x - width * 0.33, y - 0.0022, center_z - height * 0.24),
                 (height * 0.12, 0.0017, height * 0.12))
        self.box(group, "amber", (center_x - width * 0.12, y - 0.0022, center_z - height * 0.24),
                 (height * 0.12, 0.0017, height * 0.12))

    def add_device_shell(self, name: str, z: float, height: float, depth: float = 0.43,
                         face_material: str = "powder_white") -> None:
        group = f"DEVICE_{name}"
        # Internal chassis, front plate, and subtle lower shadow line.
        body_center_y = self.front_y + 0.006 + depth * 0.5
        self.box(group, "graphite", (0.0, body_center_y, z), (0.442, depth, height * 0.90))
        self.box(group, face_material, (0.0, self.front_y, z), (0.520, 0.012, height))
        self.box(group, "aluminum_dark", (0.0, self.front_y - 0.0067, z - height * 0.47),
                 (0.508, 0.0016, 0.0022))
        # Rack ears and four fasteners.
        self.box(group, "aluminum", (-0.257, self.front_y + 0.0005, z), (0.018, 0.011, height * 0.98))
        self.box(group, "aluminum", (0.257, self.front_y + 0.0005, z), (0.018, 0.011, height * 0.98))
        for sx in (-0.257, 0.257):
            for sz in (-height * 0.33, height * 0.33):
                self.cylinder_between(group, "graphite", (sx, self.front_y - 0.007, z + sz),
                                      (sx, self.front_y - 0.012, z + sz), 0.0031, sections=12)

    def add_port(self, group: str, x: float, z: float, width: float = 0.0125, height: float = 0.009,
                 led: bool = False, inner: str = "black") -> None:
        y = self.front_y - 0.0072
        self.box(group, "graphite", (x, y, z), (width + 0.003, 0.0034, height + 0.003))
        self.box(group, inner, (x, y - 0.0020, z), (width, 0.0022, height))
        if led:
            self.box(group, "green", (x + width * 0.34, y - 0.0035, z + height * 0.37),
                     (0.0023, 0.0015, 0.0018))

    def add_vent_slots(self, group: str, x0: float, z: float, count: int, spacing: float,
                       width: float = 0.0028, height: float = 0.016) -> None:
        for i in range(count):
            x = x0 + i * spacing
            self.box(group, "graphite", (x, self.front_y - 0.0072, z), (width, 0.0024, height))

    def build_frame(self) -> None:
        group = "RACK_FRAME"
        W, D = 0.620, 0.690
        z0, z1 = 0.145, 1.170
        post = 0.030
        xpost = W * 0.5 - post * 0.5
        ypost = D * 0.5 - post * 0.5
        # Four vertical posts.
        for x in (-xpost, xpost):
            for y in (-ypost, ypost):
                self.box(group, "powder_white", (x, y, (z0 + z1) * 0.5), (post, post, z1 - z0))
        # Perimeter rails at bottom, middle, and top.
        for z in (z0, 0.610, z1):
            for y in (-ypost, ypost):
                self.box(group, "powder_white", (0.0, y, z), (W, post, post))
            for x in (-xpost, xpost):
                self.box(group, "powder_white", (x, 0.0, z), (post, D, post))
        # Side slats, intentionally asymmetric enough to feel designed rather than copied.
        for side_x in (-xpost, xpost):
            for z in np.linspace(0.235, 1.075, 9):
                self.box("RACK_SIDE_SLATS", "aluminum", (side_x, 0.015, float(z)),
                         (0.018, D - 0.110, 0.024))
        # Front mounting rails and holes.
        for x in (-0.272, 0.272):
            self.box("RACK_RAILS", "aluminum_dark", (x, -0.323, 0.662), (0.018, 0.024, 0.900))
            hole_count = 39 if self.detail == "high" else 27
            for z in np.linspace(0.220, 1.100, hole_count):
                self.box("RACK_RAILS", "graphite", (x, -0.337, float(z)), (0.0050, 0.0030, 0.0065))
        # Top shelf and front identity bar.
        self.box(group, "powder_white", (0.0, -0.055, 1.170), (0.490, 0.330, 0.022))
        self.box(group, "powder_white", (0.0, -0.338, 1.125), (0.550, 0.028, 0.062))
        self.pixel_text("RACK_LOGO", "label", "VEGA", -0.030, 1.127, -0.354, 0.0071, 0.0020)
        self.box("RACK_LOGO", "cyan", (0.093, -0.355, 1.127), (0.009, 0.0022, 0.009))
        # Small rack unit numerals.
        for number, z in ((1, 0.245), (4, 0.382), (7, 0.520), (10, 0.704), (13, 0.842), (16, 0.980)):
            self.pixel_text("RACK_MARKINGS", "label", str(number), -0.292, z, -0.356, 0.0022, 0.0015)
            self.pixel_text("RACK_MARKINGS", "label", str(number), 0.292, z, -0.356, 0.0022, 0.0015)
        # Joint bolts on the side frames.
        for x in (-xpost, xpost):
            for y in (-ypost, ypost):
                for z in (z0, 0.610, z1):
                    self.sphere("RACK_FASTENERS", "aluminum_dark", (x, y - (0.017 if y < 0 else -0.017), z),
                                0.0062, subdivisions=1)

    def build_handles(self) -> None:
        for x in (-0.145, 0.145):
            p1 = (x, -0.090, 1.175)
            p2 = (x, -0.090, 1.245)
            p3 = (x, 0.090, 1.245)
            p4 = (x, 0.090, 1.175)
            self.tube("TOP_HANDLES", "aluminum", [p1, p2, p3, p4], 0.0065, joint_spheres=True)

    def build_casters(self) -> None:
        wheel_z = 0.067
        for x in (-0.245, 0.245):
            for y in (-0.270, 0.270):
                group = "CASTERS"
                # Wheel axis runs left-right.
                self.cylinder_between(group, "wheel_blue", (x - 0.019, y, wheel_z),
                                      (x + 0.019, y, wheel_z), 0.044, sections=20 if self.detail == "high" else 12)
                self.cylinder_between(group, "aluminum", (x - 0.021, y, wheel_z),
                                      (x + 0.021, y, wheel_z), 0.013, sections=16)
                # Fork and swivel stem.
                self.box(group, "aluminum", (x - 0.025, y, 0.093), (0.006, 0.054, 0.060))
                self.box(group, "aluminum", (x + 0.025, y, 0.093), (0.006, 0.054, 0.060))
                self.box(group, "aluminum", (x, y, 0.123), (0.058, 0.058, 0.012))
                self.cylinder_between(group, "aluminum_dark", (x, y, 0.125), (x, y, 0.151), 0.008, sections=14)
                if y < 0:
                    self.box(group, "graphite", (x + 0.034, y - 0.022, 0.092), (0.024, 0.045, 0.007))

    def build_router(self) -> None:
        z, h = 0.998, 0.040
        self.add_device_shell("CORE_GATEWAY", z, h, depth=0.410, face_material="powder_white")
        group = "DEVICE_CORE_GATEWAY"
        self.screen(group, -0.213, z)
        self.pixel_text(group, "label", "CORE", -0.145, z, self.front_y - 0.0072, 0.00245, 0.0018)
        # Center status window.
        self.box(group, "graphite", (0.015, self.front_y - 0.0073, z), (0.115, 0.0024, 0.020))
        self.box(group, "screen", (0.015, self.front_y - 0.0090, z), (0.105, 0.0018, 0.015))
        for i in range(4):
            self.box(group, "cyan", (-0.025 + i * 0.022, self.front_y - 0.0102, z + (i % 2) * 0.004 - 0.002),
                     (0.013, 0.0012, 0.0022))
        # Network and uplink ports.
        for row in range(2):
            for col in range(4):
                self.add_port(group, 0.128 + col * 0.022, z + (0.006 if row == 0 else -0.006),
                              width=0.013, height=0.009, led=True)
        self.add_port(group, 0.225, z + 0.006, width=0.014, height=0.009, led=True)
        self.add_port(group, 0.225, z - 0.006, width=0.014, height=0.009, led=False)

    def build_patch_panel(self, label: str, z: float) -> list[float]:
        self.add_device_shell(f"PATCH_{label}", z, 0.040, depth=0.220, face_material="powder_white")
        group = f"DEVICE_PATCH_{label}"
        xs = np.linspace(-0.218, 0.218, 24)
        for i, x in enumerate(xs):
            self.add_port(group, float(x), z, width=0.0123, height=0.0092, led=False, inner="graphite")
            # tiny index tick
            if i % 6 == 0:
                self.box(group, "aluminum_dark", (float(x), self.front_y - 0.0074, z + 0.014),
                         (0.003, 0.0015, 0.002))
        self.pixel_text(group, "label", label, -0.247, z + 0.012, self.front_y - 0.0073, 0.0019, 0.0016)
        return [float(v) for v in xs]

    def build_switch(self, label: str, z: float) -> list[float]:
        self.add_device_shell(f"SWITCH_{label}", z, 0.040, depth=0.360, face_material="aluminum")
        group = f"DEVICE_SWITCH_{label}"
        self.screen(group, -0.228, z, width=0.030, height=0.022)
        self.pixel_text(group, "label", "SW", -0.185, z + 0.003, self.front_y - 0.0072, 0.00185, 0.0015)
        xs = np.linspace(-0.145, 0.205, 24)
        for i, x in enumerate(xs):
            self.add_port(group, float(x), z, width=0.0112, height=0.0088, led=True)
            if i % 8 == 7:
                self.box(group, "label", (float(x) + 0.007, self.front_y - 0.0083, z + 0.014),
                         (0.0018, 0.0015, 0.0028))
        # Two high-speed uplinks.
        self.add_port(group, 0.228, z + 0.006, width=0.014, height=0.009, led=True)
        self.add_port(group, 0.228, z - 0.006, width=0.014, height=0.009, led=True)
        return [float(v) for v in xs]

    def build_nvr(self) -> None:
        z, h = 0.405, 0.082
        self.add_device_shell("STORAGE", z, h, depth=0.470, face_material="powder_white")
        group = "DEVICE_STORAGE"
        self.screen(group, -0.226, z + 0.018, width=0.030, height=0.022)
        self.pixel_text(group, "label", "STORE", -0.190, z - 0.020, self.front_y - 0.0072, 0.00185, 0.0015)
        # Four removable drive bays.
        bay_w = 0.095
        for i in range(4):
            x = -0.125 + i * 0.100
            self.box(group, "aluminum", (x, self.front_y - 0.0072, z), (bay_w, 0.0024, 0.060))
            self.box(group, "aluminum_dark", (x, self.front_y - 0.0088, z - 0.024), (bay_w * 0.72, 0.0015, 0.003))
            self.box(group, "graphite", (x + bay_w * 0.38, self.front_y - 0.0090, z), (0.006, 0.0018, 0.050))
            self.box(group, "green", (x - bay_w * 0.37, self.front_y - 0.0090, z + 0.023), (0.002, 0.0016, 0.004))

    def build_backup(self) -> None:
        z, h = 0.520, 0.082
        self.add_device_shell("BACKUP_POWER", z, h, depth=0.445, face_material="powder_white")
        group = "DEVICE_BACKUP_POWER"
        self.screen(group, -0.228, z + 0.018, width=0.030, height=0.022)
        self.pixel_text(group, "label", "POWER", -0.177, z - 0.020, self.front_y - 0.0072, 0.0018, 0.0015)
        self.add_vent_slots(group, -0.105, z, 30, 0.0102, width=0.0033, height=0.038)
        self.box(group, "green", (0.222, self.front_y - 0.0090, z + 0.020), (0.003, 0.0016, 0.007))
        self.box(group, "amber", (0.222, self.front_y - 0.0090, z), (0.003, 0.0016, 0.007))

    def build_pdu(self) -> list[float]:
        z, h = 0.275, 0.082
        self.add_device_shell("PDU", z, h, depth=0.270, face_material="aluminum")
        group = "DEVICE_PDU"
        self.pixel_text(group, "label", "PDU", -0.225, z + 0.021, self.front_y - 0.0072, 0.0020, 0.0016)
        # USB and network management ports.
        for i in range(3):
            self.box(group, "black", (-0.225 + i * 0.014, self.front_y - 0.0084, z - 0.017),
                     (0.006, 0.0020, 0.012))
        outlet_xs = [-0.145, -0.092, -0.039, 0.014, 0.067, 0.120, 0.173]
        for i, x in enumerate(outlet_xs):
            self.box(group, "graphite", (x, self.front_y - 0.0074, z + 0.012), (0.043, 0.0030, 0.025))
            # outlet face holes
            self.box(group, "black", (x - 0.010, self.front_y - 0.0092, z + 0.015), (0.006, 0.0018, 0.010))
            self.box(group, "black", (x + 0.010, self.front_y - 0.0092, z + 0.015), (0.006, 0.0018, 0.010))
            self.box(group, "black", (x, self.front_y - 0.0092, z + 0.004), (0.006, 0.0018, 0.005))
            if i < 5:
                self.box(group, "green", (x + 0.018, self.front_y - 0.0095, z + 0.027), (0.003, 0.0015, 0.003))
        # Two larger utility outlets along the bottom.
        for x in (0.085, 0.175):
            self.box(group, "graphite", (x, self.front_y - 0.0074, z - 0.023), (0.054, 0.0030, 0.026))
            self.box(group, "black", (x - 0.013, self.front_y - 0.0092, z - 0.020), (0.007, 0.0018, 0.011))
            self.box(group, "black", (x + 0.013, self.front_y - 0.0092, z - 0.020), (0.007, 0.0018, 0.011))
        return outlet_xs

    def build_patch_cables(self, patch_xs: Sequence[float], switch_xs: Sequence[float],
                           patch_z: float, switch_z: float, pair_name: str) -> None:
        cable_count = 22 if self.detail == "high" else 12
        indices = np.linspace(0, 23, cable_count, dtype=int)
        for n, idx in enumerate(indices):
            sx = float(patch_xs[idx])
            # A controlled permutation creates realistic but tidy crossovers.
            j = int((idx * 5 + (3 if pair_name == "A" else 1)) % 24)
            ex = float(switch_xs[j])
            y0 = self.front_y - 0.014
            bulge = 0.070 + 0.010 * ((n % 4) / 3.0)
            p0 = (sx, y0, patch_z)
            p1 = (sx + 0.002 * math.sin(n), y0 - bulge, patch_z - 0.006)
            p2 = (ex + 0.002 * math.cos(n), y0 - bulge, switch_z + 0.006)
            p3 = (ex, y0, switch_z)
            material = "cable_cyan" if n in (0, cable_count - 1) else "cable_white"
            self.bezier_tube(f"PATCH_CABLES_{pair_name}", material, p0, p1, p2, p3, 0.00225)
            self.box(f"PATCH_CABLES_{pair_name}", material, (sx, y0 - 0.001, patch_z), (0.008, 0.012, 0.008))
            self.box(f"PATCH_CABLES_{pair_name}", material, (ex, y0 - 0.001, switch_z), (0.008, 0.012, 0.008))

    def build_uplink_cables(self) -> None:
        y0 = self.front_y - 0.014
        # Cyan high-speed uplink from gateway to upper switch.
        self.bezier_tube("UPLINK_CABLES", "cable_cyan",
                         (0.225, y0, 0.998), (0.300, y0 - 0.040, 0.985),
                         (0.300, y0 - 0.040, 0.804), (0.228, y0, 0.804), 0.0030)
        # Dark inter-switch link.
        self.bezier_tube("UPLINK_CABLES", "cable_dark",
                         (0.228, y0, 0.804), (0.286, y0 - 0.030, 0.790),
                         (0.286, y0 - 0.030, 0.704), (0.228, y0, 0.704), 0.0028)
        # Slim management line down the right rail.
        points = [(0.242, y0, 0.992), (0.287, y0 - 0.025, 0.960), (0.287, y0 - 0.025, 0.310),
                  (0.235, y0, 0.292)]
        self.tube("UPLINK_CABLES", "cable_white", points, 0.0018, joint_spheres=self.detail == "high")

    def build_power_cables(self, outlet_xs: Sequence[float]) -> None:
        y0 = self.front_y - 0.015
        for i, x in enumerate(outlet_xs[:5]):
            p0 = (x, y0, 0.287)
            p1 = (x + 0.004 * (i - 2), y0 - 0.055, 0.260)
            p2 = (-0.130 + i * 0.065, y0 - 0.060, 0.160)
            p3 = (-0.130 + i * 0.065, -0.250, 0.155)
            self.bezier_tube("POWER_CABLES", "cable_dark", p0, p1, p2, p3, 0.0040)
            self.box("POWER_CABLES", "cable_dark", (x, y0 - 0.003, 0.287), (0.025, 0.018, 0.018))
        # Interior vertical runs visible through the open rack.
        self.tube("POWER_CABLES", "cable_dark",
                  [(-0.115, 0.105, 0.180), (-0.115, 0.145, 0.430), (-0.105, 0.160, 0.965)], 0.006,
                  joint_spheres=True)
        self.tube("POWER_CABLES", "cable_dark",
                  [(0.085, 0.115, 0.180), (0.090, 0.150, 0.470), (0.105, 0.160, 0.900)], 0.006,
                  joint_spheres=True)

    def build_blank_and_shelf_details(self) -> None:
        # Mid-gap shelf and a slim top blanking panel.
        self.box("SHELVES", "powder_white", (0.0, -0.030, 0.625), (0.470, 0.500, 0.018))
        self.box("SHELVES", "aluminum_dark", (0.0, self.front_y, 0.625), (0.520, 0.012, 0.035))
        self.pixel_text("SHELVES", "label", "EDGE 01", 0.0, 0.625, self.front_y - 0.0072, 0.0020, 0.0016)
        self.box("SHELVES", "powder_white", (0.0, self.front_y, 1.053), (0.520, 0.012, 0.040))
        self.add_vent_slots("SHELVES", -0.160, 1.053, 33, 0.010, width=0.0032, height=0.018)


    def build_ultra_details(self) -> None:
        if self.detail not in ("ultra", "extreme"):
            return
        fy = self.front_y - 0.0105
        # Dense rack hardware: cage nuts, washers, screw heads, engraved unit ticks.
        for x in (-0.272, 0.272):
            for z in np.linspace(0.205, 1.105, 55):
                self.box("ULTRA_CAGE_NUTS", "graphite", (x, -0.340, float(z)), (0.009, 0.004, 0.009))
                self.cylinder_between("ULTRA_CAGE_NUTS", "aluminum", (x, -0.343, float(z)), (x, -0.349, float(z)), 0.0037, sections=20)
                self.box("ULTRA_CAGE_NUTS", "black", (x, -0.350, float(z)), (0.0010, 0.0010, 0.0050))
        # Fine ventilation perforations on top and blanking panels.
        for z in (1.053, 0.625):
            for row in range(4):
                for col in range(42):
                    x=-0.190+col*0.0092
                    zz=z-0.012+row*0.008
                    self.cylinder_between("ULTRA_PERFORATIONS", "black", (x, fy, zz), (x, fy-0.0025, zz), 0.00135, sections=10)
        # Switch port internals: gold contacts, latch shelves, dual activity LEDs and numbering ticks.
        for z in (0.804, 0.704):
            xs=np.linspace(-0.145,0.205,24)
            for i,x in enumerate(xs):
                for c in range(4):
                    self.box("ULTRA_PORT_CONTACTS", "amber", (float(x)-0.0045+c*0.003, fy-0.001, z+0.0015), (0.0011,0.0010,0.0048))
                self.box("ULTRA_PORT_CONTACTS", "aluminum_dark", (float(x), fy-0.001, z-0.0030), (0.008,0.0012,0.0013))
                self.box("ULTRA_PORT_CONTACTS", "green", (float(x)-0.003, fy-0.0015, z+0.0062), (0.0015,0.0010,0.0015))
                self.box("ULTRA_PORT_CONTACTS", "amber", (float(x)+0.003, fy-0.0015, z+0.0062), (0.0015,0.0010,0.0015))
        # Patch-panel keystone bezels and individual strain-relief boots.
        for z in (0.852,0.752):
            for x in np.linspace(-0.218,0.218,24):
                self.box("ULTRA_KEYSTONES", "aluminum_dark", (float(x),fy,z), (0.0152,0.0012,0.0120))
                self.box("ULTRA_KEYSTONES", "black", (float(x),fy-0.001,z), (0.0105,0.0012,0.0075))
        # 12 hot-swap storage trays with handles, labels, screws and LEDs.
        zc=0.405
        for row in range(2):
            for col in range(6):
                x=-0.175+col*0.071
                z=zc+(0.018 if row==0 else -0.018)
                self.box("ULTRA_DRIVE_TRAYS", "aluminum_dark", (x,fy,z), (0.064,0.002,0.030))
                self.box("ULTRA_DRIVE_TRAYS", "graphite", (x,fy-0.0015,z), (0.058,0.0015,0.025))
                self.box("ULTRA_DRIVE_TRAYS", "aluminum", (x+0.022,fy-0.0025,z), (0.006,0.0015,0.019))
                self.box("ULTRA_DRIVE_TRAYS", "cyan", (x-0.025,fy-0.0025,z+0.009), (0.002,0.0012,0.005))
                for sx in (-0.025,0.025):
                    self.cylinder_between("ULTRA_DRIVE_TRAYS","aluminum",(x+sx,fy-0.002,z-0.010),(x+sx,fy-0.004,z-0.010),0.0018,sections=12)
        # Front fan intake grills with hubs and radial spokes on power equipment.
        for cx,cz in [(-0.07,0.520),(0.03,0.520),(0.13,0.520)]:
            for r in (0.008,0.013,0.018):
                pts=[]
                for a in np.linspace(0,2*math.pi,25):
                    pts.append((cx+r*math.cos(a),fy,cz+r*math.sin(a)))
                self.tube("ULTRA_FAN_GRILLS","graphite",pts,0.0007,joint_spheres=False)
            self.cylinder_between("ULTRA_FAN_GRILLS","graphite",(cx,fy,cz),(cx,fy-0.003,cz),0.004,sections=20)
            for a in np.linspace(0,2*math.pi,8,endpoint=False):
                self.cylinder_between("ULTRA_FAN_GRILLS","graphite",(cx+0.004*math.cos(a),fy,cz+0.004*math.sin(a)),(cx+0.020*math.cos(a),fy,cz+0.020*math.sin(a)),0.0008,sections=8)
        # Detailed display pixels / tiny telemetry bars.
        for cx,cz in [(-0.213,0.998),(-0.228,0.804),(-0.228,0.704),(-0.226,0.423),(-0.228,0.538)]:
            for row in range(5):
                for col in range(9):
                    if (row*3+col)%4:
                        self.box("ULTRA_SCREEN_PIXELS","cyan",(cx-0.012+col*0.003,fy-0.002,cz+0.007-row*0.003),(0.0015,0.0008,0.0010))
        # Cable combs and Velcro-style straps across bundles.
        for z in (0.828,0.728):
            self.box("ULTRA_CABLE_MANAGEMENT","graphite",(0.0,-0.425,z),(0.390,0.012,0.018))
            for x in np.linspace(-0.18,0.18,13):
                self.box("ULTRA_CABLE_MANAGEMENT","aluminum_dark",(float(x),-0.433,z),(0.004,0.008,0.025))
        # Rear vertical cable ladders, PDU rail and power/network trunks visible through open frame.
        for x in (-0.235,0.235):
            self.box("ULTRA_REAR_MANAGEMENT","graphite",(x,0.285,0.650),(0.025,0.025,0.850))
            for z in np.linspace(0.25,1.05,18):
                self.box("ULTRA_REAR_MANAGEMENT","aluminum_dark",(x,0.270,float(z)),(0.055,0.012,0.009))
        for i,x in enumerate((-0.19,-0.12,-0.05,0.02,0.09,0.16)):
            pts=[(x,0.20,0.22),(x+0.02*math.sin(i),0.25,0.45),(x-0.01,0.27,0.72),(x+0.015,0.25,1.00)]
            self.tube("ULTRA_REAR_CABLES","cable_dark" if i%2 else "cable_cyan",pts,0.0030,True)
        # Chassis seam lines, corner fasteners and equipment labels.
        for z,h in [(0.998,0.040),(0.852,0.040),(0.804,0.040),(0.752,0.040),(0.704,0.040),(0.520,0.082),(0.405,0.082),(0.275,0.082)]:
            for x in (-0.245,0.245):
                for dz in (-h*0.34,h*0.34):
                    self.cylinder_between("ULTRA_DEVICE_SCREWS","aluminum",(x,fy,z+dz),(x,fy-0.003,z+dz),0.0024,sections=16)
                    self.box("ULTRA_DEVICE_SCREWS","black",(x,fy-0.004,z+dz),(0.0007,0.0007,0.0030))
        self.pixel_text("ULTRA_LABELS","label","VEGA EDGE COMPUTE",0.0,0.575,fy,0.0020,0.0014)
        self.pixel_text("ULTRA_LABELS","label","10G CORE",0.110,0.985,fy,0.0015,0.0012)

    def build_extreme_details(self) -> None:
        if self.detail != "extreme":
            return
        fy = self.front_y - 0.0135
        # Individually modeled 8-contact RJ45 sockets with shields, latch ramps, and port IDs.
        for z in (0.804, 0.704):
            xs=np.linspace(-0.145,0.205,24)
            for i,x in enumerate(xs):
                self.box("EXTREME_RJ45_SHIELDS","aluminum_dark",(float(x),fy,z),(0.0138,0.0014,0.0108))
                self.box("EXTREME_RJ45_CAVITIES","black",(float(x),fy-0.0012,z),(0.0108,0.0012,0.0078))
                for c in range(8):
                    xx=float(x)-0.0042+c*0.0012
                    self.box("EXTREME_RJ45_CONTACTS","amber",(xx,fy-0.0020,z+0.0015),(0.00055,0.0009,0.0048))
                self.box("EXTREME_RJ45_LATCHES","graphite",(float(x),fy-0.0021,z-0.0030),(0.0065,0.0010,0.0013))
                if i % 4 == 0:
                    self.pixel_text("EXTREME_PORT_NUMBERS","label",str(i+1),float(x),z+0.013,fy-0.001,0.00075,0.0007)
        # SFP+ cages and removable transceivers with pull tabs.
        for z in (0.804,0.704,0.998):
            for j,x in enumerate((0.218,0.238)):
                self.box("EXTREME_SFP_CAGES","aluminum",(x,fy,z+(0.006 if j==0 else -0.006)),(0.016,0.0020,0.009))
                self.box("EXTREME_SFP_MODULES","graphite",(x,fy-0.002,z+(0.006 if j==0 else -0.006)),(0.012,0.0020,0.006))
                self.tube("EXTREME_SFP_PULL_TABS","cable_cyan",[(x-0.004,fy-0.003,z),(x,fy-0.006,z-0.005),(x+0.004,fy-0.003,z)],0.0007,False)
        # Realistic patch plugs: boots, strain relief ribs, latch clips, and cable labels.
        for z in (0.852,0.752):
            for idx,x in enumerate(np.linspace(-0.205,0.205,18)):
                self.box("EXTREME_PATCH_PLUGS","cable_white",(float(x),fy-0.004,z),(0.010,0.010,0.007))
                self.box("EXTREME_PATCH_PLUGS","aluminum_dark",(float(x),fy-0.009,z),(0.008,0.006,0.005))
                for r in range(4):
                    self.box("EXTREME_STRAIN_RELIEF","cable_white",(float(x),fy-0.013-r*0.003,z),(0.0085,0.0012,0.0065))
                self.box("EXTREME_LATCH_CLIPS","cable_white",(float(x),fy-0.010,z+0.005),(0.003,0.008,0.0010))
                if idx%3==0:
                    self.box("EXTREME_CABLE_LABELS","powder_white",(float(x),fy-0.018,z-0.006),(0.012,0.004,0.005))
        # Dense honeycomb vents on chassis faces.
        for z0,w,h in [(0.998,0.105,0.025),(0.520,0.300,0.050),(0.405,0.080,0.055),(0.275,0.100,0.050)]:
            for row in range(7):
                for col in range(26):
                    x=-w/2+col*(w/25)
                    z=z0-h/2+row*(h/6)+(0.0015 if col%2 else 0)
                    self.cylinder_between("EXTREME_HONEYCOMB","black",(x,fy,z),(x,fy-0.002,z),0.00115,sections=12)
        # 12 drive trays: release buttons, latch bars, labels, LEDs and faux drive internals behind gaps.
        for row in range(2):
            for col in range(6):
                x=-0.175+col*0.071; z=0.405+(0.018 if row==0 else -0.018)
                self.box("EXTREME_DRIVE_LABELS","powder_white",(x-0.008,fy-0.003,z),(0.024,0.0010,0.008))
                self.box("EXTREME_DRIVE_LATCHES","aluminum",(x+0.024,fy-0.004,z),(0.004,0.0020,0.022))
                self.cylinder_between("EXTREME_DRIVE_BUTTONS","graphite",(x+0.024,fy-0.004,z+0.010),(x+0.024,fy-0.007,z+0.010),0.0024,sections=18)
                for k in range(3):
                    self.box("EXTREME_DRIVE_INTERNALS","graphite",(x-0.015+k*0.012,fy+0.006,z),(0.008,0.012,0.022))
        # Actual fan blades behind three front grills.
        for cx,cz in [(-0.07,0.520),(0.03,0.520),(0.13,0.520)]:
            self.cylinder_between("EXTREME_FAN_HUBS","aluminum_dark",(cx,fy+0.001,cz),(cx,fy-0.004,cz),0.0045,sections=24)
            for a in np.linspace(0,2*math.pi,9,endpoint=False):
                p0=(cx+0.004*math.cos(a),fy-0.002,cz+0.004*math.sin(a))
                p1=(cx+0.017*math.cos(a+0.35),fy-0.002,cz+0.017*math.sin(a+0.35))
                self.cylinder_between("EXTREME_FAN_BLADES","aluminum_dark",p0,p1,0.0024,sections=10)
        # Rear I/O panels for each appliance: PSU sockets, fans, serial/management, ground studs.
        for z in (0.998,0.804,0.704,0.520,0.405,0.275):
            ry=0.285
            self.box("EXTREME_REAR_IO","graphite",(0.0,ry,z),(0.420,0.012,0.032))
            for x in (-0.16,-0.12):
                self.box("EXTREME_REAR_POWER","black",(x,ry+0.008,z),(0.028,0.006,0.020))
                for pinx in (-0.006,0.006):
                    self.cylinder_between("EXTREME_REAR_POWER","aluminum",(x+pinx,ry+0.012,z-0.004),(x+pinx,ry+0.017,z-0.004),0.0016,sections=12)
            for x in (0.06,0.11,0.16):
                self.add_rear_port("EXTREME_REAR_NETWORK",x,ry,z)
            self.cylinder_between("EXTREME_GROUND_STUDS","amber",(0.205,ry+0.008,z),(0.205,ry+0.020,z),0.004,sections=18)
        # Braided-looking rear power trunks by wrapping thin helical strands around main cables.
        for ci,x in enumerate((-0.18,-0.10,-0.02,0.06,0.14)):
            base=[]
            for k,t in enumerate(np.linspace(0,1,50)):
                z=0.24+0.78*t; y=0.245+0.015*math.sin(t*math.pi); xx=x+0.012*math.sin(t*2*math.pi+ci)
                base.append((xx,y,z))
            self.tube("EXTREME_POWER_TRUNKS","cable_dark",base,0.0040,False)
            for phase in (0,2*math.pi/3,4*math.pi/3):
                hel=[]
                for k,p in enumerate(base):
                    a=k*0.8+phase; hel.append((p[0]+0.0045*math.cos(a),p[1]+0.0045*math.sin(a),p[2]))
                self.tube("EXTREME_BRAID","cable_cyan",hel,0.00055,False)
        # Serial plates and warning labels.
        self.pixel_text("EXTREME_LABELS","label","VEGA EDGE RACK 01",0.0,1.103,fy,0.00155,0.0011)
        self.pixel_text("EXTREME_LABELS","label","24X 2.5G POE",0.0,0.818,fy,0.00115,0.0009)
        self.pixel_text("EXTREME_LABELS","label","24X 2.5G POE",0.0,0.718,fy,0.00115,0.0009)

    def add_rear_port(self, group: str, x: float, y: float, z: float) -> None:
        self.box(group,"aluminum_dark",(x,y+0.008,z),(0.018,0.006,0.013))
        self.box(group,"black",(x,y+0.012,z),(0.013,0.004,0.009))
        self.box(group,"green",(x+0.005,y+0.015,z+0.004),(0.002,0.002,0.002))

    def build(self) -> trimesh.Scene:
        self.build_frame()
        self.build_handles()
        self.build_casters()
        self.build_blank_and_shelf_details()
        self.build_router()
        patch_a = self.build_patch_panel("A", 0.852)
        switch_a = self.build_switch("A", 0.804)
        patch_b = self.build_patch_panel("B", 0.752)
        switch_b = self.build_switch("B", 0.704)
        self.build_backup()
        self.build_nvr()
        outlets = self.build_pdu()
        self.build_patch_cables(patch_a, switch_a, 0.852, 0.804, "A")
        self.build_patch_cables(patch_b, switch_b, 0.752, 0.704, "B")
        self.build_uplink_cables()
        self.build_power_cables(outlets)
        self.build_ultra_details()
        self.build_extreme_details()
        return self.to_scene()

    def to_scene(self) -> trimesh.Scene:
        scene = trimesh.Scene()
        for group in sorted(self.parts):
            for material_name in sorted(self.parts[group]):
                meshes = self.parts[group][material_name]
                if not meshes:
                    continue
                merged = trimesh.util.concatenate(meshes)
                try:
                    merged.merge_vertices()
                    merged.remove_unreferenced_vertices()
                    merged.fix_normals()
                except Exception:
                    pass
                merged.visual = trimesh.visual.TextureVisuals(material=self.materials[material_name])
                name = f"{group}__{material_name}"
                scene.add_geometry(merged, geom_name=name, node_name=name)
        scene.metadata["title"] = "VEGA Edge Rack"
        scene.metadata["author"] = "OpenAI for Max Doubin"
        scene.metadata["license"] = "Original custom asset; user may modify and use it. No third-party logos included."
        scene.metadata["units"] = "meters"
        return scene


def write_obj(scene: trimesh.Scene, target_dir: Path, stem: str) -> list[Path]:
    obj_text, assets = trimesh.exchange.obj.export_obj(
        scene,
        include_normals=True,
        include_color=True,
        include_texture=True,
        return_texture=True,
        mtl_name=f"{stem}.mtl",
    )
    written: list[Path] = []
    obj_path = target_dir / f"{stem}.obj"
    obj_path.write_text(obj_text, encoding="utf-8")
    written.append(obj_path)
    for name, payload in assets.items():
        out_name = f"{stem}.mtl" if name.lower().endswith(".mtl") else name
        path = target_dir / out_name
        if isinstance(payload, str):
            path.write_text(payload, encoding="utf-8")
        else:
            path.write_bytes(payload)
        written.append(path)
    return written


def export_variant(output_dir: Path, detail: str) -> dict[str, object]:
    builder = Builder(detail=detail)
    scene = builder.build()
    stem = f"vega_edge_rack_{detail}"
    glb_path = output_dir / f"{stem}.glb"
    glb_path.write_bytes(scene.export(file_type="glb"))

    obj_files: list[Path] = []
    if detail == "high":
        obj_files = write_obj(scene, output_dir, stem)
        # A single merged STL is useful for CAD previews, though it has no materials.
        merged = trimesh.util.concatenate([g.copy() for g in scene.geometry.values()])
        stl_path = output_dir / f"{stem}.stl"
        stl_path.write_bytes(merged.export(file_type="stl"))
    else:
        stl_path = None

    bounds = scene.bounds
    extents = bounds[1] - bounds[0]
    faces = sum(len(g.faces) for g in scene.geometry.values())
    vertices = sum(len(g.vertices) for g in scene.geometry.values())
    return {
        "detail": detail,
        "scene": scene,
        "glb": glb_path,
        "obj_files": obj_files,
        "stl": stl_path,
        "extents": extents.tolist(),
        "faces": int(faces),
        "vertices": int(vertices),
        "objects": len(scene.geometry),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--variant", choices=("extreme", "ultra", "high", "web", "both"), default="both")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    variants = ("high", "web") if args.variant == "both" else (args.variant,)
    results = [export_variant(args.output, v) for v in variants]
    for r in results:
        e = r["extents"]
        print(
            f"{r['detail']}: {r['faces']:,} triangles, {r['vertices']:,} vertices, "
            f"{r['objects']} named objects, dimensions {e[0]:.3f} x {e[1]:.3f} x {e[2]:.3f} m"
        )
        print(f"  GLB: {r['glb']}")
        if r["stl"]:
            print(f"  STL: {r['stl']}")
        for p in r["obj_files"]:
            print(f"  OBJ asset: {p}")


if __name__ == "__main__":
    main()
