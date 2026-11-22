// Warranty page on phones: a simple step-by-step form (1 Client → 2 Items → 3 Sign & save)
// instead of the wide paper sheet. Everything typed here is copied into the paper sheet,
// so the draft, totals, printing and the saved signed PDF all work exactly as on a computer.
// Load after the Warranty page's own script (it uses calc / fitText / saveDraft from there).
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sheet = $("#sheet");
  const paper = $(".q-paper");
  const rows = () => [...$("#rows").rows];

  // The sheet's boxes this form fills in
  const infoBox = (label) => [...document.querySelectorAll(".q-info label")]
    .find((l) => l.textContent.trim().toUpperCase().startsWith(label)).querySelector("input");
  const FIELDS = {
    client: () => infoBox("CLIENT"), date: () => infoBox("DATE"), mop: () => infoBox("MODE OF PAYMENT"),
    address: () => infoBox("ADDRESS"), contact: () => infoBox("CONTACT NUMBER"),
    prepared: () => document.querySelectorAll(".q-sign-row input")[0], noted: () => document.querySelectorAll(".q-sign-row input")[1],
    signDate: () => $(".q-date input"), accept: () => $(".q-accept input"),
  };

  // Put a value in the sheet, then let the page recalculate, save the draft and check signatures.
  // The event goes to the sheet itself, so the sheet's price suggestions don't pop up.
  function setSheet(input, value) {
    if (input.value === value) return;
    input.value = value;
    if (input.classList.contains("d") && typeof fitText === "function") fitText(input);
    sheet.dispatchEvent(new Event("input"));
  }

  const today = () => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const field = (key, label, attrs = "", extra = "") => `
    <label class="pf-field"><span>${label}</span>
      <span class="pf-input-row"><input data-f="${key}" ${attrs}>${extra}</span>
    </label>`;

  // ---------- The form ----------
  const form = document.createElement("section");
  form.className = "pf";
  form.innerHTML = `
    <div class="pf-card">
      <h2><b>1</b> Client</h2>
      ${field("client", "Client name", 'autocomplete="off" placeholder="e.g. Juan Dela Cruz"')}
      ${field("contact", "Contact number", 'type="tel" inputmode="tel" autocomplete="off" placeholder="09XX XXX XXXX"')}
      ${field("address", "Address", 'autocomplete="off"')}
      ${field("date", "Date", 'autocomplete="off"', '<button type="button" class="pf-mini" data-today="date">Today</button>')}
      ${field("mop", "Mode of payment", 'list="pfMop" autocomplete="off" placeholder="e.g. CASH"')}
      <datalist id="pfMop"><option>CASH</option><option>GCASH</option><option>BANK TRANSFER</option><option>CHEQUE</option><option>CARD</option></datalist>
    </div>

    <div class="pf-card">
      <h2><b>2</b> Items</h2>
      <p class="pf-help">Type a few words (e.g. "lg 1.5") and pick from the price list.</p>
      <div class="pf-items"></div>
      <button type="button" class="pf-add"><i class="fas fa-plus"></i> Add item</button>
      <div class="pf-total"><span>Total amount to pay</span><b id="pfGrand">\u20B10.00</b></div>
      <div class="pf-warranty" id="pfWarranty"></div>
    </div>

    <div class="pf-card">
      <h2><b>3</b> Sign &amp; save</h2>
      ${field("prepared", "Prepared by", 'autocomplete="off"')}
      ${field("noted", "Noted by", 'autocomplete="off"')}
      ${field("signDate", "Date signed", 'autocomplete="off"', '<button type="button" class="pf-mini" data-today="signDate">Today</button>')}
      ${field("accept", "Client name on the acceptance", 'autocomplete="off" placeholder="Same as client name"')}
      <button type="button" class="pf-link" data-preview><i class="fas fa-file-alt"></i> Let the client read the full form &amp; terms</button>
      <div class="pf-sigs">
        <button type="button" class="pf-sig" data-sig="tech"><img alt=""><span><i class="fas fa-pen"></i> Technician signs</span></button>
        <button type="button" class="pf-sig" data-sig="client"><img alt=""><span><i class="fas fa-pen"></i> Client signs</span></button>
      </div>
      <button type="button" class="pf-save"><i class="fas fa-save"></i> Save</button>
      <p class="pf-help center">Saved forms are kept permanently and can't be changed.</p>
    </div>`;
  paper.before(form);

  const previewBtn = $("[data-preview]", form);
  function setPreview(on) {
    paper.classList.toggle("show", on);
    previewBtn.innerHTML = on ? '<i class="fas fa-times"></i> Hide the full form'
      : '<i class="fas fa-file-alt"></i> Let the client read the full form &amp; terms';
    if (on) { fitPreview(); paper.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }
  previewBtn.onclick = () => setPreview(!paper.classList.contains("show"));
  // The paper is shrunk to the phone's width (phones only; the saved PDF is always full size)
  function fitPreview() { paper.style.setProperty("--pz", Math.min(1, (paper.clientWidth - 16) / 794).toFixed(3)); }
  window.addEventListener("resize", () => paper.classList.contains("show") && fitPreview());

  // ---------- Client and sign-off fields ----------
  function fillFields() {
    form.querySelectorAll("[data-f]").forEach((i) => { i.value = FIELDS[i.dataset.f]().value; });
  }
  form.addEventListener("input", (e) => {
    const key = e.target.dataset.f;
    if (key) setSheet(FIELDS[key](), e.target.value);
  });
  form.addEventListener("click", (e) => {
    const t = e.target.closest("[data-today]");
    if (!t) return;
    const input = $(`[data-f="${t.dataset.today}"]`, form);
    input.value = today();
    setSheet(FIELDS[t.dataset.today](), input.value);
  });

  // ---------- Items: one card per filled row of the sheet ----------
  const itemsBox = $(".pf-items", form);
  const rowHasData = (r) => ["d", "q", "u", "p"].some((c) => $("." + c, r).value.trim());
  let shownRows = 1;
  const money = (n) => "\u20B1" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function drawItems() {
    const all = rows();
    const lastFilled = all.reduce((last, r, i) => (rowHasData(r) ? i : last), -1);
    shownRows = Math.min(all.length, Math.max(shownRows, lastFilled + 1, 1));
    itemsBox.innerHTML = all.slice(0, shownRows).map((r, i) => `
      <div class="pf-item" data-row="${i}">
        <div class="pf-item-head"><b>Item ${i + 1}</b>
          <button type="button" class="pf-remove" data-remove="${i}" aria-label="Remove item ${i + 1}"><i class="fas fa-trash"></i></button>
        </div>
        <input class="pf-d" data-c="d" placeholder="Description" autocomplete="off" value="${esc($(".d", r).value)}">
        <div class="pf-item-grid">
          <label><span>Qty</span><input data-c="q" type="number" inputmode="decimal" min="0" step="any" value="${esc($(".q", r).value)}"></label>
          <label><span>Unit</span><input data-c="u" list="pfUnits" autocomplete="off" value="${esc($(".u", r).value)}"></label>
          <label class="wide"><span>Price per unit</span><input data-c="p" type="number" inputmode="decimal" step="any" value="${esc($(".p", r).value)}"></label>
        </div>
        <div class="pf-line">Line total <b>${money((+$(".q", r).value || 0) * (+$(".p", r).value || 0))}</b></div>
      </div>`).join("") + '<datalist id="pfUnits"><option>UNIT</option><option>FT</option><option>SET</option><option>PC</option></datalist>';
    $(".pf-add", form).hidden = shownRows >= all.length;
    updateTotals();
  }

  function updateTotals() {
    $("#pfGrand").textContent = "\u20B1" + $("#grand").textContent;
    // The warranty the paper shows for these units (set by the Warranty page from warranty.js)
    const w = $("#warrantyBox").cloneNode(true);
    w.querySelector("h4").remove();
    $("#pfWarranty").innerHTML = '<b><i class="fas fa-shield-alt"></i> Warranty</b>' + w.innerHTML;
    $("#pfWarranty").hidden = !w.textContent.trim();   // no items yet: nothing to show
    itemsBox.querySelectorAll(".pf-item").forEach((card) => {
      const r = rows()[+card.dataset.row];
      $(".pf-line b", card).textContent = money((+$(".q", r).value || 0) * (+$(".p", r).value || 0));
    });
  }

  itemsBox.addEventListener("input", (e) => {
    const c = e.target.dataset.c;
    if (!c) return;
    const r = rows()[+e.target.closest(".pf-item").dataset.row];
    setSheet($("." + c, r), e.target.value);
    updateTotals();
  });

  // Picking from the price list fills the unit and price (still editable)
  PricePicker.attach(itemsBox, ".pf-d", (input, item) => {
    const card = input.closest(".pf-item");
    const r = rows()[+card.dataset.row];
    input.value = item.name;
    $('[data-c="u"]', card).value = item.unit;
    $('[data-c="p"]', card).value = item.srp;
    const qty = $('[data-c="q"]', card);
    if (!qty.value) qty.value = 1;
    setSheet($(".d", r), item.name);
    setSheet($(".u", r), item.unit);
    setSheet($(".p", r), String(item.srp));
    setSheet($(".q", r), qty.value);
    updateTotals();
  });

  $(".pf-add", form).onclick = () => {
    shownRows++;
    drawItems();
    const cards = itemsBox.querySelectorAll(".pf-item");
    $(".pf-d", cards[cards.length - 1]).focus();
  };

  // Removing an item moves the ones below it up, so the paper has no empty gaps
  itemsBox.addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    const all = rows();
    const from = +b.dataset.remove;
    if (rowHasData(all[from]) && !confirm("Remove this item?")) return;
    for (let i = from; i < all.length; i++) {
      ["d", "q", "u", "p"].forEach((c) => setSheet($("." + c, all[i]), i + 1 < all.length ? $("." + c, all[i + 1]).value : ""));
    }
    shownRows = Math.max(1, shownRows - 1);
    drawItems();
  });

  // ---------- Signatures and saving: the same as the signature lines on the paper ----------
  form.querySelectorAll(".pf-sig").forEach((b) => {
    b.onclick = () => $(`.q-sig-box[data-sig="${b.dataset.sig}"]`).click();
  });
  function drawSignatures() {
    form.querySelectorAll(".pf-sig").forEach((b) => {
      const src = $(`.q-sig-box[data-sig="${b.dataset.sig}"]`);
      const signed = src.classList.contains("signed");
      b.classList.toggle("signed", signed);
      if (signed) $("img", b).src = $("img", src).src; else $("img", b).removeAttribute("src");
      $("span", b).innerHTML = signed ? '<i class="fas fa-check"></i> Signed \u00B7 tap to redo'
        : `<i class="fas fa-pen"></i> ${b.dataset.sig === "client" ? "Client" : "Technician"} signs`;
    });
  }
  document.querySelectorAll(".q-sig-box").forEach((box) =>
    new MutationObserver(drawSignatures).observe(box, { attributes: true, attributeFilter: ["class"], subtree: true }));

  const topSave = $("#saveSignedBtn");
  const save = $(".pf-save", form);
  save.onclick = () => topSave.click();
  // Show "Saving…" here too, and the result message once it's done
  new MutationObserver(() => {
    save.disabled = topSave.disabled;
    save.innerHTML = topSave.innerHTML;
    const note = document.getElementById("sigNote");
    if (!topSave.disabled && note && !note.hidden) note.scrollIntoView({ behavior: "smooth", block: "center" });
  }).observe(topSave, { attributes: true, childList: true, subtree: true });

  // ---------- Keep in step with the paper ----------
  function refresh() {
    fillFields();
    shownRows = 1;
    drawItems();
    drawSignatures();
  }
  // "New" clears the paper; the form follows
  $("#newBtn").addEventListener("click", () => setTimeout(refresh, 0));
  refresh();

  window.PhoneForm = { refresh };
})();
