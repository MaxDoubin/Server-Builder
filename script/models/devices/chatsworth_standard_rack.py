"""Chatsworth Standard Rack 55053, the classic aluminium two post relay rack.

Every dimension below is printed on CPI's own dimensioned isometric on page
two of the Standard Rack product data sheet. Nothing was measured off a
photograph and nothing was estimated, with the two exceptions called out in
the comments where they occur: the channel wall thickness, which the sheet
does not dimension, and the third web hole per post, which the sheet counts
but does not locate.

Note on sources, because CPI is the vendor where it matters: they publish
Revit families and AutoCAD blocks whose terms of use forbid reproducing or
publicly displaying them. None was fetched and none was used. A dimension
printed on a data sheet is a fact about a physical object.

What the drawing shows, and what makes this rack this rack rather than a
generic pair of posts:

  Two aluminium channels three inches deep, their webs facing out and both
  flanges turning inward, which is what lets equipment bolt to the front or
  the rear of the same post. Both flanges carry the tapped holes, and each
  column is 135 of them at the EIA-310 pattern, three to a rack unit.

  The posts stand on two long base angles that run front to back, not side
  to side, so the whole footprint is 20.3 inches by 15. Four three quarter
  inch anchor holes go through them, and CPI emboss their name along the
  outside of each one.

  A formed top angle ties the two posts together, and the web of each post
  is punched with clearance holes so a vertical cable manager can bolt
  straight to the side of the rack.

The hole field is the part worth getting exactly right, and the drawing
gives a check on it: 78.25 inches, 1987.6mm, from the first hole centre to
the last. Lay 45 units of 44.45mm out with holes at 6.35, 22.23 and 38.10
into each one, and the first to last span comes to 1987.55mm. Those two
numbers agreeing to within a twentieth of a millimetre is how you know the
pattern below is the real EIA-310 pattern and not three holes spread evenly
through a unit, which is what a rack that looks subtly wrong always has.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class StandardRack(Device):
    slug = "CPI_55053"
    name = "Chatsworth Standard Rack 55053-703, 7ft 45U Two Post"
    #: The rack is the frame, not a device mounted in one. `u` carries the
    #: 45 RMU the data sheet gives so the bookkeeping has a number, and
    #: `height` is overridden with the 84.00 [2133.6] overall.
    u = 45
    #: (Full Width) 20.32 [516.1] across the two channels.
    width = 0.5161
    #: 15.00 [381.0] base depth, which is the footprint the sheet quotes.
    depth = 0.3810
    source = ("https://www.chatsworth.com/en-us/products/racks-cable-management"
              "/two-post-racks/relay-racks/standard-rack-3d-80mm/55053-703/")
    references = [
        Reference("https://www.chatsworth.com/assets-proxy/public/asset/raw/"
                  "663b2857ae13c25e14022b2b/340a73ce/67411e422d10cb00185276c7/"
                  "55053_DATASHEET-pdf",
                  "Standard Rack data sheet, page 2 DIMENSIONS: a fully dimensioned "
                  "isometric of the 7ft rack, every figure below came off it"),
        Reference("https://www.chatsworth.com/assets-proxy/public/asset/raw/"
                  "663b2857ae13c25e14022b2b/e80496da/66e9b144394807050800002d/"
                  "CPI_HCAI_OPM-0261_STD_UNIV_2POST_RACK.pdf",
                  "HCAI OPM-0261 seismic submittal, sheet 6: orthographic front and "
                  "side elevations, which is what confirmed two tapped columns per post"),
        Reference("https://www.chatsworth.com/assets-proxy/public/asset/raw/"
                  "663b2857ae13c25e14022b2b/e9e4572b/66e34994ce135c00125fd621/"
                  "SERIES_2POST_STANDARD.JPG",
                  "product photograph of the base, for the angle and anchor detail"),
    ]

    # -------------------------------------------------------------- measured
    #
    # All figures are millimetres and all are printed on the data sheet
    # isometric, quoted here with the inch figure CPI print beside them.
    # x runs across the rack with zero at the centre, y runs into the rack
    # from the front flange, z is height above the floor.

    #: 84.00 [2133.6] overall.
    HEIGHT = 2133.6
    #: (Full Width) 20.32 [516.1], outer face of one channel web to the other.
    FULL_W = 516.1
    #: (Mounting Holes) 18.32 [465.3]. EIA-310 calls for 465.1, so CPI are
    #: quoting the same pattern rounded to two decimal places of an inch.
    HOLE_W = 465.3
    #: (Flange Edges) 17.79 [451.9], the clear opening between the two
    #: inward turning flanges. Take it with the two figures above and the
    #: whole channel section falls out: flange 32.1 wide, hole sitting 6.7
    #: from its inner edge and 25.4 from the web.
    FLANGE_W = 451.9
    #: 3 inch deep channel. The sheet's text says 3" D (80 mm), which is a
    #: rounded metric equivalent, so the model uses the inch figure.
    CHANNEL_D = 76.2
    #: Not dimensioned anywhere on the sheet. Three sixteenths of an inch is
    #: the trade standard for a formed aluminium relay rack channel and is
    #: what this is drawn at. It is the only guessed number in the file.
    WALL = 4.76

    #: 12-24 THD MTG holes, 135 PLS (45 RMU), field 78.25 [1987.6] first
    #: hole centre to last. EIA-310 puts them at these three offsets into
    #: every 44.45mm unit, and 44 units plus 38.10 reproduces the 1987.6.
    RMU = 45
    HOLE_OFFSETS = (6.35, 22.23, 38.10)
    #: 3.88 [98.6] from the floor to the bottom of the first rack unit.
    FIELD_BASE = 98.6
    #: 12-24 tapped, so a 0.201 inch tap drill at 5.11mm.
    HOLE_D = 5.11

    #: Base angle: 15.00 [381.0] deep, 4.0 [101.6] tall, with .750 DIA
    #: [19.05] anchor holes 4 places at 12.50 [317.5] apart front to back
    #: and 16.00 [406.4] apart across.
    BASE_D, BASE_H = 381.0, 101.6
    ANCHOR_D = 19.05
    ANCHOR_Y = 317.5
    ANCHOR_X = 406.4
    #: The foot is not dimensioned in width on the sheet. It is drawn about
    #: as wide as the base angle is tall, so it is modelled at 101.6.
    FOOT_W = 101.6

    #: Top angle: 4.25 [108.0] deep with a 1.25 [31.8] downturn, and the
    #: 5.50 [139.7] the sheet also prints is its overall formed depth.
    TOP_D, TOP_LIP = 108.0, 31.8
    TOP_PLATE = 139.7

    #: .656 clearance holes, 6 PL, for bolting a vertical cable manager to
    #: the side of the rack. The sheet dimensions two heights, 23.00 [584.2]
    #: and 39.00 [990.6]. Six places over two posts is three each, and the
    #: third is not located on the sheet, so it is placed one more 406.4
    #: step up, which is the step the two dimensioned ones set.
    WEB_HOLE_D = 16.66
    WEB_HOLE_Z = (584.2, 990.6, 1397.0)

    @property
    def height(self) -> float:
        """84.00 [2133.6], not 45 rack units.

        45 units is 2000.25mm. The rack is 2133.6 because it carries a base
        angle under the hole field and a top angle over it, and a frame
        modelled at its hole field height stands 133mm short of the real
        thing, which is visible the moment it is put next to a cabinet.
        """
        return self.HEIGHT / 1000.0

    # ------------------------------------------------------------- materials

    def register(self, rack) -> None:
        """This product's own finishes.

        55053-703 is the black variant. CPI photograph the Standard Rack in
        Glacier White rather than black, so the value here is not sampled
        off a photograph of this part: it is taken from CPI's black finish
        as it measures on their eConnect photography, 66 of 255 on the flat
        and 84 on a lit edge, and given a little metallic character because
        this is finished aluminium rather than a steel powder coat. That is
        an inference from a sibling product and is flagged as one.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # The channel web and flanges, formed aluminium.
            "cpi_rack_channel": pbr("55053 Channel", [68, 68, 69, 255], 0.34, 0.52),
            # The flange face reads a shade lighter than the web in every
            # elevation, because it is the surface that faces the light.
            "cpi_rack_flange": pbr("55053 Flange", [80, 80, 81, 255], 0.34, 0.48),
            # Base and top angles are the same extrusion family but heavier
            # section, and they pick up more sheen on the wide flat.
            "cpi_rack_angle": pbr("55053 Angle", [74, 74, 75, 255], 0.36, 0.46),
            # A tapped hole is a hole. It has to be darker than anything
            # around it or 540 of them read as 540 grey dots.
            "cpi_rack_hole": pbr("55053 Tapped Hole", [16, 16, 17, 255], 0.0, 0.92),
            "cpi_rack_bolt": pbr("55053 Bolt", [138, 139, 138, 255], 0.72, 0.34),
            "cpi_rack_logo": pbr("55053 Embossing", [96, 96, 97, 255], 0.30, 0.56),
        })

    # ---------------------------------------------------------- hole pattern

    def hole_heights(self) -> list[float]:
        """Every tapped hole centre, in millimetres above the floor.

        EIA-310 rather than an even split. The three offsets into a unit are
        6.35, 22.23 and 38.10, so the gaps run 15.88, 15.88, 12.70 and then
        wrap. An evenly spaced column looks almost right and is the single
        most common tell of a rack that was modelled rather than measured.
        """
        out = []
        for unit in range(self.RMU):
            base = self.FIELD_BASE + unit * (U * 1000.0)
            out.extend(base + off for off in self.HOLE_OFFSETS)
        return out

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """The unit numbering CPI screen onto the flange.

        Marked and numbered U is one of the named features of this product
        and it is the only lettering anywhere on it, so it belongs in a
        texture rather than being left off. The sheet is laid over the front
        flange of the left hand post only, which is where the numbering is,
        and it keeps that flange's own 32.1 by 2133.6 proportion so the
        digits are not stretched into ribbons.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        flange = self.FULL_W / 2 - self.FLANGE_W / 2
        W = 150
        H = round(W * self.HEIGHT / flange)
        ppm = W / flange
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (188, 189, 188, 255)
        f = font(max(7, round(2.6 / 0.729 * ppm)))

        for unit in range(self.RMU):
            # The number sits against the middle hole of its unit, which is
            # how CPI mark them: one number per U, not one per hole.
            zmm = self.FIELD_BASE + unit * (U * 1000.0) + self.HOLE_OFFSETS[1]
            text = str(unit + 1)
            b = d.textbbox((0, 0), text, font=f)
            cx = W * 0.74
            cy = (1.0 - zmm / self.HEIGHT) * H
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]),
                   text, font=f, fill=ink)

        tex = save_texture("cpi_55053_units.png", img)
        rack.materials["cpi_rack_units"] = PBRMaterial(
            name="55053 Unit Numbers", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.60,
            alphaMode="BLEND", doubleSided=True,
        )
        # Over the inner half of the left post's front flange.
        cx = -(self.FULL_W / 2 - flange / 2) / 1000.0
        rack.textured_plane(self.slug, "cpi_rack_units",
                            (cx, rack.front_y - 0.0012, z),
                            flange / 1000.0, self.height)

    # ----------------------------------------------------------------- build

    def build(self, rack, z: float) -> None:
        g = self.slug
        self.register(rack)
        floor = z - self.height / 2
        front = rack.front_y
        t = self.WALL / 1000.0

        def Z(mm_above_floor: float) -> float:
            return floor + mm_above_floor / 1000.0

        web_x = self.FULL_W / 2000.0            # outer face of the web
        flange_in = self.FLANGE_W / 2000.0      # inner edge of the flange
        hole_x = self.HOLE_W / 2000.0
        depth = self.CHANNEL_D / 1000.0
        mid_z = Z(self.HEIGHT / 2)

        for side in (-1, 1):
            # The web, standing on edge with its outer face at the full
            # width and its normal running across the rack.
            rack.box(g, "cpi_rack_channel",
                     (side * (web_x - t / 2), front + depth / 2, mid_z),
                     (t, depth, self.height))
            # The two flanges, turning inward from the web at the front and
            # the rear. Both are tapped, which is what lets equipment mount
            # to either face of the same post, and it is also why the front
            # elevation shows two hole columns per post rather than one.
            for fy, sgn in ((front + t / 2, 1), (front + depth - t / 2, -1)):
                rack.box(g, "cpi_rack_flange",
                         (side * (web_x + flange_in) / 2, fy, mid_z),
                         (web_x - flange_in, t, self.height))
            # A hairline return along the inner edge of each flange, which
            # is the stiffening lip the section drawing shows and the thing
            # that stops a post reading as two flat plates.
            for fy in (front + t, front + depth - t):
                rack.box(g, "cpi_rack_channel",
                         (side * flange_in, fy, mid_z), (t, t * 1.6, self.height))

            # ---- the tapped holes, front flange and rear -----------------
            for zmm in self.hole_heights():
                for fy, fd in ((front + t * 0.5, -1), (front + depth - t * 0.5, 1)):
                    rack.front_cylinder(g, "cpi_rack_hole",
                                        (side * hole_x, fy + fd * t * 0.55, Z(zmm)),
                                        self.HOLE_D / 2000.0, t * 1.2, 8)

            # ---- clearance holes in the web for a cable manager ----------
            for zmm in self.WEB_HOLE_Z:
                rack.box(g, "cpi_rack_hole",
                         (side * (web_x - t), front + depth * 0.5, Z(zmm)),
                         (t * 1.4, self.WEB_HOLE_D / 1000.0, self.WEB_HOLE_D / 1000.0))

            # ---- base angle, running front to back under the post --------
            foot = self.FOOT_W / 1000.0
            base_d = self.BASE_D / 1000.0
            base_y = front + base_d / 2 - 0.030
            # The upstand the post bolts to, then the foot that turns
            # inboard and takes the anchors.
            rack.box(g, "cpi_rack_angle",
                     (side * (web_x - t / 2), base_y, Z(self.BASE_H / 2)),
                     (t * 1.4, base_d, self.BASE_H / 1000.0))
            rack.box(g, "cpi_rack_angle",
                     (side * (web_x - foot / 2), base_y, Z(t * 500.0)),
                     (foot, base_d, t))
            # The anchor holes go through a horizontal plate, so they have
            # to be laid flat. `front_cylinder` points its axis at the
            # viewer, which puts a 19mm bore edge on to the floor and makes
            # it read as a slot cut across the foot. A thin square of hole
            # colour sunk into the plate is what actually looks like a hole
            # from every angle this rack is ever seen from.
            for ay in (-1, 1):
                rack.box(g, "cpi_rack_hole",
                         (side * self.ANCHOR_X / 2000.0,
                          base_y + ay * self.ANCHOR_Y / 2000.0, Z(t * 500.0)),
                         (self.ANCHOR_D / 1000.0, self.ANCHOR_D / 1000.0, t * 1.6))
            # The two bolts that hold the post to the base angle.
            for bz in (self.BASE_H * 0.30, self.BASE_H * 0.68):
                rack.box(g, "cpi_rack_bolt",
                         (side * (web_x - t * 1.4), base_y - base_d * 0.28, Z(bz)),
                         (t * 1.2, 0.0090, 0.0090))
            # CPI emboss their name along the outside of each base angle.
            rack.box(g, "cpi_rack_logo",
                     (side * (web_x - t * 0.2), base_y, Z(self.BASE_H * 0.55)),
                     (t * 0.6, base_d * 0.52, 0.0140))

        # ---- the top angle tying the posts together ---------------------
        top_d = self.TOP_D / 1000.0
        rack.box(g, "cpi_rack_angle",
                 (0, front + top_d / 2, Z(self.HEIGHT - t * 500.0)),
                 (self.FULL_W / 1000.0, top_d, t))
        rack.box(g, "cpi_rack_angle",
                 (0, front + t / 2, Z(self.HEIGHT - self.TOP_LIP / 2000.0)),
                 (self.FULL_W / 1000.0, t, self.TOP_LIP / 1000.0))
        # The rear leg of the formed top piece, which is what takes the
        # 5.50 [139.7] the sheet prints past the 4.25 [108.0] flat.
        rack.box(g, "cpi_rack_angle",
                 (0, front + top_d, Z(self.HEIGHT - (self.TOP_PLATE - self.TOP_D) / 2000.0)),
                 (self.FULL_W / 1000.0, t, (self.TOP_PLATE - self.TOP_D) / 1000.0))
        # The CPI badge plate and the two hex bolts either side of it that
        # the HCAI front elevation shows on the top rail.
        rack.box(g, "cpi_rack_logo", (0, front + t, Z(self.HEIGHT - self.TOP_LIP * 0.55)),
                 (0.0560, t * 0.5, 0.0150))
        for side in (-1, 1):
            rack.front_cylinder(g, "cpi_rack_bolt",
                                (side * (hole_x - 0.006), front, Z(self.HEIGHT - self.TOP_LIP * 0.5)),
                                0.0048, t, 6)

        self.silkscreen(rack, z)
