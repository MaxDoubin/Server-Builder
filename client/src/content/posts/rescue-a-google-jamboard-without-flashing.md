## The short answer

A Google Jamboard can be turned into a usable Android screen without flashing anything. I did it on the 55 inch model, which BenQ builds and Google codenamed `baracus`. Plug a plain wired USB keyboard into one of the two side USB-A ports. The touch-only kiosk keeps Settings away from a finger, but a keyboard gets real focus in it. Turn on Unknown sources, put two launcher APKs on a USB stick, install them and set one as Home. That needed no root, no adb and no new operating system. On my board, on July 19, it took 78 minutes of dead ends to find the keyboard route and then 32 minutes to a working launcher. The board stays on stock Android 7.0 with a 2020 security patch, so it has to stay off the open internet.

## What happened to the Jamboard in October 2024?

Google's help page says the 55 inch device "reached its end of life on October 1, 2024," after an automatic update expiration date of September 30, 2024. Security updates and new features stopped on that date. Since then the board runs unlicensed: you cannot save or open Jams or join Google Meet on it. Google says you can still use the whiteboard offline and use the board as an extended display over HDMI ([Google Jamboard Help: Google Jamboard is winding down](https://support.google.com/jamboard/answer/14084927)).

So the hardware still boots and shows a picture, and the software side is a dead end.

<figure>
<img src="/images/blog/rescue-a-google-jamboard-without-flashing/jamboard-on-stand.jpg" alt="A Google Jamboard on a white rolling stand in a room with a large window, its screen dark" width="960" height="1283" loading="lazy" decoding="async">
<figcaption>A Google Jamboard on its rolling stand at a university in Warsaw. Photo: RoodyAlien, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, resized, via <a href="https://commons.wikimedia.org/wiki/File:Jamboard1.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

## Why can't I just flash it?

I tried every route to the chip that I could think of, and none of them gave a data link.

- **USB-C.** Plugged into a Mac, it showed up only as a DisplayPort display named `Google_JAM`, 3840x2160. It never appeared as a USB device in normal boot, in the bootloader menu, in recovery with "Apply update from ADB", or in forced recovery.
- **The micro-USB port on the back.** This is the port flashing needs, and Google's own update instructions use it with adb and fastboot. Mine is broken and cannot be replaced.
- **Network adb.** Ports 5555 and 22 were closed over Ethernet. Google's public update image does contain a network adb setting, `persist.nvda.adb.tcp.enable`, and it ships set to 0.
- **The Cast ports.** 8008, 8009, 8443 and 9000 are open. Port 9000 wants a client certificate issued by Google, so it is a dead end.
- **OEM unlocking.** I could switch it on in Developer options and it switched itself back off. The board runs as a managed kiosk.

LineageOS lists the Jamboard (codename `baracus`) at version 22.2, with fastboot install steps and no ready-made download ([LineageOS Wiki: Jamboard](https://wiki.lineageos.org/devices/baracus)). Without a working data port that was out of reach, so I did not flash it. The board here runs stock Android.

## What worked: a USB keyboard

The turning point was a plain wired keyboard in a side USB-A port. It gave working focus and navigation in Settings, which the touch-only kiosk interface blocks.

1. Plug a wired USB keyboard into a side USB-A port.
2. Open Settings, then About tablet, and tap Build number seven times to unlock Developer options.
3. Open Security and turn on Unknown sources.
4. On another computer, download Activity Launcher 2.4.1 and KISS Launcher 3.26.0 from F-Droid ([Activity Launcher](https://f-droid.org/packages/de.szalkowski.activitylauncher/), [KISS Launcher](https://f-droid.org/packages/fr.neamar.kiss/)). Compare each file's SHA-256 after the download and again after copying it to a USB stick.
5. Plug the stick into the board and install both APKs.
6. Set KISS as the Home app, and keep Activity Launcher installed as a backup.

A wired Apple keyboard added one more shortcut: Command+Return acts as the Android Home key.

## What should I install next?

I installed a starter pack of F-Droid apps: Open Camera 1.56.2, NewPipe 0.28.7, VLC 3.7.1, Amaze File Manager 3.11.2, LocalSend 1.17.0, Markor 2.16.1, Butterfly 2.5.3, F-Droid 1.23.1, Termux 0.119.0-beta.3 and droidVNC-NG 2.20.1. The ones I confirmed running are Open Camera, NewPipe, Termux and droidVNC-NG. I did not test the others one by one.

- **Camera.** The stock Camera app failed to open the camera even though the Admin Tool's own camera test showed the hardware worked. Open Camera ([F-Droid](https://f-droid.org/packages/net.sourceforge.opencamera/)) opened it.
- **YouTube.** NewPipe plays YouTube without a Google account.
- **Remote control.** droidVNC-NG is open source, needs Android 7 or newer and no root, and works through the accessibility service ([F-Droid: droidVNC-NG](https://f-droid.org/packages/net.christianbeier.droidvnc_ng/)). Remote control is how the board was operated for the rest of the work.
- **Streaming.** I did not sideload Netflix or Hulu from mirror sites. They depend on DRM and newer Android versions, so an external streaming box on an HDMI input is the better route.

## Can I stand it upright?

Do not rotate Android itself. An OS-level portrait setting looked right in a screenshot over VNC, at 1080x1920. A photo of the real panel then showed the picture squeezed into a sideways band. The panel only accepts a landscape signal, so any rotation has to happen inside an app that draws its own rotated view. Only that app's screens can be portrait; other apps keep their own landscape layout.

<figure>
<img src="/images/blog/rescue-a-google-jamboard-without-flashing/panel-rotation-band.jpg" alt="The Jamboard leaning in a corner with a pale browser window turned sideways into a wide band across the middle of the panel and the rest of the screen empty" width="880" height="1610" loading="lazy" decoding="async">
<figcaption>The board after I set Android's own rotation to portrait. The page that looked upright in a screenshot fills a sideways band in the middle of the real panel. The small text on the screen is blurred.</figcaption>
</figure>

<figure>
<img src="/images/blog/rescue-a-google-jamboard-without-flashing/panel-upright-home.jpg" alt="The Jamboard standing upright and showing a home screen with a large clock reading 9:11 PM, the date, an hourly weather strip and a row of buttons for Apps, Calendar, Mirror, Sleep and Settings" width="1250" height="1601" loading="lazy" decoding="async">
<figcaption>The same board on November 3, running a home app that draws its own rotated view. The clock, date, hourly weather and dock stand upright on the panel. The photo was taken at night and at an angle, so the glass looks dim and the text slightly doubled.</figcaption>
</figure>

## What should I be careful about?

- **Do not open the case.** It holds a mains-voltage power supply, and BenQ's manual says "the casing cover should be opened only by qualified service personnel" ([BenQ: Jamboard user manual](https://www.benq.eu/content/dam/b2c/en-gb/Jamboard/Jamboard%20user%20manual.pdf)). Everything here is done through the side ports and the screen.
- **Only a board you own.** Boards from a school or a company run under an administrator's policy, and unlocking one with a keyboard is not yours to do. The port scans and the firmware unpacking above were run only against a board I own. This guide does not cover getting around locks on anyone else's device.
- **It is an old Android.** The security patch level is 2020-04-06. Do not sign in with a personal Google account. Keep the board off the open internet and on its own network segment ([VLAN segmentation guide](/blog/vlan-segmentation-guide)). Never port forward VNC, and set a strong VNC password.
- **Every remote control is a way in.** droidVNC-NG needs the accessibility service, and Termux with an SSH server is persistence on a locked-down kiosk. Turn on only what you need, flip the permission switches yourself, and use keys rather than passwords for SSH ([SSH key-based authentication](/blog/ssh-key-based-authentication)).
- **Install APKs only from a source you can verify.** F-Droid, with the hash compared, is what I used. I would not take an APK from a mirror site.

## What did I not verify?

- **One board.** This is the 55 inch model on the 2020-04-06 patch image. A 65 inch board or other firmware may behave differently.
- **Other keyboards.** I used a plain wired keyboard and a wired Apple keyboard. I did not try a wireless one.
- **Flashing with a working micro-USB port.** Google's update instructions use that port. Mine is broken, so I cannot say whether flashing is practical on a board where it works.
- **The rest of the starter pack.** Only the four apps named above were confirmed running.

## Sources

- [Google Jamboard Help: Google Jamboard is winding down](https://support.google.com/jamboard/answer/14084927)
- [LineageOS Wiki: Jamboard](https://wiki.lineageos.org/devices/baracus)
- [BenQ: Jamboard user manual](https://www.benq.eu/content/dam/b2c/en-gb/Jamboard/Jamboard%20user%20manual.pdf)
- [F-Droid: Activity Launcher](https://f-droid.org/packages/de.szalkowski.activitylauncher/)
- [F-Droid: KISS Launcher](https://f-droid.org/packages/fr.neamar.kiss/)
- [F-Droid: Open Camera](https://f-droid.org/packages/net.sourceforge.opencamera/)
- [F-Droid: droidVNC-NG](https://f-droid.org/packages/net.christianbeier.droidvnc_ng/)
