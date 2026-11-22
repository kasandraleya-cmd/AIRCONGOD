// Positions and what each one can do: ONE list for the whole website.
// (The database has the same rules in supabase/positions.sql; change both together.)
//
//   Owner access        Owner / Founder, Head Supervisor     everything, incl. sales money and payroll
//   HR access           HR, Manager                          staff, payroll, incentives, schedules, office pages
//   Office access       Office Staff                         office pages and schedules (edit)
//   Schedule access     Installation Supervisor (and anyone with "Office access" ticked on the Staff page):
//                       edit Daily / Weekly Schedule; Warranty, Customer / Cleaning / Survey Records;
//                       Dashboard office boxes. No sales money, job orders, stock, payroll or staff pages.
//   Crew                installers, services, drivers, Installation Supervisor   own attendance, crew dropdowns
//   Warehouse           Warehouse Staff (/ Driver)           Scanner, Serial Number Tracking, Inventory
//   Accounting          Accounting                           Dashboard (with sales), Cash Voucher, Serial Number Tracking, Inventory
//   Editor              Editor, Videographer / Editor
//   Developer           everything (builds the website)
//
// Older position names (Owner, Human Resources, Admin Staff, Installer, Team Service…) still work.
const Roles = (function () {
  // In the order shown in the Staff page's Position list
  const POSITIONS = [
    "Owner / Founder", "Head Supervisor", "Manager", "HR", "Office Staff", "Accounting", "Installation Supervisor",
    "Head Installer", "Senior Installer", "Junior Installer", "Assistant Installer",
    "Head Services", "Services", "Driver", "Driver / Mechanic",
    "Warehouse Staff", "Warehouse Staff / Driver", "Editor", "Videographer / Editor", "Developer",
  ];

  // "OWNER/FOUNDER", "owner / founder", " Owner /Founder " → "owner / founder"
  const norm = (p) => String(p || "").trim().toLowerCase().replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ");

  const OWNER = ["owner / founder", "head supervisor", "owner"];
  const HR = ["hr", "manager", "human resources"];
  const OFFICE = ["office staff", "admin staff", "admin"];
  const SCHEDULE_ACCESS = ["installation supervisor"];   // same as "Office access" ticked on the Staff page
  const CREW = [
    "installation supervisor", "head installer", "senior installer", "junior installer", "assistant installer",
    "head services", "services", "driver", "driver / mechanic", "warehouse staff / driver",
    "technician / head installer", "technician", "installer", "team service", "service team",   // older names
  ];
  const WAREHOUSE = ["warehouse staff", "warehouse staff / driver"];
  const EDITOR = ["editor", "videographer / editor"];
  const ACCOUNTING = ["accounting", "accountant"];

  function of(position) {
    const n = norm(position);
    const dev = n === "developer";
    const owner = OWNER.includes(n), hr = HR.includes(n), office = OFFICE.includes(n);
    return {
      position: n, dev, owner, hr, office,
      crew: CREW.includes(n),
      warehouse: WAREHOUSE.includes(n),
      editor: EDITOR.includes(n),
      accounting: ACCOUNTING.includes(n),   // Dashboard (with sales), Cash Voucher, Serial Number Tracking, Inventory
      seesSales: dev || owner,                       // sales money, signed-form archiving
      // Dashboard sales (Sales this month, cash vouchers, net, monthly chart): Owner, HR / Manager,
      // Admin / Office Staff, Accounting and Developer (not Installation Supervisor)
      seesDashboardSales: dev || owner || hr || ["office staff", "admin staff", "admin"].includes(n) || ACCOUNTING.includes(n),
      staffAndPay: dev || owner || hr,               // Staff changes, Payroll, incentives
      manager: dev || owner || hr || office,         // office pages, editing schedules
      fieldOffice: SCHEDULE_ACCESS.includes(n),      // schedules + customer pages only (see "Schedule access" above)
      // My Profile page (myprofile.html): everyone, with their info, profile picture and warnings
      profilePage: true,
      // Admin / Office Staff, HR / Manager, Owner / Head Supervisor, Installation Supervisor, Developer: their own
      // payslip, day off & leave and warnings are on My Profile too, NOT on the Dashboard (business boxes only there).
      // Everyone else has those on their Dashboard and only their information on My Profile.
      profileFull: dev || owner || hr || office || n === "installation supervisor",
    };
  }
  // "Office access" ticked on someone's Staff record (e.g. a Head Installer who also runs the schedule):
  // they can edit the Daily / Weekly Schedule and use Warranty, Customer Records, Cleaning Records and
  // Survey Records, and see the Dashboard's office boxes (no sales money, rates, payroll or stock pages).
  // The database allows the same (supabase/office_access.sql).
  function hasOfficeAccess() {
    try {
      const user = String(sessionStorage.getItem("aircon_user") || "").trim().toLowerCase();
      if (!user) return false;
      const domain = typeof LOGIN_DOMAIN !== "undefined" ? LOGIN_DOMAIN : "aircongod.app";
      const s = (JSON.parse(localStorage.getItem("aircon_staff") || "[]") || []).find((x) => x && x.username && (
        String(x.username).toLowerCase() === user || String(x.login || x.username + "@" + domain).toLowerCase() === user));
      return !!(s && s.officeAccess === true && (s.status || "Active") === "Active");
    } catch (e) { return false; }
  }
  const me = () => {
    const r = of(sessionStorage.getItem("aircon_role"));
    r.fieldOffice = !r.manager && (r.fieldOffice || hasOfficeAccess());   // only matters for those without office access already
    return r;
  };

  // Crew groups for the Daily Schedule's crew dropdown, in this order
  const CREW_GROUPS = [
    ["Supervisor", ["installation supervisor"]],
    ["Head Installer", ["head installer", "technician / head installer", "technician"]],
    ["Senior Installer", ["senior installer", "installer"]],
    ["Junior Installer", ["junior installer"]],
    ["Assistant Installer", ["assistant installer"]],
    ["Services", ["head services", "services", "team service", "service team"]],
    ["Driver", ["driver", "driver / mechanic", "warehouse staff / driver"]],
  ];

  // ---------- Profile pictures (supabase/profile_photos.sql; added on My information, leave.js) ----------
  // Saved as avatars/<login email>.jpg. photoImg(email) is an <img> laid over a round avatar (the avatar must
  // be position: relative); it removes itself when that person has no photo, so their first letter shows.
  const myLoginEmail = () => {
    const u = String(sessionStorage.getItem("aircon_user") || "").trim().toLowerCase();
    return !u || u.includes("@") ? u : `${u}@${typeof LOGIN_DOMAIN !== "undefined" ? LOGIN_DOMAIN : "aircongod.app"}`;
  };
  function photoUrl(email) {
    const e = String(email || "").trim().toLowerCase();
    if (!e || typeof SUPABASE_URL === "undefined") return "";
    let v = "";
    // A photo changed on this device (mine, or a group's: "group-<id>") shows at once
    try { if (e === myLoginEmail() || e.startsWith("group-")) v = localStorage.getItem("aircon_photo_v") || ""; } catch (err) {}
    return `${SUPABASE_URL}/storage/v1/object/public/avatars/${encodeURIComponent(e + ".jpg")}${v ? "?v=" + v : ""}`;
  }
  function photoImg(email) {
    const url = photoUrl(email);
    if (!url) return "";
    const safe = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return `<img class="av-photo" src="${safe}" alt="" style="position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover" onerror="this.remove()">`;
  }

  // Save a picked picture as avatars/<key>.jpg: the middle square, 256 × 256 px.
  // key: a login email (your own photo) or "group-<id>" (a group chat's photo). Throws a readable error.
  function squareJpeg(file, size = 256) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const c = document.createElement("canvas");
        c.width = c.height = size;
        c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the picture."))), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn't a picture we can read.")); };
      img.src = url;
    });
  }
  async function savePhoto(key, file) {
    if (!window.cloud) throw new Error("Not connected to the online database.");
    const blob = await squareJpeg(file);
    const { error } = await window.cloud.storage.from("avatars")
      .upload(String(key).toLowerCase() + ".jpg", blob, { upsert: true, contentType: "image/jpeg", cacheControl: "60" });
    if (error) {
      if (/bucket/i.test(error.message)) throw new Error("Profile pictures aren't set up yet (supabase/profile_photos.sql).");
      if (/row-level security|policy|unauthorized/i.test(error.message)) throw new Error("You can't change this photo.");
      throw new Error(error.message);
    }
    try { localStorage.setItem("aircon_photo_v", String(Date.now())); } catch (e) {}
  }
  // Open the phone's / computer's picture chooser; resolves with the file, or null when nothing was picked
  const pickPicture = () => new Promise((resolve) => {
    const pick = document.createElement("input");
    pick.type = "file";
    pick.accept = "image/*";
    pick.onchange = () => resolve((pick.files && pick.files[0]) || null);
    pick.click();
  });

  return { POSITIONS, CREW_GROUPS, norm, of, me, photoUrl, photoImg, myLoginEmail, savePhoto, pickPicture };
})();
