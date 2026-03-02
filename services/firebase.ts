
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// --- FIREBASE CONFIGURATION ---
// These keys connect your app to the 'sinhala-study-helper' project.
const firebaseConfig = {
  apiKey: "AIzaSyCPn8l_hQs30cSoegzP7RyhuGoevihNbsY",
  authDomain: "sinhala-study-helper.firebaseapp.com",
  projectId: "sinhala-study-helper",
  storageBucket: "sinhala-study-helper.firebasestorage.app",
  messagingSenderId: "654218141654",
  appId: "1:654218141654:web:bbad397c0d31a6d2b0ce77",
  measurementId: "G-DN8N736EC6"
};

let app;
let dbInstance = null;
let analyticsInstance = null;

try {
  // Initialize Firebase
  app = initializeApp(firebaseConfig);
  console.log("🔥 Firebase App Initialized");
  
  // Initialize Firestore (Database)
  try {
    dbInstance = getFirestore(app);
    console.log("🔥 Firestore Initialized");
  } catch (fsError) {
    console.error("❌ Firestore Init Failed (Check importmap versions):", fsError);
  }
  
  // Initialize Analytics - DISABLED to prevent 503 Installation errors
  // Uncomment if needed and ensure environment allows Firebase Installations
  /*
  if (typeof window !== 'undefined') {
    try {
        analyticsInstance = getAnalytics(app);
        console.log("🔥 Analytics Initialized");
    } catch (e) {
        console.warn("⚠️ Firebase Analytics failed (likely ad-blocker):", e);
    }
  }
  */

} catch (error) {
  console.error("❌ Critical Firebase initialization error:", error);
}

export const db = dbInstance;
export const analytics = analyticsInstance;
