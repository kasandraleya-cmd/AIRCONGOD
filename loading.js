// Loading screen on every page: the page shows through a see-through dark backdrop while a cropped
// loading.MP4 plays in the middle. The first page opened in a browser tab plays
// the whole video; after that, each page change shows a short version.
// Include it in <head> on every page. Click or press any key to skip.
(function () {
  // Turned off for now. Change to true to bring the loading screen back.
  const ENABLED = false;
  if (!ENABLED) return;

  const SEEN = "aircon_loaded";
  let first = true;
  try {
    first = !sessionStorage.getItem(SEEN);
    sessionStorage.setItem(SEEN, "1");
  } catch (e) {}
  const SHORT_MS = 2500;   // length of the loading screen when switching pages

  const style = document.createElement("style");
  style.textContent = `
    #loader {
      position: fixed; inset: 0; z-index: 99999;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px;
      background: rgba(30, 41, 59, 0.35);
      -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
      cursor: pointer;
      transition: opacity 0.5s ease;
    }
    #loader.done { opacity: 0; pointer-events: none; }

    /* White rounded card in the middle, with the video inside it */
    #loader .ld-card {
      width: min(86vw, 360px);
      padding: 14px;
      border-radius: 22px;
      background: #fff;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.25);
    }
    #loader .ld-video {
      aspect-ratio: 4 / 3;
      border-radius: 14px;
      overflow: hidden;
      background: #041026;
    }
    /* The whole video (same 4:3 shape as the frame), so the logo at the top isn't cut off */
    #loader video {
      display: block; width: 100%; height: 100%;
      object-fit: contain;
    }`;
  document.head.appendChild(style);

  document.addEventListener("DOMContentLoaded", () => {
    const loader = document.createElement("div");
    loader.id = "loader";
    loader.innerHTML = `
      <div class="ld-card"><div class="ld-video"><video src="loading.MP4" autoplay muted playsinline preload="auto"></video></div></div>`;
    document.body.prepend(loader);

    const video = loader.querySelector("video");

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      loader.classList.add("done");
      setTimeout(() => loader.remove(), 600);
      document.removeEventListener("keydown", finish);
    }

    video.addEventListener("ended", finish);
    video.addEventListener("error", finish);   // missing or unplayable video: just show the site
    loader.addEventListener("click", finish);
    document.addEventListener("keydown", finish);
    setTimeout(finish, first ? 12000 : SHORT_MS);   // never block the site for long
  });
})();
