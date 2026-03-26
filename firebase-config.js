import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCQ0TQHT4d5_yqGNcGdlD8WooBPWo_z5sw",
  authDomain: "ptz-depto.firebaseapp.com",
  projectId: "ptz-depto",
  storageBucket: "ptz-depto.firebasestorage.app",
  messagingSenderId: "916252156375",
  appId: "1:916252156375:web:52a2b958fd5026691aeb92"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
