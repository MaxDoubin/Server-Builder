
## Compute is easy to buy, watts are not

The interesting conversation about accelerators is about memory bandwidth and
model sizes. The conversation that actually determines whether the machine can
live in your room is about electricity and air. Compute you can order.
Circuits and cooling are properties of the building, and in a house or a
classroom they are usually already at their limit.

I would rather do this arithmetic before ordering hardware than after, so
here is the arithmetic.

## The circuit math

A branch circuit has a breaker rating, and continuous loads, anything running
more than a few hours, are conventionally limited to 80 percent of that
rating. On a common 15 or 20 amp residential circuit at 120 volts, that gives
you roughly 1440 or 1920 watts of usable continuous capacity, minus everything
else already plugged into it, which in a bedroom or classroom is rarely
nothing.

```python
def circuit_headroom(watts, volts=120, breaker_amps=20, derate=0.8):
    amps = watts / volts
    budget_amps = breaker_amps * derate
    return {
        "amps_drawn": round(amps, 2),
        "continuous_budget_amps": round(budget_amps, 2),
        "fits": amps <= budget_amps,
        "spare_watts": round((budget_amps - amps) * volts),
    }


def heat_btu_per_hour(watts):
    # Essentially all electrical input becomes heat in the room
    return round(watts * 3.412)


load = 1100   # host plus one accelerator, sustained
print(circuit_headroom(load))
print(heat_btu_per_hour(load), "BTU/hr into the room")
```

Two things to note. First, a power supply's label is its output rating, not
its draw, and its efficiency means input exceeds output. Measure actual draw
at the outlet rather than trusting a label or a spec sheet.

Second, essentially all of that power becomes heat. There is no meaningful
fraction leaving as light or noise. A machine drawing 1100 watts is a 1100
watt heater that also computes, and around 3750 BTU per hour is in the range
of a small window air conditioner's entire capacity. That is the number to
bring to the conversation about whether the room stays habitable.

## Airflow: the direction problem

Accelerators come in two thermal designs and mixing them up is a classic
mistake.

**Blower style** cards pull air in and exhaust it out of the chassis. They
are loud and they work in dense, poorly ventilated arrangements because each
card is responsible for evicting its own heat.

**Open fan** cards, the common consumer design, dump hot air into the case
and rely on chassis airflow to remove it. Put two of them next to each other
in a case with mediocre airflow and the upper one is breathing the lower
one's exhaust. It will throttle, and the symptom looks like inconsistent
performance rather than an obvious heat problem.

**Passive** cards in server chassis have no fans at all and depend entirely on
high static pressure airflow from the chassis fans. Putting one in a quiet
desktop case is a way to destroy it.

Beyond the box, the room is a loop: cold air in the front, hot air out the
back, and if the hot exhaust can circulate around to the intake, your
effective intake temperature climbs until equilibrium is reached somewhere
unpleasant. Separating intake from exhaust, even crudely, is the single
highest value cooling change in a small space. Point the exhaust at a
doorway, not at a wall two inches away.

## Power capping is a legitimate tool

Accelerators are usually configured to chase maximum clocks, and the last few
percent of performance costs a disproportionate share of the power budget.
Capping board power is not a hack, it is a normal operational control, and it
is how you make a machine fit a circuit.

```bash
nvidia-smi -q -d POWER                # query the current and default limits
nvidia-smi -q -d TEMPERATURE
sudo nvidia-smi -pl 250               # set the board power limit, in watts
nvidia-smi --query-gpu=power.draw,temperature.gpu,clocks.sm \
           --format=csv --loop-ms=1000
```

I would rather run a capped accelerator that never trips a breaker or
thermally throttles than an uncapped one that does both under load. Capped
and steady beats uncapped and inconsistent, and it is much easier to reason
about capacity when the ceiling is a number you chose.

Set fan curves for sustained load rather than bursts, and monitor
temperature continuously alongside utilisation. Thermal throttling looks
exactly like a software performance regression if you are not graphing the
temperature.

## Living with the noise

The thing nobody puts in the build post: this equipment is loud. Server
chassis fans and blower cards under sustained load are not background noise,
they are conversation stopping. In a shared living space that is a real
constraint and it belongs in the plan, not in the list of regrets.

The mitigations that actually work are physical: put the machine somewhere
with a door, run the noisy workload on a schedule when nobody is nearby, and
prefer larger slower fans over small fast ones where the chassis allows it.
Undervolting and power capping help here too, because fan speed follows heat.

## The checklist

1. Measure real draw at the outlet under load, do not trust labels.
2. Check the breaker rating and what else shares the circuit.
3. Apply the 80 percent continuous rule and keep spare capacity.
4. Convert watts to BTU per hour and decide whether the room can shed it.
5. Verify the airflow design of the cards matches the chassis.
6. Separate intake from exhaust.
7. Cap board power to fit the envelope, deliberately.
8. Put the machine on a UPS sized for the real load, and test it.
9. Graph power, temperature, and clocks so throttling is visible.

None of this is exciting, and all of it decides whether the hardware runs at
its rated speed or quietly at 70 percent of it.

## References

- [British thermal unit](https://en.wikipedia.org/wiki/British_thermal_unit)
- [National Electrical Code](https://en.wikipedia.org/wiki/National_Electrical_Code)
- [nvidia-smi documentation](https://docs.nvidia.com/deploy/nvidia-smi/index.html)
- [Data center](https://en.wikipedia.org/wiki/Data_center)
- [Uninterruptible power supply](https://en.wikipedia.org/wiki/Uninterruptible_power_supply)
