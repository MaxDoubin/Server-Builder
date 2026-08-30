"""MikroTik CRS326-24S+2Q+RM, drawn from MikroTik's own product photography.

An all optics switch, and it looks nothing like the copper CRS326 that
shares its model number. Twenty four SFP+ cages fill the left two thirds in
three ganged blocks of eight, four columns two deep, and two QSFP+ cages
stand alone beside them. There is no copper on the front except the two
management jacks.

What the photographs show, working left to right:

  A pale cool grey panel, near enough the same grey as the folded rack ear
  bolted to each end, each ear pierced by two rounded capsule slots. The
  lid overhangs the panel with CLOUD SWITCH embossed across it and two wire
  bail handles standing up near the front edge.

  Three optics blocks. Each is a near black recess with a hairline pale
  frame, and inside it eight cages: four columns, a top row and a bottom
  row. Every cage carries a white card edge connector on the edge that
  faces the middle of the block, so the top row wears its white bar low and
  the bottom row wears it high. The bottom cages also show three small
  green contact pads along their outer edge.

  Between the two rows of every block runs a raised mid grey lamp strip,
  and on it four solid triangles per column, alternating down and up, so
  each port gets a pair. That strip and those triangles are the single most
  MikroTik thing on the panel: without the strip the triangles float on the
  black recess and read as smudges. Port numbers are silkscreened even
  above and odd below, and SFP+ is set vertically in the gap between blocks.

  Then the QSFP+ block, two cages stacked, with its own lamp strip carrying
  a triangle at each end and eight small lane squares in two rows between
  them, and 40G QSFP+ set vertically beside it.

  Then a bright framed housing with CONSOLE above and MGMT/BOOT below, a
  small round reset button, a vertical USB A, and a column of four domed
  lamps: USER green, FAULT red, PWR 2 and PWR 1 blue, each named in type to
  its right.

  The right sixth of the panel is empty except for Cloud Router Switch in
  a heavy italic, the model number under it, and the MikroTik wordmark low
  down, its i dotted with the little signal arc.

Nothing here is shared with another product. The cages, the lamp strip,
the triangles, the domes and every material are drawn in this file,
because a MikroTik optics block sunk in a black recess does not look like
the same MSA cage stamped into a Juniper faceplate, and one generic cage
on every rack is what made these read as fake.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class CRS326_24S_2Q(Device):
    slug = "CRS326_24S_2Q"
    name = "MikroTik CRS326-24S+2Q+RM"
    u = 1
    #: MikroTik publish 443 x 200 x 44 mm for this chassis.
    width = 0.443
    depth = 0.200
    source = "https://mikrotik.com/product/crs326_24s_2q_rm"
    references = [
        Reference("https://cdn.mikrotik.com/web-assets/rb_images/1831_hi_res.png",
                  "front on, 3000x1200, whole panel including both rack ears"),
        Reference("https://cdn.mikrotik.com/web-assets/rb_images/1832_hi_res.png",
                  "second studio view, confirms the lid bails and ear profile"),
    ]

    def face(self, rack) -> float:
        """The plane of the front panel, which is not `front_y`.

        The panel is drawn as a 10mm slab centred on the rack's front, so
        the surface everything is measured from stands 5mm proud of that.
        Measure detail from `front_y` instead and all of it is buried
        inside the slab.
        """
        return rack.front_y - 0.0050

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes, sampled off photograph 1831.

        Every figure below was read off the render and then multiplied in
        linear light by 1.289, the one factor that puts this photograph's
        panel white on 222. MikroTik light their studio renders differently
        from shot to shot: the same case measures 196 here and 157 on the
        copper CRS326, and left uncorrected the six switches modelled from
        those shots would sit in one rack in six different whites.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # 196 raw, and faintly blue rather than the warm off white the
            # CRS354 wears. The ear measures within a level of the panel,
            # so it is the fold shadow and not a paint difference that
            # separates them in the photograph.
            "mt24s_panel": pbr("CRS326-24S Panel", [220, 220, 226, 255], 0.14, 0.56),
            "mt24s_lid": pbr("CRS326-24S Lid", [226, 226, 231, 255], 0.16, 0.50),
            "mt24s_ear": pbr("CRS326-24S Ear", [217, 217, 223, 255], 0.20, 0.48),
            "mt24s_bail": pbr("CRS326-24S Lid Bail", [176, 178, 182, 255], 0.68, 0.34),
            # The recess an optics block is sunk into: 19 raw, near black.
            # Painting this a mid grey is what turns a bank of cages into a
            # slab with squares printed on it.
            "mt24s_recess": pbr("CRS326-24S Block Recess", [22, 22, 21, 255], 0.18, 0.72),
            "mt24s_frame": pbr("CRS326-24S Block Frame", [169, 170, 175, 255], 0.34, 0.46),
            # The raised strip between the two cage rows, 130 raw. Solidly
            # lighter than the recess and solidly darker than the panel,
            # which is the whole reason the triangles on it are legible.
            "mt24s_lampbar": pbr("CRS326-24S Lamp Strip", [145, 145, 148, 255], 0.22, 0.52),
            "mt24s_qsfp_bar": pbr("CRS326-24S QSFP Strip", [104, 104, 107, 255], 0.24, 0.54),
            "mt24s_cage": pbr("CRS326-24S Cage", [63, 62, 64, 255], 0.50, 0.46),
            "mt24s_bore": pbr("CRS326-24S Cage Bore", [14, 14, 15, 255], 0.16, 0.88),
            # The card edge inside an empty cage. White plastic, and the
            # brightest thing anywhere in the optics block.
            "mt24s_edge": pbr("CRS326-24S Card Edge", [236, 236, 233, 255], 0.0, 0.50),
            "mt24s_pad": pbr("CRS326-24S Contact Pad", [64, 104, 78, 255], 0.30, 0.56),
            # The management housing is a bright frame, visibly paler than
            # the frames around the optics blocks.
            "mt24s_bright": pbr("CRS326-24S Bright Frame", [233, 233, 236, 255], 0.24, 0.42),
            "mt24s_jack": pbr("CRS326-24S Jack Shell", [30, 30, 31, 255], 0.10, 0.74),
            "mt24s_throat": pbr("CRS326-24S Jack Throat", [8, 8, 9, 255], 0.06, 0.92),
            "mt24s_shield": pbr("CRS326-24S Jack Shield", [138, 139, 141, 255], 0.60, 0.38),
            "mt24s_gold": pbr("CRS326-24S Jack Contacts", [190, 154, 78, 255], 0.84, 0.26),
            "mt24s_silk": pbr("CRS326-24S Silkscreen", [96, 97, 99, 255], 0.05, 0.70),
            "mt24s_reset": pbr("CRS326-24S Reset", [57, 58, 60, 255], 0.28, 0.46),
            "mt24s_usb": pbr("CRS326-24S USB Shell", [46, 47, 49, 255], 0.44, 0.48),
            "mt24s_usb_tongue": pbr("CRS326-24S USB Tongue", [222, 222, 220, 255], 0.0, 0.44),
            # Domes, not lamps. These are moulded lenses photographed dark,
            # so the emissive stays low or a switch at idle lights a rack.
            "mt24s_dome_green": pbr("CRS326-24S User Dome", [119, 139, 107, 255], 0.0, 0.20,
                                    emissive=[0.05, 0.16, 0.05]),
            "mt24s_dome_red": pbr("CRS326-24S Fault Dome", [142, 62, 64, 255], 0.0, 0.20,
                                  emissive=[0.14, 0.02, 0.02]),
            "mt24s_dome_blue": pbr("CRS326-24S Power Dome", [67, 96, 138, 255], 0.0, 0.20,
                                   emissive=[0.03, 0.07, 0.18]),
            "mt24s_led_green": pbr("CRS326-24S Jack Green", [86, 168, 104, 255], 0.0, 0.22,
                                   emissive=[0.05, 0.22, 0.09]),
            "mt24s_led_amber": pbr("CRS326-24S Jack Amber", [196, 168, 72, 255], 0.0, 0.24,
                                   emissive=[0.20, 0.14, 0.02]),
        })

    # ------------------------------------------------------------- measured
    #
    # Photograph 1831 calibrated against the one dimension a rack product
    # always publishes: 2742 pixels spanned the 482.6mm from ear edge to ear
    # edge on the panel's mid line, which puts a pixel at 0.17600mm. The
    # cross check is the body itself, 2522 pixels or 443.9mm against the
    # 443mm MikroTik publish, so every figure below is a measurement to
    # about two tenths of a millimetre.
    #
    # The render looks straight on but is not quite: 244 pixels of ear over
    # 44.45mm makes the vertical scale 3.4 percent shorter than the
    # horizontal. Vertical figures are therefore fractions of the measured
    # panel height rather than millimetres, which cancels the foreshortening
    # exactly, and horizontal figures are metres from the body's left edge.

    #: Top and bottom of the recess every optics block is sunk into.
    BLOCK_Z = (0.289, -0.310)
    #: The two cage rows inside a block, and the lamp strip between them.
    ROW_TOP = (0.281, 0.049)
    ROW_BOT = (-0.074, -0.302)
    #: Port numbers: even above the top row, odd below the bottom.
    UPPER_Z, LOWER_Z = 0.359, -0.380

    #: Twelve SFP+ columns: first centre, pitch, and the extra a block
    #: boundary adds at every fourth column. Measured centre to centre over
    #: all twelve rather than off one pair, which is how a half millimetre
    #: of pitch error turns into six millimetres by the far end.
    COL0, PITCH, GAP = 0.02387, 0.014327, 0.006019
    #: Left and right edge of each block, metres from the panel's left edge.
    BLOCK_X = ((0.01595, 0.07526), (0.07931, 0.13844), (0.14284, 0.20144))

    QSFP_X = (0.20760, 0.22784)
    MGMT_X = (0.23312, 0.25090)
    #: Reset button, USB and the column of four domes.
    RESET_X, RESET_Z, RESET_R = 0.2555, -0.217, 0.0021
    USB_X, USB_Z = (0.2602, 0.2683), (0.040, -0.319)
    DOME_X, DOME_R = 0.2735, 0.00167
    DOME_Z = (0.122, 0.004, -0.110, -0.228)

    def column_x(self, i: int) -> float:
        """Centre of SFP+ column `i`, metres from the panel's left edge."""
        return self.COL0 + i * self.PITCH + (i // 4) * self.GAP

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        Geometry cannot spell, and a row of little grey boxes where the
        numbers go reads as a row of little grey boxes. The sheet is 4096
        wide and whatever height holds the panel's own proportion, laid
        over exactly that panel, because square pixels stretched to fit
        make every letter a tenth wider than it is tall.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width                      # pixels per metre, both axes
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (96, 97, 99, 255)
        dark = (28, 28, 30, 255)

        def px(x_m):
            return x_m * ppm

        def py(frac):
            return (0.5 - frac) * H

        def fitted(text, mm_wide, bold=False):
            """A font at which `text` measures `mm_wide` across.

            The photograph gives every string a measured box, so fit to the
            box. Setting by cap height guesses the width and on the first
            pass ran the model number into the wordmark.
            """
            want = mm_wide / 1000 * ppm
            f = font(40, bold)
            got = d.textbbox((0, 0), text, font=f)[2]
            return font(max(8, round(40 * want / max(got, 1))), bold)

        def sized(mm_cap, bold=False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        def vertical(text, cx, cy, f, fill=ink):
            """Set `text` reading bottom to top, the way MikroTik run the
            group labels in the gaps between blocks."""
            b = d.textbbox((0, 0), text, font=f)
            tile = Image.new("RGBA", (b[2] - b[0] + 8, b[3] - b[1] + 8), (0, 0, 0, 0))
            ImageDraw.Draw(tile).text((4 - b[0], 4 - b[1]), text, font=f, fill=fill)
            tile = tile.rotate(90, expand=True)
            img.alpha_composite(tile, (round(cx - tile.width / 2), round(cy - tile.height / 2)))

        # ---- port numbers, even over the top row and odd under the bottom.
        f_num = sized(1.82)
        upper, lower = py(self.UPPER_Z), py(self.LOWER_Z)
        for i in range(12):
            cx = px(self.column_x(i))
            centred(str(i * 2 + 2), cx, upper, f_num)
            centred(str(i * 2 + 1), cx, lower, f_num)
        qc = px(sum(self.QSFP_X) / 2)
        centred("2", qc, upper, f_num)
        centred("1", qc, lower, f_num)

        # ---- group labels, set vertically in the gap to the right of each
        #      block. Measured at 1.6mm caps, smaller than the numbers.
        f_lab = sized(1.6)
        for _, right in self.BLOCK_X:
            vertical("SFP+", px(right + 0.0028), py(-0.010), f_lab)
        vertical("40G QSFP+", px(self.QSFP_X[1] + 0.0030), py(-0.010), f_lab)

        # ---- the management housing's two labels.
        mc = px(sum(self.MGMT_X) / 2)
        centred("CONSOLE", mc, upper, f_lab)
        centred("MGMT/BOOT", mc, lower, f_lab)
        centred("RESET", px(self.RESET_X), lower, f_lab)

        # ---- dome names, left aligned 4.3mm to the right of the domes.
        f_dome = sized(2.0)
        for label, zf in zip(("USER", "FAULT", "PWR 2", "PWR 1"), self.DOME_Z):
            b = d.textbbox((0, 0), label, font=f_dome)
            d.text((px(0.2778), py(zf) - (b[3] + b[1]) / 2), label, font=f_dome, fill=dark)

        # ---- the right sixth: product line, model, wordmark. All three are
        #      fitted to boxes measured off the photograph rather than set
        #      by eye, because this block is the only large type on the
        #      panel and a millimetre of drift in it is obvious.
        # Measured boxes: the product line runs 389.0 to 441.6mm, the model
        # number 410.3 to 441.2 and the wordmark 410.1 to 440.0, all of them
        # ending within three millimetres of the body's right edge. The
        # first pass read those boxes off a blob scan that had swallowed the
        # rack ear slot behind them, made every string 5mm too wide, and
        # printed the wordmark half off the panel.
        centred("Cloud Router Switch", px(0.4153), py(0.336),
                fitted("Cloud Router Switch", 52.6, True))
        centred("CRS326-24S+2Q+RM", px(0.42575), py(0.196),
                fitted("CRS326-24S+2Q+RM", 31.0))
        f_mark = fitted("MikroTik", 29.9)
        f_bold = font(f_mark.size, True)
        wx = px(0.4101)
        wtop = py(-0.354) - d.textbbox((0, 0), "M", font=f_bold)[3] / 2
        d.text((wx, wtop), "Mikro", font=f_mark, fill=dark)
        wx += d.textbbox((0, 0), "Mikro", font=f_mark)[2]
        d.text((wx, wtop), "Tik", font=f_bold, fill=dark)

        tex = save_texture("crs326_24s_silkscreen.png", img)
        rack.materials["mt24s_silktex"] = PBRMaterial(
            name="CRS326-24S Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.60,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "mt24s_silktex",
                            (0, self.face(rack) - 0.0010, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def block(self, rack, g, z, x0, x1, bright=False):
        """The recess a ganged group of ports is sunk into.

        Returns the recess centre and width so a caller can hang ports off
        it without recomputing them. `bright` picks the near white frame
        the management housing wears over the mid grey the optics blocks
        wear; they are two visibly different greys in the photograph and
        painting them alike loses the one thing that separates the right
        hand end of the panel from the rest.
        """
        y = self.face(rack)
        cx, w = (x0 + x1) / 2, x1 - x0
        top, bottom = self.BLOCK_Z
        cz = z + (top + bottom) / 2 * self.height
        hz = (top - bottom) * self.height
        # A hairline outline, not a border. At 0.8mm it swallowed the port
        # numbers, which are printed barely a millimetre clear of the
        # recess. On the optics blocks the photograph shows this outline
        # dark against the pale panel, not pale: the recess is what the eye
        # reads as the block edge. Only the management housing has the
        # bright frame, and that difference is most of what separates the
        # right hand end of this panel from the rest of it.
        rack.box(g, "mt24s_bright" if bright else "mt24s_recess",
                 (cx, y - 0.0007, cz), (w + 0.0009, 0.0007, hz + 0.0009))
        rack.box(g, "mt24s_recess", (cx, y - 0.0003, cz), (w, 0.0009, hz))
        return cx, w

    def lamp_strip(self, rack, g, z, x0, x1, mat="mt24s_lampbar"):
        """The raised strip between two cage rows, and its z in rack space."""
        y = self.face(rack)
        cz = z + (self.ROW_TOP[1] + self.ROW_BOT[0]) / 2 * self.height
        hz = (self.ROW_TOP[1] - self.ROW_BOT[0]) * self.height
        rack.box(g, mat, ((x0 + x1) / 2, y - 0.0010, cz), (x1 - x0, 0.0009, hz))
        return cz, hz

    def cage(self, rack, g, x, z, w, h, top_row, ribs=2, edge_inner=True, edge_w=0.36):
        """One empty SFP+ or QSFP+ mouth as this panel presents it.

        The two rows are the same casting inverted, so everything inside
        mirrors. Get that the wrong way round and a stack of cages looks
        printed rather than fitted.

        The card edge is what stops an empty cage reading as a black
        rectangle. It is white plastic and the brightest thing in the
        block, and leaving it out turns twenty four cages into holes.
        """
        y = self.face(rack)
        # The cage is a rim, and what fills the middle is darkness. Drawing
        # it as one slab across the whole opening, which the first pass did,
        # buries the bore behind it and twenty four cages come out as
        # twenty four grey tiles: the mouth measures 19 of 255 and the cage
        # metal around it 63, and losing that step loses the hole.
        rim = 0.0009
        for dx, dz, bw, bh in ((0, h / 2 - rim / 2, w, rim), (0, -h / 2 + rim / 2, w, rim),
                               (-w / 2 + rim / 2, 0, rim, h), (w / 2 - rim / 2, 0, rim, h)):
            rack.box(g, "mt24s_cage", (x + dx, y - 0.0015, z + dz), (bw, 0.0013, bh))
        rack.box(g, "mt24s_bore", (x, y - 0.0006, z), (w - rim * 2, 0.0020, h - rim * 2))
        rack.box(g, "mt24s_bore", (x, y + 0.0042, z), (w * 0.90, 0.0110, h * 0.86))
        # `toward` is the direction from the cage centre to the lamp strip,
        # so the top row and the bottom row mirror without a second code
        # path. An SFP+ carries its white card edge on that inner side and
        # its stamped roof ribs on the outer; the QSFP+ pair have it the
        # other way round, which is plain in the photograph and is why the
        # side is an argument rather than a constant.
        toward = -1.0 if top_row else 1.0
        edge_z = z + toward * h * (0.31 if edge_inner else -0.33)
        rib_z = z - toward * h * (0.31 if edge_inner else -0.31)
        for i in range(ribs):
            span = w * 0.78
            rx = x if ribs == 1 else x - span / 2 + (i + 0.5) * span / ribs
            rw = w * 0.76 if ribs <= 2 else span / ribs * 0.58
            rz = rib_z if ribs <= 2 else rib_z
            if ribs <= 2:
                rz = z + (rib_z - z) * (0.92 - 0.26 * i)
            rack.box(g, "mt24s_cage", (rx, y - 0.0019, rz), (rw, 0.0008, h * 0.05))
        rack.box(g, "mt24s_edge", (x, y - 0.0020, edge_z), (w * edge_w, 0.0008, h * 0.08))
        # Three contact pads along the outer lip of the bottom row only.
        # They are the one asymmetry between the rows in the photograph.
        if not top_row:
            for i in (-1, 0, 1):
                rack.box(g, "mt24s_pad", (x + i * w * 0.22, y - 0.0019, z - h * 0.40),
                         (w * 0.11, 0.0007, h * 0.09))

    def triangle(self, rack, g, x, z, s, up):
        """The solid triangle MikroTik use for a port lamp.

        Four stacked slivers rather than a real triangle. At 2.3mm the
        silhouette is all that reads and this costs a fraction of the
        geometry a proper prism would.
        """
        for i in range(4):
            # t runs down the triangle from its top edge, so the slivers
            # stack the same way for both orientations and only the width
            # law flips. Deriving dz from the orientation as well, which the
            # first pass did, cancelled the flip out and printed twenty four
            # columns of identical up triangles.
            t = (i + 0.5) / 4
            wide = s * t if up else s * (1 - t)
            rack.box(g, "mt24s_silk", (x, self.face(rack) - 0.0011, z + s * (0.5 - t)),
                     (max(wide, s * 0.14), 0.0007, s * 0.26))

    def rj45(self, rack, g, x, z, w, h, lamps):
        """One management jack: black moulding, nickel rim, gold well back.

        A jack reads as a hole, not a tile, so the shield is drawn as four
        thin rails around the mouth and what fills the middle is darkness.
        The darkness has to be pushed in front of the panel and then
        stepped back behind the rim, because a throat level with the panel
        loses the depth test and comes out as an empty outline.
        """
        y = self.face(rack)
        rim = 0.0010
        for dx, dz, bw, bh in ((0, h / 2 - rim / 2, w, rim), (0, -h / 2 + rim / 2, w, rim),
                               (-w / 2 + rim / 2, 0, rim, h), (w / 2 - rim / 2, 0, rim, h)):
            rack.box(g, "mt24s_shield", (x + dx, y - 0.0016, z + dz), (bw, 0.0013, bh))
        rack.box(g, "mt24s_throat", (x, y - 0.0008, z), (w - rim * 2, 0.0022, h - rim * 2))
        rack.box(g, "mt24s_throat", (x, y + 0.0046, z), (w * 0.82, 0.0086, h * 0.82))
        rack.box(g, "mt24s_jack", (x, y - 0.0020, z + h * 0.34), (w * 0.30, 0.0011, h * 0.22))
        tongue = z - h * 0.14
        rack.box(g, "mt24s_jack", (x, y - 0.0019, tongue), (w * 0.68, 0.0006, h * 0.36))
        for i in range(8):
            cx = x - w * 0.28 + i * (w * 0.56 / 7)
            rack.box(g, "mt24s_gold", (cx, y - 0.0021, tongue), (w * 0.040, 0.0005, h * 0.30))
        # Only the management jack is lamped. Console is the one jack on
        # this panel with nothing lit in it.
        if lamps:
            for dx, mat in ((-w * 0.31, "mt24s_led_green"), (w * 0.31, "mt24s_led_amber")):
                rack.box(g, mat, (x + dx, y - 0.0021, z - h * 0.37), (w * 0.20, 0.0010, h * 0.13))

    # --------------------------------------------------------------- build

    def build(self, rack, z: float) -> None:
        g = self.slug
        self.register(rack)
        y = self.face(rack)
        h, w = self.height, self.width

        def X(from_left):
            return -w / 2 + from_left

        def Z(frac):
            return z + frac * h

        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.010, self.depth, h * 0.92))
        rack.rounded_prism(g, "mt24s_panel", (0, rack.front_y, z), (w, 0.0100, h),
                           radius=0.0011, bevel=0.0005, steps=6)

        # The lid overhangs the panel and carries two wire bail handles,
        # which the studio shot photographs standing up. They are drawn
        # folded flat here: raised they reach 7mm above a 44mm lid, which no
        # unit in a rack can do without fouling the one above it, and the
        # first render had two grey barbells hovering over the panel.
        rack.box(g, "mt24s_lid", (0, y + 0.012 + self.depth * 0.30, z + h * 0.47),
                 (w - 0.012, self.depth * 0.62, 0.0018))
        for bx in (0.061, 0.157):
            rack.box(g, "mt24s_bail", (bx, y + 0.026, z + h * 0.485), (0.026, 0.0130, 0.0020))
            for sx in (-0.012, 0.012):
                rack.box(g, "mt24s_bail", (bx + sx, y + 0.020, z + h * 0.485),
                         (0.0020, 0.0130, 0.0020))

        # Rack ears: a folded plate each end, 19.8mm of overhang either side
        # of the 443mm body to reach 482.6mm across, each with two rounded
        # capsule slots measured at 14.8 by 6.0mm.
        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0099)
            rack.rounded_prism(g, "mt24s_ear", (ex, y + 0.0012, z), (0.0198, 0.0080, h * 0.99),
                               radius=0.0014, bevel=0.0005, steps=6)
            # The fold between ear and body. Ear and panel measure within a
            # level of each other, so this shadow is the only thing in the
            # photograph that says where one stops and the other starts.
            rack.box(g, "mt24s_frame", (sx * w / 2, y + 0.0006, z), (0.0009, 0.0060, h * 0.98))
            for dz in (0.370, -0.352):
                rack.rounded_prism(g, "mt24s_recess", (ex, y - 0.0026, Z(dz)),
                                   (0.0148, 0.0028, 0.0060),
                                   radius=0.0028, bevel=0.0006, steps=8)

        # ---- the three optics blocks -----------------------------------
        cage_w = self.PITCH * 0.94
        top_c = (self.ROW_TOP[0] + self.ROW_TOP[1]) / 2
        bot_c = (self.ROW_BOT[0] + self.ROW_BOT[1]) / 2
        top_h = (self.ROW_TOP[0] - self.ROW_TOP[1]) * h
        bot_h = (self.ROW_BOT[0] - self.ROW_BOT[1]) * h
        # The light grey strip in the gap to the right of every block. It is
        # what the vertical SFP+ label is printed on, and without it the
        # label floats on bare panel and the three blocks read as one.
        for bx0, bx1 in self.BLOCK_X + (self.QSFP_X,):
            top, bottom = self.BLOCK_Z
            rack.box(g, "mt24s_lampbar",
                     (X(bx1 + 0.0025), y - 0.0006, Z((top + bottom) / 2)),
                     (0.0034, 0.0008, (top - bottom) * h))
        for grp, (bx0, bx1) in enumerate(self.BLOCK_X):
            self.block(rack, g, z, X(bx0), X(bx1))
            lamp_z, _ = self.lamp_strip(rack, g, z, X(bx0), X(bx1))
            for col in range(4):
                cx = X(self.column_x(grp * 4 + col))
                self.cage(rack, g, cx, Z(top_c), cage_w, top_h, True)
                self.cage(rack, g, cx, Z(bot_c), cage_w, bot_h, False)
                # Four triangles a column at a measured 2.55mm pitch,
                # alternating down and up so each port owns a pair.
                for k in range(4):
                    self.triangle(rack, g, cx + (k - 1.5) * 0.00255, lamp_z, 0.0023,
                                  up=(k % 2 == 1))

        # ---- the QSFP+ block -------------------------------------------
        qx0, qx1 = self.QSFP_X
        self.block(rack, g, z, X(qx0), X(qx1))
        qlz, qlh = self.lamp_strip(rack, g, z, X(qx0), X(qx1), "mt24s_qsfp_bar")
        qcx = X((qx0 + qx1) / 2)
        qcw = (qx1 - qx0) * 0.88
        # The QSFP+ mouth is the other way up from an SFP+: one wide card
        # edge along the outer lip and five stamped tabs along the inner.
        self.cage(rack, g, qcx, Z(top_c), qcw, top_h, True, ribs=5,
                  edge_inner=False, edge_w=0.86)
        self.cage(rack, g, qcx, Z(bot_c), qcw, bot_h, False, ribs=5,
                  edge_inner=False, edge_w=0.86)
        # A triangle at each end of the strip and eight lane squares in two
        # rows between them, one row per port. The first pass drew a single
        # row and the block read as a QSFP with half its lanes missing.
        self.triangle(rack, g, X(0.2111), qlz, 0.0023, up=True)
        self.triangle(rack, g, X(0.2245), qlz, 0.0023, up=False)
        for row in (1, -1):
            for k in range(4):
                rack.box(g, "mt24s_silk", (X(0.2130 + k * 0.00275), y - 0.0012,
                                           qlz + row * qlh * 0.24),
                         (0.0019, 0.0007, qlh * 0.30))

        # ---- console above, management below ---------------------------
        mx0, mx1 = self.MGMT_X
        mcx, mcw = self.block(rack, g, z, X(mx0), X(mx1), bright=True)
        self.rj45(rack, g, mcx, Z(top_c), mcw * 0.78, top_h, lamps=False)
        self.rj45(rack, g, mcx, Z(bot_c), mcw * 0.78, bot_h, lamps=True)

        # ---- reset, USB and the four domes -----------------------------
        rack.front_cylinder(g, "mt24s_reset", (X(self.RESET_X), y - 0.0014, Z(self.RESET_Z)),
                            self.RESET_R, 0.0015, 20)
        ux0, ux1 = self.USB_X
        uz0, uz1 = self.USB_Z
        ucx, ucz = X((ux0 + ux1) / 2), Z((uz0 + uz1) / 2)
        uw, uh = ux1 - ux0, (uz0 - uz1) * h
        # A vertical USB A reads light, not dark: a hairline black outline,
        # a nickel shell filling most of it and a white tongue down the
        # middle. Drawn as a dark slab with a white bar on it, which is what
        # the first two passes did, it becomes the blackest thing on a white
        # panel and pulls the eye off the ports entirely.
        rack.box(g, "mt24s_usb", (ucx, y - 0.0010, ucz), (uw, 0.0010, uh))
        rack.box(g, "mt24s_shield", (ucx, y - 0.0014, ucz), (uw - 0.0008, 0.0010, uh - 0.0008))
        rack.box(g, "mt24s_throat", (ucx, y - 0.0016, ucz), (uw * 0.56, 0.0010, uh * 0.74))
        rack.box(g, "mt24s_usb_tongue", (ucx - uw * 0.09, y - 0.0018, ucz - uh * 0.05),
                 (uw * 0.24, 0.0009, uh * 0.56))
        for zf, mat in zip(self.DOME_Z, ("mt24s_dome_green", "mt24s_dome_red",
                                         "mt24s_dome_blue", "mt24s_dome_blue")):
            rack.front_cylinder(g, mat, (X(self.DOME_X), y - 0.0013, Z(zf)),
                                self.DOME_R, 0.0014, 20)

        self.silkscreen(rack, z)
