const STORAGE_KEY = "ptz_santiago_estado_v1";

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
  }
];

let cameras = loadCameras();
let selectedCameraId = null;
const markers = {};

const map = L.map("map", {
  zoomControl: true
}).setView([-33.4685, -70.705], 12);

const esriSat = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: '&copy; Esri'
  }
);

const osm = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution: '&copy; OpenStreetMap contributors'
  }
);

esriSat.addTo(map);

L.control.layers(
  {
    "Satelital": esriSat,
    "Mapa": osm
  },
  {},
  { collapsed: false }
).addTo(map);

const cameraLayer = L.layerGroup().addTo(map);

const cameraList = document.getElementById("cameraList");
const countOk = document.getElementById("countOk");
const countOff = document.getElementById("countOff");
const countError = document.getElementById("countError");

const editorEmpty = document.getElementById("editorEmpty");
const editorPanel = document.getElementById("editorPanel");
const editorName = document.getElementById("editorName");
const editorLocation = document.getElementById("editorLocation");
const cameraStatus = document.getElementById("cameraStatus");
const cameraNotes = document.getElementById("cameraNotes");
const saveBtn = document.getElementById("saveBtn");
const focusBtn = document.getElementById("focusBtn");

function loadCameras() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(defaultCameras);

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.length) {
      return structuredClone(defaultCameras);
    }
    return parsed;
  } catch (error) {
    console.error("No se pudo cargar localStorage:", error);
    return structuredClone(defaultCameras);
  }
}

function saveCameras() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cameras));
}

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
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -12]
  });
}

function getPopupHtml(camera) {
  return `
    <div class="popup-title">${camera.nombre}</div>

    <div class="popup-line"><b>Estado:</b> ${getStatusLabel(camera.estado)}</div>

    <div style="display:flex; gap:8px; margin-top:10px;">
      <button onclick="setCameraStatus('${camera.id}','ok')" 
        style="flex:1; padding:8px; border:none; border-radius:8px; background:#39ff14; font-weight:bold;">
        🟢
      </button>

      <button onclick="setCameraStatus('${camera.id}','off')" 
        style="flex:1; padding:8px; border:none; border-radius:8px; background:#ffd400; font-weight:bold;">
        🟡
      </button>

      <button onclick="setCameraStatus('${camera.id}','error')" 
        style="flex:1; padding:8px; border:none; border-radius:8px; background:#ff2b2b; color:white; font-weight:bold;">
        🔴
      </button>
    </div>

    <div class="popup-line" style="margin-top:10px;">
      <b>Ubicación:</b> ${camera.ubicacion}
    </div>
  `;
}

function renderMarkers() {
  cameraLayer.clearLayers();

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
}

function selectCamera(cameraId) {
  selectedCameraId = cameraId;
  const camera = cameras.find(c => c.id === cameraId);
  if (!camera) return;

  editorEmpty.classList.add("hidden");
  editorPanel.classList.remove("hidden");

  editorName.textContent = camera.nombre;
  editorLocation.textContent = camera.ubicacion;
  cameraStatus.value = camera.estado;
  cameraNotes.value = camera.observacion || "";

  renderCameraList();
}

function flyToCamera(cameraId) {
  const camera = cameras.find(c => c.id === cameraId);
  if (!camera) return;

  map.flyTo([camera.lat, camera.lng], 16, {
    duration: 0.8
  });

  if (markers[camera.id]) {
    markers[camera.id].openPopup();
  }
}

function saveSelectedCamera() {
  if (!selectedCameraId) return;

  const index = cameras.findIndex(c => c.id === selectedCameraId);
  if (index === -1) return;

  cameras[index].estado = cameraStatus.value;
  cameras[index].observacion = cameraNotes.value.trim();

  saveCameras();
  renderAll();
  flyToCamera(selectedCameraId);
}

function renderAll() {
  renderMarkers();
  renderCameraList();
  updateSummary();

  if (selectedCameraId) {
    const selected = cameras.find(c => c.id === selectedCameraId);
    if (selected) {
      editorName.textContent = selected.nombre;
      editorLocation.textContent = selected.ubicacion;
      cameraStatus.value = selected.estado;
      cameraNotes.value = selected.observacion || "";
      editorEmpty.classList.add("hidden");
      editorPanel.classList.remove("hidden");
    }
  }
}

saveBtn.addEventListener("click", saveSelectedCamera);

focusBtn.addEventListener("click", () => {
  if (selectedCameraId) {
    flyToCamera(selectedCameraId);
  }
});

renderAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("SW error:", error);
    });
  });
}
