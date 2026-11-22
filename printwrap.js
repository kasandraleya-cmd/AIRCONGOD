// PRINT WRAP: a typing box (<input>) can only show one line, so a long item name either gets tiny
// letters or is cut off ("…INVERTER 1.0 H") when printed or saved as PDF. Right before printing,
// every box matched by `selector` gets a copy of its text in normal-size letters that wraps onto a
// second line when needed; the box itself is hidden on paper only. After printing it's removed.
//
//   PrintWrap.attach("#rows .d");   // Formal Quotation / Warranty item descriptions
const PrintWrap = (function () {
  function styles() {
    if (document.getElementById("printWrapStyle")) return;
    const s = document.createElement("style");
    s.id = "printWrapStyle";
    s.textContent = `
      .pw-text { display: none; }
      @media print {
        input.pw-on { display: none !important; }
        .pw-text { display: block; flex: 1; min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 1.2; padding: 1px 2px; }
      }`;
    document.head.appendChild(s);
  }

  function attach(selector) {
    styles();
    const before = () => {
      document.querySelectorAll(selector).forEach((input) => {
        if (input.nextElementSibling && input.nextElementSibling.classList.contains("pw-text")) input.nextElementSibling.remove();
        if (!input.value.trim()) return;
        // The box's normal letters (without the shrink the page applies to long names)
        const shrunk = input.style.fontSize;
        input.style.fontSize = "";
        const cs = getComputedStyle(input);
        const span = document.createElement("span");
        span.className = "pw-text";
        span.textContent = input.value;
        ["fontFamily", "fontWeight", "fontSize", "color", "textAlign", "letterSpacing"].forEach((k) => (span.style[k] = cs[k]));
        input.style.fontSize = shrunk;
        input.classList.add("pw-on");
        input.after(span);
      });
    };
    const after = () => {
      document.querySelectorAll(".pw-text").forEach((s) => s.remove());
      document.querySelectorAll("input.pw-on").forEach((i) => i.classList.remove("pw-on"));
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return { before, after };
  }

  return { attach };
})();
