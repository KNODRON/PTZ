import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

/* =========================
   DATOS INICIALES
========================= */
const defaultCameras = [
  {
    id: "PTZ-02",
    nombre: "PTZ 02",
    ubicacion: "Santiago",
    lat: -33.49267789129478,
    lng: -70.6788036280333,
    estado: "ok",
    observacion: "Transmitiendo sin problemas"
  },
  {
    id: "PTZ-13",
    nombre: "PTZ 13",
    ubicacion: "Santiago",
    lat: -33.49436132382769,
    lng: -70.67635967554472,
    estado: "ok",
    observacion: "Transmitiendo sin problemas"
  },
  {
    id: "PTZ-08",
    nombre: "PTZ 08",
    ubicacion: "Santiago",
    lat: -33.4673122418506,
    lng: -70.71182755715962,
    estado: "off",
    observacion: "Desactivada manualmente"
  },
  {
    id: "PTZ-16",
    nombre: "PTZ 16",
    ubicacion: "Santiago",
    lat: -33.47288355137933,
    lng: -70.72185068571619,
    estado: "error",
    observacion: "Sin señal"
  },
  {
    id: "PTZ-09",
    nombre: "PTZ 09",
    ubicacion: "Santiago",
    lat: -33.42292037784826,
    lng: -70.74003025471728,
    estado: "ok",
    observacion: "Transmitiendo sin problemas"
  },
  {
    id: "PTZ-ARICA-01",
    nombre: "PTZ Arica 01",
    ubicacion: "Arica",
    lat: -18.4783,
    lng: -70.3126,
    estado: "ok",
    observacion: "Agregar ubicación exacta después"
  },
  {
    id: "PTZ-STGO-EXTRA-01",
    nombre: "PTZ Santiago Extra 01",
    ubicacion: "Santiago",
    lat: -33.4489,
    lng: -70.6693,
    estado: "ok",
    observacion: "Agregar ubicación exacta después"
  }
];

/* =========================
   ESTADO GLOBAL
========================= */
let cameras = [];
let selectedCameraId = null;
let markers = {};
let unsubscribeCameras = null;
let noteSaveTimeout = null;

/* =========================
   DOM LOGIN
========================= */
const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const loginMessage = document.getElementById("loginMessage");

/* =========================
   DOM APP
========================= */
const userEmail = document.getElementById("userEmail");
const logoutBtn = document.getElementById("logoutBtn");
const changePasswordBtn = document.getElementById("changePasswordBtn");
const mobilePanelBtn = document.getElementById("mobilePanelBtn");
const sidebar = document.getElementById("sidebar");

const cameraList = document.getElementById("cameraList");
const countOk = document.getElementById("countOk");
const countOff = document.getElementById("countOff");
const countError = document.getElementById("countError");

const editorEmpty = document.getElementById("editorEmpty");
const editorPanel = document.getElementById("editorPanel");
const editorName = document.getElementById("editorName");
const editorLocation = document.getElementById("editorLocation");
const editorUpdated = document.getElementById("editorUpdated");
const cameraStatus = document.getElementById("cameraStatus");
const cameraNotes = document.getElementById("cameraNotes");
const focusBtn = document.getElementById("focusBtn");

/* =========================
   MAPA
========================= */
const map = L.map("map", { zoomControl: true }).setView([-33.4685, -70.705], 11);

const esriSat = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { attribution: "&copy; Esri" }
);

const osm = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  { attribution: "&copy; OpenStreetMap contributors" }
);

esriSat.addTo(map);

L.control.layers(
  { "Satelital": esriSat, "Mapa": osm },
  {},
  { collapsed: false }
).addTo(map);

const cameraLayer = L.layerGroup().addTo(map);

/* =========================
   UTILS
========================= */
function getStatusLabel(status) {
  if (status === "ok") return "Operativa";
  if (status === "off") return "Desactivada";
  return "Falla";
}

function getMarkerClass(status) {
  if (status === "ok") return "marker-ok";
  if (status === "off") return "marker-off";
  return "marker-error";
}

function getStatePillClass(status) {
  if (status === "ok") return "state-ok";
  if (status === "off") return "state-off";
  return "state-error";
}

function createCameraIcon(status) {
  return L.divIcon({
    className: "camera-div-icon",
    html: `<div class="camera-marker ${getMarkerClass(status)}">📷</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14]
  });
}

function formatUpdatedAt(value) {
  if (!value) return "Sin actualizaciones registradas";

  let date;
  if (typeof value?.toDate === "function") {
    date = value.toDate();
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "Sin actualizaciones registradas";

  return `Actualizado: ${date.toLocaleString("es-CL")}`;
}

function showLoginMessage(text, isError = false) {
  loginMessage.textContent = text;
  loginMessage.style.color = isError ? "#d91f26" : "#5d7365";
}

/* =========================
   FIRESTORE
========================= */
async function seedIfEmpty() {
  const snap = await getDocs(collection(db, "camaras"));
  if (!snap.empty) return;

  for (const camera of defaultCameras) {
    await setDoc(doc(db, "camaras", camera.id), {
      ...camera,
      updatedAt: serverTimestamp()
    });
  }
}

async function updateCameraField(cameraId, data) {
  await updateDoc(doc(db, "camaras", cameraId), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

/* =========================
   POPUPS Y ACCIONES
========================= */
function getPopupHtml(camera) {
  return `
    <div class="popup-title">${camera.nombre}</div>
    <div class="popup-line"><b>Ubicación:</b> ${camera.ubicacion}</div>
    <div class="popup-line"><b>Estado:</b> ${getStatusLabel(camera.estado)}</div>
    <div class="popup-line"><b>Observación:</b> ${camera.observacion || "Sin observaciones"}</div>
    <div class="popup-line"><b>${formatUpdatedAt(camera.updatedAt)}</b></div>

    <div class="popup-actions">
      <button class="popup-btn ok" onclick="window.quickSetStatus('${camera.id}','ok')">🟢</button>
      <button class="popup-btn off" onclick="window.quickSetStatus('${camera.id}','off')">🟡</button>
      <button class="popup-btn error" onclick="window.quickSetStatus('${camera.id}','error')">🔴</button>
    </div>
  `;
}

async function quickSetStatus(cameraId, status) {
  try {
    await updateCameraField(cameraId, {
      estado: status,
      observacion: "Actualización manual"
    });
  } catch (error) {
    console.error(error);
    alert("No se pudo actualizar el estado.");
  }
}

window.quickSetStatus = quickSetStatus;

/* =========================
   RENDER
========================= */
function renderMarkers() {
  cameraLayer.clearLayers();
  markers = {};

  cameras.forEach((camera) => {
    const marker = L.marker([camera.lat, camera.lng], {
      icon: createCameraIcon(camera.estado)
    });

    marker.bindPopup(getPopupHtml(camera));

    marker.on("click", () => {
      selectCamera(camera.id);
    });

    marker.addTo(cameraLayer);
    markers[camera.id] = marker;
  });
}

function renderCameraList() {
  cameraList.innerHTML = "";

  cameras.forEach((camera) => {
    const item = document.createElement("div");
    item.className = "camera-item" + (camera.id === selectedCameraId ? " active" : "");
    item.innerHTML = `
      <div class="camera-row">
        <div class="camera-name">${camera.nombre}</div>
        <div class="state-pill ${getStatePillClass(camera.estado)}">${getStatusLabel(camera.estado)}</div>
      </div>
      <div class="camera-location">${camera.ubicacion}</div>
    `;

    item.addEventListener("click", () => {
      selectCamera(camera.id);
      flyToCamera(camera.id);
      closeSidebarOnMobile();
    });

    cameraList.appendChild(item);
  });
}

function updateSummary() {
  countOk.textContent = cameras.filter(c => c.estado === "ok").length;
  countOff.textContent = cameras.filter(c => c.estado === "off").length;
  countError.textContent = cameras.filter(c => c.estado === "error").length;
}

function renderAll() {
  renderMarkers();
  renderCameraList();
  updateSummary();

  if (selectedCameraId) {
    const selected = cameras.find(c => c.id === selectedCameraId);
    if (selected) {
      updateEditor(selected);
    }
  }
}

/* =========================
   EDITOR
========================= */
function updateEditor(camera) {
  editorEmpty.classList.add("hidden");
  editorPanel.classList.remove("hidden");

  editorName.textContent = camera.nombre;
  editorLocation.textContent = camera.ubicacion;
  editorUpdated.textContent = formatUpdatedAt(camera.updatedAt);
  cameraStatus.value = camera.estado;
  cameraNotes.value = camera.observacion || "";
}

function selectCamera(cameraId) {
  selectedCameraId = cameraId;
  const camera = cameras.find(c => c.id === cameraId);
  if (!camera) return;

  updateEditor(camera);
  renderCameraList();
}

function flyToCamera(cameraId) {
  const camera = cameras.find(c => c.id === cameraId);
  if (!camera) return;

  map.flyTo([camera.lat, camera.lng], 15, { duration: 0.8 });

  if (markers[camera.id]) {
    markers[camera.id].openPopup();
  }
}

/* =========================
   AUTO-GUARDADO
========================= */
cameraStatus.addEventListener("change", async () => {
  if (!selectedCameraId) return;

  try {
    await updateCameraField(selectedCameraId, {
      estado: cameraStatus.value,
      observacion: cameraNotes.value.trim() || "Actualización manual"
    });
  } catch (error) {
    console.error(error);
    alert("No se pudo actualizar el estado.");
  }
});

cameraNotes.addEventListener("input", () => {
  if (!selectedCameraId) return;

  clearTimeout(noteSaveTimeout);
  noteSaveTimeout = setTimeout(async () => {
    try {
      await updateCameraField(selectedCameraId, {
        observacion: cameraNotes.value.trim()
      });
    } catch (error) {
      console.error(error);
    }
  }, 700);
});

focusBtn.addEventListener("click", () => {
  if (selectedCameraId) {
    flyToCamera(selectedCameraId);
  }
});

/* =========================
   SIDEBAR MÓVIL
========================= */
mobilePanelBtn.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

function closeSidebarOnMobile() {
  if (window.innerWidth <= 920) {
    sidebar.classList.remove("open");
  }
}

/* =========================
   AUTH
========================= */
loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showLoginMessage("Ingresa correo y contraseña.", true);
    return;
  }

  try {
    showLoginMessage("Ingresando...");
    await signInWithEmailAndPassword(auth, email, password);
    showLoginMessage("");
  } catch (error) {
    console.error(error);
    showLoginMessage("No se pudo iniciar sesión. Revisa correo y contraseña.", true);
  }
});

forgotPasswordBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();

  if (!email) {
    showLoginMessage("Escribe primero tu correo para enviar el restablecimiento.", true);
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showLoginMessage("Se envió un correo para cambiar/restablecer la contraseña.");
  } catch (error) {
    console.error(error);
    showLoginMessage("No se pudo enviar el correo de restablecimiento.", true);
  }
});

changePasswordBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user?.email) {
    alert("No hay un usuario autenticado.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, user.email);
    alert(`Se envió un correo de cambio/restablecimiento a ${user.email}`);
  } catch (error) {
    console.error(error);
    alert("No se pudo enviar el correo de cambio de contraseña.");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    alert("No se pudo cerrar sesión.");
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    userEmail.textContent = user.email || "Usuario";

    try {
      await seedIfEmpty();

      if (unsubscribeCameras) unsubscribeCameras();

      unsubscribeCameras = onSnapshot(collection(db, "camaras"), (snapshot) => {
        const temp = [];
        snapshot.forEach((docSnap) => {
          temp.push({
            id: docSnap.id,
            ...docSnap.data()
          });
        });

        temp.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        cameras = temp;
        renderAll();
      });
    } catch (error) {
      console.error(error);
      alert("Error conectando con Firestore. Revisa configuración y reglas.");
    }

    setTimeout(() => map.invalidateSize(), 250);
  } else {
    if (unsubscribeCameras) {
      unsubscribeCameras();
      unsubscribeCameras = null;
    }

    cameras = [];
    selectedCameraId = null;
    cameraLayer.clearLayers();
    cameraList.innerHTML = "";
    editorPanel.classList.add("hidden");
    editorEmpty.classList.remove("hidden");

    appScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
  }
});

/* =========================
   PWA
========================= */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("SW error:", error);
    });
  });
}
