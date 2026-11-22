// Signed forms: the client and technician sign on screen, and the signed sheet is saved as a PDF
// in the online database (Supabase table "signed_forms" + private storage folder "signed-forms").
//
// Saved forms can't be changed or deleted by anyone on the website (see supabase/signed_forms.sql).
// Owners and Developers can only archive (hide) a form, and restore it again.
//
// Needs: cloud.js (window.cloud), html2canvas and jsPDF loaded on the page.
(function () {
  const BUCKET = "signed-forms";
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const peso = (n) => "\u20B1" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const canManage = () => typeof Roles !== "undefined" && Roles.me().seesSales;   // Owner / Founder, Head Supervisor, Developer (roles.js)

  // ---------- Look ----------
  const css = document.createElement("style");
  css.textContent = `
    .sf-back { position: fixed; inset: 0; z-index: 9500; display: flex; align-items: center; justify-content: center;
      padding: 16px; background: rgba(15, 23, 42, .55); }
    .sf-box { width: min(640px, 100%); max-height: calc(100vh - 32px); overflow: auto; padding: 18px;
      border-radius: 12px; background: #fff; color: #16252b; box-shadow: 0 12px 40px rgba(0,0,0,.3);
      font: 14px/1.4 system-ui, "Segoe UI", sans-serif; }
    .sf-box.wide { width: min(900px, 100%); }
    .sf-box h3 { margin: 0 0 4px; font-size: 18px; }
    .sf-box p.sf-sub { margin: 0 0 12px; color: #64767d; font-size: 13px; }
    .sf-pad { display: block; width: 100%; height: 220px; border: 2px dashed #94a3b8; border-radius: 10px;
      background: #fff; touch-action: none; cursor: crosshair; }
    .sf-row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 12px; }
    .sf-row.left { justify-content: flex-start; align-items: center; }
    .sf-btn { padding: 9px 16px; border: 1px solid #dbe4e7; border-radius: 8px; background: #fff; color: #16252b;
      font: 700 13px system-ui, "Segoe UI", sans-serif; cursor: pointer; }
    .sf-btn:hover { background: #f4f7f8; }
    .sf-btn.go { border-color: #0f766e; background: #0f766e; color: #fff; }
    .sf-btn.warn { color: #b42318; }
    .sf-btn:disabled { opacity: .55; cursor: default; }
    .sf-search { flex: 1; min-width: 180px; padding: 9px 12px; border: 1px solid #dbe4e7; border-radius: 8px; font: inherit; }
    .sf-table { width: 100%; margin-top: 12px; border-collapse: collapse; font-size: 13px; }
    .sf-table th, .sf-table td { padding: 8px 6px; border-bottom: 1px solid #e5edf0; text-align: left; vertical-align: top; }
    .sf-table th { color: #64767d; font-size: 12px; font-weight: 700; }
    .sf-table tr.archived td { color: #94a3b8; }
    .sf-table td.act { white-space: nowrap; text-align: right; }
    .sf-table td.act .sf-btn { padding: 5px 10px; font-size: 12px; }
    .sf-tag { display: inline-block; margin-left: 4px; padding: 1px 6px; border-radius: 99px; background: #f1f5f9; color: #64767d; font-size: 11px; }
    .sf-empty { padding: 24px 0; color: #64767d; text-align: center; }
    .sf-note { margin-top: 10px; color: #64767d; font-size: 12px; }
    @media (max-width: 640px) {
      .sf-table thead { display: none; }
      .sf-table tr { display: block; padding: 8px 0; border-bottom: 1px solid #e5edf0; }
      .sf-table td { display: block; padding: 2px 0; border: 0; }
      .sf-table td.act { text-align: left; padding-top: 6px; }
    }`;
  document.head.appendChild(css);

  function modal(html, wide) {
    const back = document.createElement("div");
    back.className = "sf-back";
    back.innerHTML = `<div class="sf-box${wide ? " wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape" && document.body.contains(back)) { close(); document.removeEventListener("keydown", onKey); }
    });
    return { el: back.firstElementChild, close };
  }

  // ---------- Signature pad ----------
  // Resolves with a PNG picture of the signature, or null when cancelled
  function signaturePad(title) {
    return new Promise((resolve) => {
      const m = modal(`
        <h3>${esc(title)}</h3>
        <p class="sf-sub">Sign inside the box with a finger, pen or mouse.</p>
        <canvas class="sf-pad"></canvas>
        <div class="sf-row">
          <button type="button" class="sf-btn" data-a="clear">Clear</button>
          <button type="button" class="sf-btn" data-a="cancel">Cancel</button>
          <button type="button" class="sf-btn go" data-a="done">Done</button>
        </div>`);
      const canvas = m.el.querySelector("canvas");
      const ratio = Math.max(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext("2d");
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.4;
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.strokeStyle = "#0b1f44";

      let drawing = false, drawn = false, last = null;
      const at = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      canvas.addEventListener("pointerdown", (e) => {
        drawing = true; last = at(e); canvas.setPointerCapture(e.pointerId);
        ctx.beginPath(); ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
        drawn = true;
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!drawing) return;
        const p = at(e);
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        last = p;
      });
      const stop = () => { drawing = false; };
      canvas.addEventListener("pointerup", stop);
      canvas.addEventListener("pointercancel", stop);

      const finish = (value) => { m.close(); resolve(value); };
      m.el.addEventListener("click", (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === "clear") { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; }
        if (a === "cancel") finish(null);
        if (a === "done") {
          if (!drawn) return alert("Please sign first.");
          finish(trim(canvas));
        }
      });
      m.el.parentElement.addEventListener("click", (e) => { if (e.target === m.el.parentElement) resolve(null); });
    });
  }

  // Cut the empty space around a signature
  function trim(canvas) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const px = ctx.getImageData(0, 0, width, height).data;
    let top = height, left = width, right = 0, bottom = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (px[(y * width + x) * 4 + 3]) {
          if (x < left) left = x; if (x > right) right = x;
          if (y < top) top = y; if (y > bottom) bottom = y;
        }
      }
    }
    const pad = 8;
    left = Math.max(0, left - pad); top = Math.max(0, top - pad);
    right = Math.min(width, right + pad); bottom = Math.min(height, bottom + pad);
    const out = document.createElement("canvas");
    out.width = right - left; out.height = bottom - top;
    out.getContext("2d").drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  // ---------- Making the PDF ----------
  // A sheet made of several pages (children with class "pdf-page", e.g. the Survey) becomes one PDF
  // page each, filling the A4 page; any other sheet becomes one page with a small margin.
  async function sheetToPdf(sheet) {
    const shoot = (el) => html2canvas(el, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      windowWidth: Math.max(1200, el.scrollWidth + 100),
      onclone: (doc) => doc.documentElement.classList.add("sf-capture"),
    });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    const pages = [...sheet.querySelectorAll(":scope > .pdf-page")];
    const margin = pages.length ? 0 : 8, maxW = 210 - margin * 2, maxH = 297 - margin * 2;
    const list = pages.length ? pages : [sheet];
    for (let i = 0; i < list.length; i++) {
      const shot = await shoot(list[i]);
      let w = maxW, h = (shot.height * w) / shot.width;
      if (h > maxH) { h = maxH; w = (shot.width * h) / shot.height; }
      if (i) pdf.addPage();
      pdf.addImage(shot.toDataURL("image/jpeg", 0.9), "JPEG", (210 - w) / 2, margin, w, h);
    }
    return pdf.output("blob");
  }

  const newNumber = () => {
    const d = new Date();
    const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
    return { no: `SF-${ymd}-${rand}`, folder: `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}` };
  };

  // Saves a signed sheet. info: { client, contact, address, date, total, details }
  // Returns { no } or throws an Error with a message for the user.
  async function save(sheet, info) {
    const db = window.cloud;
    if (!db) throw new Error("The online database isn't connected, so the signed form can't be saved. Check the internet and refresh.");
    if (typeof html2canvas === "undefined" || !window.jspdf) throw new Error("The PDF maker didn't load. Check the internet and refresh.");

    const pdf = await sheetToPdf(sheet);
    const { no, folder } = newNumber();
    const path = `${folder}/${no}.pdf`;

    const up = await db.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (up.error) throw new Error(friendly(up.error));

    const { error } = await db.from("signed_forms").insert({
      no, client: info.client, contact: info.contact || null, address: info.address || null,
      form_date: info.date || null, total: info.total ?? null, details: info.details || null, file_path: path,
    });
    if (error) throw new Error(friendly(error));
    return { no };
  }

  function friendly(error) {
    const msg = String((error && error.message) || error);
    if (/bucket not found|relation .*signed_forms.* does not exist|signed_forms/i.test(msg) && /not found|does not exist|schema cache/i.test(msg))
      return "Signed forms aren't set up in the database yet. Run supabase/signed_forms.sql in Supabase first.";
    if (/fetch|network/i.test(msg)) return "Can't reach the online database. Check the internet and try again.";
    return msg;
  }

  // ---------- Opening a saved PDF ----------
  async function open(form) {
    const tab = window.open("", "_blank");
    const { data, error } = await window.cloud.storage.from(BUCKET).createSignedUrl(form.file_path, 300);
    if (error) { if (tab) tab.close(); return alert("Couldn't open the form: " + friendly(error)); }
    if (tab) tab.location.href = data.signedUrl; else location.href = data.signedUrl;
    window.cloud.from("signed_forms_log").insert({ form_id: form.id, action: "Viewed" }).then(() => {});
  }

  // ---------- List of signed forms ----------
  // options.client: show only this client's forms
  function showList(options = {}) {
    if (!window.cloud) return alert("The online database isn't connected. Check the internet and refresh.");
    const manager = canManage();
    const m = modal(`
      <h3>Signed forms</h3>
      <p class="sf-sub">Saved signed copies. They can't be changed or deleted${manager ? "; archiving only hides one, and it can be restored" : ""}.</p>
      <div class="sf-row left">
        <input class="sf-search" type="search" placeholder="Search client or form no." value="${esc(options.client || "")}">
        ${manager ? '<label style="font-size:13px;white-space:nowrap"><input type="checkbox" class="sf-arch"> Show archived</label>' : ""}
        <button type="button" class="sf-btn" data-a="close">Close</button>
      </div>
      <div class="sf-list"><div class="sf-empty">Loading\u2026</div></div>`, true);
    const list = m.el.querySelector(".sf-list");
    const search = m.el.querySelector(".sf-search");
    const archBox = m.el.querySelector(".sf-arch");
    let forms = [];

    async function load() {
      const q = search.value.trim().replace(/[%,()*\\]/g, " ").trim();
      let query = window.cloud.from("signed_forms").select("*").order("created_at", { ascending: false }).limit(300);
      if (!(archBox && archBox.checked)) query = query.is("archived_at", null);
      if (q) query = query.or(`client.ilike.%${q}%,no.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) { list.innerHTML = `<div class="sf-empty">${esc(friendly(error))}</div>`; return; }
      forms = data;
      draw();
    }

    function draw() {
      if (!forms.length) { list.innerHTML = '<div class="sf-empty">No signed forms found.</div>'; return; }
      list.innerHTML = `<table class="sf-table">
        <thead><tr><th>Form no.</th><th>Saved</th><th>Client</th><th>Total</th><th>Saved by</th><th></th></tr></thead>
        <tbody>${forms.map((f, i) => `
          <tr class="${f.archived_at ? "archived" : ""}">
            <td>${esc(f.no)}${f.archived_at ? '<span class="sf-tag">Archived</span>' : ""}</td>
            <td>${esc(new Date(f.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }))}</td>
            <td>${esc(f.client)}${f.contact ? `<br><small>${esc(f.contact)}</small>` : ""}</td>
            <td>${f.total != null ? peso(f.total) : "\u2014"}</td>
            <td>${esc(String(f.created_by || "").split("@")[0])}</td>
            <td class="act">
              <button type="button" class="sf-btn go" data-open="${i}">Open PDF</button>
              ${manager ? (f.archived_at
                ? `<button type="button" class="sf-btn" data-restore="${i}">Restore</button>`
                : `<button type="button" class="sf-btn warn" data-archive="${i}">Archive</button>`) : ""}
            </td>
          </tr>`).join("")}</tbody></table>
        <p class="sf-note">Showing up to 300 newest. Search to find older forms.</p>`;
    }

    m.el.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.a === "close") return m.close();
      if (b.dataset.open) return open(forms[+b.dataset.open]);
      const f = forms[+(b.dataset.archive || b.dataset.restore)];
      if (!f) return;
      if (b.dataset.archive) {
        const reason = prompt(`Archive ${f.no} (${f.client})?\n\nIt will be hidden from the list but kept safely, and can be restored.\nReason (optional):`, "");
        if (reason === null) return;
        b.disabled = true;
        const { error } = await window.cloud.from("signed_forms").update({ archived_at: new Date().toISOString(), archive_reason: reason || null }).eq("id", f.id);
        if (error) { b.disabled = false; return alert("Not archived: " + friendly(error)); }
      } else {
        b.disabled = true;
        const { error } = await window.cloud.from("signed_forms").update({ archived_at: null, archive_reason: null }).eq("id", f.id);
        if (error) { b.disabled = false; return alert("Not restored: " + friendly(error)); }
      }
      load();
    });
    let timer;
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 300); });
    if (archBox) archBox.addEventListener("change", load);
    (window.cloudReady || Promise.resolve()).then(load);
  }

  window.SignedForms = { signaturePad, save, showList, open };
})();
