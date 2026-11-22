// The sidebar menu, in ONE place for every page.
// To add, rename, move or remove a page in the menu, change MENU below; every page follows.
// Load it on each page right before user.js (user.js then hides the links a position may not open).
(function buildSidebar() {
  const nav = document.querySelector(".side nav");
  if (!nav) return;

  // Logo + name: show only the shield from the logo (the words in the picture are too small to read
  // here and the name is written beside it anyway), and make it a link back to the Dashboard
  const brand = document.querySelector(".side .side-brand");
  if (brand && !brand.querySelector(".side-home")) {
    const img = brand.querySelector("img");
    if (img) {
      const logo = document.createElement("i");
      logo.className = "side-logo";
      logo.setAttribute("role", "img");
      logo.setAttribute("aria-label", "AIRCON G.O.D logo");
      img.replaceWith(logo);
    }
    const home = document.createElement("a");
    home.className = "side-home";
    home.href = "dashboard.html";
    home.title = "Go to Dashboard";
    while (brand.firstChild) home.appendChild(brand.firstChild);
    brand.appendChild(home);
  }

  // [page, icon, name, who] in groups. A group without a title has no heading.
  // who (optional): a roles.js flag (Roles.me()) the person must have to see the link, e.g. "staffAndPay"
  const MENU = [
    { items: [
      ["dashboard.html", "fa-home", "Dashboard"],
      ["myprofile.html", "fa-id-badge", "My Profile"],   // everyone: own info, profile picture, warnings
      ["myattendance.html", "fa-user-clock", "My Attendance"],   // everyone: own time in and attendance
    ] },
    { title: "Sales", items: [
      ["sales.html", "fa-shopping-cart", "Job Order"],
      ["jo-records.html", "fa-folder-open", "JO Records"],   // every job order: red until its stock is recorded, green once it is
      ["aftersales.html", "fa-tools", "Warranty"],
      ["warranty-records.html", "fa-file-alt", "Warranty Records"],   // every Warranty quotation saved (histrecords.js)
      ["formal-records.html", "fa-file-invoice", "Formal Records"],   // every Formal Quotation saved
      ["ocular.html", "fa-binoculars", "Ocular Survey"],   // installers list what a site needs (no prices)
      ["ocular-records.html", "fa-folder-open", "Ocular Records"],   // every survey sent, by customer (HR / supervisors / office; user.js)
      ["customers.html", "fa-address-book", "Customer Records"],
      ["cleaning-records.html", "fa-wind", "Cleaning Records"],
      ["survey-records.html", "fa-clipboard-check", "Survey Records"],
      ["btucalc.html", "fa-ruler-combined", "Room Measurement"],
    ] },
    { title: "Stock", items: [
      ["scanner.html", "fa-barcode", "Scanner"],
      ["serialtrackernumber.html", "fa-hashtag", "Serial Number Tracking"],
      ["inventory.html", "fa-boxes", "Inventory"],
      ["pricelist.html", "fa-tags", "Price List"],
    ] },
    { title: "Schedule", items: [
      ["dailysched.html", "fa-calendar-day", "Daily Schedule"],
      ["schedule.html", "fa-calendar-alt", "Weekly Schedule"],
    ] },
    { title: "Accounting", items: [
      ["cashvoucher.html", "fa-file-invoice-dollar", "Expenses"],
    ] },
    { title: "Team", items: [
      ["staff.html", "fa-user-friends", "Staff"],
      ["attendance.html", "fa-user-check", "Attendance", "staffAndPay"],   // crew attendance: Owner / Head Supervisor, HR / Manager, Developer only
      ["payroll.html", "fa-money-check-alt", "Payroll"],
      // Time Clock moved to its own website (timeclock-site/); IC cards are given on the Staff page
    ] },
    { title: "Admin", items: [
      // Logins, page views and record changes: Owner / Head Supervisor and Developer only (supabase/audit_events.sql)
      ["auditlog.html", "fa-clipboard-list", "Audit Log", "seesSales"],
    ] },
  ];
  // Pages that aren't in the menu light up the page they belong to
  const BELONGS_TO = { "formalquotation.html": "aftersales.html", "survey.html": "aftersales.html" };

  const page = (location.pathname.split("/").pop() || "dashboard.html").toLowerCase();
  const active = BELONGS_TO[page] || page;

  const me = typeof Roles !== "undefined" ? Roles.me() : {};
  const allowed = ([, , , who]) => !who || !!me[who];

  // Same button markup as before, so user.js can still hide links by position
  nav.innerHTML = MENU.map((g) =>
    (g.title ? `<div class="nav-group">${g.title}</div>` : "") +
    // Inside every category the pages are in alphabetical order
    g.items.filter(allowed).sort((a, b) => a[2].localeCompare(b[2], undefined, { sensitivity: "base" })).map(([file, icon, name]) => file === active
      ? `<button class="on" aria-current="page" title="${name}"><i class="fas ${icon}"></i> ${name}</button>`
      : `<button onclick="location.href='${file}'" title="${name}"><i class="fas ${icon}"></i> ${name}</button>`).join("")
  ).join("");
  nav.classList.add("grouped");
  nav.setAttribute("aria-label", "Main menu");

  // After user.js has hidden links for this position: hide headings with nothing left under them
  function tidy() {
    nav.querySelectorAll(".nav-group").forEach((h) => {
      let any = false;
      for (let n = h.nextElementSibling; n && !n.classList.contains("nav-group"); n = n.nextElementSibling) {
        if (n.tagName === "BUTTON") any = true;
      }
      h.hidden = !any;
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tidy);
  else setTimeout(tidy, 0);
})();
