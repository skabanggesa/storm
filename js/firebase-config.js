// Import fungsi yang diperlukan daripada SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-storage.js";

// Konfigurasi Firebase anda
const firebaseConfig = {
  apiKey: "AIzaSyAc79DeK_4PerZU0y0PHOdkktByXrQETEc",
  authDomain: "kot2025-9f977.firebaseapp.com",
  projectId: "kot2025-9f977",
  storageBucket: "kot2025-9f977.firebasestorage.app",
  messagingSenderId: "447340488198",
  appId: "1:447340488198:web:5400db0aa4f3c91e834587",
  measurementId: "G-HY26QLXZ3F"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);

// Inisialisasi perkhidmatan untuk digunakan dalam fail lain
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);