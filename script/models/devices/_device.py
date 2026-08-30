"""One real product, modelled from photographs of that product.

Every device in this library used to come out of one `panel_shell` call:
the same folded box, the same ears, the same crease line, with a different
number of holes punched in the front. That is why a Catalyst and a Nexus
and a PowerEdge all read as the same object in three greys. Real hardware
does not work like that. A Catalyst 9300 has a hinged blue uplink module
seam and a slab of status LEDs at the far left; a Nexus 9336C is thirty
six QSFP cages in two rows and almost nothing else; a PowerEdge is a wall
of drive carriers with one small control cluster. Those are not the same
box with different holes.

So each product gets its own module and its own `build`, written while
looking at photographs of that product, and the reference images it was
drawn from are recorded on the class so the next person can check the
work.

WHAT IS STILL SHARED, and why that is not the same shortcut: true
primitives. An M6 cage screw is the same screw in a Cisco rack and a
Juniper one. An 8P8C jack is the same moulding whoever solders it down.
An SFP+ cage is a MSA part with a published outline. Drawing a different
screw per vendor would be inventing a difference that does not exist,
which is the same error as pretending a difference away. The line is:
share the parts that are genuinely identical, never the chassis.
"""

from __future__ import annotations

from dataclasses import dataclass, field


U = 0.04445
"""One rack unit, in metres. EIA-310."""

PANEL_W = 0.4826
"""Width across the mounting ears of a 19 inch panel, in metres."""


@dataclass
class Reference:
    """A photograph this model was drawn from."""

    url: str
    note: str = ""


class Device:
    """Base for one product. Subclass it, do not extend it.

    The base deliberately draws nothing. It holds the facts about the
    product and gives the subclass a coordinate frame; every millimetre of
    geometry belongs to the subclass, because every product is its own
    shape.

    Coordinates match the rack builders: x across the face, y into the
    rack with the front at `front_y`, z up. `build` is handed the rack it
    is being mounted in and the z of its own vertical centre.
    """

    #: Node group name in the GLB. Must equal the device id in the rack
    #: definition, or the model and the elevation disagree and CI fails.
    slug: str = ""
    #: The product name as its vendor writes it.
    name: str = ""
    #: Rack units, from the vendor.
    u: int = 1
    #: Chassis depth in metres, from the vendor.
    depth: float = 0.4
    #: Width of the chassis body itself, which is not the width across the
    #: ears. Most 19 inch equipment is 440 to 448mm across the body.
    width: float = 0.442
    #: The page the dimensions and port counts came from.
    source: str = ""
    #: Photographs this was modelled from.
    references: list[Reference] = []

    @property
    def height(self) -> float:
        """Panel height, one hair under the full unit so units do not touch."""
        return self.u * U - 0.0015

    def build(self, rack, z: float) -> None:
        """Draw this product. Every subclass overrides this."""
        raise NotImplementedError(f"{type(self).__name__} has no geometry yet")
