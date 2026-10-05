## The problem

You have an old Mac running Server, an install guide that names a version number, or a Mac that refuses to upgrade because the Server app is on it, and you need to know which macOS Server version goes with which macOS and what each one still did. Apple sold its server software for 23 years under three different names and two different business models, and it removed most of the services years before it stopped selling the app. Here is every version in order, with Apple's own dates where they exist.

## The short answer

The last version of macOS Server is **5.12.2**, and there will not be another. [Apple discontinued macOS Server on April 21, 2022](https://support.apple.com/en-us/101601). On that day Apple said existing customers "can continue to download and use the app with macOS Monterey," as [9to5Mac quoted](https://9to5mac.com/2022/04/21/apple-pulls-the-plug-on-dated-20-macos-server-app/) at the time, and [MacRumors reported](https://www.macrumors.com/2022/04/21/apple-discontinues-macos-server/) that 5.12.2 would be the last release. One macOS later the door closed: Apple's support article for the upgrade says "macOS Server is not supported in macOS Ventura," and it tells you to [delete the Server app before upgrading](https://support.apple.com/en-us/101947).

By the end, 5.12.2 did very little. Apple's own table lists only Profile Manager and Open Directory in versions 5.12 and later. Everything else had moved into macOS itself or been removed.

## The boxed years: Mac OS X Server 1.0 to 10.6

Mac OS X Server shipped before the consumer Mac OS X did. Version 1.0 went on sale on March 16, 1999 at $499 with an unlimited client license, according to Apple's announcement as [reprinted in MUUG Lines](https://centos.muug.ca/pub/muuglines/pdf/muug9904.pdf), and it was the NeXT-derived system Apple had been calling Rhapsody, as [CNET reported](https://www.cnet.com/tech/tech-industry/apple-opens-parts-of-its-os/) that day. From 10.0 onward, the server edition tracked each consumer release:

| Version | Released | Price (US) | What it added |
|---|---|---|---|
| 1.0 | March 16, 1999 | $499, unlimited clients | NeXT-derived base, Apache, WebObjects, NetBoot |
| 10.0 | May 21, 2001 | $499 for 10 clients, $999 unlimited | Apache, Samba, WebObjects 5, QuickTime Streaming Server 3 |
| 10.1 | September 25, 2001 | Same | Software RAID 0 and RAID 1 |
| 10.2 Jaguar | August 24, 2002 | $499 / $999 | Open Directory (LDAPv3), NetInstall, Workgroup Manager |
| 10.3 Panther | October 24, 2003 | $499 / $999 | Server Admin, Open Directory 2 with Kerberos, Samba 3, Postfix and Cyrus mail, VPN server |
| 10.4 Tiger | April 29, 2005 | $499 / $999 | 64-bit apps, iChat Server, Weblog Server, Xgrid, Software Update Server |
| 10.5 Leopard | October 26, 2007 | $499 / $999 | Podcast Producer, Wiki Server, iCal Server (CalDAV); the last for PowerPC |
| 10.6 Snow Leopard | August 28, 2009 | $499, unlimited clients | Intel only; Address Book Server (CardDAV), Mobile Access Server |

Sources for each row: Apple's announcements for [10.0](https://www.apple.com/newsroom/2001/05/21Apple-Introduces-Mac-OS-X-Server/), [10.1](https://www.apple.com/newsroom/2001/09/25Major-Mac-OS-X-Server-v10-1-Update-Now-Available/), [10.2](https://www.apple.com/newsroom/2002/07/17Apple-Announces-Mac-OS-X-Jaguar-Server-Worlds-Easiest-to-Manage-UNIX-Based-Server-Software/), [10.3](https://www.apple.com/newsroom/2003/10/08Apple-Announces-Mac-OS-X-Server-Panther/), [10.4](https://www.apple.com/newsroom/2005/04/12Apple-Announces-Mac-OS-X-Server-Tiger/), [10.5](https://www.apple.com/newsroom/2007/10/16Apple-Announces-Mac-OS-X-Server-Leopard/) and [10.6](https://www.apple.com/newsroom/2009/06/08Apple-Introduces-Mac-OS-X-Server-Snow-Leopard/), with the Snow Leopard ship date from [Apple's August 2009 release](https://www.apple.com/newsroom/2009/08/24Apple-to-Ship-Mac-OS-X-Snow-Leopard-on-August-28/). Sources disagree on the 1.0 price before launch, $995 in [Macworld](https://www.macworld.com/article/159076/appleintroduces.html) and $999 in CNET, but agree it shipped at $499.

## The app years: Lion Server through OS X Server 4

With OS X Lion in 2011, the server stopped being a separate operating system. [Lion Server](https://www.apple.com/newsroom/2011/07/20Mac-OS-X-Lion-Available-Today-From-the-Mac-App-Store/) was a $49.99 add-on from the Mac App Store, released on July 20, 2011. It brought Profile Manager, Apple's first device management server, and [Macworld's review](https://www.macworld.com/article/666716/mac-os-x-lion-server-review.html) noted that Apple had dropped Samba for its own SMB implementation.

A year later the price fell to $19.99 and the name changed to OS X Server. The app's version numbers stopped matching macOS here, which is the source of most confusion:

| Server app | Required macOS | Released |
|---|---|---|
| Lion Server | OS X Lion 10.7 | July 20, 2011 |
| OS X Server 2 | OS X Mountain Lion 10.8 | [July 25, 2012](https://www.apple.com/newsroom/2012/07/25Mountain-Lion-Available-Today-From-the-Mac-App-Store/) |
| OS X Server 3 | OS X Mavericks 10.9 | [October 22, 2013](https://www.apple.com/newsroom/2013/10/23OS-X-Mavericks-Available-Today-Free-from-the-Mac-App-Store/) |
| OS X Server 4 | OS X Yosemite 10.10 | [October 16, 2014](https://www.apple.com/newsroom/2014/10/16OS-X-Yosemite-Available-Today-as-a-Free-Upgrade/) |

Apple's [admin tools compatibility article](https://support.apple.com/en-us/HT201651) confirms the same mapping: version 2 for Mountain Lion, 3 for Mavericks and 4 for Yosemite.

## Server 5: one major version for seven years

Version 5 lasted from 2015 to the end, so the point release is what tells you which macOS it needs. Apple's security release notes and support pages give these:

| Server | Required macOS | First release |
|---|---|---|
| 5.0 | Yosemite 10.10.5 or El Capitan | [September 16, 2015](https://support.apple.com/en-us/103813) |
| 5.1 | El Capitan 10.11.4 | [March 21, 2016](https://support.apple.com/en-us/103178) |
| 5.2 | El Capitan 10.11.6 or Sierra 10.12 | [September 20, 2016](https://support.apple.com/en-us/HT207027) |
| 5.3 | Sierra 10.12.4 | [March 27, 2017](https://support.apple.com/en-us/HT205643) |
| 5.4 | High Sierra 10.13 | September 25, 2017 |
| 5.5 | High Sierra 10.13.3 | [January 2018](https://support.apple.com/en-us/100762) |
| 5.6 | High Sierra 10.13.3 or later | Spring 2018 |
| 5.7.1 | Mojave 10.14 | Fall 2018 |
| 5.8 | Mojave 10.14.4 or later | [Spring 2019](https://support.apple.com/guide/server/requirements-apd3c1d37ac/5.8/mac/10.14) |
| 5.9 and 5.10 | Catalina 10.15 | [Fall 2019 onward](https://support.apple.com/guide/server/requirements-apd3c1d37ac/5.9/mac/10.15) |
| 5.11 | Big Sur 11 | [December 14, 2020](https://support.apple.com/en-us/120989) |
| 5.12 to 5.12.2 | Monterey 12 | 2021 to 2022 |

Version 5.0 was a free upgrade for existing OS X Server users, as [iMore noted](https://www.imore.com/os-x-server-50-released-el-capitan-and-yosemite-users-can-upgrade-free), and 5.2 was the first to carry the name macOS Server. Apple's [Monterey note](https://support.apple.com/en-us/101904) is blunt about the last jump: "macOS Server 5.11.1 and earlier is not compatible with macOS Monterey. To use macOS Server with macOS Monterey, update to macOS Server 5.12." Exact days are missing above where no reliable source gives one. Release dates for 5.6, 5.7.1, 5.10 and the 5.12 builds vary between secondary sources by days or months, so this table gives the season instead.

## 2017 and 2018: Apple moves the useful parts into macOS

The decline started with a gift. In High Sierra and Server 5.4, Apple moved caching into macOS: "the Caching service moves out of macOS Server and into System Preferences > Sharing > Content Caching," its [5.4 notes](https://support.apple.com/en-us/HT207828) say, and "All File Sharing functionality has moved to macOS High Sierra." Time Machine server went the same way, and [Xcode Server moved into Xcode](https://support.apple.com/en-us/HT208041). The same release removed FTP.

Then came the cull. In January 2018 Apple warned that "a number of services will be deprecated, and will be hidden on new installations of an update to macOS Server coming in spring 2018," as [MacRumors reported](https://www.macrumors.com/2018/01/30/apple-kills-essential-services-macos-server/). Version 5.6 hid ten of them: Calendar, Contacts, DHCP, DNS, Mail, Messages, NetInstall, VPN, Websites and Wiki, per [TidBITS](https://tidbits.com/watchlist/macos-server-5-6/). Version 5.7.1, the first for Mojave, removed them. Apple's [migration guide](https://developer.apple.com/support/macos-server/macOS-Server-Service-Migration-Guide.pdf) put it plainly: new installations and upgrades "will require you to migrate most services to other software." What survived from 5.7.1 through 5.11.1 was Profile Manager, Open Directory and Xsan.

## April 2022: the end, and what went where

Xsan left first. "With the Xsan command-line management tools built into macOS Big Sur and later, you no longer need macOS Server to create and administer Xsan storage networks," [Apple says](https://support.apple.com/en-us/101843), and Xsan's interface was removed from Server 5.12. Then on April 21, 2022 Apple discontinued the app, explaining that the most popular features, caching, file sharing and Time Machine server, were already in every copy of macOS since High Sierra.

Two leftovers still matter. Profile Manager kept working on Monterey until Apple cut off its connection to Apple's push service: per Apple's table, "As of October 29, 2024, Profile Manager will no longer be able to create or renew push notification certificates," and "As of April 14th, 2025, Profile Manager will no longer be able to send push notifications." A device management server that cannot send push notifications cannot tell devices to do anything. And Open Directory does not stop when you remove the app: Apple's [user guide](https://support.apple.com/guide/server/apd9567d317/mac) says it "remains configured and running even after the app is removed."

## What to use instead

Apple's [discontinuation article](https://support.apple.com/en-us/101601) names alternatives for each removed service. They are worth reading as Apple's own word on what replaces what:

| Service | Removed in | Apple's suggested alternatives |
|---|---|---|
| FTP | 5.4 | SFTP over SSH |
| DNS | 5.7.1 | BIND, Unbound, KnotDNS |
| VPN | 5.7.1 | OpenVPN, SoftEther VPN, WireGuard |
| Mail | 5.7.1 | Dovecot and Postfix, Courier, Kerio Connect |
| Calendar | 5.7.1 | CalendarServer, DavMail, Radicale, Kerio Connect |
| Contacts | 5.7.1 | CalendarServer, DavMail, Kerio Connect |
| Wiki | 5.7.1 | MediaWiki, PmWiki, XWiki, Confluence, WordPress |
| Messages | 5.7.1 | ejabberd, Openfire, Prosody |
| RADIUS | 5.7.1 | FreeRADIUS |
| Xsan | 5.12 | Command-line tools in macOS, Quantum |
| Profile Manager | Last in 5.12.2 | An MDM solution of your choice |

For DHCP, the firewall and websites, Apple's table says only the interface was removed: bootpd, pf and Apache are still part of macOS. Apple names no replacement for Open Directory, so the realistic choices are binding Macs to an existing LDAP or Active Directory, covered in [Setting Up Active Directory in a Homelab](/blog/active-directory-homelab), or using your MDM's identity features. If you run your own DNS anyway, [DNS: The Infrastructure Most People Ignore](/blog/dns-fundamentals-infrastructure) is a good place to start.

## What breaks

**The Ventura upgrade stops because the Server app is installed.** Apple's installer refuses while Server is on the disk, because it is unsupported there. Fix: export what you need, then delete the Server app, as [Apple's article](https://support.apple.com/en-us/101947) describes, before upgrading.

**Managed devices stopped responding to commands.** Profile Manager lost the ability to send push notifications on April 14, 2025, so it can no longer reach devices. Fix: move devices to a current MDM. Apple's article only says to choose one; it does not name a product.

**An old LDAP server is still running on a Mac nobody manages.** Open Directory keeps running after the Server app is removed. Fix: migrate users to your new directory, then decommission Open Directory deliberately rather than assuming deletion did it.

**A guide tells you to enable DNS or DHCP in the Server app.** Those panes were hidden in 5.6 and removed in 5.7.1. Fix: run the replacement Apple lists, or configure the built-in daemons directly.

**Xsan clients after an upgrade.** Server 5.12 no longer manages Xsan. Fix: use the command-line Xsan tools built into macOS since Big Sur.

## What this means

macOS Server ended as a $19.99 app that managed devices and directories, a long way from the $999 server operating system it started as. The version mapping is simple once you see it: 10.x tracked macOS until Snow Leopard, the app was numbered 2 through 4 for Mountain Lion through Yosemite, and version 5 covered everything from Yosemite to Monterey, ending at 5.12.2. If you still depend on any of it, the dependable path is the one Apple's own table lays out: the built-in macOS services for caching, file sharing and Time Machine, a supported MDM for devices, and standard open source servers for everything else.

## References

- https://support.apple.com/en-us/101601
- https://9to5mac.com/2022/04/21/apple-pulls-the-plug-on-dated-20-macos-server-app/
- https://www.macrumors.com/2022/04/21/apple-discontinues-macos-server/
- https://support.apple.com/en-us/101947
- https://centos.muug.ca/pub/muuglines/pdf/muug9904.pdf
- https://www.cnet.com/tech/tech-industry/apple-opens-parts-of-its-os/
- https://www.macworld.com/article/159076/appleintroduces.html
- https://www.apple.com/newsroom/2001/05/21Apple-Introduces-Mac-OS-X-Server/
- https://www.apple.com/newsroom/2001/09/25Major-Mac-OS-X-Server-v10-1-Update-Now-Available/
- https://www.apple.com/newsroom/2002/07/17Apple-Announces-Mac-OS-X-Jaguar-Server-Worlds-Easiest-to-Manage-UNIX-Based-Server-Software/
- https://www.apple.com/newsroom/2003/10/08Apple-Announces-Mac-OS-X-Server-Panther/
- https://www.apple.com/newsroom/2005/04/12Apple-Announces-Mac-OS-X-Server-Tiger/
- https://www.apple.com/newsroom/2007/10/16Apple-Announces-Mac-OS-X-Server-Leopard/
- https://www.apple.com/newsroom/2009/06/08Apple-Introduces-Mac-OS-X-Server-Snow-Leopard/
- https://www.apple.com/newsroom/2009/08/24Apple-to-Ship-Mac-OS-X-Snow-Leopard-on-August-28/
- https://www.apple.com/newsroom/2011/07/20Mac-OS-X-Lion-Available-Today-From-the-Mac-App-Store/
- https://www.macworld.com/article/666716/mac-os-x-lion-server-review.html
- https://www.apple.com/newsroom/2012/07/25Mountain-Lion-Available-Today-From-the-Mac-App-Store/
- https://www.apple.com/newsroom/2013/10/23OS-X-Mavericks-Available-Today-Free-from-the-Mac-App-Store/
- https://www.apple.com/newsroom/2014/10/16OS-X-Yosemite-Available-Today-as-a-Free-Upgrade/
- https://support.apple.com/en-us/HT201651
- https://support.apple.com/en-us/103813
- https://support.apple.com/en-us/103178
- https://support.apple.com/en-us/HT207027
- https://support.apple.com/en-us/HT205643
- https://support.apple.com/en-us/100762
- https://support.apple.com/guide/server/requirements-apd3c1d37ac/5.8/mac/10.14
- https://support.apple.com/guide/server/requirements-apd3c1d37ac/5.9/mac/10.15
- https://support.apple.com/en-us/120989
- https://support.apple.com/en-us/101904
- https://www.imore.com/os-x-server-50-released-el-capitan-and-yosemite-users-can-upgrade-free
- https://support.apple.com/en-us/HT207828
- https://support.apple.com/en-us/HT208041
- https://www.macrumors.com/2018/01/30/apple-kills-essential-services-macos-server/
- https://tidbits.com/watchlist/macos-server-5-6/
- https://tidbits.com/watchlist/macos-server-5-7-1/
- https://developer.apple.com/support/macos-server/macOS-Server-Service-Migration-Guide.pdf
- https://support.apple.com/en-us/101843
- https://support.apple.com/guide/server/apd9567d317/mac
- https://tidbits.com/2022/04/21/apple-issues-kill-9-on-macos-server/
