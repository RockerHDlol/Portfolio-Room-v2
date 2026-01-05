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
  aboutMe: document.querySelector(".modal.aboutMe"),
  contact: document.querySelector(".modal.contact"),
};

const globalCloseBtn = document.createElement("button");
globalCloseBtn.className = "global-modal-close";
globalCloseBtn.setAttribute("aria-label", "Close modal");
globalCloseBtn.innerHTML = `<img src="/images/Close.png" alt="" />`;
document.body.appendChild(globalCloseBtn);
globalCloseBtn.style.display = "none";

globalCloseBtn.addEventListener("click", () => {
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
    const numCols = w <= 520 ? 1 : w <= 980 ? 2 : 3;

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

// START: button disabled until assets loaded
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
        interactionEnabled = true; // ✅ unlock after reveal is done
        canvas.style.opacity = "1";
      },
    },
    "-=0.1"
  );
}

manager.onLoad = () => {
  loadingScreenButton.style.boxShadow = "rgba(0, 0, 0, 0.24) 0px 3px 8px";
  loadingScreenButton.textContent = "Enter!";
  loadingScreenButton.style.cursor = "pointer";
  loadingScreenButton.style.transition =
    "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";

  let isDisabled = false;

  const enter = (e) => {
    
    e.preventDefault();
    e.stopPropagation(); // ✅ prevents click-through

    if (isDisabled) return;
    isDisabled = true;

    // feedback
    loadingScreenButton.style.boxShadow = "none";
    loadingScreenButton.textContent = "Welcome!";
    loadingScreen.style.backgroundColor = "#4b000aff";


    // keep disabled until reveal finished
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

// ----- Modals -----
let isModalOpen = false;

loadPostsFromSheet().catch(console.error);

const showModal = async (modal, modalKey = null) => {
  console.log(`Opening modal: ${modalKey}`);
  modal.style.display = "block";
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
  gsap.to(modal, { opacity: 1, duration: 0.5 });
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
    duration: 0.5,
    onComplete: () => {
      globalCloseBtn.style.display = "none";
      modal.style.display = "none";

      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.enabled = true;

      flyToView("home");

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

// textures
const textureMap = {
  Pic1: { day: "/textures/Room/Day/Pic1.webp" },
  Pic2: { day: "/textures/Room/Day/Pic2.webp" },
  Pic3: { day: "/textures/Room/Day/Pic3.webp" },
};

const loadedTextures = { day: {} };

Object.entries(textureMap).forEach(([key, paths]) => {
  const dayTexture = textureLoader.load(paths.day);
  dayTexture.flipY = false;
  dayTexture.colorSpace = THREE.SRGBColorSpace;
  loadedTextures.day[key] = dayTexture;
});

// scene
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
    if (isModalOpen) return;
    e.preventDefault();
    pointer.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
  },
  { passive: false }
);

window.addEventListener(
  "touchend",
  (e) => {
    if (isModalOpen) return;
    if (!interactionEnabled) return; // ✅ guard
    e.preventDefault();
    handleRaycasterInteraction();
  },
  { passive: false }
);

function handleRaycasterInteraction() {
  if (!interactionEnabled) return; // ✅ guard for safety
  if (isModalOpen || isCameraMoving) return;

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
      flyToView("workPC", { onComplete: () => showModal(modals.workPC, "workPC") });
    } else if (object.name.includes("workCamera")) {
      flyToView("workCamera", { onComplete: () => showModal(modals.workCamera, "workCamera") });
    } else if (object.name.includes("workEvent")) {
      flyToView("workEvent", { onComplete: () => showModal(modals.workEvent, "workEvent") });
    } else if (object.name.includes("aboutMe")) {
      flyToView("aboutMe", { onComplete: () => showModal(modals.aboutMe) });
    } else if (object.name.includes("contact")) {
      showModal(modals.contact);
    }
  }
}

window.addEventListener("click", (e) => {
  if (!interactionEnabled) return;
  handleRaycasterInteraction();
});

// ----- Load GLB -----
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

camera.position.set(7.457997013443906, 4.2664251408437535, -3.9566580964541194);
controls.target.set(5.3, 4.05, -4.45);
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
  aboutMe: {
    position: new THREE.Vector3(7.1, 4.7, -4.8),
    target: new THREE.Vector3(6.4, 4.4, -5.2),
  },
};

let isCameraMoving = false;

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
      gsap.delayedCall(0.05, enableOrbitLimitsAroundCurrentView);

      controls.enabled = true;
      isCameraMoving = false;

      if (typeof onComplete === "function") onComplete();
    },
  });

  tl.to(camera.position, { x: view.position.x, y: view.position.y, z: view.position.z }, 0);
  tl.to(controls.target, { x: view.target.x, y: view.target.y, z: view.target.z }, 0);
}

window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
