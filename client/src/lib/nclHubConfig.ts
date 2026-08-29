/**
 * Competition-day checklist and the mistakes worth not repeating, shown on
 * the /ncl hub.
 *
 * Extracted from the page component so the prerenderer renders them into the
 * static HTML. /ncl shipped the site nav and nothing else to anything that
 * does not run JavaScript, which is the opposite of what a page written to
 * be found by someone searching for competition prep should do.
 */

export const DAY_CHECKLIST = [
  "Have a working analysis environment ready in advance: a Linux VM (Kali or similar) with Wireshark, hashcat or John, binwalk, exiftool, strings, and sqlmap already installed and updated.",
  "Download wordlists like rockyou beforehand, so you are not fetching them when the clock is running.",
  "Keep a scratch file open for notes: where each clue came from, partial answers, and things to come back to.",
  "Read the rules and the honour code first, and confirm the exact flag format the platform expects.",
  "Check power and connectivity: charger plugged in, a stable connection, and a backup plan if it drops.",
  "Read every question in a category before you start, then triage by confidence and point value rather than going top to bottom.",
  "Watch the clock and avoid tunnelling. If a challenge stalls you, bank an easier one and return with fresh eyes.",
  "Double-check each submission against the required format before you send it.",
];

export const MISTAKES = [
  "I used to open the hardest-looking challenge first and burn twenty minutes before I had even read the prompt properly. Now I read every question in a category first and clear the fast ones.",
  "I treated the Gymnasium like a scoreboard to win instead of a place to be wrong safely. Practice is where mistakes are supposed to happen.",
  "I under-documented. I would find a useful detail, not write down where it came from, and then waste time re-finding it. A scratch file open at all times fixed that.",
  "I once spent far too long trying to crack something that was just Base64. Learn to tell encoding from encryption before you attack it.",
  "I put off learning the tools. Getting comfortable with CyberChef, Wireshark display filters, and a few hashcat modes ahead of time turned a ten-minute fumble into a thirty-second answer.",
];
