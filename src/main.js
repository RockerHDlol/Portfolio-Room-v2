import * as THREE from "three";
import "./style.scss";
import { OrbitControls } from "./utils/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import gsap from "gsap";

// Set to true to preload Instagram and YouTube content during startup.
const PRELOAD_REELS = false;

/**
 * ✅ Interaction lock:
 * - false while loading screen is up
 * - true only after loading + reveal finished
 */
let interactionEnabled = false;
let isModalOpen = false;
let isCameraMoving = false;
let isPortraitMode = false;

// Slide state (wird später genutzt)
let slideT = 0.5;

let lastPortraitBeforeOverlay = null;

let suppressPortraitSlide = false;




// ----- Top-right menu -----
let isMenuOpen = false;
const menuRoot = document.querySelector(".site-menu");
const menuToggleBtn = document.getElementById("menuToggle");
const menuBackdrop = document.getElementById("menuBackdrop");
const menuPanel = document.getElementById("siteMenuPanel");

// ✅ HARTE INITIALISIERUNG - Menü komplett geschlossen
isMenuOpen = false;

if (menuRoot) {
  menuRoot.classList.remove("is-open");
  menuRoot.classList.remove("is-ready");
  // ✅ menuRoot NIE verstecken – sonst sind die 3 Striche weg
  menuRoot.style.display = "";
  menuRoot.style.opacity = "1";
  menuRoot.style.pointerEvents = "auto";
}


if (menuToggleBtn) {
  menuToggleBtn.setAttribute("aria-expanded", "false");
  gsap.set(menuToggleBtn, { opacity: 0, y: -6, scale: 0.95 });
}

if (menuBackdrop) {
  menuBackdrop.hidden = true;
  gsap.set(menuBackdrop, { opacity: 0 });
}

if (menuPanel) {
  menuPanel.hidden = true;
  gsap.set(menuPanel, { opacity: 0, x: 12 });
}

const canvas = document.querySelector("#experience-canvas");
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

let suppressHoverUntil = 0;
let hoverArmed = true;
let masonryResizeHandler = null;
let resizeTimeout = null;

const modals = {
  post: document.querySelector(".modal.post"),
  film: document.querySelector(".modal.film"),
  live: document.querySelector(".modal.live"),
  contact: document.querySelector(".modal.contact"),
};

function storePortraitPoseBeforeOverlay() {
  if (!isPortraitMode) {
    lastPortraitBeforeOverlay = null;
    return;
  }
  lastPortraitBeforeOverlay = {
    position: camera.position.clone(),
    target: controls.target.clone(),
    slideT,
  };
}

const aboutBox = document.querySelector("#aboutMeBox");
const getInTouchBox = document.querySelector("#getInTouchBox");
const contactForm = document.querySelector("#contactForm");
const contactFormStatus = document.querySelector("#contactFormStatus");

if (contactForm) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = contactForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    contactFormStatus.textContent = "Wird gesendet...";

    try {
      const response = await fetch(contactForm.action, {
        method: "POST",
        body: new FormData(contactForm),
        headers: { Accept: "application/json" },
      });

      if (!response.ok) throw new Error("Contact form request failed");

      contactForm.reset();
      contactFormStatus.textContent = "Danke, deine Nachricht wurde gesendet.";
    } catch (error) {
      console.error(error);
      contactFormStatus.textContent = "Das Senden ist fehlgeschlagen. Bitte versuche es erneut.";
    } finally {
      submitButton.disabled = false;
    }
  });
}

function showAboutBox(box = aboutBox) {
  if (!box) return;
  hideMenuUI();

  storePortraitPoseBeforeOverlay();

  const inner = box.querySelector(".about-box-inner") || box;
  inner.appendChild(globalCloseBtn);

  box.style.display = "block";
  box.setAttribute("aria-hidden", "false");

  globalCloseBtn.classList.add("is-about");
  globalCloseBtn.style.display = "grid";

  isModalOpen = true;

  controls.enabled = false;
  controls.enableRotate = false;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = false;

  if (currentHoveredObject) {
    playHoverAnimation(currentHoveredObject, false);
    currentHoveredObject = null;
  }
  document.body.style.cursor = "default";
  currentIntersects = [];

  gsap.killTweensOf(box);
  gsap.killTweensOf(inner);

  gsap.set(box, { opacity: 1 });
  gsap.fromTo(
    inner,
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.45, ease: "circ.out", overwrite: "auto" }
  );
}

function hideAboutBox(box = aboutBox) {
  if (!box) return;
  showMenuUI();
  globalCloseBtn.classList.remove("is-about");
  globalCloseBtn.style.display = "none";

  const inner = box.querySelector(".about-box-inner") || box;

  gsap.killTweensOf(box);
  gsap.killTweensOf(inner);

  gsap.to(inner, {
    opacity: 0,
    y: 10,
    duration: 0.35,
    ease: "power2.in",
    onComplete: () => {
      document.body.appendChild(globalCloseBtn);
      box.style.display = "none";
      box.setAttribute("aria-hidden", "true");

      globalCloseBtn.classList.remove("is-about");
      globalCloseBtn.style.display = "none";
      isModalOpen = false;

      // WICHTIG: NICHT controls.enabled hier setzen
      // controls.enabled = false; // <- ENTFERNEN

      if (isPortraitMode && lastPortraitBeforeOverlay) {
        slideT = lastPortraitBeforeOverlay.slideT ?? slideT;
        
        // WICHTIG: suppressPortraitSlide für die Rückflug-Animation aktivieren
        suppressPortraitSlide = true;

        flyToPose(
          lastPortraitBeforeOverlay.position,
          lastPortraitBeforeOverlay.target,
          {
            duration: 0.6,
            ease: "power2.out",
            onComplete: () => {
              controls.enableRotate = false;
              disableOrbitLimits();
              controls.enabled = true;
              controls.update();
              
              // WICHTIG: suppressPortraitSlide wieder deaktivieren
              suppressPortraitSlide = false;
              // ✅ Jetzt die aktuelle Slide-Position anwenden
              applyCameraSlide(slideT);
            },
          }
        );
      } else {
        flyToView("home", {
          onComplete: () => {
            controls.enableRotate = true;
            enableOrbitLimitsAroundCurrentView();
            controls.enabled = true;
            controls.update();
          },
        });
      }

      suppressHoverUntil = performance.now() + 300;
      hoverArmed = false;
      currentIntersects = [];
      if (currentHoveredObject) {
        playHoverAnimation(currentHoveredObject, false);
        currentHoveredObject = null;
      }
      document.body.style.cursor = "default";
    },
  });
}

const globalCloseBtn = document.createElement("button");
globalCloseBtn.className = "global-modal-close";
globalCloseBtn.setAttribute("aria-label", "Close modal");
globalCloseBtn.innerHTML = `<img src="/images/Close.png" alt="" />`;
document.body.appendChild(globalCloseBtn);
globalCloseBtn.style.display = "none";

globalCloseBtn.addEventListener("click", () => {
  const openInfoBox = document.querySelector(".about-box[aria-hidden='false']");
  if (openInfoBox) {
    hideAboutBox(openInfoBox);
    return;
  }

  const openModal = document.querySelector(".modal.is-open");
  if (openModal) hideModal(openModal);
});

let POSTS_BY_CATEGORY = { post: [], film: [], live: [] };
const renderedInstagramModals = new Set();
const instagramLayoutHandlers = new Map();

async function loadPostsFromSheet() {
  const r = await fetch(`/api/posts?ts=${Date.now()}`);
  const data = await r.json();

  POSTS_BY_CATEGORY = { post: [], film: [], live: [] };

  for (const item of data.items || []) {
    if (!item?.category || !item?.postId) continue;

    const category = String(item.category).toLowerCase();
    if (!POSTS_BY_CATEGORY[category]) continue;

    POSTS_BY_CATEGORY[category].push({
      postId: item.postId,
      type: String(item.type ?? "instagram").toLowerCase(),
      name: item.name ?? item.Name ?? "",
      subText: item.subText ?? item.SubText ?? "",
      date: item.date ?? item.Date ?? "",
      aspectRatio: item.aspectRatio ?? "4/5",
    });
  }

  console.log("Loaded posts:", POSTS_BY_CATEGORY);
}

const headerDiv = document.getElementById("Header");
if (headerDiv) headerDiv.remove();

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function getYoutubeEmbedUrl(videoId) {
  const value = String(videoId || "").trim();

  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) {
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(url.pathname.slice(1))}`;
    }

    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v") || url.pathname.split("/").pop();
      if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
    }
  } catch {
    // The sheet can contain a plain YouTube video ID.
  }

  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(value)}`;
}

function renderInstagramEmbeds(modalElement, modalKey, { skipReels = false } = {}) {
  if (renderedInstagramModals.has(modalKey)) {
    return Promise.resolve();
  }

  const contentEl = modalElement.querySelector(".modal-content");
  if (!contentEl) {
    console.error("No .modal-content found in modal");
    return Promise.resolve();
  }

  if (masonryResizeHandler) {
    window.removeEventListener("resize", masonryResizeHandler);
  }

  masonryResizeHandler = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(layoutMasonry, 150);
  };

  window.addEventListener("resize", masonryResizeHandler);

  let items = [...(POSTS_BY_CATEGORY[modalKey] || [])].reverse();
  if (skipReels) {
    items = items.filter(({ aspectRatio }) => {
      const ratioParts = String(aspectRatio || "4/5")
        .replace(/\s+/g, "")
        .split("/")
        .map((part) => parseFloat(part.trim()));
      return !(ratioParts[0] === 9 && ratioParts[1] === 15.5);
    });
  }
  console.log(`Rendering ${items.length} posts for ${modalKey}`);

  if (items.length === 0) {
    contentEl.innerHTML =
      '<p style="color: white; padding: 20px;">No posts found</p>';
    return Promise.resolve();
  }

  const container = document.createElement("div");
  container.className = "insta-masonry";
  contentEl.innerHTML = "";
  contentEl.appendChild(container);
  if (!skipReels) {
    renderedInstagramModals.add(modalKey);
  }

  const postElements = items.map(({ postId, type, name, subText, date, aspectRatio }) => {
    const wrapper = document.createElement("div");
    wrapper.className = "iframe-wrapper";
    if (type === "youtube") wrapper.classList.add("youtube-card");

    const cleanRatio = String(aspectRatio || "4/5").replace(/\s+/g, "");
    const ratioParts = cleanRatio.split("/").map((s) => parseFloat(s.trim()));
    const isPortraitReel = ratioParts[0] === 9 && ratioParts[1] === 15.5;
    wrapper.style.aspectRatio = cleanRatio;
    wrapper.dataset.aspectRatio = cleanRatio;

    const parts = cleanRatio.split("/").map((s) => parseFloat(s.trim()));
    const wR = parts[0] || 4;
    const hR = parts[1] || 5;
    const ar = hR / wR;

    const MIN_PAD = 1;
    const MAX_PAD = 20;
    let metaPad = 4 + (ar - 0.6) * 12;
    metaPad = Math.max(MIN_PAD, Math.min(MAX_PAD, metaPad));
    wrapper.style.setProperty("--meta-pad", `${metaPad}vw`);

    const embedMarkup = type === "youtube"
      ? `
        <div class="youtube-embed">
          <iframe
            src="${getYoutubeEmbedUrl(postId)}"
            title="${escapeHtml(name || "YouTube video")}"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen>
          </iframe>
        </div>`
      : `
        <div class="insta-embed${isPortraitReel ? " insta-embed--portrait-reel" : ""}">
          <iframe
            src="https://www.instagram.com/p/${encodeURIComponent(postId)}/embed/"
            frameborder="0"
            scrolling="no"
            allowtransparency="true">
          </iframe>
        </div>`;

    wrapper.innerHTML = `
      ${embedMarkup}
      <div class="iframe-cover"></div>
      <div class="post-meta">
        <div class="post-title">${escapeHtml(name || "")}</div>
        <div class="post-sub">${escapeHtml(subText || "")}</div>
        <div class="post-date">${escapeHtml(date || "")}</div>
      </div>
    `;
    return wrapper;
  });

  function layoutMasonry() {
    const containerWidth =
      container.getBoundingClientRect().width ||
      modalElement.getBoundingClientRect().width;

    if (!containerWidth) {
      return;
    }

    const w = window.innerWidth;
    const numCols = w <= 600 ? 1 : w <= 1000 ? 2 : 3;

    const gridStyles = getComputedStyle(container);
    const gap = parseFloat(gridStyles.rowGap) || 15;
    const rowHeight = parseFloat(gridStyles.gridAutoRows) || 8;
    const colWidth = (containerWidth - (numCols - 1) * gap) / numCols;

    postElements.forEach((el) => {
      const isYoutube = el.classList.contains("youtube-card");
      const span = isYoutube && numCols >= 2 ? 2 : 1;
      const itemWidth = colWidth * span + gap * (span - 1);

      const ratioStr = el.dataset.aspectRatio || "4/5";
      const parts = ratioStr.split("/").map((s) => parseFloat(s.trim()));
      const wRatio = parts[0];
      const hRatio = parts[1];
      const ratio = wRatio && hRatio ? hRatio / wRatio : 5 / 4;

      const elHeight = itemWidth * ratio;
      const rowSpan = Math.ceil((elHeight + gap) / (rowHeight + gap));
      el.style.gridColumn = `span ${span}`;
      el.style.gridRow = `span ${rowSpan}`;
    });

    container.innerHTML = "";
    postElements.forEach((el) => container.appendChild(el));
  }

  instagramLayoutHandlers.set(modalKey, layoutMasonry);

  requestAnimationFrame(() => {
    layoutMasonry();
    setTimeout(layoutMasonry, 300);
  });

  resizeTimeout = setTimeout(layoutMasonry, 150);

  const iframeLoads = [...container.querySelectorAll("iframe")].map((iframe) => {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, 12000);
      iframe.addEventListener("load", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  });

  return Promise.all(iframeLoads);
}

const manager = new THREE.LoadingManager();
manager.itemStart("instagram-preload");

const loadingScreen = document.querySelector(".loading-screen");
const loadingProgress = document.querySelector(".loading-progress");
const loadingProgressValue = document.querySelector(".loading-progress-value");
const loadingProgressNumber = document.querySelector(".loading-progress-number");
const loadingProgressCircumference = 2 * Math.PI * 52;

function updateLoadingProgress(loaded, total) {
  const progress = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  loadingProgressValue.style.strokeDashoffset =
    loadingProgressCircumference * (1 - progress / 100);
  loadingProgress.setAttribute("aria-valuenow", String(progress));
  loadingProgressNumber.textContent = `${progress}%`;
}

updateLoadingProgress(0, 1);

function playReveal() {
  const tl = gsap.timeline();

  tl.to(loadingScreen, {
    opacity: 0,
    backdropFilter: "blur(0px)",
    webkitBackdropFilter: "blur(0px)",
    duration: 1.4,
    ease: "power2.inOut",
  }).eventCallback("onComplete", () => {
    loadingScreen.style.pointerEvents = "none";
    playIntroAnimtion();
    loadingScreen.remove();
    revealHamburgerMenu();
    interactionEnabled = true;
  });
}

function revealHamburgerMenu() {
  if (!menuRoot || !menuToggleBtn) return;

  // ✅ Sicherstellen dass Menü GESCHLOSSEN ist
  isMenuOpen = false;
  menuRoot.classList.remove("is-open");
  document.body.classList.remove("menu-open");

  
  if (menuBackdrop) {
    menuBackdrop.hidden = true;
    gsap.set(menuBackdrop, { opacity: 0 });
  }
  
  if (menuPanel) {
    menuPanel.hidden = true;
    gsap.set(menuPanel, { opacity: 0, x: 12 });
  }

  // ✅ Nur wenn noch nicht initialisiert
  if (menuRoot.classList.contains("is-ready")) return;

  // menuRoot.style.display = "";         // ✅ erst jetzt existiert es wieder

  menuRoot.classList.add("is-ready");
  menuRoot.style.pointerEvents = "auto";

  gsap.to(menuRoot, {
    opacity: 1,
    duration: 0.3,
    ease: "power1.out",
  });

  gsap.to(menuToggleBtn, {
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.35,
    ease: "back.out(1.7)",
  });
}

function openMenu() {
  if (!menuRoot || !menuToggleBtn || !menuPanel || !menuBackdrop) return;
  if (isMenuOpen) return;
  if (isModalOpen) return;

  isMenuOpen = true;

  menuRoot.classList.add("is-open");
  document.body.classList.add("menu-open");
  menuToggleBtn.setAttribute("aria-expanded", "true");

  menuBackdrop.hidden = false;
  menuPanel.hidden = false;

  controls.enabled = false;
  hoverArmed = false;
  suppressHoverUntil = performance.now() + 999999;
  
  if (currentHoveredObject) {
    playHoverAnimation(currentHoveredObject, false);
    currentHoveredObject = null;
  }
  document.body.style.cursor = "default";

  gsap.killTweensOf(menuBackdrop);
  gsap.killTweensOf(menuPanel);

  gsap.to(menuBackdrop, { opacity: 1, duration: 0.18, ease: "power1.out" });
  gsap.fromTo(
    menuPanel,
    { opacity: 0, x: 12 },
    { opacity: 1, x: 0, duration: 0.22, ease: "power2.out" }
  );
}

function closeMenu() {
  if (!menuRoot || !menuToggleBtn || !menuPanel || !menuBackdrop) return;
  if (!isMenuOpen) return;

  isMenuOpen = false;

  menuRoot.classList.remove("is-open");
  document.body.classList.remove("menu-open");
  menuToggleBtn.setAttribute("aria-expanded", "false");

  gsap.killTweensOf(menuBackdrop);
  gsap.killTweensOf(menuPanel);

  gsap.to(menuBackdrop, {
    opacity: 0,
    duration: 0.18,
    ease: "power1.in",
    onComplete: () => (menuBackdrop.hidden = true),
  });
  gsap.to(menuPanel, {
    opacity: 0,
    x: 12,
    duration: 0.18,
    ease: "power2.in",
    onComplete: () => (menuPanel.hidden = true),
  });

  gsap.delayedCall(0.05, () => {
    controls.enabled = true;
    suppressHoverUntil = performance.now() + 250;
    hoverArmed = false;
  });
}

function hideMenuUI() {
  if (!menuRoot) return;

  if (isMenuOpen) closeMenu();

  gsap.killTweensOf(menuRoot);

  gsap.to(menuRoot, {
    opacity: 0,
    duration: 0.2,
    ease: "power1.out",
    onComplete: () => {
      menuRoot.style.pointerEvents = "none";
      menuRoot.style.display = "none";
    },
  });
}

function showMenuUI() {
  if (!menuRoot) return;

  gsap.killTweensOf(menuRoot);

  menuRoot.style.display = "";
  menuRoot.style.pointerEvents = "auto";

  gsap.fromTo(
    menuRoot,
    { opacity: 0 },
    {
      opacity: 1,
      duration: 0.25,
      ease: "power1.out",
    }
  );
}

// Menu listeners
menuToggleBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (!interactionEnabled || isModalOpen) return;

  isMenuOpen ? closeMenu() : openMenu();
});

document.addEventListener("click", (e) => {
  if (!isMenuOpen) return;

  // wenn du auf den Toggle oder ins Panel klickst -> NICHT schließen
  if (menuToggleBtn?.contains(e.target)) return;
  if (menuPanel?.contains(e.target)) return;

  // alles andere ist "outside"
  closeMenu();
});


// if (menuBackdrop) menuBackdrop.addEventListener("click", () => closeMenu());


if (menuPanel) {
  menuPanel.addEventListener("click", (e) => {
    const viewBtn = e.target.closest("[data-action='view']");
    const aboutBtn = e.target.closest("[data-action='about']");
    const getInTouchBtn = e.target.closest("[data-action='get-in-touch']");

    if (aboutBtn) {
      closeMenu();
      hideMenuUI();
      showAboutBox();
      return;
    }

    if (getInTouchBtn) {
      closeMenu();
      hideMenuUI();
      showAboutBox(getInTouchBox);
      return;
    }

    if (!viewBtn) return;

    const view = viewBtn.getAttribute("data-view");
    closeMenu();

    if (view === "post") {
      hideMenuUI();
      flyToView("post", { onComplete: () => showModal(modals.post, "post") });
    } else if (view === "film") {
      hideMenuUI();
      flyToView("film", { onComplete: () => showModal(modals.film, "film") });
    } else if (view === "live") {
      hideMenuUI();
      flyToView("live", { onComplete: () => showModal(modals.live, "live") });
    }
  });
}


// ===============================
// Drag to slide (portrait only)
// ===============================
let slideDragging = false;
let slideStartX = 0;
let slideStartT = 0;

// wie “schnell” slideT reagiert (kleiner = langsamer)
const SLIDE_SENSITIVITY = 1.7;

function canSlideNow(e) {
  // nicht sliden wenn UI offen / modal / menu / loading etc.
  if (!interactionEnabled) return false;
  if (!isPortraitMode) return false;
  if (isMenuOpen || isModalOpen || isCameraMoving) return false;
  if (e?.target?.closest?.(".site-menu")) return false;
  return true;
}

window.addEventListener("pointerdown", (e) => {
  if (!canSlideNow(e)) return;
  slideDragging = true;
  slideStartX = e.clientX;
  slideStartT = slideT;
});

window.addEventListener("pointermove", (e) => {
  if (!slideDragging) return;
  if (!canSlideNow(e)) return;

  const dx = (e.clientX - slideStartX) / window.innerWidth;
  const nextT = slideStartT - dx * SLIDE_SENSITIVITY;
  applyCameraSlide(nextT);
});

window.addEventListener("pointerup", () => {
  slideDragging = false;
});

window.addEventListener("pointercancel", () => {
  slideDragging = false;
});


manager.onProgress = (url, loaded, total) => {
  updateLoadingProgress(loaded, total);
};

manager.onLoad = () => {
  updateLoadingProgress(1, 1);
  interactionEnabled = false;
  playReveal();
};

window.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  const isLoadingVisible =
    loadingScreen &&
    getComputedStyle(loadingScreen).display !== "none" &&
    loadingScreen.style.opacity !== "0";

  if (!isLoadingVisible) return;

});


let postsLoaded = false;
let postsPromise = null;

postsPromise = loadPostsFromSheet()
  .catch((err) => {
    console.error(err);
  })
  .finally(() => {
    postsLoaded = true;
});

if (!PRELOAD_REELS) {
  manager.itemEnd("instagram-preload");
} else {
  postsPromise
    .then(async () => {
    const preloadPromises = [];

    for (const modalKey of ["post", "film", "live"]) {
      const modal = modals[modalKey];
      if (!modal) continue;

      modal.style.display = "block";
      modal.style.visibility = "hidden";
      modal.style.pointerEvents = "none";
      modal.style.opacity = "0";
      preloadPromises.push(
        renderInstagramEmbeds(modal, modalKey)
      );
    }

    await Promise.all(preloadPromises);
    // Give Safari time to finish iframe scripts and layout before Enter is enabled.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    })
    .catch((err) => {
      console.error("Instagram preload failed:", err);
    })
    .finally(() => {
      manager.itemEnd("instagram-preload");
    });
}

const showModal = async (modal, modalKey = null) => {
  console.log(`Opening modal: ${modalKey}`);

  storePortraitPoseBeforeOverlay();

  modal.style.display = "block";
  modal.style.visibility = "visible";
  modal.style.pointerEvents = "auto";
  modal.classList.add("is-open");
  globalCloseBtn.classList.remove("is-about");
  globalCloseBtn.style.display = "grid";

  isModalOpen = true;

  controls.enabled = false;
  controls.enableRotate = false;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = false;

  if (currentHoveredObject) {
    playHoverAnimation(currentHoveredObject, false);
    currentHoveredObject = null;
  }
  document.body.style.cursor = "default";
  currentIntersects = [];

  if (modalKey && ["post", "film", "live"].includes(modalKey)) {
    renderInstagramEmbeds(modal, modalKey);
  }

  gsap.set(modal, { opacity: 0 });
  gsap.to(modal, { opacity: 1, duration: 0.35 });
};

const hideModal = (modal) => {
  globalCloseBtn.style.display = "none";
  suppressHoverUntil = performance.now() + 800;
  hoverArmed = false;

  currentIntersects = [];
  if (currentHoveredObject) {
    playHoverAnimation(currentHoveredObject, false);
    currentHoveredObject = null;
  }

  document.body.style.cursor = "default";
  isModalOpen = false;

  gsap.to(modal, {
    opacity: 0,
    duration: 0.35,
    onComplete: () => {
      globalCloseBtn.style.display = "none";
      modal.style.visibility = "hidden";
      modal.style.pointerEvents = "none";
      modal.classList.remove("is-open");
      showMenuUI();

      // WICHTIG: NICHT controls.enabled hier setzen - das wird in flyToPose/flyToView gemacht
      // controls.enabled = false; // <- ENTFERNEN

      if (isPortraitMode && lastPortraitBeforeOverlay) {
        // ✅ Portrait: zurück zum Zustand VOR dem Öffnen (mit Animation)
        slideT = lastPortraitBeforeOverlay.slideT ?? slideT;
        
        // WICHTIG: suppressPortraitSlide für die Rückflug-Animation aktivieren
        suppressPortraitSlide = true;

        flyToPose(
          lastPortraitBeforeOverlay.position,
          lastPortraitBeforeOverlay.target,
          {
            duration: 0.6,
            ease: "power2.out",
            onComplete: () => {
              // ✅ Portrait bleibt locked
              controls.enableRotate = false;
              disableOrbitLimits();
              controls.enabled = true;
              controls.update();
              
              // WICHTIG: suppressPortraitSlide wieder deaktivieren
              suppressPortraitSlide = false;
              // ✅ Jetzt die aktuelle Slide-Position anwenden
              applyCameraSlide(slideT);
            },
          }
        );
      } else {
        // ✅ Landscape: normal home
        flyToView("home", {
          onComplete: () => {
            controls.enableRotate = true;
            enableOrbitLimitsAroundCurrentView();
            controls.enabled = true;
            controls.update();
          },
        });
      }

      // Diese Zeilen sind redundant - sie werden in den onComplete Callbacks oben gemacht
      // suppressHoverUntil = performance.now() + 300;
      // hoverArmed = false;
      // currentIntersects = [];
      // if (currentHoveredObject) {
      //   playHoverAnimation(currentHoveredObject, false);
      //   currentHoveredObject = null;
      // }
      // document.body.style.cursor = "default";
    },
  });
};

// ----- Raycaster -----
const raycasterObjects = [];
let currentIntersects = [];
let currentHoveredObject = null;

const socialLinks = {
  YouTube: "https://www.youtube.com",
  Instagram: "https://www.instagram.com/caspar_reichl/",
  Artstaion: "https://www.artstation.com/caspar_r",
};

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerGlow = document.createElement("div");
pointerGlow.className = "pointer-glow";
pointerGlow.setAttribute("aria-hidden", "true");
document.body.appendChild(pointerGlow);

const textureLoader = new THREE.TextureLoader(manager);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");

const loader = new GLTFLoader(manager);
loader.setDRACOLoader(dracoLoader);

const textureMap = {
  Pic1: { day: "/textures/Room/Day/Pic1.webp" },
  Pic2: { day: "/textures/Room/Day/Pic2.webp" },
  Pic3: { day: "/textures/Room/Day/Pic3.webp" },
  Pic4: { day: "/textures/Room/Day/Pic4.webp" },
};

const loadedTextures = { day: {} };

Object.entries(textureMap).forEach(([key, paths]) => {
  const dayTexture = textureLoader.load(paths.day);
  dayTexture.flipY = false;
  dayTexture.colorSpace = THREE.SRGBColorSpace;
  loadedTextures.day[key] = dayTexture;
});

const scene = new THREE.Scene();

const dustCount = 100;
const dustBounds = {
  xMin: 3.2,
  xMax: 6.8,
  yMin: 1.4,
  yMax: 7.2,
  zMin: -5.8,
  zMax: -3.1,
};
const dustPositions = new Float32Array(dustCount * 3);
const dustSpeeds = new Float32Array(dustCount);
const dustPhases = new Float32Array(dustCount);
const dustDrifts = new Float32Array(dustCount * 2);
const dustSizes = new Float32Array(dustCount);
const dustOpacities = new Float32Array(dustCount);

function getDustOpacity(x, z) {
  return THREE.MathUtils.randFloat(0.01, 0.07);
}

for (let index = 0; index < dustCount; index += 1) {
  const offset = index * 3;
  dustPositions[offset] = THREE.MathUtils.randFloat(dustBounds.xMin, dustBounds.xMax);
  dustPositions[offset + 1] = THREE.MathUtils.randFloat(dustBounds.yMin, dustBounds.yMax);
  dustPositions[offset + 2] = THREE.MathUtils.randFloat(dustBounds.zMin, dustBounds.zMax);
  dustSpeeds[index] = THREE.MathUtils.randFloat(0.012, 0.045);
  dustPhases[index] = Math.random() * Math.PI * 2;
  dustDrifts[index * 2] = THREE.MathUtils.randFloat(0.012, 0.045);
  dustDrifts[index * 2 + 1] = THREE.MathUtils.randFloat(0.008, 0.035);
  dustSizes[index] = THREE.MathUtils.randFloat(0.55, 1);
  dustOpacities[index] = getDustOpacity(dustPositions[offset], dustPositions[offset + 2]);
}

const dustGeometry = new THREE.BufferGeometry();
dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
dustGeometry.setAttribute("aSize", new THREE.BufferAttribute(dustSizes, 1));
dustGeometry.setAttribute("aOpacity", new THREE.BufferAttribute(dustOpacities, 1));

const dustMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color(0xffffff) },
    uOpacity: { value: 1 },
  },
  vertexShader: `
    attribute float aSize;
    attribute float aOpacity;
    varying float vOpacity;

    void main() {
      vec4 modelPosition = modelMatrix * vec4(position, 1.0);
      vec4 viewPosition = viewMatrix * modelPosition;
      gl_Position = projectionMatrix * viewPosition;
      gl_PointSize = aSize * 33.0 * (1.0 / -viewPosition.z);
      vOpacity = aOpacity;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vOpacity;

    void main() {
      float distanceFromCenter = distance(gl_PointCoord, vec2(0.5));
      float softEdge = 1.0 - smoothstep(0.18, 0.5, distanceFromCenter);
      if (softEdge <= 0.0) discard;
      gl_FragColor = vec4(uColor, softEdge * vOpacity * uOpacity);
    }
  `,
  sizeAttenuation: true,
  transparent: true,
  depthWrite: false,
  depthTest: false,
});

const dust = new THREE.Points(dustGeometry, dustMaterial);
dust.renderOrder = 999;
scene.add(dust);

const dustClock = new THREE.Clock();

function animateDust() {
  const delta = Math.min(dustClock.getDelta(), 0.05);
  const elapsed = dustClock.elapsedTime;
  const positions = dustGeometry.attributes.position.array;

  for (let index = 0; index < dustCount; index += 1) {
    const offset = index * 3;
    const driftOffset = index * 2;
    positions[offset + 1] -= dustSpeeds[index] * delta;
    positions[offset] += Math.sin(elapsed * 0.45 + dustPhases[index]) * delta * dustDrifts[driftOffset];
    positions[offset + 2] += Math.cos(elapsed * 0.35 + dustPhases[index]) * delta * dustDrifts[driftOffset + 1];

    if (positions[offset + 1] < 1.25) {
      positions[offset] = THREE.MathUtils.randFloat(dustBounds.xMin, dustBounds.xMax);
      positions[offset + 1] = THREE.MathUtils.randFloat(6.2, dustBounds.yMax);
      positions[offset + 2] = THREE.MathUtils.randFloat(dustBounds.zMin, dustBounds.zMax);
      dustOpacities[index] = getDustOpacity(positions[offset], positions[offset + 2]);
    }
  }

  dustGeometry.attributes.position.needsUpdate = true;
  dustGeometry.attributes.aOpacity.needsUpdate = true;
}

window.addEventListener("mousemove", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  pointerGlow.style.left = `${e.clientX}px`;
  pointerGlow.style.top = `${e.clientY}px`;
  mouseCameraFollow.x = pointer.x;
  mouseCameraFollow.y = pointer.y;
  if (performance.now() >= suppressHoverUntil) hoverArmed = true;
});

window.addEventListener(
  "touchstart",
  (e) => {
    // ✅ UI touches (Burger/Menu) NICHT hijacken
    if (e.target.closest(".site-menu")) return;

    if (isMenuOpen || isModalOpen) return;

    e.preventDefault();
    pointer.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
  },
  { passive: false }
);


window.addEventListener(
  "touchend",
  (e) => {
    // ✅ UI touches (Burger/Menu) NICHT hijacken
    if (e.target.closest(".site-menu")) return;

    if (isMenuOpen || isModalOpen) return;
    if (!interactionEnabled || isMenuOpen || isModalOpen) return;

    e.preventDefault();
    handleRaycasterInteraction();
  },
  { passive: false }
);

function handleRaycasterInteraction() {
  if (!interactionEnabled || isModalOpen || isCameraMoving) return;

  if (isMenuOpen) {
    closeMenu();
    return;
  }

  if (currentIntersects.length > 0) {
    const object = currentIntersects[0].object;

    Object.entries(socialLinks).forEach(([key, url]) => {
      if (object.name.includes(key)) {
        const newWindow = window.open();
        if (newWindow) {
          newWindow.opener = null;
          newWindow.location = url;
        }
      }
    });

    if (object.name.includes("workPC")) {
      hideMenuUI();
      flyToView("post", { onComplete: () => showModal(modals.post, "post") });
    } else if (object.name.includes("workCamera")) {
      hideMenuUI();
      flyToView("film", { onComplete: () => showModal(modals.film, "film") });
    } else if (object.name.includes("workEvent")) {
      hideMenuUI();
      flyToView("live", { onComplete: () => showModal(modals.live, "live") });
    } else if (object.name.includes("aboutMe")) {
      hideMenuUI();
      showAboutBox();
    } else if (object.name.includes("contact")) {
      showModal(modals.contact);
    }
  }
}

window.addEventListener("click", (e) => {
  if (!interactionEnabled || isMenuOpen || isModalOpen) return;
  handleRaycasterInteraction();
});

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  // 1️⃣ Menü hat Prio
  if (isMenuOpen) {
    closeMenu();
    return;
  }

  // 2️⃣ About-Me Box
  const openInfoBox = document.querySelector(".about-box[aria-hidden='false']");
  if (openInfoBox) {
    hideAboutBox(openInfoBox);
    return;
  }

  // 3️⃣ Normales Modal
  const openModal = document.querySelector(".modal.is-open");
  if (openModal) {
    hideModal(openModal);
  }
});

let grandma2, poster1;

loader.load("/models/Room_Portfolio.glb", (glb) => {
  glb.scene.traverse((child) => {
    if (!child.isMesh) return;

    if (child.name.includes("Raycaster")) raycasterObjects.push(child);

    if (child.name.includes("Hover")) {
      child.userData.initialScale = new THREE.Vector3().copy(child.scale);
      child.userData.initialPosition = new THREE.Vector3().copy(child.position);
      child.userData.initialRotation = new THREE.Euler().copy(child.rotation);
    }

    if (child.name.includes("AnimGrandMA")) {
      grandma2 = child;
      child.scale.set(0, 0, 0);
    } else if (child.name.includes("AnimPoster1")) {
      poster1 = child;
      child.scale.set(0, 0, 0);
    }

    Object.keys(textureMap).forEach((key) => {
      if (child.name.includes(key)) {
        const material = new THREE.MeshBasicMaterial({
          map: loadedTextures.day[key],
        });
        child.material = material;

        if (child.material.map) {
          child.material.map.minFilter = THREE.LinearFilter;
        }
      }
    });
  });

  scene.add(glb.scene);
});

function playIntroAnimtion() {
  const t1 = gsap.timeline({
    defaults: { duration: 0.8, ease: "back.out(1.8)" },
  });

  if (grandma2) {
    t1.to(grandma2.scale, { x: 1, y: 1, z: 1 }, "-=0.4");
  }
  if (poster1) {
    t1.to(poster1.scale, { x: 1, y: 1, z: 1 });
  }
}

// ----- Camera / Renderer / Controls -----
const camera = new THREE.PerspectiveCamera(
  35,
  sizes.width / sizes.height,
  0.01,
  1000
);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

renderer.setClearColor(0x2b0f0f, 1);

renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.dampingFactor = 0;
controls.update();

const mouseCameraFollow = { x: 0, y: 0 };
let mouseFollowCenter = null;
let manualOrbiting = false;

const azimuthLimit = Math.PI / 30;
const polarLimit = Math.PI / 30;

const minZoomOffset = -0.5;
const maxZoomOffset = 0;

function clampOrbitAroundCurrentView() {
  controls.update();

  const polarCenter = controls.getPolarAngle();
  const azimuthCenter = controls.getAzimuthalAngle();
  const distanceCenter = controls.getDistance();

  controls.minPolarAngle = polarCenter - polarLimit;
  controls.maxPolarAngle = polarCenter + polarLimit;

  controls.minAzimuthAngle = azimuthCenter - azimuthLimit;
  controls.maxAzimuthAngle = azimuthCenter + azimuthLimit;

  controls.minDistance = Math.max(0.1, distanceCenter + minZoomOffset);
  controls.maxDistance = distanceCenter + maxZoomOffset;

  controls.update();
}

function enableOrbitLimitsAroundCurrentView() {
  clampOrbitAroundCurrentView();
}

function rememberMouseFollowCenter() {
  mouseFollowCenter = {
    azimuth: controls.getAzimuthalAngle(),
    polar: controls.getPolarAngle(),
  };
}

function updateMouseCameraFollow() {
  if (
    !interactionEnabled ||
    isModalOpen ||
    isMenuOpen ||
    isCameraMoving ||
    manualOrbiting ||
    isPortraitMode ||
    !mouseFollowCenter
  ) return;

  const desiredAzimuth = mouseFollowCenter.azimuth + mouseCameraFollow.x * azimuthLimit * 0.85;
  const desiredPolar = mouseFollowCenter.polar - mouseCameraFollow.y * polarLimit * 0.85;
  const azimuthDelta = Math.atan2(
    Math.sin(controls.getAzimuthalAngle() - desiredAzimuth),
    Math.cos(controls.getAzimuthalAngle() - desiredAzimuth)
  );
  const polarDelta = controls.getPolarAngle() - desiredPolar;

  controls._rotateLeft(azimuthDelta * 0.16);
  controls._rotateUp(polarDelta * 0.16);
}

function disableOrbitLimits() {
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.minDistance = 0;
  controls.maxDistance = Infinity;
}

camera.position.set(7.657997013443906, 4.2664251408437535, -4.2);
controls.target.set(5.3, 4.05, -4.55);
controls.update();
enableOrbitLimitsAroundCurrentView();
rememberMouseFollowCenter();

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button === 0 && interactionEnabled && !isModalOpen && !isMenuOpen) {
    manualOrbiting = true;
  }
});

window.addEventListener("pointerup", () => {
  if (!manualOrbiting) return;
  manualOrbiting = false;
  controls.update();
  rememberMouseFollowCenter();
});

const HOME_VIEW = {
  position: camera.position.clone(),
  target: controls.target.clone(),
};

const VIEWS = {
  home: HOME_VIEW,
  post: {
    position: new THREE.Vector3(6.011918667226149, 4.165424262115528, -4.151384665960448),
    target: new THREE.Vector3(5.4, 4.15, -4.18),
  },
  film: {
    position: new THREE.Vector3(5.915519, 4.019118, -5.290547),
    target: new THREE.Vector3(5.800511, 4.022210, -5.249112),
  },
  live: {
    position: new THREE.Vector3(5.573762, 4.116623, -3.628980),
    target: new THREE.Vector3(5.241140, 4.008493, -3.582967),
  },
};


function flyToView(viewKey, { duration = 0.7, ease = "power2.out", onComplete } = {}) {
  const view = VIEWS[viewKey];
  if (!view) return;

  isCameraMoving = true;
  controls.enabled = false;

  disableOrbitLimits();

  gsap.killTweensOf(camera.position);
  gsap.killTweensOf(controls.target);

  const tl = gsap.timeline({
    defaults: { duration, ease },
    onUpdate: () => controls.update(),
    onComplete: () => {
      controls.update();
      rememberMouseFollowCenter();
        
      if (!isPortraitMode) {
        gsap.delayedCall(0.05, enableOrbitLimitsAroundCurrentView);
      } else {
        disableOrbitLimits();
        controls.enableRotate = false;
      }
    
      controls.enabled = true;
      isCameraMoving = false;
    
      if (typeof onComplete === "function") onComplete();
    },

  });

  tl.to(camera.position, { x: view.position.x, y: view.position.y, z: view.position.z }, 0);
  tl.to(controls.target, { x: view.target.x, y: view.target.y, z: view.target.z }, 0);
}

function flyToPose(position, target, { duration = 0.55, ease = "power2.out", onComplete } = {}) {
  isCameraMoving = true;
  controls.enabled = false;

  if (isPortraitMode) suppressPortraitSlide = true; // ✅

  disableOrbitLimits();

  gsap.killTweensOf(camera.position);
  gsap.killTweensOf(controls.target);

  gsap.timeline({
    defaults: { duration, ease },
    onUpdate: () => controls.update(),
    onComplete: () => {
      controls.update();
      rememberMouseFollowCenter();

      // WICHTIG: Hier muss suppressPortraitSlide nur deaktiviert werden, 
      // wenn wir NICHT aus hideModal/hideAboutBox kommen
      // Wir übergeben diese Logik an den Caller
      
      if (isPortraitMode) {
        disableOrbitLimits();
        controls.enableRotate = false;
      } else {
        enableOrbitLimitsAroundCurrentView();
        controls.enableRotate = true;
      }

      controls.enabled = true;
      isCameraMoving = false;

      // NICHT hier: suppressPortraitSlide = false; // <- WIRD VOM CALLER GEMACHT

      if (typeof onComplete === "function") onComplete();
    },
  })
  .to(camera.position, { x: position.x, y: position.y, z: position.z }, 0)
  .to(controls.target, { x: target.x, y: target.y, z: target.z }, 0);
}

window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  updateCameraModeByOrientation();

});

// ----- Hover -----
function playHoverAnimation(object, isHovering) {
  gsap.killTweensOf(object.scale);
  gsap.killTweensOf(object.rotation);
  gsap.killTweensOf(object.position);

  if (isHovering) {
    gsap.to(object.scale, {
      x: object.userData.initialScale.x * 1.1,
      y: object.userData.initialScale.y * 1.1,
      z: object.userData.initialScale.z * 1.1,
      duration: 0.5,
      ease: "bounce.out(1.8)",
    });
    gsap.to(object.rotation, {
      x: object.userData.initialRotation.x * 1.2,
      duration: 0.5,
      ease: "bounce.out(1.8)",
    });
  } else {
    gsap.to(object.scale, {
      x: object.userData.initialScale.x,
      y: object.userData.initialScale.y,
      z: object.userData.initialScale.z,
      duration: 0.3,
      ease: "bounce.out(1.8)",
    });
    gsap.to(object.rotation, {
      x: object.userData.initialRotation.x,
      duration: 0.3,
      ease: "bounce.out(1.8)",
    });
  }
}

let focusedPointerObject = null;
let pendingPointerObject = null;
let isPointerFocusFadingOut = false;
const dimmedMaterials = [];

const noiseCanvas = document.createElement("canvas");
noiseCanvas.width = 128;
noiseCanvas.height = 128;
const noiseContext = noiseCanvas.getContext("2d");
const noiseImage = noiseContext.createImageData(128, 128);

for (let index = 0; index < noiseImage.data.length; index += 4) {
  const value = Math.floor(Math.random() * 256);
  noiseImage.data[index] = value;
  noiseImage.data[index + 1] = value;
  noiseImage.data[index + 2] = value;
  noiseImage.data[index + 3] = 255;
}

noiseContext.putImageData(noiseImage, 0, 0);
const noiseTexture = new THREE.CanvasTexture(noiseCanvas);
noiseTexture.wrapS = THREE.RepeatWrapping;
noiseTexture.wrapT = THREE.RepeatWrapping;
noiseTexture.minFilter = THREE.LinearFilter;
noiseTexture.magFilter = THREE.LinearFilter;

const spotlightBoxMaterial = new THREE.ShaderMaterial({
  uniforms: {
    color: { value: new THREE.Color(0xffc266) },
    opacity: { value: 0 },
    uTime: { value: 0 },
    uNoise: { value: noiseTexture },
  },
  vertexShader: `
    varying vec3 vLocalPosition;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
      vLocalPosition = position;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 color;
    uniform float opacity;
    uniform float uTime;
    uniform sampler2D uNoise;
    varying vec3 vLocalPosition;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    float hash(vec2 point) {
      return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = smoothstep(0.0, 1.0, fract(point));
      float bottom = mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x);
      float top = mix(hash(cell + vec2(0.0, 1.0)), hash(cell + 1.0), local.x);
      return mix(bottom, top, local.y);
    }

    void main() {
      const float noiseInfluence = 5.0;
      float progress = clamp((2.0 - vLocalPosition.y) / 4.0, 0.0, 1.0);
      float angle = atan(vLocalPosition.z, vLocalPosition.x);
      vec2 noiseUv = vec2(
        fract((angle + 3.14159) / 6.28318 * 0.55 + uTime * 0.004),
        fract(progress * 0.28 - uTime * 0.025)
      );
      float edgeNoise = texture2D(uNoise, noiseUv).r;
      float softEdge = 1.0;
      float beamFade = smoothstep(0.0, 0.18, progress);
      float animatedProgress = progress * 0.2 - uTime * 0.04;
      float stripeNoise = noise(vec2(angle * 4.0, animatedProgress));
      float rayBands = 0.5 + 0.5 * sin(angle * 12.0);
      float noisyRayBands = clamp(
        rayBands + (stripeNoise - 0.5) * 0.3 * noiseInfluence,
        0.0,
        1.0
      );
      float rayStripes = 0.62 + 0.38 * smoothstep(0.28, 0.78, noisyRayBands);
      float stripeIndex = floor((angle + 3.14159) / 6.28318 * 12.0);
      float stripeRandom = fract(sin(stripeIndex * 91.73) * 43758.5453);
      float rayBreaks = 0.86 + 0.14 * sin(
        progress * (4.0 + stripeRandom * 3.0) + stripeRandom * 6.28318
      );
      float stripeBrightness = 0.8 + stripeRandom * 0.2;
      float endFade = 1.0 - smoothstep(0.1, 0.8, progress);
      float surfaceNoiseValue = noise(vec2(angle * 3.0, animatedProgress * 1.2));
      float surfaceNoise = clamp(
        0.82 + (surfaceNoiseValue - 0.5) * 0.18 * noiseInfluence,
        0.05,
        1.0
      );
      vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
      float cameraFacing = abs(dot(normalize(vWorldNormal), viewDirection));
      float centerToEdgeFade = smoothstep(0.1, 0.82, cameraFacing);
      float silhouetteFade = smoothstep(0.0, 0.5, cameraFacing);
      float noisyEdgeFade = mix(0.0, 1.0, edgeNoise);
      float edgeInfluence = 1.0 - silhouetteFade;
      float animatedEdgeFade = mix(1.0, noisyEdgeFade, edgeInfluence);

      gl_FragColor = vec4(
        color,
        softEdge * beamFade * rayStripes * rayBreaks
          * stripeBrightness * endFade * surfaceNoise
          * centerToEdgeFade * animatedEdgeFade * opacity
      );
    }
  `,
  transparent: true,
  depthWrite: false,
  depthTest: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});

const spotlightBox = new THREE.Mesh(
  new THREE.ConeGeometry(1, 4, 32, 1, true),
  spotlightBoxMaterial
);
spotlightBox.visible = false;
spotlightBox.renderOrder = 1000;
spotlightBox.userData.selfRotation = 0;
scene.add(spotlightBox);
const spotlightClock = new THREE.Clock();

function updateSpotlightBox(object) {
  const bounds = new THREE.Box3().setFromObject(object);
  const hit = currentIntersects.find(
    (intersection) => intersection.object === object
  );
  const target = hit?.point?.clone() ?? bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const source = new THREE.Vector3(0, 0.75, -1).applyMatrix4(camera.matrixWorld);
  const direction = source.clone().sub(target).normalize();
  const height = source.distanceTo(target);
  const baseQuaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction
  );
  const spinQuaternion = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    spotlightBox.userData.selfRotation || 0
  );

  spotlightBox.position.copy(source).add(target).multiplyScalar(0.5);
  spotlightBox.quaternion.copy(baseQuaternion).multiply(spinQuaternion);
  spotlightBox.scale.set(
    Math.max(Math.max(size.x, size.z) * 0.35, 0.2),
    height / 4,
    Math.max(Math.max(size.x, size.z) * 0.35, 0.2)
  );
}

function showSpotlightBox(object) {
  updateSpotlightBox(object);
  spotlightBox.visible = true;

  gsap.killTweensOf(spotlightBoxMaterial.uniforms.opacity);
  gsap.to(spotlightBoxMaterial.uniforms.opacity, {
    value: 0.2,
    duration: 0.25,
    ease: "power2.out",
  });
}

function hideSpotlightBox() {
  gsap.killTweensOf(spotlightBoxMaterial.uniforms.opacity);
  gsap.to(spotlightBoxMaterial.uniforms.opacity, {
    value: 0,
    duration: 0.2,
    ease: "power2.out",
    onComplete: () => {
      if (spotlightBoxMaterial.uniforms.opacity.value === 0) {
        spotlightBox.visible = false;
      }
    },
  });
}

function applyPointerFocus(object) {
  focusedPointerObject = object;
  showSpotlightBox(object);

  scene.traverse((child) => {
    if (!child.isMesh || child === object || child === spotlightBox) return;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const dimmed = materials.map((material) => {
      const copy = material.clone();
      const targetColor = copy.color?.clone().multiplyScalar(0.6);

      if (targetColor) {
        gsap.to(copy.color, {
          r: targetColor.r,
          g: targetColor.g,
          b: targetColor.b,
          duration: 0.35,
          ease: "power2.out",
        });
      }
      return copy;
    });

    dimmedMaterials.push({ mesh: child, material: child.material });
    child.material = Array.isArray(child.material) ? dimmed : dimmed[0];
  });
}

function clearPointerFocus() {
  if (isPointerFocusFadingOut || dimmedMaterials.length === 0) return;

  focusedPointerObject = null;
  isPointerFocusFadingOut = true;
  hideSpotlightBox();
  const materialsToRestore = dimmedMaterials.splice(0);
  let remaining = materialsToRestore.length;

  for (const { mesh, material } of materialsToRestore) {
    const copies = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const originals = Array.isArray(material) ? material : [material];
    let hasAnimatedColor = false;

    copies.forEach((copy, index) => {
      const originalColor = originals[index]?.color;
      if (!copy.color || !originalColor) {
        return;
      }

      hasAnimatedColor = true;
      gsap.to(copy.color, {
        r: originalColor.r,
        g: originalColor.g,
        b: originalColor.b,
        duration: 0.35,
        ease: "power2.out",
        onComplete: () => {
          if (--remaining === 0) finishPointerFocusFade(materialsToRestore);
        },
      });
    });

    if (!hasAnimatedColor && --remaining === 0) {
      finishPointerFocusFade(materialsToRestore);
    }
  }
}

function finishPointerFocusFade(materialsToRestore) {
  for (const { mesh, material } of materialsToRestore) {
    if (mesh.material !== material && Array.isArray(mesh.material)) {
      mesh.material = material;
    } else if (mesh.material !== material) {
      mesh.material = material;
    }
  }

  isPointerFocusFadingOut = false;
  const nextObject = pendingPointerObject;
  pendingPointerObject = null;
  if (nextObject) applyPointerFocus(nextObject);
}

function updatePointerFocus(object) {
  if (object === focusedPointerObject) {
    updateSpotlightBox(object);
    return;
  }
  if (object === pendingPointerObject) return;

  pendingPointerObject = object;
  if (!isPointerFocusFadingOut && dimmedMaterials.length === 0) {
    pendingPointerObject = null;
    if (object) applyPointerFocus(object);
    return;
  }
  clearPointerFocus();
}


// 1) Definiere Slide-Punkte (du kannst die Werte später fein-tunen)
// Ich nehme deine HOME_VIEW als "base" und verschiebe X links/rechts.
// ===============================
// Portrait camera slide: 3 feste Punkte
// ===============================

// BASE = deine normale HOME View
const SLIDE = {
  base: {
    position: HOME_VIEW.position.clone(),
    target: HOME_VIEW.target.clone(),
  },

  // ✅ HIER trägst du feste Punkte ein:
  left: {
    position: new THREE.Vector3(7.2, 4.26, -3.75 ),
    target:   new THREE.Vector3(5.3, 4.05, -3.65),
  },

  right: {
    position: new THREE.Vector3(7.7, 4.26, -4.45 ),
    target:   new THREE.Vector3(5.3, 4.05, -5.35),
  },
};

// (5.3, 4.05, -4.45)

updateCameraModeByOrientation();


function applyCameraSlide(t) {
  // ✅ Während Rückflug oder wenn andere Animationen laufen nicht überschreiben
  if (suppressPortraitSlide || isCameraMoving || isModalOpen) return;

  slideT = Math.max(0, Math.min(1, t));

  const p = SLIDE.left.position.clone().lerp(SLIDE.right.position, slideT);
  const tgt = SLIDE.left.target.clone().lerp(SLIDE.right.target, slideT);

  camera.position.copy(p);
  controls.target.copy(tgt);
  controls.update();
}


function setPortraitMode(enabled) {
  isPortraitMode = enabled;

  if (enabled) {
    // Portrait: kein Orbit-rotate, wir sliden
    controls.enableRotate = false;
    controls.enablePan = false;
    controls.enableZoom = true;

    disableOrbitLimits();
    
    // WICHTIG: Nur slide anwenden, wenn nicht unterdrückt
    if (!suppressPortraitSlide) {
      applyCameraSlide(slideT);
    }

  } else {
    // Landscape: zurück auf BASE / HOME
    slideT = 0.5; // optional: reset

    camera.position.copy(HOME_VIEW.position);
    controls.target.copy(HOME_VIEW.target);
    controls.update();

    controls.enableRotate = true;
    controls.enablePan = false;
    controls.enableZoom = true;

    enableOrbitLimitsAroundCurrentView();
  }
}


function updateCameraModeByOrientation() {
  const portrait = window.matchMedia("(orientation: portrait)").matches
    || (window.innerHeight > window.innerWidth);

  // nur wenn sich der Modus wirklich ändert:
  if (portrait !== isPortraitMode) {
    setPortraitMode(portrait);
  }
}


// ----- Render loop -----
function render() {
  animateDust();
  updateMouseCameraFollow();
  controls.update();
  const spotlightDelta = Math.min(spotlightClock.getDelta(), 0.05);
  spotlightBoxMaterial.uniforms.uTime.value = spotlightClock.elapsedTime;
  if (spotlightBox.visible && focusedPointerObject) {
    spotlightBox.userData.selfRotation += spotlightDelta * 0.05;
    updateSpotlightBox(focusedPointerObject);
  }

    // console.log(
    //     "cam pos:",
    //     camera.position.x.toFixed(6),
    //     camera.position.y.toFixed(6),
    //     camera.position.z.toFixed(6),
    //     "| target:",
    //     controls.target.x.toFixed(6),
    //     controls.target.y.toFixed(6),
    //     controls.target.z.toFixed(6)
    // );

  if (performance.now() >= suppressHoverUntil) hoverArmed = true;

  if (
    !interactionEnabled ||
    isModalOpen ||
    isCameraMoving ||
    !hoverArmed ||
    performance.now() < suppressHoverUntil
  ) {
    if (currentHoveredObject) {
      playHoverAnimation(currentHoveredObject, false);
      currentHoveredObject = null;
    }
    clearPointerFocus();
    document.body.style.cursor = "default";
    pointerGlow.classList.remove("is-visible");
  } else {
    raycaster.setFromCamera(pointer, camera);
    currentIntersects = raycaster.intersectObjects(raycasterObjects);

    if (currentIntersects.length > 0) {
      const obj = currentIntersects[0].object;

      if (obj.name.includes("Hover")) {
        if (obj !== currentHoveredObject) {
          if (currentHoveredObject) playHoverAnimation(currentHoveredObject, false);
          playHoverAnimation(obj, true);
          currentHoveredObject = obj;
        }
      }

      const isPointer = obj.name.includes("Pointer");
      updatePointerFocus(isPointer ? obj : null);
      document.body.style.cursor = isPointer ? "pointer" : "default";
      pointerGlow.classList.toggle("is-visible", isPointer);
    } else {
      if (currentHoveredObject) {
        playHoverAnimation(currentHoveredObject, false);
        currentHoveredObject = null;
      }
      clearPointerFocus();
      document.body.style.cursor = "default";
      pointerGlow.classList.remove("is-visible");
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();
