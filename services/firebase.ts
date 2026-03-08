
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";

let app;
let dbInstance = null;
let authInstance = null;

try {
  app = initializeApp(firebaseConfig);
  console.log("🔥 Firebase App Initialized");
  
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  console.log("🔥 Firestore Initialized with DB:", firebaseConfig.firestoreDatabaseId);
  
  authInstance = getAuth(app);
  console.log("🔥 Auth Initialized");
} catch (error) {
  console.error("❌ Critical Firebase initialization error:", error);
}

export const db = dbInstance;
export const auth = authInstance;
