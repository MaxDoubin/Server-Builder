
## The problem

Someone wants a real enterprise switch for a home lab, finds a used Catalyst 9300 listed well below its new price, and cannot tell what the letters in the part number mean, whether the unit will stack, how much PoE it can really supply, or whether the previous owner still holds its license. Any one of those can make a cheap switch useless, so check them before you pay.

## Read the suffix before the price

The part number decides most of what a 9300 can do. The family letters set the uplink design and stacking speed, and the final letter sets the license tier. The C9300 has modular uplinks, the C9300X adds 1 Tbps stacking, the C9300L has fixed uplinks, and the C9300LM is the mini model with fixed uplinks. Cisco's [ordering guide](https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9300-series-switches/nb-06-cat9300-swit-ser-cte-en.html) lists Essentials as -E and Advantage as -A, so the suffix picks Network Essentials or Network Advantage.

The base license works differently from a subscription. The ordering guide says "The Network Stack license is perpetual and included with the hardware by default," and [Cisco's licensing guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst_9000/cat9000-config-available-licenses.html) says base licenses have no expiration date: "There is no expiration date for such a license."

Subscriptions behave differently. Cisco's DNA and Catalyst licenses are sold as "3/5/7 year term subscription" lines, and the licensing guide says "Add-on licenses must be renewed before term expiry, to continue using DNA features." Get the end date of every add-on subscription on a used unit before you pay. The same guide says that when add-on licenses are deactivated and the switch reloads, "The switch then continues operating with base license capabilities." That fallback follows deactivation, so do not assume an expired subscription behaves the same way.

The feature split matters most for a lab. The [datasheet](https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9300-series-switches/nb-06-cat9300-ser-data-sheet-cte-en.html) draws the line like this:

| Feature | Network Essentials (-E) | Network Advantage (-A) |
|---|---|---|
| Routing | RIP, EIGRP stub and OSPF capped at 1,000 routes | Adds BGP, EIGRP, IS-IS, HSRP and full OSPF |
| Segmentation | Not listed | VRF, VXLAN, LISP, TrustSec and MPLS |
| SD-Access | Not listed | Enabled with Advantage |
| MACsec | MACsec-128 | Adds MACsec-256 |

Cisco's ordering guide says "SD-Access can be enabled with Cisco Catalyst or Cisco DNA Advantage." The datasheet's overview describes MACsec-256 as "available on all models," but its feature table marks MACsec-256 as Advantage only. If you need MACsec-256, confirm it for the exact model before you buy.

For any feature not in the table, [Cisco's licensing guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst_9000/cat9000-config-available-licenses.html) points to a lookup tool: "To know which license levels a feature is available with, use Cisco Feature Navigator at https://cfnng.cisco.com." If the lab covers BGP or VRF, a -E unit is the wrong buy, and the suffix is the first thing to read on any listing.

## Stacking needs matching licenses and cables

Each 9300 family stacks at its own speed. The [datasheet](https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9300-series-switches/nb-06-cat9300-ser-data-sheet-cte-en.html) gives StackWise-480 for the C9300 at 480 Gbps, StackWise-1T for the C9300X at 1 Tbps, and StackWise-320 for the C9300L and C9300LM at 320 Gbps. A mixed stack of C9300X and C9300 units runs at StackWise-480 speeds. Cisco lists eight members as the maximum, with "Up to eight switches can be configured in a StackWise-1T."

Matching matters more than speed. For C9300X stacks, the datasheet's stacking table requires "with same license level," so a -E unit and an -A unit cannot be members of the same C9300X stack. Power sharing has its own limit. By default, "Up to four switches can be configured in a StackPower stack," and reaching eight needs the XPS-2200 appliance.

Measure the gap between the units before you order stack cables for the rack.

## Uplinks come from the modules you buy

The datasheet says "The default switch configuration does not include the network module," but the ordering guide says C9300 SKUs come with a C9300-NM-8X module as default, and C9300X SKUs come with a C9300X-NM-2C. Confirm the module on each listing by part number against the ordering guide, and price any missing module with the switch. Modular C9300 uplinks run 10G, 25G, 40G and multigigabit, and the C9300X adds 100G. The C9300X-NM-4C fits only the 48HX, 48TX and 24Y models.

On fixed-uplink models, the uplinks are already part of the SKU, so the module question does not arise. The C9300L offers 4x 1G, 4x 10G/1G or 2x 40G fixed uplinks, depending on the model.

Copper ports vary by model too. The ordering guide describes the C9300-24T-E as a "Cisco Catalyst 9300 24-port 1G copper, data only, modular uplinks" model, while the datasheet lists the C9300-24UX's ports as "24 ports Multigigabit Cisco UPOE (10G/5G/2.5G/1G/100M)." Read the copper ports as carefully as the fiber options.

## PoE depends on the power supplies, not the model name

PoE power comes from the power supplies. The datasheet lists 350W, 715W, 1100W and 1900W supplies, and the default supply follows the model. The C9300-48U ships with 1100W, the C9300-48P with 715W, and the C9300-48T with 350W and no PoE at all, since the -T models are data-only.

The datasheet's power supply table lists available PoE power for each supply setup. A C9300-48U on its default 1100W supply shows 822W of available PoE with no secondary supply, and 1537W with a 715W secondary supply added.

Per-port power depends on the PoE standard. Cisco UPOE extends the IEEE PoE+ standard to double the power per port to 60 watts. Cisco UPOE+ provides 90W per port on 21 ports of the 24-port and 48-port switches.

Before you buy, read the wattage on each supply label, count the supplies, and add up the draw of the devices you plan to power. A second supply is the fix when one supply cannot carry the load. For how redundant supplies work in general, see [redundant power supplies](/blog/redundant-power-supplies).

## Noise and heat in a room you use

The datasheet measures noise per ISO 7779 and declares it per ISO 9296, at bystander positions and an ambient temperature of 25 degrees Celsius. A C9300 with AC supplies and 24 PoE+ ports loaded is listed at LpA 45 dB typical and 48 dB max. The C9300L, with half its PoE+ ports loaded, is listed at 44 dB typical and 47 dB max.

These are declared values, not a promise for your room. A rack-mount 9300 in a closet or garage is a different situation from one in a bedroom, so plan the location before the switch arrives.

## Used listings and the Smart Account

Start with the new price. An [eBay storefront](https://www.ebay.com/str/bestciscoseller) shows a "NEW Cisco C9300-24U-E Catalyst 9300 24-port UPOE, Network Essentials" at $4,295.00. A used unit with the same tier should be priced against that figure, then adjusted for condition, warranty, and any uplink module or power supply the listing leaves out. [Buying used enterprise gear](/blog/buying-used-enterprise-gear) covers the general checks for used hardware.

Refurbished sellers describe condition differently. [Essential Tech](https://essentialtechinc.com/c9300-24ux-a/) lists a "Used Refurbished Cisco C9300-24UX-A Catalyst 9300 24-Port mGig UPOE Switch, Network Advantage" and says "Our switches are Cisco original, tested, complete, and fully configured." The listing offers "Support-eligible serial numbers available upon request" but gives no warranty or return terms. Ask for the serial number and the warranty terms in writing before you pay.

The license does not live only on the box. Cisco describes Smart Licensing as "a pool of software licenses that can be used across the entire organization" in its [licensing white paper](https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9000-series-switches/catalyst-9000-licensing-wp.html). The white paper places that pool in a Smart Account on Cisco License Central, so check which account a used switch is registered to before you pay.

Cisco's [migration guide](https://www.cisco.com/c/en/us/support/docs/switches/catalyst-9300-series-switches/216520-migrate-catalyst-license-to-smart-licens.html) describes re-registration after a downgrade, using an ID token and this command:

```
license smart register idtoken <idtoken> all
```

Removing the switch from the previous owner's account depends on the seller, so get that confirmed in writing.

Evaluation states depend on the software release. On 16.9.1 through 17.3.1, licenses that were not registered or released become Eval Expired after 90 days. The migration guide says that Smart Licensing Using Policy "no longer has evaluation states for licenses."

## What breaks

- **The previous owner still holds the license.** Smart Licensing keeps licenses in a Smart Account, so the switch has to be registered to your own account. Fix: get the seller's written confirmation that the switch has been removed from their Smart Account before you pay, then register it to your own account with an ID token.

- **A -E switch has no BGP or VRF.** The license tier sets which routing and segmentation features are available, and the datasheet lists BGP and VRF only under Advantage. Fix: read the suffix before paying, then check each feature you need in [Cisco Feature Navigator](https://cfnng.cisco.com).

- **A stack that will not form the way you planned.** For C9300X stacks, the datasheet requires "with same license level," so a -E unit and an -A unit cannot be members of the same C9300X stack. Fix: buy members with the same license tier, measure the gap between units, and order stack cables before you rack them.

- **A PoE plan that one supply cannot carry.** The default supply follows the model: 1100W on the C9300-48U, 715W on the C9300-48P, and 350W with no PoE on the C9300-48T. Fix: read the wattage on each supply label, count them, and total the draw of your devices. Add a second supply when the total is more than one supply can carry.

- **A listing without the uplink module.** The datasheet says the default switch configuration does not include the network module, so the module on a listing can differ from the default that the ordering guide lists. Fix: ask the seller for the module part number and price it with the switch. If you need 100G on a C9300X, confirm the module fits your model, since the C9300X-NM-4C works only with the 48HX, 48TX and 24Y.

- **An enable password nobody knows.** By default, a user with physical access can recover a lost password by stopping the startup sequence. Cisco's IOS XE 16.6 configuration guide describes a reset that an administrator can restrict, and it warns that "Returning the device to the default configuration results in the loss of all existing configurations." Fix: ask the seller for the enable password before paying. If recovery is restricted, the reset returns the switch to its default configuration, so plan to rebuild from your own notes.

## What this means

A used 9300 is a good lab buy when the lab needs stacking, PoE or Advantage features. Start from the suffix: pick -A for BGP, VRF and SD-Access, and -E when switching and OSPF up to 1,000 routes are enough. Before you pay, get the Smart Account release in writing, count the power supplies, and confirm the uplink module.

Cisco's [end-of-sale listing](https://www.cisco.com/c/en/us/products/switches/catalyst-9300-series-switches/eos-eol-notice-listing.html) for the 9300 has its most recent IOS XE notice dated November 5, 2025, for IOS XE 17.17.x. Check the notice for the release you plan to run. A used unit that arrives on someone else's account or without its uplink module can cost more to fix than it saves.

## References

- https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9300-series-switches/nb-06-cat9300-swit-ser-cte-en.html
- https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9300-series-switches/nb-06-cat9300-ser-data-sheet-cte-en.html
- https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst_9000/cat9000-config-available-licenses.html
- https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9000-series-switches/catalyst-9000-licensing-wp.html
- https://www.cisco.com/c/en/us/support/docs/switches/catalyst-9300-series-switches/216520-migrate-catalyst-license-to-smart-licens.html
- https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/16-6/configuration_guide/sys_mgmt/b_166_sys_mgmt_9300_cg/b_166_sys_mgmt_9300_cg_chapter_01100.html
- https://www.cisco.com/c/en/us/products/switches/catalyst-9300-series-switches/eos-eol-notice-listing.html
- https://cfnng.cisco.com
- https://www.ebay.com/str/bestciscoseller
- https://essentialtechinc.com/c9300-24ux-a/
- https://commons.wikimedia.org/wiki/File:Cisco_switch_stack_-_IMG_0691.jpg
- https://commons.wikimedia.org/wiki/File:RJ45_Switch_Ports.jpg
