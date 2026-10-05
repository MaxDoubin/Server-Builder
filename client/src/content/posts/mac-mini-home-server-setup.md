
## The short answer

A Mac mini makes a quiet always-on home server once you change four defaults: stop it sleeping, make it start itself after a power failure, decide on FileVault, and give it a wired connection with a fixed address. Apple's [own Mac mini server guide](https://support.apple.com/guide/mac-mini/set-up-your-macmini-as-a-server-apd05a94454f/2026/mac/27), written for macOS 27, covers the same ground, and the M6 and M5 Pro minis [became available September 22, 2026](https://www.apple.com/newsroom/2026/09/the-new-mac-mini-and-mac-studio-are-available-today/). Every Apple silicon mini back to the 2020 M1 [still runs macOS 27](https://support.apple.com/en-us/102852), and on macOS 26 and later an Apple silicon Mac can [unlock FileVault over SSH](https://support.apple.com/guide/security/managing-filevault-sec8447f5049/web) after a restart, so a headless mini no longer has to run unencrypted. Apple lists idle draw at [4 W](https://support.apple.com/en-us/103253) for the M6 and the 2024 M4, about $6.42 a year at the July 2026 U.S. residential average of [18.31 cents per kilowatt-hour](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a).

## Which Mac mini should you use as a home server?

Any Apple silicon Mac mini works, and the model matters mostly for Ethernet speed, memory and how long macOS updates will last. The M6 and M5 Pro [start at $899 and $1,699](https://www.apple.com/newsroom/2026/09/the-new-mac-mini-and-mac-studio-are-available-today/). The table uses [Apple's newest-macOS list](https://support.apple.com/en-us/102852) and [Apple's power figures](https://support.apple.com/en-us/103253); cost is idle watts times 8,760 hours at 18.31 cents per kilowatt-hour.

| Mac mini | Newest macOS | Idle / maximum watts | Idle cost per year |
| :--- | :--- | ---: | ---: |
| M6 (2026) | macOS 27 | 4 / 70 | $6.42 |
| M5 Pro (2026) | macOS 27 | 6 / 145 | $9.62 |
| M4 (2024) | macOS 27 | 4 / 65 | $6.42 |
| M4 Pro (2024) | macOS 27 | 5 / 140 | $8.02 |
| M2 (2023) | macOS 27 | 7 / 50 (CPU maximum) | $11.23 |
| M1 (2020) | macOS 27 | 6.8 / 39 (CPU maximum) | $10.91 |
| Intel Core i7 (2018) | macOS Sequoia 15 | 19.9 / 122 (CPU maximum) | $31.92 |

Apple measures idle [with only Finder open and default power management](https://support.apple.com/en-us/103253), at the wall. Notebookcheck's meter read [2.1 to 2.4 W idle, 0.47 W in standby and a 74.3 W peak](https://www.notebookcheck.net/Compact-powerhouse-with-the-2-nm-M6-SoC-Apple-Mac-mini-2026-Review.1401148.0.html) for the M6, and the same review lists 2.6 to 2.7 W idle for the M4, both below Apple's 4 W. Budget with Apple's figure, because its test conditions are stated, and treat Notebookcheck's as the floor. Apple's rows are single configurations; the M5 Pro figure is for 64GB and 8TB, and drives or load add more.

The 2018 Intel mini tops out at Sequoia, and Apple shipped [Sequoia 15.8.1 on September 28, 2026](https://support.apple.com/en-us/100100). Memory is a configure-to-order choice on current minis, [16GB standard on the M6](https://www.apple.com/newsroom/2026/09/the-new-mac-mini-and-mac-studio-are-available-today/), so size it for your containers on day one.

## Which energy settings keep a Mac mini awake and restarting after a power failure?

In System Settings, open Energy, stop automatic sleep when the display is off, turn on Wake for network access as a fallback, and set the power-return option. Apple's [Energy settings page](https://support.apple.com/guide/mac-help/change-energy-settings-mchlp1168/mac) describes each one, and the labels vary by Mac and macOS version.

<figure>
<img src="/images/blog/mac-mini-home-server-setup/power-button.jpg" alt="Power button on the underside of an M4 Mac mini, beside the ring-shaped air vent" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>The M4 Mac mini's power button sits on its underside near a rear corner, so a mini on a shelf is awkward to restart by hand. The power-return setting removes the need after an outage. Photo: Kyu3a, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Power_Button_of_M4_Mac_mini.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

Power return comes in two versions. A mini introduced in 2024 or later on macOS 26.5 or later has "Start up when power is connected," and [Apple says Always](https://support.apple.com/en-us/125517) turns the Mac on whenever it is connected to power, including "restoring power using an external power switch," and after a power failure. Older minis list "Start up automatically after a power failure." The power button is on the bottom near the rear left corner, which [Notebookcheck calls annoying](https://www.notebookcheck.net/Compact-powerhouse-with-the-2-nm-M6-SoC-Apple-Mac-mini-2026-Review.1401148.0.html), so a mini on a shelf is awkward to restart by hand.

### The pmset equivalents

pmset must run as root. Start with `pmset -g cap`, which the [man page](https://keith.github.io/xcode-man-pages/pmset.1.html) says displays which power management features your Mac supports.

| Command | Effect |
| :--- | :--- |
| `sudo pmset -a sleep 0` | Sets the system sleep timer to never; 0 disables it |
| `sudo pmset -a womp 1` | Wakes on an Ethernet magic packet, the same as Wake for network access |
| `sudo pmset -a autorestartatconnect 1` | 2024 or newer mini on macOS 26.5 or later: [sets Always](https://derflounder.wordpress.com/2026/05/12/using-pmset-to-set-your-mac-to-automatically-power-on-when-power-is-available-on-macos-tahoe-26-5-0/) |
| `sudo pmset -a autorestart 1` | Older minis: automatic restart on power loss |
| `pmset -g assertions` | Lists processes holding power assertions that can block sleep |

Each key you set should report the value you gave it. Older minis use `autorestart`, and a 2024 or newer mini on macOS 26.5 or later also shows `autorestartatconnect`.

```bash
pmset -g | grep -E "sleep|womp|autorestart"
```

```
 sleep                0
 womp                 1
 autorestartatconnect 1
```

Some guides also recommend `pmset networkoversleep 1`. The man page says that setting is [not used by all platforms and that changing it is unsupported](https://keith.github.io/xcode-man-pages/pmset.1.html), so skip it. `sudo pmset restoredefaults` undoes your changes.

### Add a UPS

A UPS covers the gap before a clean shutdown. Energy > UPS Options sets the time or battery level at which the Mac shuts down, and `sudo pmset -u haltafter 2` shuts it down after 2 minutes on battery. [Sizing a UPS](/blog/ups-sizing-homelab) is a separate calculation.

## Should a headless Mac mini use FileVault and automatic login?

Keep FileVault on if the mini holds personal data and runs macOS 26 or later, and unlock it over SSH after restarts. Turn FileVault off, with automatic login, only if the mini sits somewhere locked and must recover with nobody reachable. Apple silicon Macs [encrypt data automatically](https://support.apple.com/guide/mac-help/protect-data-on-your-mac-with-filevault-mh11785/mac), FileVault adds the login password requirement, and [automatic login is unavailable](https://support.apple.com/en-us/102316) while it is on.

| Setup | After a power failure | Cost |
| :--- | :--- | :--- |
| FileVault off, automatic login | Boots into your account and starts login items | Anyone who powers it on gets a logged-in session |
| FileVault on, macOS 26 or later | Waits at the lock screen until you unlock it over SSH | You must reach it on the LAN |
| FileVault on, macOS 15 or earlier | Waits until someone types the password at the machine | You must be there |

Apple says the SSH unlock needs [Apple silicon, macOS 26 or later, Remote Login and a network connection](https://support.apple.com/guide/security/managing-filevault-sec8447f5049/web). It is password-only: the [apple_ssh_and_filevault man page](https://keith.github.io/xcode-man-pages/apple_ssh_and_filevault.7.html) explains that OpenSSH keeps its configuration in the locked data volume, so key authentication is unavailable until you unlock, and SSH disconnects briefly while macOS mounts the volume. One user [reports](https://deepakness.com/raw/remote-filevault-unlock-macos-tahoe/) that it failed on Wi-Fi and worked on Ethernet.

For restarts you start yourself, `sudo fdesetup authrestart` [bypasses the initial unlock](https://keith.github.io/xcode-man-pages/fdesetup.8.html); run `sudo fdesetup supportsauthrestart` first. The man page warns that "FileVault protections are reduced during authenticated restarts."

Login still matters after the unlock. Apple's developer documentation says a [user agent runs only while that user is logged in](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html), Docker Desktop's [start-at-sign-in option](https://docs.docker.com/desktop/settings-and-maintenance/settings/) is off by default, and Tailscale's [Standalone app cannot run before login](https://tailscale.com/docs/concepts/macos-variants). With FileVault on, run server software as launch daemons where you can.

## How do you reach a headless Mac mini remotely?

Turn on Remote Login for SSH and Screen Sharing for the desktop under System Settings > General > Sharing, and test both before you unplug the display. Apple's server guide says to [make sure you can manage the mini](https://support.apple.com/guide/mac-mini/set-up-your-macmini-as-a-server-apd05a94454f/2026/mac/27) through one of them or your server software.

For SSH, Apple's [Remote Login page](https://support.apple.com/guide/mac-help/allow-a-remote-computer-to-access-your-mac-mchlp1066/mac) gives the form `ssh username@hostname`. Once you are in, set up [key-based authentication](/blog/ssh-key-based-authentication).

For Screen Sharing, Apple's [type options page](https://support.apple.com/guide/mac-help/screen-sharing-type-options-on-mac-mchl1883115d/mac) says High Performance needs Apple silicon and macOS Sonoma 14 or later, 75 megabits per second for one 4K display, and UDP ports 5900, 5901 and 5902, and it recommends a wired connection. A virtual display tops out at 4K.

Away from home, use a VPN rather than forwarding ports. Tailscale's open-source tailscaled variant can run before login, but Tailscale says it is [only recommended for unattended installs managed by experienced macOS system administrators](https://tailscale.com/docs/concepts/macos-variants). Because the [data volume stays locked until you unlock it](https://keith.github.io/xcode-man-pages/apple_ssh_and_filevault.7.html), software installed on the mini cannot be relied on first, so reach its LAN address through your router's VPN or another always-on device.

## Which container runtime fits a Mac mini: Docker Desktop, OrbStack or Apple's container tool?

Use Docker Desktop or OrbStack for mainstream container workloads, and try Apple's container tool for single services. Apple's [container](https://github.com/apple/container) runs Linux containers as lightweight virtual machines, needs Apple silicon, and its README says it is supported on macOS 26 and does not mention macOS 27. The project says it is under active development.

| | Docker Desktop | OrbStack | Apple container |
| :--- | :--- | :--- | :--- |
| Memory model | VM limit defaults to [50% of host memory](https://docs.docker.com/desktop/settings-and-maintenance/settings/) | Limit is [no more than 8 GB by default](https://docs.orbstack.dev/settings), released when unused | One VM per container, [1 GB RAM and 4 CPUs by default](https://github.com/apple/container/blob/main/docs/resource-usage.md) |
| Starts | At sign-in, off by default | Not stated on the pages read | Launch agent started by `container system start` |

On a 16GB mini, Docker's default is an 8GB ceiling, and its Resource Saver [turns the VM off when idle](https://docs.docker.com/desktop/settings-and-maintenance/settings/). Apple's [technical overview](https://github.com/apple/container/blob/main/docs/technical-overview.md) admits a limitation: pages freed inside a container's VM are not returned to macOS, so memory-hungry containers may need occasional restarts.

Idle-memory figures in blog comparisons vary widely, so this article gives none. The vendors' documented limits describe configured behavior; measure your own with Activity Monitor or `container stats`.

## How do you add file sharing, a Time Machine server and a media server?

File Sharing and Time Machine destinations are built into macOS, so only media needs extra software. Turn on File Sharing in General > Sharing, then Options > "Share files and folders using SMB." For a Time Machine destination, add a shared folder, Control-click it, choose Advanced Options and turn on ["Share as a Time Machine backup destination"](https://support.apple.com/guide/mac-help/back-up-to-a-shared-folder-mchl31533145/mac); "Limit backups to" caps its size.

<figure>
<img src="/images/blog/mac-mini-home-server-setup/m1-ports.jpg" alt="Rear panel of a 2020 M1 Mac mini with power button, power inlet, Ethernet, two Thunderbolt ports, HDMI, two USB-A ports and a headphone jack" width="1200" height="597" loading="lazy" decoding="async">
<figcaption>The 2020 M1 Mac mini keeps two USB-A ports beside its two Thunderbolt ports, which suits external backup drives. The 2024 redesign is USB-C only, with two of its ports on the front. Photo: Gerd Fahrenhorst, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Mac_mini_2020_(M1)_Anschl%C3%BCsse.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

For media, [Plex](https://support.plex.tv/articles/115002178853-using-hardware-accelerated-streaming/) says hardware-accelerated streaming needs a Plex Pass and lists macOS VideoToolbox as the native decoder and encoder. [Jellyfin](https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/) lists VideoToolbox, full acceleration on Intel and Apple silicon Macs running macOS 12 or later, and 10-bit H.264 hardware decoding only on Apple silicon and Rockchip.

A Time Machine share on the mini does not protect the mini. Back up its own data to an external disk and follow the [3-2-1 rule](/blog/backup-strategy-321-rule).

## What network setup does a Mac mini server need?

Use Ethernet, give the mini a DHCP reservation, and buy 10GbE only if your switch and storage can use it. Apple recommends [a wired connection](https://support.apple.com/guide/mac-help/screen-sharing-type-options-on-mac-mchl1883115d/mac) for High Performance Screen Sharing, and the one report above favors it for SSH unlock.

<figure>
<img src="/images/blog/mac-mini-home-server-setup/rear-ports.jpg" alt="Rear panel of a 2024 M4 Mac mini with power inlet, Ethernet port, HDMI port and three Thunderbolt ports" width="1200" height="818" loading="lazy" decoding="async">
<figcaption>The back of a 2024 M4 Mac mini: one Ethernet jack, Gigabit unless 10Gb Ethernet was ordered, plus HDMI and three Thunderbolt ports. Photo: AzureSaturn, <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Mac_mini_(M4,_2024)_-_Backside.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

Wi-Fi also complicates reservations. Apple's [private address feature](https://support.apple.com/en-us/102509) gives each network a different MAC address and, in Rotating mode, changes it every 2 weeks; Off uses the hardware address. Microsoft says a [reservation](https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-scopes) ties an address to a MAC and lets you change addresses without signing in to the device. Apple's server guide instead suggests [DHCP with a manual address](https://support.apple.com/guide/mac-mini/set-up-your-macmini-as-a-server-apd05a94454f/2026/mac/27) so the address does not change.

The M6 and M5 Pro have [2.5Gb Ethernet with a 10Gb option](https://www.apple.com/newsroom/2026/09/the-new-mac-mini-and-mac-studio-are-available-today/); the 2024 M4 has [Gigabit, configurable to 10Gb](https://support.apple.com/en-us/121555). Notebookcheck says the 10Gb port costs [$100](https://www.notebookcheck.net/Compact-powerhouse-with-the-2-nm-M6-SoC-Apple-Mac-mini-2026-Review.1401148.0.html). Without it, Sonnet's Thunderbolt adapter [needs macOS 15 or later](https://www.sonnettech.com/product/solo10g-tb3/techspecs.html), runs 10GBASE-T to 100 meters on Cat 6A and 55 on Cat 6, and reaches 2.5 or 5 Gbps only through multi-gigabit switches. See [10GbE in a homelab](/blog/10gbe-networking-homelab).

## Mac mini home server setup checklist

1. Finish initial setup with a display and keyboard, as Apple says to [do first](https://support.apple.com/guide/mac-mini/set-up-your-macmini-as-a-server-apd05a94454f/2026/mac/27), with a strong login password.
2. Connect Ethernet and reserve an address on the router, or choose DHCP with a manual address.
3. Turn on Remote Login and Screen Sharing, then test both from another computer.
4. In Energy, prevent automatic sleeping, turn on Wake for network access and set the power-return option.
5. Run `pmset -g` and confirm `sleep 0`.
6. Decide on FileVault. If it stays on, save the recovery key and test the SSH unlock.
7. Turn on the firewall and allow the apps you run.
8. Choose manual or automatic macOS updates.
9. Install your container runtime, set memory limits and make it start without a login.
10. Add File Sharing, a Time Machine folder and your media server as needed.
11. Attach a UPS and set its shutdown threshold.
12. Restart from another computer and confirm every service returns; once, cut power at the outlet to test the power-return setting.

## What breaks

**The mini sleeps and drops off the network.** Apple's server guide warns that if a mini [goes to sleep, running tasks may be interrupted](https://support.apple.com/guide/mac-mini/set-up-your-macmini-as-a-server-apd05a94454f/2026/mac/27). Fix: turn on "Prevent automatic sleeping when the display is off," run `sudo pmset -a sleep 0` and confirm with `pmset -g`.

**A power failure leaves it off.** The power-return behavior differs by model and macOS version, and Apple's guide says to set the mini to restart automatically. Fix: set Start up when power is connected to Always, or on older minis Start up automatically after a power failure, then add a UPS.

**A restart stops at the FileVault lock screen.** The data volume stays locked until an account password is entered. Fix: on macOS 26 or later, SSH in and enter the account password; use `sudo fdesetup authrestart` for restarts you start yourself.

**An update restarts the mini and apps do not come back.** Apple's server guide says that after [a power outage or a macOS update](https://support.apple.com/guide/mac-mini/set-up-your-macmini-as-a-server-apd05a94454f/2026/mac/27) some server apps "may need to be relaunched manually." Fix: update manually in a window you choose and configure each app to start automatically.

**Containers eat memory.** Docker's VM can claim up to half of RAM and Apple's tool does not return freed memory. Fix: set memory limits and restart heavy containers.

**A reservation stops matching on Wi-Fi.** A private Wi-Fi address is not the hardware address. Fix: use Ethernet, or set Private Wi-Fi Address to Fixed or Off for that network.

## Frequently asked questions

### Can an old Intel Mac mini still be a home server?

Yes, with limits. Apple lists [Sequoia for the 2018, Monterey for the Late 2014 and Catalina for the Late 2012](https://support.apple.com/en-us/102852). The 2018 draws 19.9 W idle against 4 W for the M4, $31.92 against $6.42 a year. Apple's container tool needs Apple silicon, and Docker Desktop supports the [current and two previous macOS releases](https://docs.docker.com/desktop/setup/install/mac-install/), so Sequoia should drop out when macOS 28 ships.

<figure>
<img src="/images/blog/mac-mini-home-server-setup/intel-2018.jpg" alt="Top view of a space gray 2018 Intel Mac mini on a wooden desk" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>A 2018 Intel Mac mini. Apple lists its Core i7 configuration at 19.9 W idle, about five times the M4's 4 W, and its newest macOS is Sequoia. Photo: Derorgmas, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Mac_Mini_(2018).jpg">Wikimedia Commons</a>.</figcaption>
</figure>

### Do I need an HDMI dummy plug to run it without a monitor?

Apple's server guide does not require one. It says [High Performance Screen Sharing](https://support.apple.com/guide/mac-mini/set-up-your-macmini-as-a-server-apd05a94454f/2026/mac/27) improves the resolution of the virtual display, at up to 4K.

### How much electricity does a Mac mini server use?

Apple lists 4 W idle for the M6 and M4, with maximums of [70 W and 65 W](https://support.apple.com/en-us/103253). Notebookcheck measured 2.1 to 2.4 W idle on the M6, or $3.37 to $3.85 a year at 18.31 cents per kilowatt-hour.

### Should a server run macOS 27 or stay on 26?

Apple still patches all three: its [security page](https://support.apple.com/en-us/100100) lists macOS 27.0.1, Tahoe 26.7.1 and Sequoia 15.8.1 on September 28, 2026. Apple's container README names only macOS 26, so check each tool's notes before upgrading a working server.

## What this means

Buy an M6, or a used M4 or M1, connect Ethernet, set the Energy options and decide on FileVault deliberately. If the mini holds personal data, keep FileVault on and learn the SSH unlock; if it sits in a locked closet, automatic login is simpler. Then run the restart test; it finds what the settings missed. Use a 2018 Intel mini only for light, LAN-only jobs.

## References

- [Apple: Set up your Mac mini as a server](https://support.apple.com/guide/mac-mini/set-up-your-macmini-as-a-server-apd05a94454f/2026/mac/27)
- [Apple: Change Energy settings on a Mac desktop computer](https://support.apple.com/guide/mac-help/change-energy-settings-mchlp1168/mac)
- [Apple: Turn on a Mac mini, Mac Studio, or iMac without pressing its power button](https://support.apple.com/en-us/125517)
- [Apple: Mac mini power consumption and thermal output](https://support.apple.com/en-us/103253)
- [Apple: Identify your Mac mini model](https://support.apple.com/en-us/102852)
- [Apple: Mac mini (2024) tech specs](https://support.apple.com/en-us/121555)
- [Apple Newsroom: The new Mac mini and Mac Studio are available today](https://www.apple.com/newsroom/2026/09/the-new-mac-mini-and-mac-studio-are-available-today/)
- [Apple: Apple security releases](https://support.apple.com/en-us/100100)
- [Apple: How to log in automatically to a Mac user account](https://support.apple.com/en-us/102316)
- [Apple: Protect data on your Mac with FileVault](https://support.apple.com/guide/mac-help/protect-data-on-your-mac-with-filevault-mh11785/mac)
- [Apple Platform Security: Managing FileVault in macOS](https://support.apple.com/guide/security/managing-filevault-sec8447f5049/web)
- [Apple: Allow a remote computer to access your Mac](https://support.apple.com/guide/mac-help/allow-a-remote-computer-to-access-your-mac-mchlp1066/mac)
- [Apple: Screen sharing type options on Mac](https://support.apple.com/guide/mac-help/screen-sharing-type-options-on-mac-mchl1883115d/mac)
- [Apple: Back up to a shared folder with Time Machine](https://support.apple.com/guide/mac-help/back-up-to-a-shared-folder-mchl31533145/mac)
- [Apple: Use private Wi-Fi addresses on Apple devices](https://support.apple.com/en-us/102509)
- [Apple Developer: Creating Launch Daemons and Agents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- [pmset(1) man page](https://keith.github.io/xcode-man-pages/pmset.1.html)
- [fdesetup(8) man page](https://keith.github.io/xcode-man-pages/fdesetup.8.html)
- [apple_ssh_and_filevault(7) man page](https://keith.github.io/xcode-man-pages/apple_ssh_and_filevault.7.html)
- [Der Flounder: Using pmset to power on a Mac when power is available](https://derflounder.wordpress.com/2026/05/12/using-pmset-to-set-your-mac-to-automatically-power-on-when-power-is-available-on-macos-tahoe-26-5-0/)
- [DeepakNess: Remote FileVault unlock in macOS Tahoe 26](https://deepakness.com/raw/remote-filevault-unlock-macos-tahoe/)
- [Tailscale: macOS variants](https://tailscale.com/docs/concepts/macos-variants)
- [apple/container on GitHub](https://github.com/apple/container)
- [apple/container: resource usage](https://github.com/apple/container/blob/main/docs/resource-usage.md)
- [apple/container: technical overview](https://github.com/apple/container/blob/main/docs/technical-overview.md)
- [Docker Docs: Desktop settings](https://docs.docker.com/desktop/settings-and-maintenance/settings/)
- [Docker Docs: Install Docker Desktop on Mac](https://docs.docker.com/desktop/setup/install/mac-install/)
- [OrbStack docs: Settings](https://docs.orbstack.dev/settings)
- [Plex: Using hardware-accelerated streaming](https://support.plex.tv/articles/115002178853-using-hardware-accelerated-streaming/)
- [Jellyfin: Hardware acceleration](https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/)
- [Microsoft Learn: DHCP scopes in Windows Server](https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-scopes)
- [Notebookcheck: Apple Mac mini 2026 review](https://www.notebookcheck.net/Compact-powerhouse-with-the-2-nm-M6-SoC-Apple-Mac-mini-2026-Review.1401148.0.html)
- [Sonnet: Solo10G Thunderbolt adapter tech specs](https://www.sonnettech.com/product/solo10g-tb3/techspecs.html)
- [U.S. EIA: Electric Power Monthly, Table 5.6.A](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a)
