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
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

/* =========================
   ESTADO GLOBAL
========================= */
let cameras = [];
let selectedCameraId = null;
let markers = {};
let unsubscribeCameras = null;
let currentUserRole = "visor";
let currentUserData = null;

/* NUEVO: control local de edición */
let isEditingNotes = false;
let notesDirty = false;

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


const mobileUserEmail = document.getElementById("mobileUserEmail");
const mobileChangePasswordBtn = document.getElementById("mobileChangePasswordBtn");
const mobileLogoutBtn = document.getElementById("mobileLogoutBtn");

const mCountOk = document.getElementById("mCountOk");
const mCountOff = document.getElementById("mCountOff");
const mCountError = document.getElementById("mCountError");

const fabMenu = document.getElementById("fabMenu");
const fabFocus = document.getElementById("fabFocus");

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

function canEdit() {
  return currentUserRole === "admin";
}

function applyRoleUI() {
  const editable = canEdit();
  cameraStatus.disabled = !editable;
  cameraNotes.disabled = !editable;
  changePasswordBtn.disabled = false;
}

function closeSidebarOnMobile() {
  if (window.innerWidth <= 920) {
    sidebar.classList.remove("open");
  }
}

/* =========================
   FIRESTORE
========================= */
async function loadCurrentUserProfile(uid) {
  const ref = doc(db, "usuarios", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("No existe documento de usuario en Firestore.");
  }

  currentUserData = snap.data();
  currentUserRole = currentUserData.rol || "visor";
  applyRoleUI();
}

async function updateCameraField(cameraId, data) {
  const user = auth.currentUser;
  if (!user || !canEdit()) return;

  await updateDoc(doc(db, "camaras", cameraId), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: user.email || "usuario"
  });
}

/* NUEVO: guardar observación de forma controlada */
async function saveNotesIfNeeded() {
  if (!selectedCameraId || !canEdit() || !notesDirty) return;

  const newText = cameraNotes.value.trim();
  const currentCamera = cameras.find(c => c.id === selectedCameraId);

  if (!currentCamera) return;

  if ((currentCamera.observacion || "") === newText) {
    notesDirty = false;
    return;
  }

  try {
    await updateCameraField(selectedCameraId, {
      observacion: newText
    });
    notesDirty = false;
  } catch (error) {
    console.error(error);
    alert("No se pudo guardar la observación.");
  }
}

/* =========================
   POPUPS
========================= */
function getPopupHtml(camera) {
  const actionButtons = canEdit()
    ? `
      <div class="popup-actions">
        <button class="popup-btn ok" onclick="window.quickSetStatus('${camera.id}','ok')">🟢</button>
        <button class="popup-btn off" onclick="window.quickSetStatus('${camera.id}','off')">🟡</button>
        <button class="popup-btn error" onclick="window.quickSetStatus('${camera.id}','error')">🔴</button>
      </div>
    `
    : `<div class="popup-line"><b>Modo:</b> solo visualización</div>`;

  return `
    <div class="popup-title">${camera.nombre}</div>
    <div class="popup-line"><b>Ubicación:</b> ${camera.ubicacion}</div>
    <div class="popup-line"><b>Estado:</b> ${getStatusLabel(camera.estado)}</div>
    <div class="popup-line"><b>Observación:</b> ${camera.observacion || "Sin observaciones"}</div>
    <div class="popup-line"><b>${formatUpdatedAt(camera.updatedAt)}</b></div>
    <div class="popup-line"><b>Actualizado por:</b> ${camera.updatedBy || "sistema"}</div>
    ${actionButtons}
  `;
}

async function quickSetStatus(cameraId, status) {
  if (!canEdit()) return;

  try {
    const camera = cameras.find(c => c.id === cameraId);
    await updateCameraField(cameraId, {
      estado: status,
      observacion: camera?.observacion || ""
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

    marker.on("click", async () => {
      await saveNotesIfNeeded();
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

    item.addEventListener("click", async () => {
      await saveNotesIfNeeded();
      selectCamera(camera.id);
      flyToCamera(camera.id);
      closeSidebarOnMobile();
    });

    cameraList.appendChild(item);
  });
}

function updateSummary() {
  const ok = cameras.filter(c => c.estado === "ok").length;
  const off = cameras.filter(c => c.estado === "off").length;
  const error = cameras.filter(c => c.estado === "error").length;

  countOk.textContent = ok;
  countOff.textContent = off;
  countError.textContent = error;

  if (mCountOk) mCountOk.textContent = ok;
  if (mCountOff) mCountOff.textContent = off;
  if (mCountError) mCountError.textContent = error;
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
  editorUpdated.textContent = `${formatUpdatedAt(camera.updatedAt)} · por ${camera.updatedBy || "sistema"}`;
  cameraStatus.value = camera.estado;

  /* IMPORTANTE: si estoy escribiendo, no me pises el texto */
  if (!isEditingNotes) {
    cameraNotes.value = camera.observacion || "";
    notesDirty = false;
  }

  applyRoleUI();
}

function selectCamera(cameraId) {
  selectedCameraId = cameraId;
  const camera = cameras.find(c => c.id === cameraId);
  if (!camera) return;

  isEditingNotes = false;
  notesDirty = false;
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
   AUTO-GUARDADO CORREGIDO
========================= */
cameraStatus.addEventListener("change", async () => {
  if (!selectedCameraId || !canEdit()) return;

  try {
    const currentCamera = cameras.find(c => c.id === selectedCameraId);

    await updateCameraField(selectedCameraId, {
      estado: cameraStatus.value,
      observacion: currentCamera?.observacion || ""
    });
  } catch (error) {
    console.error(error);
    alert("No se pudo actualizar el estado.");
  }
});

cameraNotes.addEventListener("focus", () => {
  if (!canEdit()) return;
  isEditingNotes = true;
});

cameraNotes.addEventListener("input", () => {
  if (!canEdit()) return;
  notesDirty = true;
});

cameraNotes.addEventListener("blur", async () => {
  if (!canEdit()) return;
  await saveNotesIfNeeded();
  isEditingNotes = false;
});

cameraNotes.addEventListener("keydown", async (e) => {
  if (!canEdit()) return;

  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    await saveNotesIfNeeded();
    cameraNotes.blur();
  }
});

focusBtn.addEventListener("click", async () => {
  await saveNotesIfNeeded();
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

if (fabMenu) {
  fabMenu.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

if (fabFocus) {
  fabFocus.addEventListener("click", async () => {
    await saveNotesIfNeeded();
    if (selectedCameraId) {
      flyToCamera(selectedCameraId);
    }
  });
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

mobileChangePasswordBtn.addEventListener("click", async () => {
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

mobileLogoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    alert("No se pudo cerrar sesión.");
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
    try {
      await loadCurrentUserProfile(user.uid);

      loginScreen.classList.add("hidden");
      appScreen.classList.remove("hidden");
      const sessionText = `${user.email || "Usuario"} · ${currentUserRole}`;
      userEmail.textContent = sessionText;
      if (mobileUserEmail) mobileUserEmail.textContent = sessionText;

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

      setTimeout(() => map.invalidateSize(), 250);
    } catch (error) {
      console.error(error);
      alert("Tu usuario no tiene perfil válido en Firestore o no está activo.");
      await signOut(auth);
    }
  } else {
    if (unsubscribeCameras) {
      unsubscribeCameras();
      unsubscribeCameras = null;
    }

    currentUserRole = "visor";
    currentUserData = null;
    cameras = [];
    selectedCameraId = null;
    cameraLayer.clearLayers();
    cameraList.innerHTML = "";
    editorPanel.classList.add("hidden");
    editorEmpty.classList.remove("hidden");
    isEditingNotes = false;
    notesDirty = false;

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
