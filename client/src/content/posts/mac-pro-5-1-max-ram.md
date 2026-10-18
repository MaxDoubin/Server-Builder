
## The problem

Anyone with a 2010 or 2012 Mac Pro, or shopping for one, needs to know how much memory the machine accepts before ordering modules. Apple, EveryMac, OWC and owner forums quote 32GB, 64GB, 96GB and 128GB for these models. The figures depend on the processor count, the module size and the operating system, so they cannot be compared directly.

## Apple's maximum by tray and processor count

Apple's [Mid 2010 specifications](https://support.apple.com/en-us/112578) and [Mid 2012 specifications](https://support.apple.com/en-us/118464) give the same limits for each processor tray:

| Processor tray | Slots | Apple maximum | Module sizes Apple lists | Speed set by processor |
| --- | --- | --- | --- | --- |
| One processor (quad-core or six-core) | 4 | 32GB | 1GB, 2GB, 4GB, 8GB | 1066MHz or 1333MHz |
| Two processors (8-core or 12-core) | 8, four per processor | 64GB | 1GB, 2GB, 4GB, 8GB | 1066MHz or 1333MHz |

Apple's [memory guide](https://support.apple.com/en-ke/HT205043) confirms the split: "The quad-core and 6-core Mac Pro have one CPU and the 8-core and 12-core Mac Pro have two CPUs." On the single-processor machine, the four slots sit on one slide-out tray, as [EveryMac's six-core listing](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-six-core-3.33-mid-2010-westmere-specs.html) describes it. Four 8GB modules make 32GB, which is why the single-processor ceiling is half the dual-processor one.

Speed follows the processor, not the module. Apple rates the 2.8GHz and 3.2GHz single-processor Mid 2010 models at 1066MHz and the 3.33GHz model at 1333MHz. On the dual side, the 2.4GHz eight-core model is 1066MHz, while the 2.66GHz and 2.93GHz models are 1333MHz. The Mid 2012 single-processor models follow the same split: the 3.2GHz model runs 1066MHz and the 3.33GHz model runs 1333MHz. Every dual-processor Mid 2012 model in Apple's list is 1333MHz.

For modules of equal size, Apple recommends filling the slots in the order listed in its table. On a single-processor tray that means slots 1 and 2 for two modules, slots 1, 2 and 3 for three, and all four slots for four. On an eight-core or 12-core machine, four modules go in slots 1, 2, 5 and 6, and eight modules go in slots 1 through 8 in order.

## Why the official figure changed after launch

At the 2010 launch, Apple said the quad-core model was ["expandable up to 16GB"](https://www.apple.com/newsroom/2010/07/27Apple-Unveils-New-Mac-Pro-With-Up-to-12-Processing-Cores/) and the eight-core model was "expandable up to 32GB." OWC quotes Apple's listing from that period as "four memory slots supporting up to 16GB of main memory using 1GB, 2GB, or 4GB DIMMs" ([OWC](https://eshop.macsales.com/blog/6620-owc-confirms-2010-mac-pro-single-processor-models-can-use-32gb-ram)). OWC's blog then says that it is "allowing us to support 8GB DIMMs for up to 32GB of memory in your Quad-Core or 6-Core Mid 2010 Mac Pro." Apple's current spec adds 8GB to the module sizes it lists, and it gives 32GB for the single-processor tray. Four 4GB modules make 16GB and four 8GB modules make 32GB, so the official figure moved with the module sizes.

<figure>
<img src="/images/blog/mac-pro-5-1-max-ram/photo-1.jpg" alt="A square Intel Xeon X5690 processor package" width="806" height="605" loading="lazy" decoding="async">
<figcaption>An Intel Xeon X5690, a six-core Westmere processor from the same generation as the Xeon W3680 in the six-core Mid 2010 Mac Pro. Intel publishes its own maximum memory figure for each Xeon, and it can differ from Apple's. Photo: Copyright: Atsushi Nunome (Computer System Laboratory at Kyoto Institute of Technology), <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Xeon_X5690_3_46GHz.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

[EveryMac's six-core listing](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-six-core-3.33-mid-2010-westmere-specs.html) still gives Apple's official figure as 16GB, while Apple's current spec says 32GB. Plan around the current spec.

The processor adds a second, separate ceiling. EveryMac lists a Xeon W3680 in the six-core 3.33GHz Mid 2010 model, and [Intel rates the W3680 at 24GB](https://www.intel.com/content/www/us/en/products/sku/47917/intel-xeon-processor-w3680-12m-cache-3-33-ghz-6-40-gts-intel-qpi/specifications.html). That is below the 32GB Apple lists for the single-processor tray, so the chip rating and Apple's figure disagree. On the eight-slot machines, eight 8GB modules make the 64GB Apple lists.

## What owners and vendors run past Apple's limit

OWC sells memory above Apple's figures and certifies it. Its [2010 to 2012 memory listing](https://eshop.macsales.com/shop/memory/owc/apple-mac-pro/2010-2012) advertises "Up to 128GB memory" for these models. Its [MaxRAM page](https://eshop.macsales.com/memory/maxram) certifies 48GB for quad-core and six-core machines and 128GB for eight-core and 12-core machines, and says its configurations exceed Apple's officially supported maximums. EveryMac repeats the single-processor number, stating that the six-core model "actually can support 48 GB of RAM."

The 128GB kit is eight 16GB modules, sold as "8 x 16GB PC10600 DDR3 ECC-R 1333MHz DIMMs" ([OWC product page](https://eshop.macsales.com/item/OWC/1333D3X9M128/)). OWC lists the 1333MHz kit for eight-core and 12-core machines and a 1066MHz kit for eight-core machines only.

Owners also report running 128GB. In one [Apple Community thread](https://discussions.apple.com/thread/250548432), an owner of an eight-core 2010 Mac Pro reported 128GB "running at 800mhz" with all eight slots filled. After removing slots 4 and 8, the same owner reported that speed "jumped to 1066mhz" with six modules, which is 96GB. That trades 32GB of capacity for faster memory. That is one owner's report, not a benchmark, and a reply in the thread says that populating slot 4 may increase bus loading.

## Module types, speeds and mixing rules

Apple's spec lists the memory as DDR3 ECC SDRAM, and its [memory guide](https://support.apple.com/en-ke/HT205043) adds that "8GB RDIMMs are also supported." Apple's listed sizes stop at 8GB, so a 16GB module is outside Apple's stated configuration. OWC lists its 16GB kit as ECC-R, and its listing says "Registered memory cannot be mixed with non-registered memory."

Mixing types can stop a machine from starting. Apple's guide says "The computer will not start if both types of DIMMS are installed in the same computer." OWC adds that "16GB modules do not mix with other density (2GB, 4GB or 8GB) module types." Pick one module type and one density for the whole machine. OWC also says to "Install in pairs for best performance."

Apple's guide also covers mixed sizes. It says "If you install different sized DIMMs in your Mac Pro, follow the order in the table above," and that the Memory Slot Utility should appear onscreen and recommend an improved configuration.

## Checking what macOS actually sees

Install the full set, then check the total the operating system reports with [sysctl](https://ss64.com/mac/sysctl.html):

```
$ sysctl -n hw.memsize
137438953472
```

That number is 128GiB in bytes, the total for eight 16GB modules. Repeat the check after any change, not only after the first install.

## What breaks

**Four 16GB modules in a single-processor Mac Pro exceed Apple's ceiling.** Four 16GB modules make 64GB, double the 32GB Apple lists for that tray, and Apple's spec does not list 16GB modules at all. Fix: for an Apple-listed build, use four 8GB modules for 32GB. If you go past that, treat OWC's certified 48GB as OWC's limit rather than Apple's, and confirm the result with `sysctl -n hw.memsize`.

<figure>
<img src="/images/blog/mac-pro-5-1-max-ram/photo-2.jpg" alt="A Mac Pro memory riser card with four DIMM slots, two of them holding FB-DIMM modules" width="1280" height="960" loading="lazy" decoding="async">
<figcaption>A memory riser card from a 2006 Mac Pro, with FB-DIMMs in two of its four slots. Apple says DIMMs from older Macs cannot be used in the 2010 and 2012 models, which take DDR3 ECC modules. Photo: Blake Patterson, <a href="https://creativecommons.org/licenses/by/2.0/">CC BY 2.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:FB-DIMM_riser_A.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

**Filling all eight slots may drop the memory speed.** One owner reports 800MHz with eight modules and 1066MHz after removing slots 4 and 8. Why: Apple's eight-slot order fills slots 1 through 4 before slots 5 through 8, and a reply in the same thread says that populating slot 4 may increase bus loading. Fix: follow Apple's order, which for four modules on a dual-processor machine is slots 1, 2, 5 and 6, and check the layout with the Memory Slot Utility.

**Mixing registered and non-registered modules stops the machine from starting.** Apple's guide says the computer will not start with both types installed, and OWC says the two cannot be mixed. Why: Apple's guide states the start failure directly, and OWC's listing gives the same rule for registered memory. Fix: buy one type and one density for the entire machine, and check that every module matches the kit you bought.

**Reusing DIMMs from an older Mac.** Apple's guide says "DIMMs from older Mac computers cannot be used in your Mac Pro." Why: the 2010 and 2012 models take DDR3 ECC, while the Early 2008 model used FB-DIMMs, which Apple says to install in matched pairs. Fix: buy DDR3 ECC modules that match the list above. For what a firmware change does and does not alter on these machines, read [Mac Pro 4,1 vs 5,1](/blog/mac-pro-4-1-vs-5-1).

**The macOS memory ceiling depends on the macOS version.** The sources disagree. OWC's MaxRAM page and one [iFixit answer](https://www.ifixit.com/Answers/View/751184/Mac+Pro+5.1+what+is+max+RAM) say Mac OS X cannot use more than 96GB, and that answer gives 128GB only "when running a 64-bit version of Windows XP or later or Linux." A second reply in the same thread ties the 96GB figure to firmware and expects Mojave to lift it, and the [Apple Community thread](https://discussions.apple.com/thread/250548432) owner ran all 128GB on an eight-core 2010 Mac Pro he uses on High Sierra and occasionally Mojave. Why: the 96GB number is an older-firmware and early-macOS limit rather than a fixed ceiling, so what a given macOS reports depends on its version. Fix: install the full set, run `sysctl -n hw.memsize`, and trust the number it reports on your own macOS version rather than a blanket cap. Check [the latest macOS support for the 5,1](/blog/mac-pro-5-1-latest-os) before you upgrade.

## What this means

For a single-processor Mac Pro, the Apple-listed ceiling is 32GB, which means four 8GB modules at the speed Apple lists for the processor. For an eight-core or 12-core Mac Pro, the ceiling is 64GB, which means eight 8GB modules at 1066MHz or 1333MHz depending on the processor. Those are the builds Apple's documents support.

Going beyond those figures means accepting OWC's certification in place of Apple's. On a dual-processor machine, that means the 128GB kit of 16GB ECC-R modules, with the speed drop one owner reported when all eight slots were filled. On a single-processor machine, it means OWC's 48GB figure, which is above Apple's 32GB and is not in Apple's spec. Either way, the total macOS reports is the number that decides what you actually have, so install the full set, fill it in Apple's order, and confirm the result with `sysctl -n hw.memsize` before you depend on it.

## References

- https://support.apple.com/en-us/112578
- https://support.apple.com/en-us/118464
- https://support.apple.com/en-ke/HT205043
- https://www.apple.com/newsroom/2010/07/27Apple-Unveils-New-Mac-Pro-With-Up-to-12-Processing-Cores/
- https://everymac.com/actual-maximum-mac-ram/actual-maximum-mac-pro-ram-capacity.html
- https://everymac.com/systems/apple/mac_pro/specs/mac-pro-six-core-3.33-mid-2010-westmere-specs.html
- https://everymac.com/systems/apple/mac_pro/specs/mac-pro-quad-core-2.8-mid-2010-nehalem-specs.html
- https://www.intel.com/content/www/us/en/products/sku/47917/intel-xeon-processor-w3680-12m-cache-3-33-ghz-6-40-gts-intel-qpi/specifications.html
- https://eshop.macsales.com/memory/maxram
- https://eshop.macsales.com/shop/memory/owc/apple-mac-pro/2010-2012
- https://eshop.macsales.com/item/OWC/1333D3X9M128/
- https://eshop.macsales.com/blog/6620-owc-confirms-2010-mac-pro-single-processor-models-can-use-32gb-ram
- https://discussions.apple.com/thread/250548432
- https://www.ifixit.com/Answers/View/751184/Mac+Pro+5.1+what+is+max+RAM
- https://ss64.com/mac/sysctl.html
- https://commons.wikimedia.org/wiki/File:Mac_Pro_DIMM_Riser_Cards_(2485084107).jpg
- https://commons.wikimedia.org/wiki/File:Mac_Pro,_profile.jpg
- https://commons.wikimedia.org/wiki/File:Assorted_DDR3_desktop_memory_modules_(Crucial_Ballistix,_Crucial,_Lenovo_and_Ramaxel).jpg
