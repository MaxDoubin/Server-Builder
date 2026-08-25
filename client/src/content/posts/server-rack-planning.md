
## Choosing a Rack

Server racks are measured in "U" units, where 1U equals 1.75 inches of vertical space. Common sizes are 42U (full height), 24U (half height), and 12U (quarter height). I run a 42U rack because I knew I would grow into it, and having empty space is better than outgrowing a smaller rack.

Important specifications: make sure it is a standard 19-inch wide rack with a depth of at least 36 inches (preferably 40+) to accommodate deep servers. Weight capacity matters too. A fully loaded R740 weighs about 60 pounds, and a rack full of them needs a frame rated for the load.

The 19 inch figure is the distance between the mounting rails, not the width of the rack, and it is the one dimension that is genuinely standard. Everything else varies. The hole spacing is the part worth knowing: rack holes come in a repeating group of three per U, spaced 0.625, 0.625 and 0.5 inches apart. That asymmetry is why a panel mounted one hole off will not line up with anything above it, and why the U boundaries are marked on good rails.

Square hole, round hole and threaded rails are not interchangeable. Square hole with cage nuts is the modern default and the one to buy, because it takes any screw size and every rail kit ships for it. Threaded rails lock you to a thread pitch and strip if you overtighten them.

## Depth is the specification people get wrong

Width is standard. Depth is not, and it is where a rack purchase actually fails.

Measure from the front rail to the back of the longest thing you own, then add space behind it for power cords, which do not bend flat. A 2U server at 29 inches wants a good 34 inches of rail-to-rail depth once the cable is in, and the four-post rail kit needs the rear posts inside its adjustment range. Rail kits usually cover something like 24 to 36 inches. Outside that they simply do not fit, and there is no workaround.

Two-post racks exist and are fine for switches and patch panels. They are not fine for a 60 pound server, whatever the shelf claims.

## Layout Planning

I planned my rack layout on paper before installing anything. The general rules:

- **Heavy equipment goes at the bottom.** Servers and UPS units are the heaviest items and should be low for stability.
- **Networking equipment goes at the top.** Switches, patch panels, and cable management sit at the top where cable runs are shortest.
- **Leave space between sections.** 1U blanking panels between groups of equipment improve airflow and organization.
- **Power distribution on the sides.** Vertical PDUs mount on the rear rack rails and keep power cables organized.

Two of those deserve expanding, because the reasoning matters more than the rule.

The weight rule is about the centre of gravity, and it is a safety rule rather than a tidiness one. A UPS is the densest object in the rack, often 60 to 100 pounds in 2U, and putting it at the top of a four-post frame on castors makes a genuinely dangerous object. Batteries at the bottom, always.

The blanking panel rule is not about organisation at all, despite how I wrote it originally. An open U in a populated rack is a short circuit for air: exhaust from the back is at lower pressure than the cold front, so hot air flows through the gap and straight back into the intake of whatever is above it. Blanking panels are cheap and they measurably drop intake temperatures. Fill every gap in front of running equipment, not just the ones that look untidy.

## My Layout (Top to Bottom)

- 1U: Patch panel
- 1U: Mikrotik 10GbE switch
- 1U: Cisco switch
- 1U: Blank
- 5U: Mac Pro (rack-mount)
- 1U: Blank
- 2U: Dell R740 #1
- 2U: Dell R740 #2
- 1U: Blank
- 2U: UPS
- Remaining: Empty (future expansion)

## Airflow decides the layout more than aesthetics do

Rack equipment is overwhelmingly front to back: cold in the front, hot out the back. The whole discipline of rack layout follows from keeping those two air masses apart.

That is what hot aisle and cold aisle containment means at scale, and the principle does not stop applying because the rack is in a closet. If your rack faces a wall and exhausts into a corner, the hot air has nowhere to go and comes back around the side. Give the exhaust a path out of the room.

Switches are the awkward exception. Many of them blow side to side, and some blow back to front, which puts their intake in the hot aisle. Check the airflow direction before choosing where a switch lives; several vendors sell the same model in both directions for exactly this reason.

## Power Planning

I calculated total power draw before installing anything. Each circuit in my house is rated for 15A at 120V, which is 1,800 watts. My rack draws about 1,300 watts under typical load, leaving headroom for peaks. If I add more equipment, I will need a dedicated circuit.

One correction to that arithmetic worth making explicit: a branch circuit should be loaded to 80 percent of its rating for a continuous load, which is anything running three hours or more. A rack is the definition of a continuous load. So a 15A circuit is 1,440 usable watts, not 1,800, and my 1,300W typical draw is much closer to the limit than the raw number suggests.

## Heat follows power, exactly

Essentially all the electrical power a rack consumes leaves it as heat. The conversion is a definition rather than an estimate: one watt is 3.412142 BTU per hour. A 1,300W rack is therefore about 4,436 BTU/hr, continuously.

For comparison, a ton of refrigeration is 3,516.85 watts, so that rack is roughly 0.37 tons of cooling load sitting in a closet. A typical bedroom window unit is 0.5 to 1 ton, which is the honest way to understand why a closet with a vent fan works for one rack and stops working for two.

## Cooling

The rack is in a closet with forced-air ventilation. I added a vent fan at the top of the closet door to exhaust hot air into the room. A temperature sensor inside the rack triggers an alert if ambient temperature exceeds 85 degrees Fahrenheit.

Measure at the intake, not in the middle of the rack, because intake temperature is what the equipment actually experiences and what the vendor's operating range refers to. A sensor dangling in the warm middle of a rack tells you something is hot without telling you whether anything is out of spec.

## Lessons Learned

Buy more rack than you think you need. Label everything during installation, not after. And always test power and network before racking a server. Debugging a cabling issue with a 60-pound server on rails is miserable.

Two more, learned since:

Leave a U free above anything you expect to service. Rails let a server slide out, but hands need room above it to get the lid off, and the machine you most want to open is always the one wedged between two others.

Do the weight sum before you fill the top half. Frames have a static load rating and castors have their own, usually lower, and a rack that is fine standing still can be a problem the day you try to roll it.

## References

- https://en.wikipedia.org/wiki/19-inch_rack
- https://en.wikipedia.org/wiki/Rack_unit
- https://en.wikipedia.org/wiki/Data_center
- https://en.wikipedia.org/wiki/British_thermal_unit
- https://en.wikipedia.org/wiki/Ton_of_refrigeration
- https://en.wikipedia.org/wiki/Computer_cooling
