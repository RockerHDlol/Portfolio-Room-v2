import * as THREE from "three";
import "./style.scss";
import { OrbitControls } from "./utils/OrbitControls.js";
// import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import gsap from "gsap";

const canvas = document.querySelector("#experience-canvas");
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
};

let suppressHoverUntil = 0;
let hoverArmed = true;

const modals = {
    workPC: document.querySelector(".modal.workPC"),
    workCamera: document.querySelector(".modal.workCamera"),
    workEvent: document.querySelector(".modal.workEvent"),
    aboutMe: document.querySelector(".modal.aboutMe"),
    contact: document.querySelector(".modal.contact"),
};

let POSTS_BY_CATEGORY = { workPC: [], workCamera: [], workEvent: [] };


async function loadPostsFromSheet() {
  const r = await fetch(`/api/posts?ts=${Date.now()}`); // ts = kein Browsercache
  const data = await r.json();

  POSTS_BY_CATEGORY = { workPC: [], workCamera: [], workEvent: [] };

  for (const item of data.items || []) {
    if (!item?.category || !item?.postId) continue;
    (POSTS_BY_CATEGORY[item.category] ??= []).push(item);
  }
}


const headerDiv = document.getElementById("Header");
if (headerDiv) {
    headerDiv.remove();
}

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
  if (!contentEl) return;

  const items = POSTS_BY_CATEGORY[modalKey] || [];

  const iframesHtml = items.map(({ postId, hoverText }) => `
    <div class="iframe-wrapper">
      <div class="insta-embed">
        <iframe
          src="https://www.instagram.com/p/${postId}/embed/"
          width="320"
          height="400"
          frameborder="0"
          scrolling="no"
          allowtransparency="true">
        </iframe>
      </div>

      <div class="iframe-cover"></div>

      <div class="post-tooltip">${escapeHtml(hoverText || "")}</div>
    </div>
  `).join("");

  contentEl.innerHTML = `
    <div class="insta-grid">
      ${iframesHtml}
    </div>
  `;
}

let touchHappened = false;
document.querySelectorAll(".modal-exit-button").forEach((button) => {
    button.addEventListener(
        "touchend",
        (e) => {
            touchHappened = true;
            e.preventDefault();
            const modal = e.target.closest(".modal");
            hideModal(modal);
        },
        { passive: false }
    );

    button.addEventListener(
        "click",
        (e) => {
            if (touchHappened) return;
            e.preventDefault();
            const modal = e.target.closest(".modal");
            hideModal(modal);
        },
        { passive: false }
    );
});

let isModalOpen = false;

loadPostsFromSheet();

const showModal = async (modal, modalKey = null) => {
    modal.style.display = "block";
    isModalOpen = true;
    controls.enabled = false;

    // ✅ hard lock
    controls.enableRotate = false;
    controls.enableZoom = false;
    controls.enablePan = false;

    // ✅ stop inertial movement
    controls.enableDamping = false;

    if (currentHoveredObject) {
        playHoverAnimation(currentHoveredObject, false);
        currentHoveredObject = null;
    }
    document.body.style.cursor = "default";
    currentIntersects = [];

    // 🔁 fill Instagram posts for the work modals
    if (modalKey && ["workPC", "workCamera", "workEvent"].includes(modalKey)) {
        await loadPostsFromSheet();
        renderInstagramEmbeds(modal, modalKey);
    }

    gsap.set(modal, {
        opacity: 0,
    });

    gsap.to(modal, {
        opacity: 1,
        duration: 0.5,
    });
};

const hideModal = (modal) => {
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
            modal.style.display = "none";
            controls.enableRotate = true;
            controls.enableZoom = true;
            controls.enablePan = true;
            controls.enableDamping = true;

            controls.enabled = true;
            flyToView("home");

            suppressHoverUntil = performance.now() + 300; // 300ms kein Hover
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

//Loadres
const textureLoader = new THREE.TextureLoader();

// Instantiate a loader
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

// Texture Loader wenn ich mehr will dan Second usw. und , am ende von first
const textureMap = {
    Baked: {
        day: "/textures/Room/Day/Texture.webp",
    },
};

const loadedTextures = {
    day: {},
};

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
        e.preventDefault();
        handleRaycasterInteraction();
    },
    { passive: false }
);

function handleRaycasterInteraction() {
    if (isModalOpen || isCameraMoving) return;
    if (currentIntersects.length > 0) {
        const object = currentIntersects[0].object;

        Object.entries(socialLinks).forEach(([key, url]) => {
            if (object.name.includes(key)) {
                const newWindow = window.open();
                newWindow.opener = null;
                newWindow.location = url;
                newWindow.target = "_blank";
                newWindow.rel = "noopener noreferrer";
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

window.addEventListener("click", handleRaycasterInteraction);

let grandma2, poster1;

loader.load("/models/Room_Portfolio.glb", (glb) => {
    glb.scene.traverse((child) => {
        if (child.isMesh) {
            if (child.name.includes("Raycaster")) {
                raycasterObjects.push(child);
            }

            if (child.name.includes("Hover")) {
                child.userData.initialScale = new THREE.Vector3().copy(
                    child.scale
                );
                child.userData.initialPosition = new THREE.Vector3().copy(
                    child.position
                );
                child.userData.initialRotation = new THREE.Euler().copy(
                    child.rotation
                );
            }

            // Check für start animation
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
        }
    });
    scene.add(glb.scene);
    playIntroAnimtion();
});

function playIntroAnimtion() {
    const t1 = gsap.timeline({
        defaults: {
            duration: 0.8,
            ease: "back.out(1.8)",
        },
    });

    t1.to(
        grandma2.scale,
        {
            x: 1,
            y: 1,
            z: 1,
        },
        "-=0.4"
    ).to(poster1.scale, {
        x: 1,
        y: 1,
        z: 1,
    });
}

const camera = new THREE.PerspectiveCamera(
    35,
    sizes.width / sizes.height,
    0.1,
    1000
);






const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// const geometry = new THREE.BoxGeometry( 1, 1, 1 );
// const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );

const controls = new OrbitControls(camera, renderer.domElement);
// controls.minDistance = 3.5;
// controls.maxDistance = 10;

controls.enableDamping = true;
controls.dampingFactor = 0.03;
controls.update();

const azimuthLimit = Math.PI / 15;  // Pan (klein = viel bewegung, groß = wenig bewegung)
const polarLimit   = Math.PI / 30;  // Tilt (klein = viel bewegung, groß = wenig bewegung)

const minZoomOffset = -0.5; // wie weit ran
const maxZoomOffset =  0.5; // wie weit raus

function clampOrbitAroundCurrentView() {
  controls.update(); 

  const polarCenter   = controls.getPolarAngle();
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

camera.position.set(7.457997013443906, 4.2664251408437535, -3.9566580964541194);

controls.target.set(5.3, 4.05, -4.45);

controls.update();

enableOrbitLimitsAroundCurrentView();

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

const HOME_VIEW = {
  position: camera.position.clone(),
  target: controls.target.clone()
};

const VIEWS = {
  home: HOME_VIEW,

  workPC: {
    position: new THREE.Vector3(6.011918667226149, 4.165424262115528, -4.151384665960448),
    target:   new THREE.Vector3(5.4, 4.15, -4.18),
  },
  workCamera: {
    position: new THREE.Vector3(5.889881184473396, 3.989059500010512, -5.3108671519258435),
    target:   new THREE.Vector3(5.8, 3.99, -5.31),
  },
  workEvent: {
    position: new THREE.Vector3(5.711951377719833, 4.078826981178438, -3.643985967008238),
    target:   new THREE.Vector3(5.24, 4.0, -3.6),
  },
  aboutMe: {
    position: new THREE.Vector3(7.1, 4.7, -4.8),
    target:   new THREE.Vector3(6.4, 4.4, -5.2),
  }
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

      if (typeof onComplete === "function") onComplete(); // ✅ neu
    }
  });

  tl.to(camera.position, { x: view.position.x, y: view.position.y, z: view.position.z }, 0);
  tl.to(controls.target, { x: view.target.x, y: view.target.y, z: view.target.z }, 0);
}

// Event Listeners
window.addEventListener("resize", () => {
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;

    // Update Camera
    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();

    // Update renderer
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

function playHoverAnimation(object, isHovering) {
    gsap.killTweensOf(object.scale);
    gsap.killTweensOf(object.rotation);
    gsap.killTweensOf(object.position);

    if (isHovering) {
        gsap.to(object.scale, {
            x: object.userData.initialScale.x * 1.2,
            y: object.userData.initialScale.y * 1.2,
            z: object.userData.initialScale.z * 1.2,
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

const render = () => {
  controls.update();

  // Raycaster / Hover
  if (isModalOpen || isCameraMoving || !hoverArmed || performance.now() < suppressHoverUntil) {
    // Hover sicher aus
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
};

render();

