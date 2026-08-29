/**
 * Cyber Club in a Box.
 *
 * Everything needed to start a high school cybersecurity club, written for
 * the person who has been told to start one and has no idea where to begin.
 *
 * This is the plan the South CTA Cyber Club runs, generalised. It assumes no
 * budget, no lab, one room with school laptops, and a faculty advisor whose
 * subject is not computer science. Anything that needs money is marked, and
 * the free path is always the default rather than the consolation prize.
 *
 * The page at /cyber-club/kit and the downloadable markdown at
 * /data/cyber-club-kit.md are both generated from this file, so they cannot
 * drift apart.
 */

export const KIT_VERSION = "2026.1";

export interface KitSession {
  week: number;
  title: string;
  /** One sentence a student would recognise as the point of the meeting. */
  goal: string;
  /** What the person running the meeting does beforehand. Be specific. */
  prep: string;
  /** What happens in the room, in order. */
  run: string[];
  /** The observable signal that it worked. Not a feeling. */
  evidence: string;
  /** Free tools only, unless the session is explicitly marked as costing money. */
  tools: string[];
}

export interface KitResource {
  name: string;
  url: string;
  what: string;
  cost: "free" | "free tier" | "paid";
}

export interface KitBudgetLine {
  item: string;
  zero: string;
  funded: string;
  note: string;
}

export interface KitFailure {
  symptom: string;
  cause: string;
  fix: string;
}

/**
 * Twelve meetings, one per week, ending on a competition.
 *
 * The order is not arbitrary. Weeks 1 to 4 are chosen because they produce a
 * result in the first fifteen minutes with no setup, which is what keeps a
 * new member coming back. The heavier sessions land after the club has a
 * core that will show up regardless.
 */
export const KIT_SESSIONS: KitSession[] = [
  {
    week: 1,
    title: "Solve something in the first ten minutes",
    goal: "Every person in the room finds at least one flag before the bell, so nobody leaves thinking this is not for them.",
    prep: "Make free accounts on picoCTF ahead of time or have members make their own at the door. Pick five General Skills challenges you have solved yourself, in increasing difficulty, and write the five names on the board.",
    run: [
      "Two minutes on what a flag is: a short piece of text in a fixed format, usually picoCTF{...}, that you copy out of a challenge and paste into the answer box to score it. Nothing gets installed; it all runs in the browser.",
      "Solve the first challenge yourself on the projector, reading every hint out loud, and do not hide the moment you misread it and the answer is rejected. The room needs to see that a wrong submission costs nothing.",
      "Send everyone to the picoGym practice page, filter to General Skills, and have them work the same four challenges you picked. Walk the room; when someone is stuck, ask them what the hint says rather than handing over the answer.",
      "When a fast member finishes, do not let them call out the flag. Give them the job of sitting with someone who has not finished, and having them explain rather than announce.",
      "Last five minutes: three members each say one thing they tried that did not work and what they did next.",
    ],
    evidence: "Walk the room and count screens, not raised hands: every person has at least one correct submission showing on their own screen. If more than one or two have none, your four challenges were too hard for a first day, not the people, so pick easier ones next time.",
    tools: ["picoCTF", "a browser"],
  },
  {
    week: 2,
    title: "The command line, taught as a search problem",
    goal: "Members stop being afraid of a terminal by using it to find things that are hidden in plain sight.",
    prep: "Have picoCTF's webshell open, or install Windows Subsystem for Linux beforehand if your machines allow it. Prepare a directory of about forty small text files with the answer word buried inside exactly one of them.",
    run: [
      "Start in the picoCTF webshell so nobody has to install anything. Put four commands on the board and allow only these for the first ten minutes: ls to list, cd to move between folders, cat to print a file, pwd to show where you are.",
      "Give everyone the same directory and ask them to find a specific word by opening files with cat one at a time. Let it get tedious on purpose; that tedium is the setup for the next step.",
      "Introduce grep as the whole point: grep -r word . searches every file at once. Have them find the same word again and notice it took one command instead of forty.",
      "Add three more: file tells you what something actually is regardless of its name, strings pulls readable text out of a non-text file, and xxd shows the raw bytes. Hand them a file with a misleading extension, for example a .txt that is really an image, and let file catch it.",
      "Finish on picoGym General Skills challenges that need exactly these commands, so the tools earn a real flag and are not just a drill.",
    ],
    evidence: "Give one member a folder of forty files and ask for a word inside one of them. If they type grep without being reminded it exists, it stuck. If they start opening files one by one, it did not, and week three should open with a five minute grep warm up.",
    tools: ["picoCTF webshell", "any Linux shell", "WSL"],
  },
  {
    week: 3,
    title: "Open source intelligence, with rules",
    goal: "Members learn what can be found about a person or an organisation from public sources, and where the line is.",
    prep: "Read the club's rules of engagement aloud before anything else. Choose targets that are institutions, never a student and never a staff member.",
    run: [
      "Read the rules of engagement out loud before anything is typed. The targets today are institutions the club chooses together, for example your school district's public domain or a well known company. Never a student, never a staff member, no exceptions.",
      "WHOIS: run whois example.com, or use who.is in a browser if the command is blocked, and read who registered the domain and when. Point out that many records now sit behind privacy services, and that the absence is itself a finding.",
      "Certificate transparency: open crt.sh, type the domain into the box, and read the list of subdomains that have had certificates issued. Explain that every HTTPS certificate is logged in public by design, so this is not a leak.",
      "DNS: run dig example.com or nslookup example.com and read the A record, which is the address, and the MX record, which shows who handles the mail and often reveals the organisation's email provider.",
      "Reverse image search: take a photo from the organisation's own public site, run it through a reverse image search, and see where else it appears. Explain that platforms usually strip location metadata from photos before you ever see them, so the image itself rarely gives a location.",
      "Finish on a picoCTF or TryHackMe OSINT challenge, so the skills are used against a target built for practice.",
    ],
    evidence: "Ask a member to name a point where they chose not to look further and say why. Someone who can describe the stop has understood the session better than someone who only lists what they found. If nobody can point to a line they did not cross, reteach the rules before week four.",
    tools: ["whois", "crt.sh", "dig or nslookup", "picoCTF"],
  },
  {
    week: 4,
    title: "Cryptography you can do on paper",
    goal: "Demystify encryption by breaking the weak version of it by hand before touching a tool.",
    prep: "Print a Caesar wheel and a frequency table. Prepare three ciphertexts: Caesar, Vigenere with a short key, and one base64 blob that is not encryption at all.",
    run: [
      "Break the Caesar by hand: hand out the ciphertext and the printed wheel, and show how to line the wheel up and shift the alphabet. Time the room. A short common word usually gives away the shift in under two minutes, and once the shift is known the rest falls out.",
      "Frequency analysis on the Vigenere, in pairs, using the printed table. The lesson is that a repeating key leaves a fingerprint, and that E, T, and A being the common letters in English is a weakness an attacker leans on.",
      "The base64 blob: have them paste it into CyberChef and apply the From Base64 operation. It turns into readable text with no key at all. Say the sentence plainly: encoding is not encryption, anyone can reverse encoding, encryption needs a key, and mistaking the two is the single most common beginner error in this hobby.",
      "Only now open CyberChef properly, framed honestly as a faster version of the paper work they just did rather than as magic. Show its Magic operation recovering the Caesar shift they already found by hand.",
    ],
    evidence: "Ask the room to define encoding, hashing, and encryption in one sentence each. You want three genuinely different answers: encoding is reversible with no key, hashing is one way, encryption is reversible only with a key. If the three blur together, run the base64 demo once more before moving on.",
    tools: ["paper", "CyberChef", "dcode.fr"],
  },
  {
    week: 5,
    title: "Packets on a screen",
    goal: "Members read a real capture and describe what happened in it in plain English.",
    prep: "Download a sample capture from the Wireshark sample captures page, for example http.cap for a web session plus a capture that contains a DNS lookup. Install Wireshark ahead of time or confirm it is already on the machines. Do not capture your school network.",
    run: [
      "Open the capture in Wireshark with no filter applied and let the wall of rows sit there for a minute without explaining it. That overwhelmed feeling is the honest starting point, and naming it afterwards helps.",
      "Introduce exactly three filters, typed into the bar at the top and applied with Enter: http shows web requests, dns shows name lookups, and ip.addr == 1.2.3.4 shows traffic to or from one machine. Have them try each and watch the list shrink.",
      "Right click any HTTP packet and choose Follow, then HTTP Stream. The full request and response appear as plain text. Read one request out loud. This is the moment people understand why a password sent over plain HTTP is readable by anyone on the path, and why HTTPS exists.",
      "Have each member write one sentence describing what the captured user did, for example, they loaded a page and downloaded an image.",
    ],
    evidence: "Collect the one sentence summaries and read two or three aloud. They should broadly agree on what the user did. If they contradict each other, the room was guessing from the packet list instead of reading a followed stream, so demonstrate Follow Stream once more.",
    tools: ["Wireshark", "published sample captures"],
  },
  {
    week: 6,
    title: "Passwords and hashes",
    goal: "Members understand why a stolen password database is still dangerous, and why some are worse than others.",
    prep: "Generate your own hashes for the session: an online tool or a one line command will produce the MD5, SHA-1, and bcrypt of a word you choose. Never use a real breach dump, and never crack a hash tied to a real account.",
    run: [
      "Hash the same word three ways in front of the room using CyberChef, with the MD5, SHA1, and Bcrypt operations, and line the outputs up. Point out that MD5 and SHA-1 come back instantly while bcrypt takes a visible moment, and that the slowness is deliberate, not a bug.",
      "Identify unknown hashes before cracking anything. A 32 character hex string is probably MD5, 40 is probably SHA-1, and a string starting $2b$ is bcrypt. Have them sort a handful by shape, using length and the leading characters, with no tool yet.",
      "Crack the fast ones with a wordlist using John the Ripper or hashcat, which try each word in the list until one matches. The MD5 and SHA-1 of a common word fall in seconds. Then point the same tool at the bcrypt hash, watch it crawl, and stop it after a minute; that refusal to fall over is the point.",
      "Close on salting: hash the word password twice with a random salt and show that the two outputs differ. Explain that the salt is why two people with the same password do not get the same hash, which is what defeats a precomputed lookup table.",
    ],
    evidence: "Ask why a slow hash is a feature and not a flaw. The answer you want is that the slowness barely affects one honest login but multiplies the cost of trying billions of guesses. A member who can also say what a salt stops has the whole picture.",
    tools: ["hashid or hash-identifier", "John the Ripper", "hashcat", "CyberChef"],
  },
  {
    week: 7,
    title: "Web exploitation, defensively",
    goal: "Members see how three classic web bugs work, in an environment built to be broken.",
    prep: "Stand up OWASP Juice Shop, either locally with Docker or on the hosted demo. Never test against a site you do not own.",
    run: [
      "Write the scope on the board before anything else: the only legal target today is the Juice Shop instance we stood up, and nothing else, ever. Say plainly that testing a real site you do not own is a crime, not a prank.",
      "Start in the browser, not with tools. Open the page source with right click then View Source, and the Network tab with F12 then Network, and reload while watching the requests. Many first findings sit in plain sight here, for example a comment left in the source or an admin path in a request.",
      "SQL injection on the login form: type ' OR 1=1;-- into the email field with any password, and log in as the first user without knowing their password. Explain in one sentence: the input was pasted straight into a database query and changed what the query meant.",
      "Cross site scripting in a search or review field: enter <script>alert(1)</script> and watch a pop up fire. Explain that the site treated typed text as code to run, which means an attacker could run code in another visitor's browser.",
      "Broken access control by editing a URL or a request: change an id or a basket number and reach data that belongs to someone else. Explain that the site checked what you asked for but never whether you were allowed to ask.",
      "Then flip every finding: for each bug, state the fix out loud. Parameterised queries stop the injection, escaping output stops the scripting, and a server side permission check stops the access control bug.",
    ],
    evidence: "For every bug a member finds, they state the fix before moving on; a finding with no fix is half an answer. By the end each of the three bugs has both a working demonstration and a one sentence fix that a member, not you, supplied.",
    tools: ["OWASP Juice Shop", "browser developer tools"],
  },
  {
    week: 8,
    title: "Log analysis, the unglamorous one",
    goal: "Members find the one interesting line in fifty thousand boring ones.",
    prep: "Generate a synthetic auth log: a few thousand normal SSH login lines with one short burst of failed logins from a single address buried inside. Keep that address and its timestamp to yourself. A short script or a template log works; do not use a real log from a real machine.",
    run: [
      "Hand out the log with no hints and let the room read it for ten minutes. The point of the flounder is that scrolling does not scale, and they need to feel that before the tools mean anything.",
      "Introduce three commands as counting tools, not as syntax. grep 'Failed password' auth.log pulls the failures, piping that to sort then uniq -c counts how many times each line repeats, and awk pulls out one column, for example the source address.",
      "Chain them: grep the failures, awk out the source address, then sort, then uniq -c, then sort -rn. The attacker's address rises to the top because the signal is volume and timing, not the content of any one line. Say that out loud once they see it.",
      "Discuss the defence: what rule would alert on this, for example more than twenty failures from one address in a minute, and then immediately ask what ordinary event would trip that same rule and raise a false alarm.",
    ],
    evidence: "One member proposes an alert rule and another finds a normal situation that would fire it wrongly, for example a whole school behind one shared address, or a user with a stale saved password. That back and forth is the actual skill; if it does not happen on its own, prompt it with the shared address example.",
    tools: ["grep", "awk", "sort", "uniq"],
  },
  {
    week: 9,
    title: "Forensics and file carving",
    goal: "Members recover something that was meant to be hidden inside another file.",
    prep: "Build the artifacts yourself: append a zip to a PNG on the command line with cat image.png secret.zip > carved.png, write a message into a photo's EXIF Comment field, and rename one file to the wrong extension. Leave real GPS coordinates in one photo on purpose.",
    run: [
      "file and its magic bytes: run file on each artifact. The extension is a suggestion, but file reads the first bytes and tells you what the thing actually is. Show it catching the renamed file.",
      "exiftool on the photo that still has GPS coordinates in it, and read the location out. Connect it straight back to week three: this is how a photo leaks where it was taken, and why platforms strip it before publishing.",
      "binwalk on the PNG with the zip stapled to the end. binwalk reports the embedded zip; extract it with binwalk -e and open what falls out. Explain that many files are just containers, and nothing stops extra data being appended after the real end.",
      "Steganography last, and honestly: try one tool on one image, but tell them plainly that in competition steganography is usually the worst return on time in the whole field, and that knowing when to abandon a category is itself a real skill.",
    ],
    evidence: "Each member recovers at least one hidden artifact and can name which tool told them it was there, for example file flagged the wrong extension, or binwalk found the zip. Recovering something by luck does not count; they should be able to say what the tool reported.",
    tools: ["file", "exiftool", "binwalk", "strings"],
  },
  {
    week: 10,
    title: "Registering for the National Cyber League",
    goal: "The paperwork gets done, in the room, together, before the deadline that everyone otherwise misses.",
    prep: "Read the current season dates on the NCL site. Confirm with your advisor who pays the registration fee and how. This is the session with a cost attached.",
    run: [
      "Put registration on the projector and walk through it one field at a time while every member does the same on their own screen. Do not let anyone leave a step half done; a half filled form is a member who is not registered.",
      "Confirm payment out loud so nobody assumes someone else handled it: say who is paying the fee, whether that is the school activities fund or the member, and how it gets paid before the deadline.",
      "Explain the structure plainly: a preseason placement round that sets your bracket, then an individual game, then a team game, all three run on the Cyber Skyline platform.",
      "Set expectations honestly. First season scores are usually low and that is normal. The number that matters is next season's percentile measured against this season's, not the top of the scoreboard.",
      "Form teams in the room now, while everyone is present, not the night before the team game.",
    ],
    evidence: "Count completed registrations against the people in the room; the two numbers should match. Anyone who leaves without finishing will almost certainly never finish, so chase those before the meeting ends, not after.",
    tools: ["National Cyber League", "Cyber Skyline"],
  },
  {
    week: 11,
    title: "A full practice game, timed",
    goal: "The club finds out what it is actually like to work under a clock, before it counts.",
    prep: "Assemble a mixed set of challenges across every category covered so far. Use the preseason gym if the season is running.",
    run: [
      "Run the longest block you can, ninety minutes if the schedule allows and one period if it does not, with a timer visible to the whole room from the start.",
      "The person running it gives no help of any kind, including hints. This is uncomfortable and it is the entire point; a competition has no advisor leaning over a shoulder.",
      "Use the NCL Gym if the season is live, otherwise assemble a mixed set across every category covered so far, so nobody can specialise their way around their weak areas.",
      "Debrief on time, not score. The scoreboard is not the lesson; the lesson is which category ate the most minutes for the fewest points, because that is what to train before it counts.",
      "Every member writes down the single thing they will look up before next week.",
    ],
    evidence: "Collect the written notes and actually read them. They should name specific categories and techniques, not say practise more. Those notes are your syllabus for next season; if they are vague, the debrief was too gentle and next time you name the time sinks yourself.",
    tools: ["NCL Gym", "picoCTF", "a timer"],
  },
  {
    week: 12,
    title: "Write it down and hand it over",
    goal: "The club survives the founder graduating.",
    prep: "Bring the club's notes, accounts list, and this plan.",
    run: [
      "Each member writes a short guide to the one category they got best at, aimed at a member who has not tried it yet. Ten honest half page guides is a curriculum the club owns.",
      "Do the account handover in writing, in a shared document, not out loud: who holds the club email, who holds the competition registration login, who holds the shared drive, and the recovery email or phone on each. A password living in one person's memory is a club that ends when they graduate.",
      "Elect next year's officers now, while the season is fresh in everyone's mind, not in August when half the room has forgotten and the other half has left.",
      "Decide what to change in this plan. Write down which weeks worked in your room and which did not. The plan is a starting point and it should not survive a year unchanged.",
    ],
    evidence: "Before the last meeting ends, two things exist and you can point to them: a named successor who has agreed out loud, and a written handover document listing every account and who holds it. If either is missing, the club is one graduation away from starting over.",
    tools: ["a shared document", "a club email account"],
  },
];

export const KIT_RESOURCES: KitResource[] = [
  {
    name: "picoCTF",
    url: "https://picoctf.org/",
    what: "Carnegie Mellon's permanent beginner CTF, with a browser shell so nothing needs installing. This is where week one happens.",
    cost: "free",
  },
  {
    name: "National Cyber League",
    url: "https://nationalcyberleague.org/",
    what: "The competition this plan builds toward. Individual and team games, scored by category, with a per-competitor scouting report at the end.",
    cost: "paid",
  },
  {
    name: "CyberChef",
    url: "https://gchq.github.io/CyberChef/",
    what: "Browser-based encoding, decoding, and analysis. Runs entirely client side, so it works on locked-down school machines.",
    cost: "free",
  },
  {
    name: "OWASP Juice Shop",
    url: "https://owasp.org/www-project-juice-shop/",
    what: "A deliberately broken web application, built for teaching. The safe target for week seven.",
    cost: "free",
  },
  {
    name: "Wireshark sample captures",
    url: "https://wiki.wireshark.org/SampleCaptures",
    what: "Published packet captures, so a club never has to capture its own school network to have something to read.",
    cost: "free",
  },
  {
    name: "TryHackMe",
    url: "https://tryhackme.com/",
    what: "Guided rooms with hints, useful for members who want to keep going between meetings. The free tier is enough for a club.",
    cost: "free tier",
  },
  {
    name: "CYBER.ORG",
    url: "https://www.cyber.org/",
    what: "Free K-12 cybersecurity curriculum and ranges, funded by CISA. The place to point a faculty advisor who wants lesson plans rather than a club plan.",
    cost: "free",
  },
  {
    name: "OverTheWire Bandit",
    url: "https://overthewire.org/wargames/bandit/",
    what: "A thirty-level SSH wargame that teaches the command line by making it the only option. Good homework between weeks two and three.",
    cost: "free",
  },
  {
    name: "NIST NICE Workforce Framework",
    url: "https://www.nist.gov/nice/framework",
    what: "The vocabulary for what these skills are called on a job posting. Useful when a member asks what any of this leads to.",
    cost: "free",
  },
];

export const KIT_BUDGET: KitBudgetLine[] = [
  {
    item: "Practice platform",
    zero: "picoCTF and OverTheWire, permanently free",
    funded: "TryHackMe or Hack The Box subscriptions",
    note: "The free tier genuinely covers this whole plan. Paid platforms buy convenience, not capability.",
  },
  {
    item: "Competition entry",
    zero: "None. This is the one line with no free path.",
    funded: "National Cyber League registration, per competitor, per season",
    note: "Check the current price on the NCL site each season rather than trusting a figure written down a year ago. Ask the school activities fund, the CTE department, and local employers, in that order.",
  },
  {
    item: "Machines",
    zero: "School laptops with a browser",
    funded: "A single shared mini PC running the practice targets",
    note: "Every session here except week seven runs in a browser. Juice Shop has a hosted demo if Docker is not allowed on your network.",
  },
  {
    item: "Lab target",
    zero: "The hosted OWASP Juice Shop demo",
    funded: "A refurbished small form factor PC running Docker on an isolated VLAN",
    note: "If you do stand up your own, it must not sit on the school network. Ask your IT department before, not after.",
  },
  {
    item: "Room and time",
    zero: "One classroom, one period a week, one advisor",
    funded: "The same, plus a locked cupboard",
    note: "This is the real constraint. A club with a room and no budget works. A club with a budget and no room does not.",
  },
  {
    item: "Snacks",
    zero: "Members bring their own",
    funded: "A modest per-meeting spend",
    note: "Not a joke. Attendance in the second month tracks food more closely than curriculum.",
  },
];

export const KIT_FAILURES: KitFailure[] = [
  {
    symptom: "Twenty people at meeting one, four at meeting four.",
    cause: "The first meetings were lectures. People came for something to do and were given something to watch.",
    fix: "Every meeting produces a solved thing within fifteen minutes. If the plan for a week does not, move it later and put a solvable one in its place.",
  },
  {
    symptom: "The same three people answer everything.",
    cause: "Nothing structural is stopping them, and everyone else has learned they do not have to try.",
    fix: "Pairs, rotated weekly, and a rule that the person who solved it explains rather than announces. Give the fast members the job of teaching; most of them like it.",
  },
  {
    symptom: "Members hit an install problem and never come back.",
    cause: "Week one required software on a locked-down school machine.",
    fix: "Browser-only for the first month. Nothing in weeks one through six here needs an install.",
  },
  {
    symptom: "The advisor is uncomfortable with what the club is doing.",
    cause: "Nobody wrote down the rules, so every session looked like it might be the one that goes too far.",
    fix: "Written rules of engagement, signed, on file with the advisor before week three. Targets we own or that are published for practice, nothing else, no exceptions, and the club stops the moment that is unclear.",
  },
  {
    symptom: "Everyone forgot to register for the competition.",
    cause: "Registration was homework.",
    fix: "It is a meeting. Week ten exists for exactly this reason.",
  },
  {
    symptom: "The club dies when the founder graduates.",
    cause: "The knowledge and the accounts lived in one head.",
    fix: "Week twelve, every year, not just the year the founder leaves. A named successor and a written handover before the last meeting.",
  },
];

/** Written rules of engagement, the single most important page in this kit. */
export const KIT_RULES: string[] = [
  "We only touch systems we own, systems the club stood up for practice, or systems published by their owners for people to practise on. Nothing else, ever, including systems that look abandoned.",
  "We do not test, scan, or probe the school network, school accounts, or school devices. Not to be helpful, not to prove a point, not once.",
  "We never search for information about a classmate or a staff member, in any exercise. Open source intelligence practice uses institutions and published targets only.",
  "We do not use real breach data. Practice hashes and practice accounts are generated by us for the session.",
  "If a member finds a real vulnerability in something belonging to the school or a local organisation, they stop, tell the advisor, and let the advisor decide who to tell. They do not investigate further and they do not tell anyone else first.",
  "Anyone can stop an exercise by saying so, and the exercise stops while it is discussed. No one has to justify stopping in the moment.",
];
