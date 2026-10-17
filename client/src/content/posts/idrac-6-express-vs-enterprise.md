
## The problem

Someone with an 11th generation PowerEdge, such as an R610, R710 or T610, opens the iDRAC6 web interface and finds that the Virtual Console errors out or never appears. Before changing browser or Java settings, that person needs to know whether the controller has the console at all, because the Express tier does not. The answer also decides whether a Java fix is worth any time.

## Express is the default on the 600 to 900 series

[Wikipedia's version table](https://en.wikipedia.org/wiki/Dell_DRAC) dates iDRAC 6 Express to 2008 and describes it as "Standard on all midrange systems." [Wikipedia's PowerEdge list](https://en.wikipedia.org/wiki/List_of_PowerEdge_servers) places the R610, R710 and T610 in Generation 11, a section that reads "Released by Dell in 2010." The same list dates the PowerEdge 1950, a Generation 9 model, to 2006. Community replies report the same default. [A 2014 forum reply](https://www.dell.com/community/en/conversations/systems-management-general/idrac-6-express-virtual-console/647f4c88f4ccf8a8de53b493) says Express is standard on the 600 to 900 series and that "iDRAC 6 Express can be upgraded to Enterprise by installing a physical card." An R610 or R710 is therefore more likely to have Express than Enterprise. The console test that follows settles which one you have.

## Express and Enterprise split the features

[Wikipedia's Dell DRAC article](https://en.wikipedia.org/wiki/Dell_DRAC) says "Certain features are not available for the Express version," and it names "the remote console functionality and the vFlash SD card slot" among them. The same article says that taking advantage of "storage greater than 256 MB on the iDRAC6 enterprise" requires a vFlash SD card, which Express does not have. [Dell's virtual media support article](https://www.dell.com/support/kbdoc/en-us/000124001/using-the-virtual-media-function-on-idrac-6-7-8-and-9) adds that the "Enterprise module (iDRAC6) is required to access this function." [Velocity Tech Solutions' license guide](https://velocitytechsolutions.com/blog/idrac-license-level-guide-tech-help-blog/) says Express "includes the majority of iDrac features" but has none of the virtual console functionality.

| Feature | iDRAC6 Express | iDRAC6 Enterprise |
|---|---|---|
| Remote console (Virtual Console) | Not available | Available |
| Virtual media | Not available | Available |
| vFlash SD card slot | Not available | Available |
| Network port | Shared with an on-board port | Dedicated port |
| Java KVM console | Not available | Available |

[NetApp's knowledge base](https://kb.netapp.com/on-prem/solidfire/hardware_Kbs/What_is_the_difference_between_iDRAC_Express_and_iDRAC_Enterprise_and_how_to_configure) says Express uses "a shared NIC setup by leveraging one of the on-board 1GbE ports." It adds that Express allows "most iDRAC Enterprise features except a Dedicated NIC and an easy to use KVM java console." Forum reports describe the same split on iDRAC6 itself.

A reseller's September 22, 2010 post described the split in the same terms. It said that its remote clients ordering Dell servers had to have the iDRAC6 Enterprise product installed, and it listed "Remote video, keyboard, and mouse control with Virtual Console" under Enterprise.

## Test the console to find out which tier you have

Open the Virtual Console from the web interface before changing anything else. [Dell's virtual media steps](https://www.dell.com/support/kbdoc/en-us/000124001/using-the-virtual-media-function-on-idrac-6-7-8-and-9) begin with the same action: "Open the Virtual Console from the iDRAC web interface." Owners report that an Express unit shows "iDRAC Express does not support this feature," and [a November 27, 2014 forum thread](https://www.dell.com/community/en/conversations/systems-management-general/idrac-6-express-virtual-console/647f4c88f4ccf8a8de53b493) describes the same message on a PowerEdge R710. A reply in that thread says "Virtual console is a capability of the iDRAC 6 Enterprise and iDRAC 6 Express has no such capabilities."

If the console launches, the server has the Enterprise tier, and the Java steps that follow apply. If it returns the message, no browser or Java change will bring the feature back, because the feature is missing. A 2016 post in the same thread reports the same message on an R610, so the symptom is not limited to one server. If the web interface loads but the console does not, the iDRAC itself is working, and only the tier or Java is in question. On an Enterprise server, a console that refuses to open points to Java rather than the tier.

The console test is the most direct check. Express still handles basic management: [a 2015 forum reply](https://www.dell.com/community/PowerEdge-General-HW/Confusion-about-which-iDrac-to-use/td-p/4617546) says "Basic Management includes racadm commands, telnet and ssh."

## The Enterprise upgrade is described as a card and as software

Descriptions of the upgrade differ. [Wikipedia's version table](https://en.wikipedia.org/wiki/Dell_DRAC) describes the Enterprise tier as "Additional software features in combination with express; vFlash SD card slot," while [a 2014 community reply](https://www.dell.com/community/PowerEdge-Hardware-General/Difference-between-iDrac6-Express-and-Enterprise-licensing/td-p/4442335) says "There is no logic on the Enterprise card, it only enables the functions when its installed."

Forum replies mostly describe hardware. [A 2015 reply](https://www.dell.com/community/PowerEdge-General-HW/Confusion-about-which-iDrac-to-use/td-p/4617546) tells a buyer "You will need to buy the enterprise card for remote console and virtual media." In [a 2016 forum thread about an R510](https://www.dell.com/community/Systems-Management-General/After-changing-RAM-iDRAC-6-enterprise-reverted-to-Express-in/td-p/5155927), a community member wrote, "The R510 server's iDrac is hardware based and not license based." Dell's virtual media note calls the requirement an "Enterprise or greater license" and an "Enterprise module," while forum replies describe a physical card.

## Java 8 update 121 is the newest Java the console supports

Once the Enterprise console is present, Java decides whether it launches. [Dell's virtual console troubleshooting article](https://www.dell.com/support/kbdoc/en-us/000185549/idrac-virtual-console-troubleshooting) says "iDRAC6 only supports Java 8 update 121 and older." Newer runtimes fall outside that stated support, so a newer Java may stop the console from launching even when it works on other sites. The statement covers the Virtual Console only, which Express does not have, so the Java limit matters only after the tier test passes. The same article points to a separate resource on "Java 8 update 131 compatibility issues with iDRAC6 Virtual Console," so Dell flags Java 8 update 131 on its own. A Java downgrade does nothing for an Express server, because the console is missing before Java is ever reached. If you must run an older runtime, keep the iDRAC on a management VLAN and remove the runtime when the session ends, because an old runtime widens what an attacker can reach.

## Listed iDRAC6 cards can turn out to be Express

Listings are easy to misread. [A 2015 forum thread](https://www.dell.com/community/PowerEdge-General-HW/Confusion-about-which-iDrac-to-use/td-p/4617546) says eBay and Amazon listings for iDRAC cards showed two part numbers, and that some pictured cards had an RJ45 LAN port while others did not. One reply said the listed parts were all the Express card, and a later reply from the same poster lists "No dedicated Port." among the Express card's limits. Ask the seller for the card's label or part number, check it against the card when it arrives, and confirm that it is the Enterprise card before you pay. Do not rely on the photo alone, and treat any mismatch between the label and the seller's number as a reason to walk away.

## What breaks

- **The console says "iDRAC Express does not support this feature."** Express has no remote console, so the message is accurate, and no browser or Java change adds the feature. Fix: confirm the tier with the console test. If you need a screen, install an Enterprise card. Otherwise, manage the server through the web interface and command line, which Express still offers.

- **Virtual media will not map on Express.** [Dell's support article](https://www.dell.com/support/kbdoc/en-us/000124001/using-the-virtual-media-function-on-idrac-6-7-8-and-9) requires the Enterprise module, and [Wikipedia](https://en.wikipedia.org/wiki/Dell_DRAC) says the iDRAC6 Enterprise "virtual console and virtual media features are now integrated into a single plug-in." Fix: use an Enterprise iDRAC6 for any ISO you need to mount. Dell's steps cover iDRAC6 and iDRAC7 firmware 1.00.00 to 1.20.20, and they warn against closing the management window while the file and device association is in use.

- **The console fails on a newer Java.** Dell's stated support stops at Java 8 update 121, so newer runtimes sit outside it. Fix: install Java 8 update 121 or an older build, use it only on a management VLAN, and remove it when you finish.

- **An Enterprise server drops to Express after a RAM install.** A [2016 owner report on a PowerEdge R510](https://www.dell.com/community/Systems-Management-General/After-changing-RAM-iDRAC-6-enterprise-reverted-to-Express-in/td-p/5155927) says the iDRAC came loose during a RAM install and the license reverted to Express. The same report says the server had moved the iDRAC onto the shared LOM 1 port. Fix: power the server down, reseat the iDRAC card, then set NIC Selection back to Dedicated from Shared, as the owner did.

- **A shared port puts management on your data network.** [NetApp's knowledge base](https://kb.netapp.com/on-prem/solidfire/hardware_Kbs/What_is_the_difference_between_iDRAC_Express_and_iDRAC_Enterprise_and_how_to_configure) describes Express as sharing one of the on-board ports, so the iDRAC answers on a port that also carries server traffic. Fix: give the iDRAC an address on your management VLAN and allow only that segment to reach it, or use an Enterprise card with its own port.

## What this means

Assume Express until the console test says otherwise. In practice the order is simple: run the console test, check Java only after the tier is confirmed, and buy a card only after its label or part number reads Enterprise. If you need a screen, the Enterprise tier is the only iDRAC6 option that provides one. If the work is limited to tasks that racadm, SSH or the web interface can do, the Enterprise card is not needed.

Licensing changed on later servers. [Velocity Tech Solutions' license guide](https://velocitytechsolutions.com/blog/idrac-license-level-guide-tech-help-blog/) says that starting with 12th generation servers, Dell made iDRAC levels "a licensing cost rather than a piece of hardware you can install into your system." For the iDRAC 9 license side, see the [iDRAC 9 Enterprise license](/blog/idrac-9-enterprise-license) post. If you cannot log in after a reset, the [iDRAC default password](/blog/idrac-default-password) post covers default passwords by generation and how to reset them.

## References

- https://en.wikipedia.org/wiki/Dell_DRAC
- https://en.wikipedia.org/wiki/List_of_PowerEdge_servers
- https://kb.netapp.com/on-prem/solidfire/hardware_Kbs/What_is_the_difference_between_iDRAC_Express_and_iDRAC_Enterprise_and_how_to_configure
- https://www.dell.com/support/kbdoc/en-us/000124001/using-the-virtual-media-function-on-idrac-6-7-8-and-9
- https://www.dell.com/support/kbdoc/en-us/000185549/idrac-virtual-console-troubleshooting
- https://www.dell.com/community/PowerEdge-Hardware-General/Difference-between-iDrac6-Express-and-Enterprise-licensing/td-p/4442335
- https://www.dell.com/community/en/conversations/systems-management-general/idrac-6-express-virtual-console/647f4c88f4ccf8a8de53b493
- https://www.dell.com/community/PowerEdge-General-HW/Confusion-about-which-iDrac-to-use/td-p/4617546
- https://www.dell.com/community/Systems-Management-General/After-changing-RAM-iDRAC-6-enterprise-reverted-to-Express-in/td-p/5155927
- https://blog.mpecsinc.ca/2010/09/dell-idrac6-enterprise-required-for.html
- https://velocitytechsolutions.com/blog/idrac-license-level-guide-tech-help-blog/
- https://commons.wikimedia.org/wiki/File:Dell_PowerEdge_R610.jpg
- https://commons.wikimedia.org/wiki/File:Five_Dell_PowerEdge_1950s_Front.jpg
