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

NOTHING IS SHARED, including the connectors, and the reasoning that said
otherwise is worth recording because it was wrong in an instructive way.

The argument for sharing went: an SFP+ cage is an MSA part with a
published outline, an 8P8C jack is one moulding whoever solders it down,
so drawing a different one per vendor invents a difference that does not
exist. Every clause of that is true about the plug interface, and the
plug interface is not what anybody looks at. What you see on a front
panel is the vendor sheet metal around the connector, and that is not
standardised at all. Cisco stamps its cages into the panel with a flange
and a coloured bail latch. MikroTik mills a recess and silkscreens the
port number above it in their own typeface. Ubiquiti sinks its jacks in a
black inset band with the indicators built into the jack corners. Juniper
uses a raised lip and puts the lamps somewhere else entirely.

One jackRim and one sfpCage at fixed proportions went onto all six racks,
and the result reads as a generic port on every one of them, because a
generic port is exactly what it is. So each product draws its own
connectors at its own proportions from its own photographs, along with
everything else. If two products genuinely share a detail, that will show
up as two pieces of code that happen to agree, which is honest, rather
than one piece of code asserting a sameness nobody checked.
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
