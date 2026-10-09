function escapeText(value){const div=document.createElement("div");div.textContent=value==null?"":String(value);return div.innerHTML.replaceAll('"',"&quot;");}
function safeMedia(value){try{const u=new URL(value,location.href);return typeof value==="string"&&value.trim()&&["http:","https:"].includes(u.protocol)?u.href:""}catch{return ""}}
houseData.books=(Array.isArray(houseData.books)?houseData.books:[]).filter(Boolean).map(b=>({...b,pages:(Array.isArray(b.pages)?b.pages:[]).filter(Boolean)}));
houseData.videos=(Array.isArray(houseData.videos)?houseData.videos:[]).filter(Boolean);
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let flowerChosen = houseData.favoriteFlower || "marigold";
let isZoomedIn = false;

/* ---------------- BOOT ---------------- */
let bootCancelled = false;
function showSceneFailure(err) {
  console.error('Scene could not start:', err);
  try { window.HouseScene?.dispose(); } catch (cleanupError) { console.error('Scene cleanup failed:', cleanupError); }
  const loading = $("#loading");
  const panel = document.createElement("div");
  panel.className = "scene-failure";
  panel.setAttribute("role", "alert");
  const message = document.createElement("p");
  message.textContent = "This little world couldn't open right now. Please check your connection and try again. If it still won't open, try another browser.";
  const retry = document.createElement("button");
  retry.className = "enter-btn";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => location.reload());
  panel.append(message, retry);
  loading.replaceChildren(panel);
  loading.inert = false;
  retry.focus();
}
function boot() {
  const container = $("#three-container");
  const suspended = [...$("#stage").children].filter(el => el.id !== "loading").map(el => [el, el.inert]);
  suspended.forEach(([el]) => { el.inert = true; });
  requestAnimationFrame(async () => {
    try {
      await import('./scene.js');
      if (bootCancelled) return;
      window.HouseScene.init(container);
      window.HouseScene.setHotspotHandler(handleHotspot);
      window.HouseScene.setFlower(flowerChosen);
      window.onZoomStateChange = (zoomedIn) => {
        isZoomedIn = zoomedIn;
        zoomToggle.textContent = zoomedIn ? "Zoom out" : "Zoom in";
        endVisit.style.display = zoomedIn ? "none" : "inline-block";
      };
      suspended.forEach(([el, inert]) => { el.inert = inert; });
      $("#loading").classList.add("hidden");$("#loading").inert=true;
    } catch (err) {
      if (!bootCancelled) showSceneFailure(err);
    }
  });
}

/* ---------------- ARRIVAL ---------------- */
function initArrival() {
  $("#arrival-names").innerHTML =
    `${escapeText(houseData.personOne)} <span class="heart">&#10084;</span> ${escapeText(houseData.personTwo)}`;
  $("#ending-names").innerHTML =
    `${escapeText(houseData.personOne)} <span class="heart">&#10084;</span> ${escapeText(houseData.personTwo)}`;
  $("#ending-message").textContent = houseData.finalMessage || "Made with love.";
  $("#key-chip").textContent = houseData.familyName || "OUR LITTLE WORLD";

  $("#enter-btn").addEventListener("click", () => {
    $("#arrival-overlay").classList.add("hidden");$("#arrival-overlay").inert=true;$("#hud").inert=false;$("#zoom-toggle").focus();
    window.HouseScene.beginArrival();
    startQuoteRotation();
  });
}

/* ---------------- DAY / NIGHT ---------------- */
let isNight = false;
const daynightBtn = $("#daynight-toggle");
const daynightIcon = $("#daynight-icon");

function setDisplayedTime(hour) {
  const time = ((hour % 24) + 24) % 24;
  const suffix = time >= 12 ? "PM" : "AM";
  const twelveHour = Math.floor(time) % 12 || 12;
  const minutes = Math.round((time % 1) * 60).toString().padStart(2, "0");
  $("#time-readout").textContent = `${twelveHour}:${minutes} ${suffix}`;
  $("#time-of-day").textContent = time < 7 ? "DAWN" : time < 11 ? "MORNING" : time < 16 ? "AFTERNOON" : time < 19 ? "SUNSET" : "NIGHT";
  isNight = time < 6 || time >= 19;
  daynightBtn.classList.toggle("is-night", isNight);
  daynightIcon.innerHTML = isNight ? "&#9790;" : "&#9728;";
}

daynightBtn.addEventListener("click", () => {
  const nextHour = isNight ? 14 : 21;
  $("#world-time").value = nextHour;
  window.HouseScene.setTime(nextHour);
  setDisplayedTime(nextHour);
});
$("#world-time").addEventListener("input", (event) => {
  const hour = Number(event.currentTarget.value);
  window.HouseScene.setTime(hour);
  setDisplayedTime(hour);
});

/* ---------------- ZOOM HUD ---------------- */
const zoomToggle = $("#zoom-toggle");
const endVisit = $("#end-visit");

zoomToggle.addEventListener("click", () => {
  window.HouseScene.setZoom(!isZoomedIn);
});

endVisit.addEventListener("click", () => {
  clearInterval(quoteTimer);clearTimeout(quoteDelay);clearTimeout(quoteHide);
  $("#ending-overlay").inert=false;$("#ending-overlay").classList.remove("hidden");$("#hud").inert=true;$("#world-time-control").inert=true;$("#daynight-toggle").inert=true;
});

/* ---------------- HOTSPOT ROUTER ---------------- */
function handleHotspot(type) {
  window.HouseScene.focusArea(type);
  if (type === "bookshelf") openBookChooser();
  if (type === "tv") openTv();
  if (type === "garden") openFlowerPicker();
}

/* ---------------- MODAL HELPERS ---------------- */
let modalReturnFocus;
function openModal(sel){const modal=$(sel);if(!modal.classList.contains("open"))modalReturnFocus=document.activeElement;modal.inert=false;modal.classList.add("open");modal.querySelector("button")?.focus();$("#hud").inert=true;$("#three-container").inert=true;$("#world-time-control").inert=true;$("#daynight-toggle").inert=true;}
function closeModal(sel){const modal=$(sel);modal.classList.remove("open");modal.inert=true;if(sel==="#tv-modal"){window.HouseScene.stopVideo();$("#tv-screen").textContent="Select a video to play";}$("#hud").inert=false;$("#three-container").inert=false;$("#world-time-control").inert=false;$("#daynight-toggle").inert=false;modalReturnFocus?.focus();}
$$("[data-hotspot]").forEach(btn=>btn.addEventListener("click",()=>handleHotspot(btn.dataset.hotspot)));

$$(".modal-backdrop").forEach((backdrop) => {
  backdrop.inert=true;backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      closeModal("#"+backdrop.id);
      if (backdrop.id === "tv-modal") window.HouseScene.stopVideo();
    }
  });
});
$("#book-close").addEventListener("click", () => closeModal("#book-modal"));
$("#tv-close").addEventListener("click", () => { closeModal("#tv-modal"); window.HouseScene.stopVideo(); });
$("#flower-close").addEventListener("click", () => closeModal("#flower-modal"));

document.addEventListener("keydown", (e) => {
  const modal=$(".modal-backdrop.open");if(e.key==="Tab"&&modal){const items=[...modal.querySelectorAll("button:not(:disabled),video[controls]")].filter(el=>el.offsetParent);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
  if (e.key === "Escape") {
    $$(".modal-backdrop.open").forEach((m) => closeModal("#"+m.id));
    window.HouseScene.stopVideo();
  }
});

/* ---------------- BOOKSHELF ---------------- */
let currentBook = null;
let currentPage = 0;

function openBookChooser() {
  if (houseData.books.length === 1) { openBook(houseData.books[0]); return; }

  $("#book-title").textContent = "Pick a book";
  $("#book-sub").textContent = "";
  $("#book-dots").innerHTML = "";
  $("#book-prev").style.display = "none";
  $("#book-next").style.display = "none";

  const container = $("#book-pages");
  container.innerHTML = "";
  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "10px";
  houseData.books.forEach((book) => {
    const btn = document.createElement("button");
    btn.className = "video-item";
    btn.style.background = "rgba(0,0,0,0.05)";
    btn.style.color = "var(--ink)";
    btn.textContent = book.title;
    btn.addEventListener("click", () => {
      $("#book-prev").style.display = "inline-block";
      $("#book-next").style.display = "inline-block";
      openBook(book);
    });
    list.appendChild(btn);
  });
  if(!houseData.books.length)list.textContent="No books have been added yet.";container.appendChild(list);
  openModal("#book-modal");
}

function openBook(book) {
  currentBook = book;
  currentPage = 0;
  $("#book-title").textContent = book.title;
  $("#book-sub").textContent = `${book.pages.length} ${book.pages.length===1?"page":"pages"}`;
  renderBookPage();
  openModal("#book-modal");
}

function renderBookPage() {
  const pages = currentBook.pages;
  const container = $("#book-pages");
  container.innerHTML = "";
  if(!pages.length)container.textContent="This book is waiting for its first memory.";
  pages.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "book-page" + (i === currentPage ? " active" : "");
    div.innerHTML = `
      <div class="caption">${escapeText(p.caption)}</div>
      ${p.date ? `<div class="date">${escapeText(p.date)}</div>` : ""}
      <div class="text">${escapeText(p.text)}</div>
    `;
    container.appendChild(div);
  });

  const dots = $("#book-dots");
  dots.innerHTML = "";
  pages.forEach((_, i) => {
    const d = document.createElement("span");
    if (i === currentPage) d.classList.add("active");
    dots.appendChild(d);
  });

  $("#book-prev").disabled = currentPage === 0;
  $("#book-next").disabled = currentPage >= pages.length - 1;
}

$("#book-prev").addEventListener("click", () => {
  if (currentPage > 0) { currentPage--; renderBookPage(); }
});
$("#book-next").addEventListener("click", () => {
  if (currentBook && currentPage < currentBook.pages.length - 1) { currentPage++; renderBookPage(); }
});

/* ---------------- TV ---------------- */
function openTv() {
  window.HouseScene.stopVideo();
  const list = $("#video-list");
  list.innerHTML = "";
  if (!houseData.videos.length) {
    list.innerHTML = `<div style="opacity:.6;font-size:14px;">No videos added yet.</div>`;
  }
  houseData.videos.forEach((v) => {
    const btn = document.createElement("button");
    btn.className = "video-item";
    btn.innerHTML = `<span class="play-icon">&#9654;</span> ${escapeText(v.title)}`;
    btn.addEventListener("click", () => {
      const screen = $("#tv-screen");
      const src=safeMedia(v.src);window.HouseScene.stopVideo();screen.replaceChildren();
      if (src) {
        const video=document.createElement("video");video.controls=true;video.playsInline=true;video.crossOrigin="anonymous";video.src=src;video.style.cssText="width:100%;height:100%;border-radius:8px";screen.appendChild(video);window.HouseScene.playVideo(video);video.addEventListener("error",()=>{window.HouseScene.stopVideo();screen.textContent="This video is unavailable."},{once:true});video.play().catch(()=>{video.focus()});
      } else {
        screen.innerHTML = "";
        screen.textContent = `No video has been added for ${v.title || "this memory"}.`;
      }
    });
    list.appendChild(btn);
  });
  openModal("#tv-modal");
}

/* ---------------- FLOWER PICKER ---------------- */
const flowerHex = {
  marigold: "#f4a531",
  rose: "#d94f70",
  tulip: "#b53a5c",
  daisy: "#f4d35e"
};

function openFlowerPicker() {
  const wrap = $("#flower-options");
  wrap.innerHTML = "";
  Object.keys(flowerHex).forEach((key) => {
    const btn = document.createElement("button");
    btn.className = "flower-option" + (flowerChosen === key ? " selected" : "");
    btn.innerHTML = `<span class="dot" style="background:${flowerHex[key]}"></span>`;
    btn.setAttribute("aria-label", key);
    btn.addEventListener("click", () => {
      flowerChosen = key;
      window.HouseScene.setFlower(key);
      openFlowerPicker();
    });
    wrap.appendChild(btn);
  });
  openModal("#flower-modal");
}

/* ---------------- QUOTES ---------------- */
let quoteIndex = 0;
let quoteTimer = null,quoteDelay=null,quoteHide=null;

function showNextQuote() {
  const toast = $("#quote-toast");
  const quotes = houseData.quotes?.length ? houseData.quotes : ["Somewhere, in the middle of ordinary days, we made a home."];
  toast.textContent = `“${quotes[quoteIndex % quotes.length]}”`;
  toast.classList.add("show");
  quoteIndex++;
  clearTimeout(quoteHide);quoteHide=setTimeout(() => toast.classList.remove("show"), 6000);
}

function startQuoteRotation() {
  quoteDelay=window.setTimeout(showNextQuote, 7000);
  const intervalMs = Math.max(30000, Number(houseData.quoteIntervalSeconds || 120) * 1000);
  quoteTimer = window.setInterval(showNextQuote, intervalMs);
}

setDisplayedTime(Number($("#world-time").value));

/* ---------------- INIT ---------------- */
$("#hud").inert=true;$("#ending-overlay").inert=true;
initArrival();
boot();

window.addEventListener("pagehide",e=>{if(!e.persisted)bootCancelled=true;clearInterval(quoteTimer);clearTimeout(quoteDelay);clearTimeout(quoteHide);window.HouseScene?.stopVideo()});
