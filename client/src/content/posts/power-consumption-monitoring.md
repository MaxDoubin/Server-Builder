
## Measuring Power

You cannot optimize what you do not measure. I use three levels of power monitoring:

1. **Kill-A-Watt meter** on the rack's input circuit for total rack power draw
2. **PDU displays** showing per-PDU power consumption
3. **iDRAC power monitoring** showing per-server real-time and historical power usage

Together, these give me a complete picture of where power is going.

## What I Found

When I first measured, my rack was drawing about 1,600 watts continuously. At my electricity rate, that works out to roughly $140 per month. Not trivial.

Breaking it down:
- Dell R740 #1: ~500W (heavily loaded with VMs)
- Dell R740 #2: ~450W (moderate load)
- Mac Pro: ~280W (mostly idle)
- Networking equipment: ~80W
- UPS overhead: ~60W

## Optimizations

**BIOS power profiles:** Switching from "Performance" to "Performance Per Watt (OS)" on both R740s saved about 80W total with no noticeable performance impact.

**Idle server management:** The Mac Pro was drawing 280W while barely being used. I configured it to sleep when idle and wake on network access. Average draw dropped to about 40W.

**Consolidating VMs:** By rebalancing VM placement, I was able to keep R740 #2 at lower utilization, which reduced its power draw by about 60W.

**After optimization:** Total rack draw dropped from 1,600W to about 1,100W. That is a 30% reduction and saves roughly $40 per month.

## Temperature and Power

Server power draw is closely linked to cooling. Higher ambient temperatures cause fans to spin faster, which uses more power, which generates more heat. Keeping the rack area cool (below 75F) helps keep fan speeds and power draw lower.

I added better ventilation to the closet housing my rack, which dropped ambient temperature by about 5 degrees and resulted in measurably lower fan speeds and power consumption.

## The Long-Term View

Power costs add up over years. A 500W reduction saves over $500 per year at typical electricity rates. When evaluating new equipment, I now factor in power consumption alongside purchase price, performance, and features. A server that costs less but draws more power may actually cost more over its lifetime.
