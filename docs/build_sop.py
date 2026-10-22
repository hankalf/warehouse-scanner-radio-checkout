"""Build the Scanner & Radio Checkout SOP as a PDF.

Run:  python3 docs/build_sop.py
Output: docs/Scanner-Radio-Checkout-SOP.pdf
"""

from pathlib import Path

from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Spacer, KeepTogether

from sop_common import (
    BLUE, P, bullets, callout, figure, figure_row, make_doc, section, steps, table,
)

OUT = Path(__file__).resolve().parent / "Scanner-Radio-Checkout-SOP.pdf"


def build():
    doc = make_doc(
        OUT,
        title="Scanner & Radio Checkout — SOP",
        subject="Standard Operating Procedure and Admin Settings Reference",
        header="Scanner & Radio Checkout — Standard Operating Procedure",
        footer="Warehouse device tracking — every action is logged for audit",
        page_word="Page",
    )

    s = []  # story
    W = doc.width

    # ---------------- Cover ----------------
    s.append(Spacer(1, 0.5 * inch))
    s.append(P("Scanner &amp; Radio Checkout", "title"))
    s.append(P("Standard Operating Procedure<br/>Procedimiento Operativo Estándar", "subtitle"))
    s.append(Spacer(1, 0.15 * inch))
    s.append(table(
        [["Scope", "Checking out, returning, inspecting, and charging the warehouse's numbered "
                   "handheld barcode scanners and two-way radios."],
         ["Applies to", "Operators, Equipment Techs, Team Leads, Supervisors, and Admins."],
         ["Everyday use", "The <b>kiosk</b> on the shared tablet by the charging rack (landscape). No sign-in required."],
         ["Management", "Fleet board, Reports, and Admin panel — <b>admins, supervisors, and leads</b>."],
         ["Records", "Every action writes an immutable audit entry (who, what, when, and the inspection answers)."]],
        [1.25 * inch, W - 1.25 * inch], header=False, zebra=False))
    s.append(Spacer(1, 0.3 * inch))
    s.append(callout(
        "Why this matters",
        "Lost and broken scanners and radios cost money and slow the shift down. The system "
        "records who has every device and when it is due back, and no returned device goes "
        "back into service until a tech has put it on the charger and inspected it — so the "
        "next person always picks up a charged, working unit.", BLUE))
    s.append(Spacer(1, 0.22 * inch))
    s.append(figure("kiosk-board",
                    "The kiosk on the shared tablet — what the floor sees all day.",
                    max_w=6.6 * inch, max_h=2.9 * inch))

    s.append(PageBreak())

    # ---------------- Contents ----------------
    s.append(P("Contents", "h1"))
    s.append(table(
        [["1", "The device lifecycle at a glance"],
         ["2", "Roles and PINs"],
         ["3", "Checkout policy — when a device is due back"],
         ["4", "Using the kiosk (everyday floor use)"],
         ["5", "Reading the kiosk board"],
         ["6", "Equipment tech: inspection and charging checklist"],
         ["7", "Damaged devices — supervisor review"],
         ["8", "Supervisor tasks on the fleet board"],
         ["9", "Reports"],
         ["10", "Advanced: every admin setting and what it does (and what a lead sees)"],
         ["11", "Troubleshooting"]],
        [0.4 * inch, W - 0.4 * inch], header=False, zebra=False))

    # ---------------- 1. Lifecycle ----------------
    s.append(section("1. The device lifecycle at a glance", P(
        "Each scanner and radio moves through a fixed sequence. The system blocks any step "
        "taken out of order.")))
    s.append(table(
        [["Stage", "Who", "What happens"],
         ["<b>Available</b>", "—", "Charged, inspected, and ready to use."],
         ["<b>Checked out</b>", "Operator", "In use on the floor. The tile shows who has it and when it is due back."],
         ["<b>Awaiting inspection</b>", "Operator returns it", "Back at the rack, waiting for a tech. It <b>cannot</b> be checked out again in this state."],
         ["<b>Available</b> (again)", "Equipment tech", "On the charger, inspected, condition Good → returns to service."],
         ["<b>Damaged</b>", "Tech flags it", "Held out of service with a reason (and optional photo) until a <b>supervisor</b> reviews it."],
         ["<b>Out of service</b>", "Admin/supervisor retires it", "Removed from rotation (lost, broken, replaced). Restoring it sends it to <i>Awaiting inspection</i> first."]],
        [1.35 * inch, 1.2 * inch, W - 2.55 * inch]))
    s.append(Spacer(1, 8))
    s.append(P(
        "<b>Overdue</b> is not a separate stage — any checked-out device past its due time is "
        "flagged overdue automatically, turns red, and appears in the banner at the top of the "
        "kiosk."))

    # ---------------- 2. Roles ----------------
    s.append(section("2. Roles and PINs", P(
        "Every employee has a short PIN (4–8 digits) that identifies them. The PIN "
        "determines what they are allowed to do. One person can hold more than one role.")))
    s.append(table(
        [["Role", "Can do"],
         ["Operator", "Check out an available device; check in the device <b>they</b> checked out."],
         ["Equipment tech", "Inspect returned devices and dock them on the charger, returning good ones to service or flagging damage."],
         ["Supervisor", "The fleet board, reports, and the admin panel — manages <b>devices</b>, the <b>checkout policy</b>, and the kiosk logo, and reviews <b>damaged</b> devices — but does not manage employees or Teams settings."],
         ["<b>Team lead</b>", "A floor lead. Does <b>every</b> operator and tech job, reviews <b>damaged</b> devices, and can <b>view</b> the device fleet and audit log — but <b>cannot change anything</b> in the admin panel (see section 10)."],
         ["Admin", "Everything, including managing <b>employees</b> and the <b>Teams notification</b> settings."]],
        [1.25 * inch, W - 1.25 * inch]))
    s.append(Spacer(1, 10))
    s.append(callout(
        "Change the default PINs before going live",
        "A new installation ships with sample accounts — Admin <b>0000</b>, Operator "
        "<b>1111</b>, Tech <b>2222</b>, Supervisor <b>3333</b>. Set real PINs in "
        "Admin → Workers on day one, and remove the samples you do not need. "
        "PINs are stored encrypted and cannot be read back — if one is forgotten, "
        "an admin sets a new one."))

    # ---------------- 3. Checkout policy ----------------
    s.append(section("3. Checkout policy — when a device is due back", P(
        "A device is due back a fixed number of <b>hours after checkout</b> — one shift plus "
        "some slack. Because the clock starts at the moment of checkout, a night shift that "
        "crosses midnight is handled exactly like a day shift.")))
    s.append(table(
        [["Device type", "Kiosk color", "Must be returned"],
         ["<b>Scanner</b>", "Silver tile", "Within the scanner window — <b>12 hours</b> by default."],
         ["<b>Radio</b>", "Blue tile", "Within the radio window — <b>12 hours</b> by default."]],
        [1.6 * inch, 1.1 * inch, W - 2.7 * inch]))
    s.append(Spacer(1, 8))
    s.append(P(
        "Both windows are set in <b>Admin → Advanced → Checkout policy</b> (section 10). The "
        "current policy is printed at the top of the kiosk in English and Spanish. When an "
        "employee checks a device out, the confirmation screen shows the exact date and time it "
        "is due back, and that time then appears on the device's tile."))

    # ---------------- 4. Using the kiosk ----------------
    s.append(section("4. Using the kiosk (everyday floor use)", P(
        "The kiosk is the shared tablet by the charging rack. It needs no sign-in — every "
        "action is confirmed with the employee's own PIN, which is what records who did it. "
        "Scanners are in the top block and radios in the bottom block.")))

    s.append(KeepTogether([P("Checking a device out — Operator", "h2"), steps([
        "Tap the device you want. It must have a <b>green ring</b> (Available).",
        "Enter your PIN and tap <b>Next / Siguiente</b>.",
        "Your name appears. Confirm it is you — tap <b>Yes, that's me / Sí</b>. "
        "(If it is not your name, tap <b>Not me</b> and try again.)",
        "The screen shows when the device is <b>due back</b>. The tile now shows your "
        "name at the top and a yellow ring. Take the device off the charger and go.",
    ])]))
    s.append(figure_row([
        ("kiosk-pin", "Step 2 — enter your PIN."),
        ("kiosk-confirm", "Step 3 — confirm your name, and see the due-back time."),
    ]))

    s.append(KeepTogether([P("Checking a device in — Operator", "h2"), steps([
        "Put the device back in its slot on the rack, then tap its tile (yellow ring, your name on it).",
        "Enter your PIN, tap <b>Next</b>, and confirm your name.",
        "The device moves to <b>Awaiting inspection</b> (orange ring). You are done — "
        "do not mark it available yourself; a tech will inspect and dock it.",
    ])]))
    s.append(Spacer(1, 4))
    s.append(P(
        "<i>Only the person who checked a device out (or an admin) can check it back "
        "in.</i> This keeps returns attributed to the right person.", "small"))

    s.append(KeepTogether([P("Inspecting and docking — Equipment tech", "h2"), steps([
        "Tap a device with an <b>orange ring</b> (Awaiting inspection).",
        "Enter your PIN, tap <b>Next</b>, confirm your name, and tap "
        "<b>Yes — continue / Sí</b>.",
        "Answer the four inspection questions (next section).",
        "Tap <b>Submit / Enviar</b>.",
    ])]))

    # ---------------- 5. Reading the board ----------------
    s.append(section("5. Reading the kiosk board", P(
        "Every device is a tile. The <b>fill color</b> tells you the device type; the "
        "<b>ring around the tile</b> tells you its status.")))
    s.append(table(
        [["Ring color", "Status", "What to do"],
         ["Green", "Available", "Ready to check out."],
         ["Yellow", "Checked out", "In use — the holder's name is shown at the top of the tile, with the due-back time."],
         ["Orange", "Awaiting inspection", "A tech needs to inspect it and put it on the charger."],
         ["Red + “OVERDUE”", "Overdue", "Past its due time. Track it down and return it now."],
         ["Red (rose)", "Damaged — needs review", "Out of use until a supervisor reviews it."],
         ["Gray", "Out of service", "Retired from the fleet."]],
        [1.35 * inch, 1.5 * inch, W - 2.85 * inch]))
    s.append(Spacer(1, 10))
    s.append(figure("kiosk-board",
                    "Scanners #2 and #6 and Radio #3 are checked out (yellow ring, due time shown), "
                    "Scanner #9 is overdue, Scanners #4 and #11 and Radio #7 await inspection "
                    "(orange), Scanner #13 is damaged, and Radio #20 is out of service.",
                    max_w=6.4 * inch, max_h=3.2 * inch))
    s.append(Spacer(1, 8))
    s.append(P(
        "The counts along the top show how many devices are in each state. If anything "
        "is overdue, a red banner lists them. Each tile also shows the device number, and "
        "the type (Scanner or Radio) along the bottom."))

    # ---------------- 6. Checklist ----------------
    s.append(section("6. Equipment tech: inspection and charging checklist", P(
        "Before any returned device can go back into service, the tech must answer all "
        "four questions. Every prompt is shown in English and Spanish.")))
    s.append(table(
        [["#", "Question", "Notes"],
         ["1", "<b>On the charger?</b> / ¿En el cargador?", "Yes or No. Seat it in the cradle and make sure the charge light comes on."],
         ["2", "<b>Inspected?</b> / ¿Inspeccionado?", "Yes or No. Scanners: screen, trigger/keys, battery, strap. Radios: antenna, PTT button, battery, belt clip."],
         ["3", "<b>Condition</b> / Condición", "Good / Bueno — or — Damaged / Dañado."],
         ["4", "<b>If damaged, why?</b> / ¿Por qué está dañado?", "Required when Damaged. A <b>photo</b> can be attached with the tablet camera (optional but recommended)."]],
        [0.3 * inch, 2.1 * inch, W - 2.4 * inch]))
    s.append(Spacer(1, 10))
    s.append(figure_row([
        ("kiosk-checklist", "The checklist as a tech answers it."),
        ("kiosk-checklist-damaged", "Damaged reveals the reason box and photo button."),
    ], max_h=3.7 * inch))
    s.append(Spacer(1, 10))
    s.append(callout(
        "The rule the system enforces",
        "A device returns to service <b>only</b> if it is on the charger <b>and</b> "
        "inspected <b>and</b> its condition is Good. If either answer is No, the "
        "system refuses to return it to service."))

    # ---------------- 7. Damaged ----------------
    s.append(section("7. Damaged devices — supervisor review", P(
        "When a tech marks a device <b>Damaged</b>, the device is immediately held "
        "out of service. The tech cannot return it, and it cannot be checked out.")))
    s.append(bullets([
        "The reported reason (and photo, if taken) is saved to the device.",
        "If Teams alerts are switched on, a message is posted to the channel right away "
        "so a supervisor knows.",
        "A <b>supervisor, lead, or admin</b> reviews it on the fleet board: tap the device, read "
        "<b>Reported damage</b>, view the photo, then either "
        "<b>Return to service (reviewed)</b> or <b>Retire (out of service)</b>.",
    ]))
    s.append(figure("board-damaged",
                    "What the supervisor sees: the reported reason, the photo, and the "
                    "decisions available.", max_w=3.4 * inch, max_h=4.2 * inch))

    # ---------------- 8. Supervisor tasks ----------------
    s.append(section("8. Supervisor tasks on the fleet board", P(
        "The fleet board at <b>/</b> is for admins, supervisors, and leads. Sign in with your "
        "PIN. Tap any device to open its action panel.")))
    s.append(table(
        [["Action", "Who", "When it appears"],
         ["Check out / Check in (return)", "Operator (admins and leads included)", "Same lifecycle actions as the kiosk."],
         ["Inspect &amp; dock (checklist)", "Tech (admins and leads included)", "Device is awaiting inspection. Runs the same four questions as the kiosk."],
         ["<b>Return to service (reviewed)</b>", "Supervisor, Lead, or Admin", "Device is Damaged — clears the damage note and photo."],
         ["Retire (out of service)", "Admin / Supervisor / Lead", "Any device not already retired. Use for lost or broken units."],
         ["Restore to fleet", "Admin / Supervisor / Lead", "Device is out of service. It goes to Awaiting inspection."],
         ["Change device type (Scanner / Radio)", "Admin / Supervisor", "Always — the number must be free under the new type. Logged. <i>Not available to leads.</i>"],
         ["View full history", "Everyone on the board", "Opens that device's complete lifecycle record."]],
        [2.0 * inch, 1.55 * inch, W - 3.55 * inch]))
    s.append(Spacer(1, 10))
    s.append(figure("board-fleet",
                    "The fleet board. Filter chips across the top; tap any device to act on it.",
                    max_w=6.4 * inch, max_h=3.3 * inch))
    s.append(Spacer(1, 8))
    s.append(P(
        "Use the filter chips above the grid to show only one status. When viewing "
        "<b>Awaiting inspection</b>, techs, leads, and admins get a <b>Select multiple</b> "
        "button to clear a full rack of good devices at once (this skips the questions and "
        "records each one as on the charger, inspected, and good)."))

    # ---------------- 9. Reports ----------------
    s.append(section("9. Reports", P(
        "<b>/reports</b> answers the end-of-shift questions.")))
    s.append(table(
        [["Panel", "What it tells you"],
         ["Still checked out", "How many devices are out right now, and how many are overdue."],
         ["Total checkouts", "Lifetime usage count."],
         ["Avg turnaround", "Average time from a device being returned to it being inspected and back in service."],
         ["Inspections", "Total number of inspections recorded."],
         ["Damage reports", "How many times a device has been flagged damaged."],
         ["End-of-shift sweep", "A table of every device still out — who has it, since when, when it is due, and whether it is overdue. <b>Work this list before the shift ends.</b>"],
         ["Most-used devices", "Highest-use units — useful for rotating wear and spotting tired batteries."]],
        [1.5 * inch, W - 1.5 * inch]))
    s.append(Spacer(1, 10))
    s.append(figure("reports", "The Reports page, including the end-of-shift sweep.",
                    max_w=6.0 * inch, max_h=4.0 * inch))

    # ---------------- 10. Advanced ----------------
    s.append(section("10. Advanced: every admin setting and what it does", P(
        "The Admin panel is at <b>/admin</b>, open to admins, supervisors, and leads. If you are "
        "already signed in on the fleet board, no second PIN is needed. The header has a "
        "<b>light/dark mode</b> toggle and a link back to the fleet.")))
    s.append(callout(
        "What a lead sees here",
        "A lead opens the same page but in <b>view-only</b> mode: the <b>Device fleet</b> "
        "list and the <b>audit log</b> (with its CSV export). Add a device, Workers, and "
        "Advanced are hidden, and devices have no Edit or Remove buttons. Everything below in "
        "this section is therefore <b>admin/supervisor only</b>. Leads still perform every floor "
        "action from the fleet board and the kiosk.", BLUE))
    s.append(Spacer(1, 8))
    s.append(callout(
        "What a supervisor sees here",
        "A supervisor manages <b>devices</b> (add, edit, remove, change type), the "
        "<b>checkout policy</b>, the <b>kiosk logo</b>, and the <b>audit log</b>, and can return "
        "damaged devices to service. <b>Workers</b> and the <b>Teams notification</b> settings "
        "are hidden — those are admin only.", BLUE))
    s.append(Spacer(1, 10))
    s.append(figure("admin-lead",
                    "The admin page as a lead sees it: the device fleet (view-only) and the "
                    "audit log — no Add a device, Workers, or Advanced.",
                    max_w=6.2 * inch, max_h=3.6 * inch))

    s.append(P("Devices", "h2"))
    s.append(table(
        [["Setting", "What it does"],
         ["<b>Add a device</b>", "Adds a new scanner or radio by number. It enters as Available. Numbers are unique <i>per type</i>, so Scanner #5 and Radio #5 can both exist."],
         ["<b>Add a numbered range</b>", "Adds every device from the first number to the last in one go (e.g. radios 21–40), skipping any that already exist."],
         ["<b>Device fleet</b> list", "Every device with its type and current status."],
         ["Search (devices)", "Filters the list by number, type, or status (e.g. “awaiting inspection”)."],
         ["<b>Edit</b> (per device)", "Change a device's number or type. Logged to the audit trail."],
         ["<b>Remove</b> (per device)", "<b>Permanently deletes</b> the device and its history. Intended for a device added by mistake. Blocked while the device is checked out. To take a real device out of rotation and <b>keep</b> its history, use <b>Retire</b> on the board instead."]],
        [1.45 * inch, W - 1.45 * inch]))
    s.append(Spacer(1, 10))
    s.append(figure("admin-devices", "Admin - Devices.", max_w=4.2 * inch, max_h=3.8 * inch))

    s.append(P("Workers &mdash; admin only", "h2"))
    s.append(table(
        [["Setting", "What it does"],
         ["<b>Add a worker</b>", "Creates an employee: name, PIN (4–8 digits, must be unique), and one or more roles (OPERATOR, TECH, LEAD, SUPERVISOR, ADMIN)."],
         ["<b>Bulk upload (CSV)</b>", "Adds many employees at once from a CSV with columns <b>name,pin,roles</b> (roles separated by <b>;</b> — e.g. OPERATOR;TECH). Rows with a duplicate or invalid PIN are skipped and reported."],
         ["<b>Download sample CSV</b>", "A correctly formatted example file to fill in."],
         ["<b>Employees</b> list", "All employees, sorted by role: Admin, Supervisor, Lead, Operator, Tech."],
         ["Search (employees)", "Filters the list by name or role."],
         ["<b>Export employees (CSV)</b>", "Downloads name, roles, and active status. PINs are encrypted and cannot be exported."],
         ["<b>Edit</b> (per employee)", "Change their name, roles, or set a new PIN (leave PIN blank to keep the current one)."],
         ["<b>Deactivate</b> / Reactivate", "Revokes or restores access <b>while keeping</b> the person's history. Use this when someone leaves."],
         ["<b>Remove</b> (per employee)", "Deletes the employee record entirely. Prefer Deactivate to preserve the audit trail."]],
        [1.45 * inch, W - 1.45 * inch]))
    s.append(Spacer(1, 10))
    s.append(figure("admin-workers", "Admin - Workers.", max_w=4.2 * inch, max_h=3.8 * inch))

    s.append(P("Advanced section (collapsed by default)", "h2"))
    s.append(P(
        "Click <b>Advanced</b> to expand. These are setup settings — you should rarely "
        "need to change them day to day."))
    s.append(P("<b>Microsoft Teams notifications</b> &mdash; admin only", "body"))
    s.append(table(
        [["Setting", "What it does"],
         ["<b>Webhook URL</b>", "Where alerts are posted. Create it in Teams: channel &gt; <b>“...” menu</b> &gt; <b>Workflows</b> → “Post to a channel when a webhook request is received”, then paste the URL it generates (it contains <i>logic.azure.com</i>). Older “Incoming Webhook” connector URLs also work."],
         ["<b>Enable Teams notifications</b>", "Master on/off switch. Nothing is sent while this is off."],
         ["Notify: <b>device flagged damaged</b>", "Posts the moment a tech reports damage, so a supervisor can review. <i>On by default.</i>"],
         ["Notify: <b>device goes overdue</b>", "Intended for the end-of-shift overdue sweep. Requires a scheduled job to run the sweep; the preference is stored and ready."],
         ["Notify: <b>device checked out</b>", "Posts each checkout, including the due-back time. <i>Off by default.</i>"],
         ["Notify: <b>device checked in</b>", "Posts each check-in. <i>Off by default.</i>"],
         ["Notify: <b>inspected, docked &amp; returned to service</b>", "Posts each completed inspection. <i>Off by default.</i>"],
         ["<b>Save</b>", "Stores the settings. If notifications are enabled, a valid https URL and at least one alert type are required."],
         ["<b>Send test message</b>", "Posts a test line to the channel so you can confirm the connection before relying on it. Errors report exactly what Teams returned."]],
        [1.7 * inch, W - 1.7 * inch]))
    s.append(Spacer(1, 8))
    s.append(figure("admin-advanced",
                    "Admin - Advanced, expanded: Teams notifications, checkout policy, kiosk "
                    "logo, and system timezone.", max_w=6.0 * inch, max_h=4.6 * inch))
    s.append(Spacer(1, 6))
    s.append(P(
        "<i>Per-action alerts (checkout / check-in / inspected) get chatty on a busy "
        "floor — that is why they start switched off.</i>", "small"))

    s.append(Spacer(1, 10))
    s.append(P("<b>Checkout policy</b>", "body"))
    s.append(table(
        [["Setting", "What it does"],
         ["<b>Scanners — hours</b>", "How many hours after checkout a scanner is due back. Default 12. Between 1 and 336 (two weeks)."],
         ["<b>Radios — hours</b>", "The same for radios. Default 12. Set it longer if, for example, leads keep a radio across several shifts."],
         ["<b>Save</b>", "Applies to every checkout from now on. Devices already out keep the due time they were given."]],
        [1.7 * inch, W - 1.7 * inch]))

    s.append(Spacer(1, 10))
    s.append(P("<b>Kiosk logo</b>", "body"))
    s.append(table(
        [["Setting", "What it does"],
         ["<b>Choose File</b>", "Uploads your company logo, shown in the top-left corner of the kiosk board. PNG, JPG, or SVG under 500 KB."],
         ["<b>Remove logo</b>", "Clears it; the kiosk falls back to the device icon."]],
        [1.7 * inch, W - 1.7 * inch]))

    s.append(Spacer(1, 10))
    s.append(P("<b>System</b> (read-only)", "body"))
    s.append(table(
        [["Reading", "What it means"],
         ["<b>Timezone</b>", "The timezone logged times and Teams messages are shown in. Set by the <b>TZ</b> environment variable on the server (e.g. America/Chicago). Due times are “N hours after checkout”, so they do not depend on it."],
         ["<b>Server time now</b>", "The system's current time in that timezone. Compare it against a clock on the wall to confirm the setting is right."]],
        [1.7 * inch, W - 1.7 * inch]))
    s.append(Spacer(1, 6))
    s.append(P(
        "<i>Due times are displayed in the timezone of the device you are looking at. Keep "
        "the kiosk tablet set to the warehouse's timezone so what the floor sees matches what "
        "the server recorded.</i>", "small"))

    s.append(Spacer(1, 10))
    s.append(P("<b>Recent activity (audit log)</b>", "body"))
    s.append(table(
        [["Setting", "What it does"],
         ["Activity table", "The most recent actions: when, which device, what happened, who did it, and any note (including the inspection answers)."],
         ["<b>Export full log (CSV)</b>", "Downloads the <b>complete</b> audit history — for a loss investigation, a damage dispute, or a periodic asset audit. Records are never edited or deleted."]],
        [1.7 * inch, W - 1.7 * inch]))

    # ---------------- 11. Troubleshooting ----------------
    s.append(P("11. Troubleshooting", "h1"))
    s.append(table(
        [["Symptom", "Cause and fix"],
         ["“PIN not recognized.”", "Wrong PIN, or the employee is deactivated. An admin can set a new PIN in Admin → Workers."],
         ["“This action requires the TECH role.”", "The PIN entered does not hold the role that action needs — e.g. an operator trying to inspect. Use the right person's PIN, or have an admin add the role."],
         ["Device was checked out by someone else", "Only the person holding a device (or an admin) can check it in. An admin can return it on the fleet board."],
         ["A device cannot be checked out", "It is not Available — it is awaiting inspection, damaged, or retired. Follow the ring color."],
         ["A device shows overdue too soon / too late", "The checkout window is wrong for your shifts. Adjust Admin → Advanced → Checkout policy."],
         ["Logged times look wrong by hours", "The server timezone is off. Check Admin → Advanced → System and set the <b>TZ</b> environment variable."],
         ["“Scanner #5 already exists” when adding or retyping", "Numbers are unique per type. Pick a free number, or renumber the existing device first."],
         ["Teams test says HTTP 405", "The URL pasted is not a webhook (usually a link to the channel). Create a Workflows webhook as described in section 10."],
         ["Teams says nothing posted", "Check <b>Enable Teams notifications</b> is on and at least one alert type is ticked, then use <b>Send test message</b>."],
         ["Kiosk shows old information", "The board refreshes itself every few seconds; if it looks stuck, reload the page on the tablet."]],
        [1.9 * inch, W - 1.9 * inch]))

    s.append(Spacer(1, 16))
    s.append(callout(
        "Shift rhythm — the short version",
        "Operators check devices out at the kiosk at the start of the shift and check them "
        "back in at the rack at the end. The equipment tech inspects and docks everything "
        "orange. Before the shift ends, a supervisor opens <b>Reports → End-of-shift sweep</b> "
        "and chases down anything still out. Damaged devices wait for a supervisor.", BLUE))

    doc.build(s)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    build()
