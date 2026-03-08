import express from "express";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Initialize Firebase Admin
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
        console.log("✅ Firebase Admin initialized successfully");
    } catch (error) {
        console.error("❌ Failed to initialize Firebase Admin:", error);
    }
} else {
    console.warn("⚠️ Firebase Admin credentials missing. Admin features will be disabled.");
}

app.use(express.json({ limit: '50mb' }));

// Admin API Routes
app.get("/api/admin/status", (req, res) => {
    res.json({ initialized: admin.apps.length > 0 });
});

app.post("/api/admin/upload", async (req, res) => {
    if (!admin.apps.length) {
        return res.status(500).json({ error: "Firebase Admin not initialized" });
    }

    const { type, path: docPath, data } = req.body;

    try {
        const db = admin.firestore();
        const docRef = db.doc(docPath);
        
        if (type === 'set') {
            await docRef.set({
                ...data,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } else if (type === 'delete') {
            await docRef.delete();
        }

        res.json({ success: true, path: docPath });
    } catch (error: any) {
        console.error("Admin Upload Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
    });
    app.use(vite.middlewares);
} else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
}

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
