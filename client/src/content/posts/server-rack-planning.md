
## Choosing a Rack

Server racks are measured in "U" units, where 1U equals 1.75 inches of vertical space. Common sizes are 42U (full height), 24U (half height), and 12U (quarter height). I run a 42U rack because I knew I would grow into it, and having empty space is better than outgrowing a smaller rack.

Important specifications: make sure it is a standard 19-inch wide rack with a depth of at least 36 inches (preferably 40+) to accommodate deep servers. Weight capacity matters too. A fully loaded R740 weighs about 60 pounds, and a rack full of them needs a frame rated for the load.

## Layout Planning

I planned my rack layout on paper before installing anything. The general rules:

- **Heavy equipment goes at the bottom.** Servers and UPS units are the heaviest items and should be low for stability.
- **Networking equipment goes at the top.** Switches, patch panels, and cable management sit at the top where cable runs are shortest.
- **Leave space between sections.** 1U blanking panels between groups of equipment improve airflow and organization.
- **Power distribution on the sides.** Vertical PDUs mount on the rear rack rails and keep power cables organized.

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

## Power Planning

I calculated total power draw before installing anything. Each circuit in my house is rated for 15A at 120V, which is 1,800 watts. My rack draws about 1,300 watts under typical load, leaving headroom for peaks. If I add more equipment, I will need a dedicated circuit.

## Cooling

The rack is in a closet with forced-air ventilation. I added a vent fan at the top of the closet door to exhaust hot air into the room. A temperature sensor inside the rack triggers an alert if ambient temperature exceeds 85 degrees Fahrenheit.

## Lessons Learned

Buy more rack than you think you need. Label everything during installation, not after. And always test power and network before racking a server. Debugging a cabling issue with a 60-pound server on rails is miserable.
