# macOS Server versions: fact sheet (agent, checked 2026-10-05; 48 sources)

Corrections from agent: 5.0 ran on Yosemite 10.10.5 and El Capitan; 5.2 and 5.3 were Sierra; 5.4 first High Sierra. FTP and Server Docs removed in 5.4 (2017), not 2018. Apple never names Apple Business Manager as Profile Manager's replacement (only "choose an MDM solution"); no named Open Directory replacement.

## 1999 Mac OS X Server 1.0
- March 16, 1999, $499 unlimited clients (Apple release reprinted in MUUG Lines): https://centos.muug.ca/pub/muuglines/pdf/muug9904.pdf
- Rhapsody renamed: "Apple began adapting the Next operating system into an Apple-specific version called Rhapsody, now called Mac OS X Server." (CNET) https://www.cnet.com/tech/tech-industry/apple-opens-parts-of-its-os/
- Mach/BSD 4.4 base, Apache 1.3.4, WebObjects 4.01, NetBoot, AppleShare; preinstalled on Macintosh Server G3 for $4,999 (MUUG).
- Pre-launch price disagreement: Macworld "$995 for a software-only version" vs CNET "$999"; both agree launch at $499: https://www.macworld.com/article/159076/appleintroduces.html

## 2001-2009 boxed 10.0-10.6
- 10.0 May 21, 2001, $499 (10-client) / $999 (unlimited); Apache, Samba, WebObjects 5, QuickTime Streaming Server 3: https://www.apple.com/newsroom/2001/05/21Apple-Introduces-Mac-OS-X-Server/
- 10.1 Sept 25, 2001; $19.95 upgrade kit; "RAID support for disk striping (RAID-0) and disk mirroring (RAID-1)": https://www.apple.com/newsroom/2001/09/25Major-Mac-OS-X-Server-v10-1-Update-Now-Available/
- 10.2 Jaguar Aug 24, 2002 $499/$999; NetInstall, Workgroup Manager; "new Open Directory, an easy-to-setup LDAPv3 directory server": https://www.apple.com/newsroom/2002/07/17Apple-Announces-Mac-OS-X-Jaguar-Server-Worlds-Easiest-to-Manage-UNIX-Based-Server-Software/
- 10.3 Panther Oct 24, 2003 $499/$999; Server Admin, Open Directory 2 (Kerberos), Samba 3, Postfix/Cyrus, PPTP/L2TP VPN: https://www.apple.com/newsroom/2003/10/08Apple-Announces-Mac-OS-X-Server-Panther/
- 10.4 Tiger April 29, 2005 $499/$999; 64-bit apps, iChat Server, Weblog Server, Xgrid, Software Update Server: https://www.apple.com/newsroom/2005/04/12Apple-Announces-Mac-OS-X-Server-Tiger/
- 10.5 Leopard Oct 26, 2007 $499/$999; Podcast Producer, Wiki Server, iCal Server ("world's first commercial CalDAV standard-based calendar server"); last PowerPC ("Intel, PowerPC G5, or G4"): https://www.apple.com/newsroom/2007/10/16Apple-Announces-Mac-OS-X-Server-Leopard/
- 10.6 Snow Leopard Intel-only; Address Book Server (CardDAV), Mobile Access Server, Podcast Producer 2; "$499 with unlimited client licenses": https://www.apple.com/newsroom/2009/06/08Apple-Introduces-Mac-OS-X-Server-Snow-Leopard/ ; shipped Aug 28, 2009: https://www.apple.com/newsroom/2009/08/24Apple-to-Ship-Mac-OS-X-Snow-Leopard-on-August-28/

## 2011-2014 App Store add-on
- Lion Server July 20, 2011, Mac App Store $49.99: https://www.apple.com/newsroom/2011/07/20Mac-OS-X-Lion-Available-Today-From-the-Mac-App-Store/
- Lion Server added Profile Manager: https://support.apple.com/en-us/112430 ; dropped Samba, Apple's own SMB: https://www.macworld.com/article/666716/mac-os-x-lion-server-review.html
- Mountain Lion July 25, 2012: "OS X Server" $19.99: https://www.apple.com/newsroom/2012/07/25Mountain-Lion-Available-Today-From-the-Mac-App-Store/
- Mountain Lion app = 2.x ("updates OS X Server v2.0 or v2.1 to version 2.1.1"): https://support.apple.com/en-us/101044
- Server 3.0 Mavericks Oct 22, 2013 $19.99: https://www.apple.com/newsroom/2013/10/23OS-X-Mavericks-Available-Today-Free-from-the-Mac-App-Store/
- Server 4.0 Yosemite Oct 16, 2014 $19.99: https://www.apple.com/newsroom/2014/10/16OS-X-Yosemite-Available-Today-as-a-Free-Upgrade/
- Admin tools compatibility (2 = ML, 3 = Mavericks, 4 = Yosemite): https://support.apple.com/en-us/HT201651

## 2015-2022 Server 5.x
- 5.0 (5.0.3) Sept 16, 2015, "OS X Yosemite v10.10.5 and later": https://support.apple.com/en-us/103813 ; 5.0.15 "requires OS X Yosemite v10.10.5 or OS X El Capitan v10.11.1": https://support.apple.com/en-us/HT205361 ; free for Yosemite Server users (iMore): https://www.imore.com/os-x-server-50-released-el-capitan-and-yosemite-users-can-upgrade-free
- 5.1 March 21, 2016, El Capitan 10.11.4: https://support.apple.com/en-us/103178
- 5.2 Sept 20, 2016, first named "macOS Server"; "requires OS X 10.11.6 or macOS Sierra 10.12": https://support.apple.com/en-us/HT207027
- 5.3 March 27, 2017, "requires macOS Sierra 10.12.4": https://support.apple.com/en-us/HT205643
- 5.4 Sept 25, 2017, High Sierra 10.13: https://support.apple.com/en-us/103178
- 5.5 Jan 2018 (High Sierra 10.13.3): https://support.apple.com/en-us/100762
- 5.6 spring 2018 (TidBITS April 3; exact day UNVERIFIED): https://tidbits.com/watchlist/macos-server-5-6/
- 5.7.1 first Mojave release, "macOS Server now requires macOS 10.14 Mojave" (date Sept 28 or 30, 2018 disputed): https://tidbits.com/watchlist/macos-server-5-7-1/ ; https://www.macstrategy.com/article.php?201=
- 5.8 macOS 10.14.4 or later: https://support.apple.com/guide/server/requirements-apd3c1d37ac/5.8/mac/10.14
- 5.9 macOS 10.15 or later (Oct 8, 2019 per MacStrategy): https://support.apple.com/guide/server/requirements-apd3c1d37ac/5.9/mac/10.15
- 5.10 Catalina (date UNVERIFIED)
- 5.11 Dec 14, 2020, Big Sur: https://support.apple.com/en-us/120989
- 5.12 Monterey: "macOS Server 5.11.1 and earlier is not compatible with macOS Monterey. To use macOS Server with macOS Monterey, update to macOS Server 5.12.": https://support.apple.com/en-us/101904 (5.12 date UNVERIFIED)
- 5.12.1 requires macOS 12 or later: https://support.apple.com/guide/server/requirements-apd3c1d37ac/mac
- 5.12.2 date UNVERIFIED (Dec 8, 2021 vs April 21, 2022 conflict)
- 5.x price "$19.99 new, free update": https://tidbits.com/watchlist/macos-server-5-11/

## 2017 High Sierra absorbs services (5.4)
- "In macOS High Sierra and macOS Server 5.4, the Caching service moves out of macOS Server and into System Preferences > Sharing > Content Caching.": https://support.apple.com/en-us/HT207828
- "All File Sharing functionality has moved to macOS High Sierra." (HT207828)
- "Caching Server, Time Machine Server, and File Sharing advanced options are now built directly into macOS."; "Xcode Server has been integrated into Xcode.": https://support.apple.com/en-us/HT208041
- "macOS Server 5.4 removes the FTP service when you upgrade." (HT207828); FTP "Removed in Server 5.4": https://support.apple.com/en-us/101601

## 2018 deprecation (5.6) then removal (5.7.1)
- Jan 2018 "A number of services will be deprecated, and will be hidden on new installations of an update to macOS Server coming in spring 2018." (MacRumors quoting Apple): https://www.macrumors.com/2018/01/30/apple-kills-essential-services-macos-server/
- 5.6 hid ten services: Calendar, Contacts, DHCP, DNS, Mail, Messages, NetInstall, VPN, Websites, Wiki: https://tidbits.com/watchlist/macos-server-5-6/
- "Then in the fall of 2018, new installations and upgrades of macOS Server will require you to migrate most services to other software." (Apple Migration Guide): https://developer.apple.com/support/macos-server/macOS-Server-Service-Migration-Guide.pdf
- Apple's alternatives table (https://support.apple.com/en-us/101601): DNS "BIND, Unbound, KnotDNS"; VPN "OpenVPN, SoftEther VPN, WireGuard"; Mail "dovecot/Postfix", "Courier, KerioConnect"; Calendar "CalendarServer, DavMail, Radicale, Kerio Connect"; Contacts "CalendarServer, DavMail, Kerio Connect"; Wiki "MediaWiki, PmWiki, XWiki, Confluence, WordPress"; Messages "ejabberd, Openfire, Prosody"; Radius "FreeRadius"; AirPort Management "AirPort Utility". DHCP (bootpd), Firewall (pf), Websites (Apache), NetBoot/NetInstall: only "UI tools" removed.
- Kept "macOS Server 5.7.1 through 5.11.1": "Profile Manager, Open Directory, Xsan".
- Software Update service "being replaced by managed software updates from a supported mobile device management (MDM) solution and the content caching service" (Migration Guide).

## 2020-2022 the end
- "With the Xsan command-line management tools built into macOS Big Sur and later, you no longer need macOS Server to create and administer Xsan storage networks."; Xsan UI hidden in 5.11.1 and "removed from macOS Server 5.12.": https://support.apple.com/en-us/101843
- April 21, 2022: "As of April 21, 2022, Apple has discontinued macOS Server. Existing macOS Server customers can continue to download and use the app with macOS Monterey.": https://9to5mac.com/2022/04/21/apple-pulls-the-plug-on-dated-20-macos-server-app/
- Apple's reason: "The most popular server features... Caching Server, File Sharing Server, and Time Machine Server are bundled with every installation of macOS High Sierra and later" (quote contains an em dash in original; paraphrase).
- Profile Manager "Available in Server 5.12.2": https://support.apple.com/en-us/101601 ; MacRumors "macOS Server 5.12.2 will be the last version of the app": https://www.macrumors.com/2022/04/21/apple-discontinues-macos-server/
- 5.12+ included only Profile Manager and Open Directory (101601).
- Profile Manager replacement: Apple says "learn about choosing an MDM solution and planning your MDM migration" (101601). TidBITS speculation re Apple Business Essentials: https://tidbits.com/2022/04/21/apple-issues-kill-9-on-macos-server/
- "Open Directory remains configured and running even after the app is removed.": https://support.apple.com/guide/server/apd9567d317/mac
- "As of October 29, 2024, Profile Manager will no longer be able to create or renew push notification certificates"; "As of April 14th, 2025, Profile Manager will no longer be able to send push notifications." (101601)

## After Monterey
- Ventura: "macOS Server is not supported in macOS Ventura."; must remove the Server app before upgrading: https://support.apple.com/en-us/101947
- Sonoma/Sequoia/Tahoe: no Apple statement (UNVERIFIED).
- Apple's live guide still says 5.12.1 needs "macOS 12 or later" (contradiction).
- App Store page https://apps.apple.com/us/app/macos-server/id883878097 returned 404 on 2026-10-05 (agent's own check).
