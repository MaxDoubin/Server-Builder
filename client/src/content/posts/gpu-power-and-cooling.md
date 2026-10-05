
## Compute Is Easy to Buy, Watts Are Not

The conversation about accelerator hardware is almost entirely about the accelerator. What matters just as much, and gets discussed far less, is whether the electrical circuit can carry it and whether the room can get rid of the heat.

This is not a footnote. Power and cooling are the constraints that actually bind in most environments, professional and otherwise. A machine you cannot power at full load is a machine that throttles or shuts down, and a room you cannot cool is a room where everything runs hot and fails early.

The good news is that the relevant engineering is straightforward arithmetic. You can do all of it before spending anything.

## Circuit Math Before Purchase Math

Start with the circuit, because it is a hard limit that no amount of configuration works around.

A standard branch circuit has a rating, and continuous loads, meaning anything drawing for three hours or more, are conventionally limited to 80 percent of that rating. Sustained compute is unambiguously a continuous load.

So a 15 amp circuit at 120 volts gives 15 times 0.8 times 120, which is 1,440 watts of continuous capacity. A 20 amp circuit at the same voltage gives 1,920 watts. That number is the entire budget for everything on the circuit, including the machines you already have plugged in, and including whatever else in the building shares that breaker, which in a house is frequently more than you expect.

Higher voltage is the lever worth knowing about. At 208 or 240 volts, the same current carries roughly twice the power, which is why equipment rooms are wired that way. Most enterprise power supplies accept both, and they are typically a little more efficient at the higher voltage. Connector types follow from this: the common lower current cordage differs from the higher current variety, and a device requiring the latter cannot be safely adapted into the former, whatever adapters exist for sale.

```python
def circuit_budget(amps, volts, continuous=True):
    derate = 0.8 if continuous else 1.0
    return amps * volts * derate

def headroom(amps, volts, device_watts, existing_watts=0):
    budget = circuit_budget(amps, volts)
    used = device_watts + existing_watts
    return {
        "budget_w": round(budget),
        "used_w": used,
        "headroom_w": round(budget - used),
        "fits": used <= budget,
    }

print(headroom(amps=20, volts=120, device_watts=1200, existing_watts=400))
# {'budget_w': 1920, 'used_w': 1600, 'headroom_w': 320, 'fits': True}
```

Note what that example shows. A single high draw machine plus modest existing load consumes most of a 20 amp circuit. Adding a second machine of the same class is not a purchasing decision, it is an electrical one.

## Transients Break Power Supplies

Average power draw is not the whole story. Accelerators produce brief, very sharp current spikes well above their nominal draw, on timescales of milliseconds.

A power supply sized exactly to the average can trip its overcurrent protection on those transients and shut the machine down under load, which presents as an inexplicable reboot during heavy work while every steady state measurement looks fine. It is a genuinely confusing failure because nothing in the monitoring shows a problem.

The practical response is headroom. Sizing a supply meaningfully above the calculated steady state draw is not waste, it is tolerance for the transient behavior of the load. It also keeps the supply operating in the load band where its efficiency curve is best, which is generally somewhere in the middle of its range rather than near its top.

The same reasoning applies to uninterruptible supplies. A unit sized to the average draw may not ride through a spike, and the volt amp rating on the label is not the same as the watt rating you actually need to compare against. Size on watts, leave room, and test the unit with the real load attached.

## Airflow Is a Delta-T Problem

Cooling is where intuition fails most often, because people think about temperature when they should be thinking about heat removal rate.

Essentially all the electrical power a computer consumes leaves as heat. A machine drawing 1,000 watts is a 1,000 watt heater. There is no meaningful fraction that becomes something else. Room cooling is rated in BTU per hour, and the conversion is watts times 3.412, so that machine puts about 3,400 BTU per hour into the room, most of what a small window air conditioner is rated to remove. That is the number to bring to the conversation about whether the room stays habitable.

Removing that heat with air requires moving enough air, and the relationship is:

```
CFM = 3.16 * watts / delta_T_fahrenheit
```

where delta T is the temperature rise you allow between intake and exhaust. The important property of that formula is the inverse relationship: allowing a smaller temperature rise requires proportionally more airflow. Halving the acceptable rise doubles the air you must move.

```python
def required_cfm(watts, delta_t_f=20.0):
    return round(3.16 * watts / delta_t_f, 1)

for w in (500, 1000, 2000):
    print(w, "W ->", required_cfm(w), "CFM at 20F rise;",
          required_cfm(w, 10), "CFM at 10F rise")
```

Run that and the scale becomes clear quickly. This is why dense compute rooms are designed around airflow paths rather than around raw cooling capacity, and why hot and cold separation matters so much. Air that has already picked up heat and gets pulled back into an intake is the same as having no cooling at all, no matter how much capacity the room's cooling equipment has on paper.

Two failure modes worth naming. Recirculation, where exhaust finds a path back to intakes through gaps, over the top of equipment, or around the sides. And a room where the cooling equipment is adequate but the air simply does not travel where it needs to, which is a distribution problem that adding capacity does not solve. In a small room, separating intake from exhaust, even crudely, is usually the highest value cooling change available: point the exhaust at a doorway, not at a wall two inches away.

Intake temperature is also what matters, not room temperature. A general room reading tells you very little. The number that predicts component life is the temperature of the air actually entering each machine.

Inside the chassis the same rule applies card by card, and accelerators come in three thermal designs that are easy to mix up.

**Blower style** cards pull air in and push it out through the back of the chassis. They are loud, and they work in dense, poorly ventilated arrangements because each card evicts its own heat.

**Open fan** cards, the common consumer design, dump hot air into the case and rely on chassis airflow to remove it. Put two next to each other in a case with mediocre airflow and the upper one breathes the lower one's exhaust. It throttles, and the symptom looks like inconsistent performance rather than an obvious heat problem.

**Passive** cards, built for server chassis, have no fans at all and depend entirely on high static pressure airflow from the chassis fans. In a quiet desktop case one overheats quickly under load and throttles or shuts itself down.

## Power Capping Is a Legitimate Tool

Accelerators are usually configured to chase maximum clocks, and the last few percent of performance costs a disproportionate share of the power budget. Capping board power is not a hack. It is a normal operational control, and it is how you make a machine fit a circuit.

```bash
nvidia-smi -q -d POWER                # current, default, min and max limits
nvidia-smi -q -d TEMPERATURE
sudo nvidia-smi -pl 250               # set the board power limit, in watts
nvidia-smi --query-gpu=power.draw,temperature.gpu,clocks.sm \
           --format=csv --loop-ms=1000
```

The limit does not survive a reboot, so apply it from a service at boot rather than once by hand. I would rather run a capped accelerator that never trips a breaker or thermally throttles than an uncapped one that does both under load. Capped and steady beats uncapped and inconsistent, and capacity is much easier to reason about when the ceiling is a number you chose.

Set fan curves for sustained load rather than bursts, and graph power, temperature, and clocks continuously alongside utilization. Thermal throttling looks exactly like a software performance regression if you are not graphing the temperature.

## Living with the Noise

The thing nobody puts in the build post: this equipment is loud. Server chassis fans and blower cards under sustained load are not background noise, they are conversation stopping, and in a shared living space that is a real constraint that belongs in the plan rather than in the list of regrets. The mitigations that work are physical: put the machine somewhere with a door, run the noisy workload on a schedule when nobody is nearby, and prefer larger, slower fans over small fast ones where the chassis allows it. Undervolting and power capping help too, because fan speed follows heat.

## Designing for the Limit You Actually Have

The way I approach this is to start from the constraint rather than the wish list.

Establish the electrical budget first: what circuits exist, what is already on them, and what continuous capacity remains after derating. That number caps everything downstream.

Convert that budget to heat, because it is the same number, and ask honestly whether the space can reject it. A room that cannot remove a kilowatt continuously will heat up until something throttles or fails, and in a small enclosed space that happens faster than people expect.

Then decide what to run. This ordering feels backwards to most people, who choose hardware and then discover the constraints. Doing it in the correct order occasionally means buying less capable hardware, and it always means the hardware you buy actually runs at full capability instead of throttling.

Measure rather than assume. A power meter at the plug and a couple of temperature probes cost very little and replace a lot of estimation. Nameplate ratings are worst case figures, and a power supply's wattage is what it can deliver, not what it draws: at full output, conversion losses mean it pulls more than its rating from the wall. The only way to know your real number is to measure your own workload.

Every serious infrastructure environment is constrained by power and cooling long before it is constrained by rack space or by compute budget, which is why data center capacity is sold in kilowatts per rack. The formulas do not change between a closet and a facility, only the units in front of them.

## References

- [Thermal design power](https://en.wikipedia.org/wiki/Thermal_design_power)
- [IEC 60320 appliance couplers](https://en.wikipedia.org/wiki/IEC_60320)
- [NFPA 70: National Electrical Code](https://www.nfpa.org/codes-and-standards/nfpa-70-standard-development/70)
- [National Electrical Code](https://en.wikipedia.org/wiki/National_Electrical_Code)
- [British thermal unit](https://en.wikipedia.org/wiki/British_thermal_unit)
- [nvidia-smi documentation](https://docs.nvidia.com/deploy/nvidia-smi/index.html)
- [Uninterruptible power supply](https://en.wikipedia.org/wiki/Uninterruptible_power_supply)
- [Power usage effectiveness](https://en.wikipedia.org/wiki/Power_usage_effectiveness)
- [Data center](https://en.wikipedia.org/wiki/Data_center)
- [Uptime Institute tier standard](https://uptimeinstitute.com/tiers)
