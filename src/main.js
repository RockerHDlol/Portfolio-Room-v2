import * as THREE from "three";
import "./style.scss";
import { OrbitControls } from "./utils/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import gsap from "gsap";

/**
 * ✅ Interaction lock:
 * - false while loading screen is up
 * - true only after Enter + reveal finished
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
  workPC: document.querySelector(".modal.workPC"),
  workCamera: document.querySelector(".modal.workCamera"),
  workEvent: document.querySelector(".modal.workEvent"),
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

function showAboutBox() {
  if (!aboutBox) return;
  hideMenuUI();

  storePortraitPoseBeforeOverlay();

  const inner = aboutBox.querySelector(".about-box-inner") || aboutBox;
  inner.appendChild(globalCloseBtn);

  aboutBox.style.display = "block";
  aboutBox.setAttribute("aria-hidden", "false");

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

  gsap.killTweensOf(aboutBox);
  gsap.killTweensOf(inner);

  gsap.set(aboutBox, { opacity: 1 });
  gsap.fromTo(
    inner,
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.45, ease: "circ.out", overwrite: "auto" }
  );
}

function hideAboutBox() {
  if (!aboutBox) return;
  showMenuUI();
  globalCloseBtn.classList.remove("is-about");
  globalCloseBtn.style.display = "none";

  const inner = aboutBox.querySelector(".about-box-inner") || aboutBox;

  gsap.killTweensOf(aboutBox);
  gsap.killTweensOf(inner);

  gsap.to(inner, {
    opacity: 0,
    y: 10,
    duration: 0.35,
    ease: "power2.in",
    onComplete: () => {
      document.body.appendChild(globalCloseBtn);
      aboutBox.style.display = "none";
      aboutBox.setAttribute("aria-hidden", "true");

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
  if (aboutBox && aboutBox.style.display === "block") {
    hideAboutBox();
    return;
  }

  const openModal = document.querySelector(".modal[style*='display: block']");
  if (openModal) hideModal(openModal);
});

let POSTS_BY_CATEGORY = { workPC: [], workCamera: [], workEvent: [] };

async function loadPostsFromSheet() {
  const r = await fetch(`/api/posts?ts=${Date.now()}`);
  const data = await r.json();

  POSTS_BY_CATEGORY = { workPC: [], workCamera: [], workEvent: [] };

  for (const item of data.items || []) {
    if (!item?.category || !item?.postId) continue;

    (POSTS_BY_CATEGORY[item.category] ??= []).push({
      postId: item.postId,
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

function renderInstagramEmbeds(modalElement, modalKey) {
  const contentEl = modalElement.querySelector(".modal-content");
  if (!contentEl) {
    console.error("No .modal-content found in modal");
    return;
  }

  if (masonryResizeHandler) {
    window.removeEventListener("resize", masonryResizeHandler);
  }

  masonryResizeHandler = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(layoutMasonry, 150);
  };

  window.addEventListener("resize", masonryResizeHandler);

  const items = [...(POSTS_BY_CATEGORY[modalKey] || [])].reverse();
  console.log(`Rendering ${items.length} posts for ${modalKey}`);

  if (items.length === 0) {
    contentEl.innerHTML =
      '<p style="color: white; padding: 20px;">No posts found</p>';
    return;
  }

  const container = document.createElement("div");
  container.className = "insta-masonry";
  contentEl.innerHTML = "";
  contentEl.appendChild(container);

  const postElements = items.map(({ postId, name, subText, date, aspectRatio }) => {
    const wrapper = document.createElement("div");
    wrapper.className = "iframe-wrapper";

    const cleanRatio = String(aspectRatio || "4/5").replace(/\s+/g, "");
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

    wrapper.innerHTML = `
      <div class="insta-embed">
        <iframe
          src="https://www.instagram.com/p/${postId}/embed/"
          frameborder="0"
          scrolling="no"
          allowtransparency="true">
        </iframe>
      </div>
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
      requestAnimationFrame(layoutMasonry);
      return;
    }

    const w = window.innerWidth;
    const numCols = w <= 600 ? 1 : w <= 1000 ? 2 : 3;

    const gap = 15;
    const colWidth = (containerWidth - (numCols - 1) * gap) / numCols;

    const columns = Array.from({ length: numCols }, () => []);
    const columnHeights = Array(numCols).fill(0);

    postElements.forEach((el) => {
      const shortestColIndex = columnHeights.indexOf(Math.min(...columnHeights));
      columns[shortestColIndex].push(el);

      const ratioStr = el.dataset.aspectRatio || "4/5";
      const parts = ratioStr.split("/").map((s) => parseFloat(s.trim()));
      const wRatio = parts[0];
      const hRatio = parts[1];
      const ratio = wRatio && hRatio ? hRatio / wRatio : 5 / 4;

      const elHeight = colWidth * ratio;
      columnHeights[shortestColIndex] += elHeight + gap;
    });

    container.innerHTML = "";
    columns.forEach((col) => {
      const colDiv = document.createElement("div");
      colDiv.className = "masonry-column";
      col.forEach((el) => colDiv.appendChild(el));
      container.appendChild(colDiv);
    });
  }

  requestAnimationFrame(() => {
    layoutMasonry();
    setTimeout(layoutMasonry, 300);
  });

  resizeTimeout = setTimeout(layoutMasonry, 150);
}

let touchHappened = false;

const manager = new THREE.LoadingManager();

const loadingScreen = document.querySelector(".loading-screen");
const loadingScreenButton = document.querySelector(".loading-screen-button");

loadingScreenButton.style.cursor = "not-allowed";
loadingScreenButton.textContent = "Loading ...";

function playReveal() {
  const tl = gsap.timeline();

  tl.to(loadingScreen, {
    scale: 0.5,
    duration: 0.8,
    ease: "back.in(1.8)",
  }).to(
    loadingScreen,
    {
      y: "200vh",
      transform: "perspective(1000px) rotateX(45deg) rotateY(-35deg)",
      duration: 1.2,
      ease: "back.in(1.8)",
      onComplete: () => {
        playIntroAnimtion();
        loadingScreen.remove();
        revealHamburgerMenu();
        interactionEnabled = true;
        canvas.style.opacity = "1";
      },
    },
    "-=0.1"
  );
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

    if (aboutBtn) {
      closeMenu();
      hideMenuUI();
      showAboutBox();
      return;
    }

    if (!viewBtn) return;

    const view = viewBtn.getAttribute("data-view");
    closeMenu();

    if (view === "workPC") {
      hideMenuUI();
      flyToView("workPC", { onComplete: () => showModal(modals.workPC, "workPC") });
    } else if (view === "workCamera") {
      hideMenuUI();
      flyToView("workCamera", { onComplete: () => showModal(modals.workCamera, "workCamera") });
    } else if (view === "workEvent") {
      hideMenuUI();
      flyToView("workEvent", { onComplete: () => showModal(modals.workEvent, "workEvent") });
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


manager.onLoad = () => {
  loadingScreenButton.style.boxShadow = "rgba(0, 0, 0, 0.24) 0px 3px 8px";
  loadingScreenButton.textContent = "Enter!";
  loadingScreenButton.style.cursor = "pointer";
  loadingScreenButton.style.transition =
    "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";

  let isDisabled = false;

  const enter = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDisabled) return;
    isDisabled = true;

    loadingScreenButton.style.boxShadow = "none";
    loadingScreenButton.textContent = "Welcome!";
    loadingScreen.style.backgroundColor = "#4b000aff";

    interactionEnabled = false;

    playReveal();
  };

  loadingScreenButton.addEventListener("mouseenter", () => {
    loadingScreenButton.style.transform = "scale(1.3)";
  });

  loadingScreenButton.addEventListener("mouseleave", () => {
    loadingScreenButton.style.transform = "none";
  });

  loadingScreenButton.addEventListener("click", (e) => {
    if (touchHappened) return;
    enter(e);
  });

  loadingScreenButton.addEventListener(
    "touchend",
    (e) => {
      touchHappened = true;
      enter(e);
    },
    { passive: false }
  );
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

  loadingScreenButton?.click();
});


let postsLoaded = false;
let postsPromise = null;

manager.itemStart("posts");
postsPromise = loadPostsFromSheet()
  .catch((err) => {
    console.error(err);
  })
  .finally(() => {
    postsLoaded = true;
    manager.itemEnd("posts");
});

const showModal = async (modal, modalKey = null) => {
  console.log(`Opening modal: ${modalKey}`);

  storePortraitPoseBeforeOverlay();

  modal.style.display = "block";
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

  if (modalKey && ["workPC", "workCamera", "workEvent"].includes(modalKey)) {
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
      modal.style.display = "none";
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
  Instagram: "https://www.instagram.com",
  Artstaion: "https://www.artstation.com",
};

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

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

window.addEventListener("mousemove", (e) => {
  touchHappened = false;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
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
      flyToView("workPC", { onComplete: () => showModal(modals.workPC, "workPC") });
    } else if (object.name.includes("workCamera")) {
      hideMenuUI();
      flyToView("workCamera", { onComplete: () => showModal(modals.workCamera, "workCamera") });
    } else if (object.name.includes("workEvent")) {
      hideMenuUI();
      flyToView("workEvent", { onComplete: () => showModal(modals.workEvent, "workEvent") });
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

  if (isMenuOpen) {
    closeMenu();
    return;
  }

  if (isModalOpen) {
    closeModal();
    return;
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
controls.enableDamping = true;
controls.dampingFactor = 0.03;
controls.update();

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

function disableOrbitLimits() {
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.minDistance = 0;
  controls.maxDistance = Infinity;
}

camera.position.set(7.457997013443906, 4.2664251408437535, -4.2);
controls.target.set(5.3, 4.05, -4.55);
controls.update();
enableOrbitLimitsAroundCurrentView();

const HOME_VIEW = {
  position: camera.position.clone(),
  target: controls.target.clone(),
};

const VIEWS = {
  home: HOME_VIEW,
  workPC: {
    position: new THREE.Vector3(6.011918667226149, 4.165424262115528, -4.151384665960448),
    target: new THREE.Vector3(5.4, 4.15, -4.18),
  },
  workCamera: {
    position: new THREE.Vector3(5.915519, 4.019118, -5.295547),
    target: new THREE.Vector3(5.800511, 4.022210, -5.254112),
  },
  workEvent: {
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
  controls.update();

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
    isModalOpen ||
    isCameraMoving ||
    !hoverArmed ||
    performance.now() < suppressHoverUntil
  ) {
    if (currentHoveredObject) {
      playHoverAnimation(currentHoveredObject, false);
      currentHoveredObject = null;
    }
    document.body.style.cursor = "default";
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

      document.body.style.cursor = obj.name.includes("Pointer") ? "pointer" : "default";
    } else {
      if (currentHoveredObject) {
        playHoverAnimation(currentHoveredObject, false);
        currentHoveredObject = null;
      }
      document.body.style.cursor = "default";
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();
