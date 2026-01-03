// extensao_meet/src/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  addDoc,
  
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";


//Sua Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBlDxvlw60NgUucb4xEcAdFrsjEW_3UOEI",
  authDomain: "educ-ia.firebaseapp.com",
  databaseURL: "https://educ-ia-default-rtdb.firebaseio.com",
  projectId: "educ-ia",
  storageBucket: "educ-ia.firebasestorage.app",
  messagingSenderId: "792553477162",
  appId: "1:792553477162:web:76a3edd26aaaedd4959f53",
  measurementId: "G-10NV4SSWPV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Exportações corrigidas e completas
export {
  auth,
  db,
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  addDoc,
  onAuthStateChanged,
  signInWithCustomToken // Exportando para uso no background.js
};