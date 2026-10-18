
## The problem

If you own a 2019 Mac Pro (model 7,1) and want more cores, or bought an 8-core and now want a bigger Xeon W, you need three answers: which chips the machine accepts, whether the cooling can handle them, and whether the gain justifies the cost and the risk. Apple's documentation covers the chips it sold at purchase and says little beyond that.

## Apple lists eight to 28 cores and no post-purchase path

Apple's [Mac Pro (2019) technical specifications](https://support.apple.com/en-us/118461) offer a choice of "Configure from an 8-core to 28-core Intel Xeon W processor" and name no models. Apple does not say whether the processor can be swapped after purchase. [EveryMac](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-28-core-2.5-xeon-w-silver-tower-workstation-2019-specs.html) names the 28-core chip directly as the W-3275M.

<figure>
<img src="/images/blog/mac-pro-7-1-cpu-upgrade/photo-1.jpg" alt="Mac Pro towers on a factory assembly line at the Flextronics plant in Austin, Texas" width="960" height="640" loading="lazy" decoding="async">
<figcaption>2019 Mac Pro towers on the assembly line at the Flextronics plant in Austin, Texas, on November 20, 2019. Apple offered the processor as a configure-to-order choice from 8 to 28 cores and documents no swap after purchase. Photo: The White House from Washington, DC, <a href="https://creativecommons.org/publicdomain/mark/1.0/">Public domain</a>, via <a href="https://commons.wikimedia.org/wiki/File:President_Trump_Tours_the_Apple_Manufacturing_Plant_%2849100574702%29.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

| Apple option | Intel model | Base and max turbo | Memory speed | TDP |
|---|---|---|---|---|
| 8-core | W-3223 | 3.5 and 4.0 GHz | 2666 MHz | 160 W |
| 12-core | W-3235 | 3.3 and 4.4 GHz | 2933 MHz | 180 W |
| 16-core | W-3245 or W-3245M | 3.2 and 4.4 GHz | 2933 MHz | 205 W |
| 24-core | W-3265 or W-3265M | 2.7 and 4.4 GHz | 2933 MHz | 205 W |
| 28-core | W-3275M | 2.5 and 4.4 GHz | 2933 MHz | 205 W |

Apple's listing gives the base clock, boost clock, memory speed and thread count for each option, but no model names. The model names and TDP ratings come from [Greg Gant's processor table](https://blog.greggant.com/posts/2021/12/19/definitive-mac-pro-2019-upgrade-guide.html), and Intel's spec sheets confirm the M parts. The W-3245M, W-3265M and W-3275M each carry a 205 W rating and a 2TB maximum in Intel's sheets for the [W-3245M](https://www.intel.com/content/www/us/en/products/sku/193751/intel-xeon-w3245m-processor-22m-cache-3-20-ghz/specifications.html), [W-3265M](https://www.intel.com/content/www/us/en/products/sku/193750/intel-xeon-w3265m-processor-33m-cache-2-70-ghz/specifications.html) and [W-3275M](https://www.intel.com/content/www/us/en/products/sku/193754/intel-xeon-w3275m-processor-38-5m-cache-2-50-ghz/specifications.html). Gant's table lists 1TB for every non-M part. [ServeTheHome](https://www.servethehome.com/intel-xeon-w-3200-sku-list-and-value-analysis/) says the W-3200 line "spans nine SKUs ranging from eight to twenty-eight cores" and that there are "M" parts that support up to 2TB of memory.

Memory speed follows the processor, too. Apple says the "8-core processor operates memory at 2666MHz," while the 12-core to 28-core options run at 2933MHz. Apple's largest memory option is 1.5TB in 12 user-accessible DIMM slots, and it "Requires 24-core or 28-core processor." Anyone planning a swap should choose the processor before buying memory.

## The socket is removable, and cooling sets the practical limit

EveryMac's 28-core listing says "The Mac Pro (2019) model processor is mounted on an LGA 3647 (Socket P). It is removable." The chip is a socket part, not soldered to the board. The [iFixit teardown](https://www.ifixit.com/Teardown/Mac+Pro+2019+Teardown/128922) of the base model had no CPU replacement guide to turn to, so the team unscrewed the heat sink bracket from the backside of the logic board. That released both the bracket and the W-3223 from the socket together.

<figure>
<img src="/images/blog/mac-pro-7-1-cpu-upgrade/photo-2.jpg" alt="Intel Xeon Silver 4110 qualification sample, a large rectangular LGA 3647 server processor" width="1267" height="1400" loading="lazy" decoding="async">
<figcaption>A qualification sample of the Intel Xeon Silver 4110, a Skylake-generation server chip for the LGA 3647 socket, not a Mac Pro part. The Xeon W chips in the 2019 Mac Pro use the same socket type, so the processor is removable rather than soldered to the board. Photo: PantheraLeo1359531, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Intel_Xeon_Silver_4110_%28QN09%29_20241229_HOF9668_RAW-Export.png">Wikimedia Commons</a>.</figcaption>
</figure>

Cooling is shared across the whole chassis. iFixit notes that "The Mac Pro just has front and rear fans," and describes three tower fans that pull air through the front grille, with a blower that vents hot air out the back. [OWC's teardown gallery](https://eshop.macsales.com/blog/57077-owc-teardown-of-the-2019-mac-pro/) has photos labeled "CPU retention clip" and "Metal cover for CPU Heat Sink."

The practical limit is heat. [EveryMac's upgrade FAQ](https://everymac.com/systems/apple/mac_pro/mac-pro-tower-faq/how-to-upgrade-mac-pro-tower-rackmount-cpu-processor.html) screens candidates for "a TDP (Thermal Design Power) of 205 watts or less," so that the replacement "generates no more heat than a standard Apple-provided option." That is EveryMac's test, not Apple's. Its 205 W limit is the highest rating among the chips Apple offered, so it excludes none of them. Among Apple's options the 8-core's 160 W is the lowest rating, so every step up adds rated heat to the same fans. Going from the W-3223 to the W-3275M adds 45 W.

## Firmware decides what boots, and Apple does not document a swap

The 2019 Mac Pro is T2-equipped. Apple's specifications say "Storage encrypted by the Apple T2 Security Chip." For the chip itself, see [Apple's T2 Security Chip in the Mac Pro](/blog/apple-t2-security-chip). Greg Gant's guide says the T2 "uses a different mechanism than previous Mac Pros to update the firmware," and that you can check the firmware version by going to "About this Mac."

Apple's documents tie memory speed and capacity to the processors it sold. A chip Apple never offered has no Apple-documented memory speed or capacity, so any figure for it comes from the chip's own ratings.

EveryMac's FAQ goes further and says Apple does not officially state "whether or not it is possible to upgrade it." A question in an [Apple Community thread posted on March 9, 2020](https://discussions.apple.com/thread/251175974) pointed out that Apple's support article contains "there is no mention on whether you can upgrade the CPU." No Apple reply appears in that thread. One community reply says that changing the processor "would invalidate the warranty." That is one member's view, not an Apple policy, and no one in the thread reports installing a different processor.

[Creation Machines](https://www.creationmachines.org/product/mac-pro-71-2019-processor-upgrade-service/), a third-party vendor, sells installed upgrades in which "a qualified workstation technician will perform the upgrade," and it says "There is a 90 day parts and labor guarantee." That guarantee is the vendor's, not Apple's.

Apple's documented path ends at the chips it sold. A chip that fits the socket is not proof that the firmware will accept it.

## Threads pay off, and the top clock stops rising at 12 cores

Apple lists a 4.4 GHz boost from the 12-core upward, and Intel's sheets confirm it for the 16-, 24- and 28-core chips. Above 12 cores, extra cores add threads, not peak clock.

### From 8 cores to 16

Moving from the W-3223 to a 16-core chip changes three numbers. Memory speed rises from 2666 MHz to 2933 MHz, about 10%. Maximum boost rises from 4.0 GHz to 4.4 GHz, also about 10%. Threads double, from 16 to 32. The [W-3245M sheet](https://www.intel.com/content/www/us/en/products/sku/193751/intel-xeon-w3245m-processor-22m-cache-3-20-ghz/specifications.html) lists the 4.40 GHz maximum turbo and the 205 W rating for that chip.

The 12-core is the smallest step that reaches both 2933 MHz memory and the 4.4 GHz boost, at 180 W, which is 25 W less than the 16-core. If the work scales across threads, the 16-core is the strongest case. If it runs on a few threads, the boost gain is the whole benefit, and it is about 10%.

### From 16 cores to 28

At this step the peak clock does not change. Intel lists the same 4.40 GHz maximum turbo for the [W-3245M](https://www.intel.com/content/www/us/en/products/sku/193751/intel-xeon-w3245m-processor-22m-cache-3-20-ghz/specifications.html) and the [W-3275M](https://www.intel.com/content/www/us/en/products/sku/193754/intel-xeon-w3275m-processor-38-5m-cache-2-50-ghz/specifications.html). The base clock drops from 3.20 GHz to 2.50 GHz, and the rating stays at 205 W. Threads rise from 32 to 56, a gain of 75%, so the 28-core suits a load that keeps 56 threads busy. A load on a few threads gets the same peak clock on the 16-core, with a base clock 0.7 GHz higher.

The 24-core sits between the two. Its [W-3265M sheet](https://www.intel.com/content/www/us/en/products/sku/193750/intel-xeon-w3265m-processor-33m-cache-2-70-ghz/specifications.html) lists a 2.70 GHz base clock, 48 threads, a 4.40 GHz maximum turbo and a 205 W rating. That puts it at the same power as the 28-core, with 8 fewer threads and a base clock 0.2 GHz higher.

## What breaks

- **A 16-core swap does not reach 1.5TB of memory.** Apple ties that option to 24 or 28 cores, even though Intel rates the W-3245M for 2TB. Why: the limit is Apple's configuration rule, so the chip's own rating does not change it. Fix: choose a 24- or 28-core chip before buying 1.5TB of memory, or plan around 768GB, which Apple lists among its memory options. Creation Machines describes its 1.5TB option as "12 x 128 GB," so a full set is twelve 128 GB modules.

- **Buying DDR4-2933 for an 8-core.** Apple says the "8-core processor operates memory at 2666MHz." Why: Apple's listing sets memory speed by processor, so 2933 MHz modules in an 8-core machine run at 2666 MHz. Fix: do the processor swap first and buy memory after, or accept 2666 MHz on the 8-core.

- **Choosing the W-3175X for speed.** ServeTheHome describes the W-3175X as "based on the older Skylake generation," and says it "only has a 512GB memory capacity and 48x PCIe 3.0 lanes." Why: it is not one of the Cascade Lake chips Apple sold, and its memory ceiling is a quarter of the 2TB M parts. Fix: stay with the chips in the table, or confirm that your memory needs fit in 512GB before buying.

- **Expecting a 28-core to speed up a lightly threaded job.** The 28-core's 4.40 GHz top turbo matches the 16-core's, and its base clock is 0.7 GHz lower. Why: cores are added, but the peak clock does not move. Fix: pick the 16-core for lightly threaded software, and the 28-core only when the work fills 56 threads.

- **Treating a socket match as proof of support.** The socket is removable, but Apple does not document a processor swap, and a community reply says a change would invalidate the warranty. Why: physical access settles the mechanical question, while the firmware decides what boots. Fix: use only chips from the table, check the firmware version in About this Mac before and after, and keep the stock processor so you can put it back.

## What this means

For a 2019 Mac Pro 7,1, a processor swap pays when the work spreads across cores and the new chip is rated at 205 W or below. An 8-core owner gets the most from a 16-core chip: twice the threads, about 10% more boost and memory speed, for 45 W more rated heat. A 16-core owner gains threads, not peak clock, from the 28-core, and gives up 0.7 GHz of base clock to get them.

Compare any quote with the threads you will actually use, and with a used Mac Pro that already has the core count you need. Choose only chips Apple sold, install memory after the processor, and keep the original chip. If you would rather not open the machine, Creation Machines installs upgrades and offers a 90-day parts and labor guarantee. For whether the 2019 model is worth buying over the older machine, see [Mac Pro 5,1 vs 7,1](/blog/mac-pro-5-1-vs-7-1).

## References

- https://support.apple.com/en-us/118461
- https://everymac.com/systems/apple/mac_pro/specs/mac-pro-28-core-2.5-xeon-w-silver-tower-workstation-2019-specs.html
- https://everymac.com/systems/apple/mac_pro/mac-pro-tower-faq/how-to-upgrade-mac-pro-tower-rackmount-cpu-processor.html
- https://www.intel.com/content/www/us/en/products/sku/193754/intel-xeon-w3275m-processor-38-5m-cache-2-50-ghz/specifications.html
- https://www.intel.com/content/www/us/en/products/sku/193751/intel-xeon-w3245m-processor-22m-cache-3-20-ghz/specifications.html
- https://www.intel.com/content/www/us/en/products/sku/193750/intel-xeon-w3265m-processor-33m-cache-2-70-ghz/specifications.html
- https://www.ifixit.com/Teardown/Mac+Pro+2019+Teardown/128922
- https://eshop.macsales.com/blog/57077-owc-teardown-of-the-2019-mac-pro/
- https://blog.greggant.com/posts/2021/12/19/definitive-mac-pro-2019-upgrade-guide.html
- https://discussions.apple.com/thread/251175974
- https://www.servethehome.com/intel-xeon-w-3200-sku-list-and-value-analysis/
- https://www.creationmachines.org/product/mac-pro-71-2019-processor-upgrade-service/
