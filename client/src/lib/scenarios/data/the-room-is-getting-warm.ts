import type { Scenario } from "../types";

/** A cooling failure, where physics sets the deadline and nobody can extend it. */
export const theRoomIsGettingWarm: Scenario = {
  slug: "the-room-is-getting-warm",
  title: "The Room Is Getting Warm",
  tagline: "Both CRAC units are down. Inlet temperature is climbing 1.4 degrees a minute.",
  difficulty: "hard",
  category: "Availability",
  role: "You are the duty engineer at a small colocation facility. There are 34 racks, 11 customers, and one of you.",
  clockStart: "Saturday 13:20",
  brief: [
    "The building management system alarmed at 13:14. Both computer room air conditioning units have tripped. The chilled water loop is at 26 degrees against a setpoint of 7.",
    "Cold aisle inlet is 29 degrees and rising about 1.4 degrees a minute. ASHRAE's recommended envelope tops out at 27. Most equipment starts throttling in the mid-thirties and shutting down around 40.",
  ],
  start: "the-alarm",
  reading: [
    { label: "Power and cooling, measured rather than assumed", href: "/blog/power-consumption-monitoring" },
    { label: "Building a monitoring system that watches itself", href: "/blog/network-monitoring-system-build" },
  ],
  scenes: [
    {
      id: "the-alarm",
      mood: "critical",
      where: "The BMS panel",
      body: [
        "You have roughly eight minutes before the first equipment starts protecting itself, and about fifteen before it stops being a decision you get to make.",
      ],
      evidence: [
        {
          kind: "alert",
          title: "BMS, 13:14 to 13:20",
          lines: [
            "13:14:02  CRAC-1  FAULT  compressor high pressure trip",
            "13:14:02  CRAC-2  FAULT  compressor high pressure trip",
            "13:14:40  CHW loop supply 8.1C -> rising",
            "13:20:00  CHW loop supply 26.4C",
            "13:20:00  Cold aisle A inlet 29.1C   (was 21.0 at 13:14)",
            "13:20:00  Chiller CH-1  RUNNING, condenser fan bank 2: FAULT",
            "13:20:00  Ambient outside: 34C",
          ],
        },
      ],
      choices: [
        { label: "Both tripped at the same second, so look upstream at the chiller", to: "upstream", cost: 3 },
        { label: "Start shutting down non-critical load to buy time", to: "shed-load", cost: 6 },
        { label: "Open the doors and get every fan you can find in there", to: "doors", cost: 4 },
        { label: "Try to reset the CRAC units", to: "reset-crac", cost: 5 },
      ],
    },
    {
      id: "upstream",
      mood: "critical",
      where: "The chiller, on the roof",
      body: [
        "Two identical units tripping in the same second is not two failures, it is one. The chiller is running but cannot reject heat: one of its two condenser fan banks has failed, and at 34 degrees outside the remaining bank cannot keep head pressure down.",
        "The CRACs tripped on high pressure because the water they were given was 26 degrees, which is doing their job.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "CH-1 fault log",
          lines: [
            "13:11:50  Condenser fan bank 2: VFD fault, overcurrent",
            "13:12:30  Head pressure rising, capacity limited to 48%",
            "13:14:00  CHW supply setpoint not achievable",
            "",
            "Fan bank 2 last serviced: 2024-06 (annual PM overdue since June)",
          ],
        },
      ],
      choices: [
        { label: "Shed load now, and call the chiller contractor while it drops", to: "shed-load", cost: 4 },
        { label: "Try to restart fan bank 2 from the VFD panel", to: "vfd", cost: 6 },
        { label: "Call the contractor and wait for them", to: "end-waited-for-contractor", cost: 95 },
      ],
    },
    {
      id: "vfd",
      mood: "critical",
      where: "The VFD panel on the roof",
      body: [
        "The fault clears on reset and the bank runs for forty seconds before tripping again on overcurrent. A bearing has gone; it is not coming back today.",
        "Six minutes spent. Inlet is 37.4.",
      ],
      choices: [
        { label: "Shed load, hard and now", to: "shed-load", cost: 3 },
        { label: "Open the doors and force air through", to: "doors", cost: 3 },
      ],
    },
    {
      id: "shed-load",
      mood: "critical",
      where: "The customer list, sorted by kW",
      body: [
        "Half the heat in the room is four racks: a rendering cluster, a batch analytics job, and two racks of development infrastructure. None of it is customer-facing.",
        "Shutting those four takes the room's load from 118kW to 61kW, which the crippled chiller can just about hold.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Rack load, top of the list",
          lines: [
            "RACK   CUSTOMER        kW    TIER   NOTE",
            "B04    Halden Media   19.2   dev    render farm, batch",
            "B05    Halden Media   17.8   dev    render farm, batch",
            "C11    Orbit Analytics 12.4  dev    nightly batch, idle SLA",
            "C12    Orbit Analytics  7.9   dev    nightly batch, idle SLA",
            "A01-A09 (nine racks)   38.1   prod   customer facing, 24/7 SLA",
            "others                 22.6   mixed",
          ],
        },
      ],
      choices: [
        { label: "Shut those four now and tell the customers afterwards", to: "shed-done", cost: 5 },
        { label: "Ring both customers for permission first", to: "asked-permission", cost: 22 },
        { label: "Shut everything, it is simpler and safer", to: "end-shut-everything", cost: 12 },
      ],
    },
    {
      id: "shed-done",
      mood: "tense",
      where: "Four racks powered down",
      body: [
        "Load drops to 61kW by 13:31. Inlet peaks at 41.2 and starts falling. Two storage arrays had already thermally throttled and one blade chassis shut itself down cleanly.",
        "By 13:50 the room is at 24 degrees on half its cooling capacity. Nothing customer-facing was lost.",
      ],
      choices: [
        { label: "Get temporary chillers on site before Monday's load returns", to: "temporary", cost: 180 },
        { label: "The room is stable. Wait for the contractor on Monday", to: "end-stable-but-fragile", cost: 0 },
      ],
    },
    {
      id: "asked-permission",
      mood: "critical",
      where: "On the phone, twice",
      body: [
        "Halden Media's out of hours number goes to voicemail. Orbit Analytics answer, escalate internally, and call back after eleven minutes to agree.",
        "Twenty-two minutes at 1.4 degrees a minute. Inlet reached 48 before you shut anything down.",
      ],
      choices: [
        { label: "Shut them all down now regardless", to: "shed-done", cost: 4 },
        { label: "Shut only the customer who agreed", to: "end-half-shed", cost: 4 },
      ],
    },
    {
      id: "doors",
      mood: "critical",
      where: "Doors open, pedestal fans running",
      body: [
        "At 34 degrees outside, opening the doors is importing heat. It moves air around and lowers nothing, and it destroys the hot and cold aisle separation that was the only thing still working in your favour.",
        "Inlet rises faster after you do it, not slower.",
      ],
      choices: [
        { label: "Close them and shed load instead", to: "shed-load", cost: 4 },
        { label: "Keep going, moving air must help", to: "end-doors-open", cost: 20 },
      ],
    },
    {
      id: "reset-crac",
      mood: "critical",
      where: "Both CRAC panels",
      body: [
        "Both reset. Both run for about ninety seconds and trip again on high pressure, because they are being fed 26 degree water and that is what a high pressure trip is for.",
        "Five minutes spent resetting a protection device that is working correctly. Inlet is 36.1.",
      ],
      choices: [
        { label: "Stop resetting them and look upstream", to: "upstream", cost: 3 },
        { label: "Shed load", to: "shed-load", cost: 4 },
      ],
    },
    {
      id: "temporary",
      mood: "recovering",
      where: "On the phone to a hire company",
      body: [
        "A 200kW temporary chiller on a trailer, on site by 21:00 Saturday, connected through the loop's hire points at 23:40. Monday's full load runs normally.",
        "The hire points existed because someone specified them in 2019 and nobody had ever used them.",
      ],
      choices: [
        { label: "Also fix the actual cause: overdue maintenance on both fan banks", to: "end-handled-fully", cost: 60 },
        { label: "Temporary cooling is in. Let the contractor handle the rest", to: "end-temp-only", cost: 0 },
      ],
    },
  ],
  endings: [
    {
      id: "end-handled-fully",
      title: "Sixty-one kilowatts and a trailer",
      grade: "best",
      body: [
        "Peak inlet 41.2 degrees, no customer-facing outage, two throttled arrays and one clean chassis shutdown, all recovered. Temporary cooling connected the same evening; full load restored before Monday.",
        "The fan bank is replaced on Tuesday, and the overdue maintenance program that let a known-degrading VFD run into July is escalated with dates.",
      ],
      lesson: [
        "Two identical units failing in the same second is one failure upstream, not two failures. Three minutes spent looking at the chiller was worth more than any amount of resetting the CRACs.",
        "Load shedding is the only lever that acts in the timescale physics is working in. Everything else needs an engineer, a part, or a phone call, and the room does not wait.",
      ],
    },
    {
      id: "end-stable-but-fragile",
      title: "Stable on half a chiller",
      grade: "good",
      body: [
        "The room holds at 24 degrees all weekend on 61kW.",
        "Monday morning the development load comes back, because the customers turn it on, and the room climbs again with nobody on site until 09:00.",
      ],
      lesson: [
        "A room stabilised by removing half its load is stable only while the load stays removed, and you do not control that.",
      ],
    },
    {
      id: "end-temp-only",
      title: "The trailer is here",
      grade: "good",
      body: [
        "Temporary cooling carries the site for eleven days until the fan bank is replaced. No further incident.",
        "The maintenance program that let a VFD run three months past its service date is unchanged, and the other fan bank is on the same schedule.",
      ],
      lesson: [
        "Restoring capacity ends the emergency. The overdue service that caused it is still overdue on the redundant half.",
      ],
    },
    {
      id: "end-half-shed",
      title: "One customer said yes",
      grade: "bad",
      body: [
        "Twenty kilowatts shed instead of fifty-seven. The room peaks at 52 degrees. Six arrays throttle, four chassis shut down hard, and two storage controllers do not come back without a firmware recovery.",
        "Three of the failed devices belong to production customers who had said nothing, because nobody asked them.",
      ],
      lesson: [
        "Asking permission is right when there is time. At 1.4 degrees a minute there is not, and the colocation contract already gives you the authority to protect the room.",
      ],
    },
    {
      id: "end-shut-everything",
      title: "Everything off",
      grade: "bad",
      body: [
        "The room cools rapidly, which is the only good thing about this.",
        "Eleven customers including nine production tenants are down for four hours while the room recovers and everything is brought back in order. Two SLA credits, one contract not renewed.",
      ],
      lesson: [
        "Total shutdown is available and is the last resort, not the simple option. Half the heat was in four non-production racks, and shedding those alone was enough.",
      ],
    },
    {
      id: "end-doors-open",
      title: "Moving 34 degree air around",
      grade: "catastrophic",
      body: [
        "The doors are open, the fans are running, and the room is importing outside air that is warmer than the setpoint by 27 degrees.",
        "Aisle containment is gone, so hot exhaust recirculates into the cold aisle. Inlet passes 55. Nineteen racks of equipment shut down or fail over the next forty minutes.",
      ],
      lesson: [
        "Air movement only cools if the air you are moving is colder than the thing you are cooling. At 34 degrees ambient it is not.",
        "Hot and cold aisle separation is doing real work right up until somebody opens a door.",
      ],
    },
    {
      id: "end-waited-for-contractor",
      title: "They are ninety minutes away",
      grade: "catastrophic",
      body: [
        "The contractor arrives at 14:55. The room reached 61 degrees at 14:12 and everything in it is off, most of it not gracefully.",
        "Four storage arrays need controller replacement. Two customers lose data that was in write cache when the power went.",
      ],
      lesson: [
        "There was no version of this where waiting was viable: the deadline was set by a heat curve, not by a service agreement.",
        "The lever you have on your own is load. Use it first and apologise later.",
      ],
    },
  ],
};
