import * as THREE from 'three';
import './style.scss'
import { OrbitControls } from './utils/OrbitControls.js';
// import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import gsap from "gsap"

const canvas = document.querySelector("#experience-canvas")
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
};

const modals = {
    workPC: document.querySelector(".modal.workPC"),
    workCamera: document.querySelector(".modal.workCamera"),
    workEvent: document.querySelector(".modal.workEvent"),
    aboutMe: document.querySelector(".modal.aboutMe"),
    contact: document.querySelector(".modal.contact"),
};

let touchHappened = false;
document.querySelectorAll(".modal-exit-button").forEach(button=>{
    button.addEventListener(
        "touchend", 
        (e)=>{
            touchHappened = true
            e.preventDefault();
            const modal = e.target.closest(".modal");
            hideModal(modal);
        },
        {passive: false}
    );

    button.addEventListener(
        "click", 
        (e)=>{
            if (touchHappened) return;
            e.preventDefault();
            const modal = e.target.closest(".modal");
            hideModal(modal);
        },
        {passive: false}
    );
});

let isModalOpen = false;

const showModal = (modal) => {
    modal.style.display = "block";
    isModalOpen = true;
    controls.enabled = false;

    if(currentHoveredObject){
        playHoverAnimation(currentHoveredObject, false)
        currentHoveredObject = null
    }
    document.body.style.cursor = "default";
    currentIntersects = [];

    gsap.set(modal, {
        opacity: 0
    });

    gsap.to(modal, {
        opacity: 1,
        duration: 0.5,
    });
};

const hideModal = (modal) => {
    isModalOpen = false;

    gsap.to(modal, {
        opacity: 0,
        duration: 0.5,
        onComplete: ()=>{
            modal.style.display = "none";
            controls.enabled = true;
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
}

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

Object.entries(textureMap).forEach(([key, paths])=>{
    const dayTexture = textureLoader.load(paths.day);
    dayTexture.flipY = false;
    dayTexture.colorSpace = THREE.SRGBColorSpace
    loadedTextures.day[key] = dayTexture;
});

const scene = new THREE.Scene();

window.addEventListener("mousemove", (e)=>{
    touchHappened = false;
    pointer.x = ( e.clientX / window.innerWidth ) * 2 - 1;
	pointer.y = - ( e.clientY / window.innerHeight ) * 2 + 1; 
});

window.addEventListener(
    "touchstart", 
    (e)=>{
        if(isModalOpen) return;
        e.preventDefault()
        pointer.x = ( e.touches[0].clientX / window.innerWidth ) * 2 - 1;
	    pointer.y = - ( e.touches[0].clientY / window.innerHeight ) * 2 + 1; 
    }, 
    {passive: false}
);

window.addEventListener(
    "touchend", 
    (e)=>{
        if(isModalOpen) return;
        e.preventDefault()
        handleRaycasterInteraction()
    }, 
    {passive: false}
);

function handleRaycasterInteraction() {
    if(currentIntersects.length> 0) {
        const object = currentIntersects[0].object;

        Object.entries(socialLinks).forEach(([key, url]) =>{
            if(object.name.includes(key)){
                const newWindow = window.open();
                newWindow.opener = null;
                newWindow.location = url;
                newWindow.target = "_blank";
                newWindow.rel = "noopener noreferrer";
            }
        });

        if (object.name.includes("workPC")){
            showModal(modals.workPC);
        }else if (object.name.includes("workCamera")){
            showModal(modals.workCamera);
        }else if (object.name.includes("workEvent")){
            showModal(modals.workEvent);
        }else if (object.name.includes("aboutMe")){
            showModal(modals.aboutMe);
        }else if (object.name.includes("contact")){
            showModal(modals.contact);
        }

    }
}


window.addEventListener("click", handleRaycasterInteraction);

let grandma2,
    poster1;

loader.load("/models/Room_Portfolio.glb", (glb)=> {
    glb.scene.traverse((child) => {
        if(child.isMesh) {

            if (child.name.includes("Raycaster")){
                raycasterObjects.push(child);
            };

            if (child.name.includes("Hover")){
                child.userData.initialScale = new THREE.Vector3().copy(child.scale);
                child.userData.initialPosition = new THREE.Vector3().copy(child.position);
                child.userData.initialRotation = new THREE.Euler().copy(child.rotation);
            };

            // Check für start animation
            if (child.name.includes("AnimGrandMA")) {
                grandma2 = child;
                child.scale.set(0, 0, 0);
            } else if (child.name.includes("AnimPoster1")) {
                poster1 = child;
                child.scale.set(0, 0, 0);
            }
            
            Object.keys(textureMap).forEach((key) => {
                if(child.name.includes(key)) {
                    const material = new THREE.MeshBasicMaterial({
                        map: loadedTextures.day[key],
                    });

                    child.material = material;

                    if(child.material.map){
                        child.material.map.minFilter = THREE.LinearFilter;
                    }
                }
            });
        }
    });
    scene.add(glb.scene);
    playIntroAnimtion()
});

function playIntroAnimtion(){
    const t1 = gsap.timeline({
        defaults: {
            duration: 0.8,
            ease: "back.out(1.8)",
        },
    });

    t1.to(grandma2.scale, {
        x: 1,
        y: 1,
        z: 1,
    },"-=0.4")
    .to(poster1.scale, {
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
camera.position.set(
    7.292723393732943,
    4.254425417965636,
    -3.927931283958101
);

const renderer = new THREE.WebGLRenderer({ canvas:canvas, antialias: true });
renderer.setSize( sizes.width, sizes.height );
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// const geometry = new THREE.BoxGeometry( 1, 1, 1 );
// const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );


const controls = new OrbitControls( camera, renderer.domElement );

controls.minPolarAngle = Math.PI / 2.9;
controls.maxPolarAngle = Math.PI / 2;
controls.minAzimuthAngle = Math.PI / 5;
controls.maxAzimuthAngle = Math.PI / 1.5;
// controls.minDistance = 3.5;
controls.maxDistance = 10;

controls.enableDamping = true; 
controls.dampingFactor = 0.03;
controls.update();
controls.target.set(
    3.94312259152541,
    3.833115424908893,
    -4.81930484957838
);

// Event Listeners
window.addEventListener("resize", ()=>{
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;

    // Update Camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize( sizes.width, sizes.height );
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

function playHoverAnimation (object, isHovering){
    gsap.killTweensOf(object.scale);
    gsap.killTweensOf(object.rotation);
    gsap.killTweensOf(object.position);

    if(isHovering){
        gsap.to(object.scale, {
            x: object.userData.initialScale.x *1.2,
            y: object.userData.initialScale.y *1.2,
            z: object.userData.initialScale.z *1.2,
            duration: 0.5,
            ease: "bounce.out(1.8)",
        });
        gsap.to(object.rotation, {
            x: object.userData.initialRotation.x *1.2,
            duration: 0.5,
            ease: "bounce.out(1.8)",
        });
    }else{
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
};

const render = () =>{
    controls.update();

    // console.log(camera.position);
    // console.log("00000000000");
    // console.log(controls.target);

    // Raycaster
    if(!isModalOpen){

        raycaster.setFromCamera( pointer, camera );

        currentIntersects = raycaster.intersectObjects(raycasterObjects);

        for ( let i = 0; i < currentIntersects.length; i ++ ) {}

        if (currentIntersects.length > 0) {
            const currentIntersectObject = currentIntersects[0].object;

            if (currentIntersectObject.name.includes("Hover")) {
                if(currentIntersectObject !== currentHoveredObject){

                    if(currentHoveredObject){
                        playHoverAnimation(currentHoveredObject, false);
                    }

                    playHoverAnimation(currentIntersectObject, true);
                    currentHoveredObject = currentIntersectObject;
                }
            }

            if(currentIntersectObject.name.includes("Pointer")){
                    document.body.style.cursor = "pointer";
                }else{
                    document.body.style.cursor = "default";
                }
            }else{
                if(currentHoveredObject){
                    playHoverAnimation(currentHoveredObject, false);
                    currentHoveredObject = null;
                }
                document.body.style.cursor = "default";
        }

    }

	renderer.render(scene, camera);

    window.requestAnimationFrame(render);
}

render();