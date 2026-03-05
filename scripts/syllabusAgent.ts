import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection, getDocs } from "firebase/firestore";
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// --- CONFIGURATION ---
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCPn8l_hQs30cSoegzP7RyhuGoevihNbsY",
  authDomain: "sinhala-study-helper.firebaseapp.com",
  projectId: "sinhala-study-helper",
  storageBucket: "sinhala-study-helper.firebasestorage.app",
  messagingSenderId: "654218141654",
  appId: "1:654218141654:web:bbad397c0d31a6d2b0ce77"
};

// Define what you want the agent to build here
const TARGETS = [
    { grade: "10 ශ්‍රේණිය (Grade 10)", subject: "History", language: "si" },
    { grade: "10 ශ්‍රේණිය (Grade 10)", subject: "Science", language: "si" },
    { grade: "11 ශ්‍රේණිය (Grade 11)", subject: "History", language: "si" }
];

// --- SETUP ---
const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

// Load Balancing Keys
const API_KEYS = [
    process.env.VITE_GEMINI_API_KEY
].filter(k => !!k) as string[];

if (API_KEYS.length === 0) {
    console.error("❌ No API Keys found in .env file! Please add VITE_GEMINI_API_KEY.");
    (process as any).exit(1);
}

console.log(`🚀 Syllabus Agent Initialized with ${API_KEYS.length} AI Keys.`);

// --- HELPERS ---
let keyIndex = 0;
const getNextAI = () => {
    const key = API_KEYS[keyIndex % API_KEYS.length];
    keyIndex++;
    return new GoogleGenAI({ apiKey: key });
};

const createDocId = (...parts: string[]) => {
    return parts
        .map(p => p.toLowerCase().trim().replace(/[^a-z0-9\u0D80-\u0DFF]+/gi, '_'))
        .join('__');
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- GENERATORS ---
async function generateUnitList(grade: string, subject: string, language: string) {
    const ai = getNextAI();
    const prompt = `List the official syllabus units for: Grade: ${grade}, Subject: ${subject}, Country: Sri Lanka (NIE), Language: ${language === 'si' ? 'Sinhala' : 'English'}. Return JSON String Array ONLY.`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-1.5-flash", // Use Flash for lists (cheap/fast)
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
        });
        return JSON.parse(response.text?.trim() || "[]");
    } catch (e) {
        console.error(`Error generating unit list:`, e);
        return [];
    }
}

async function generateContent(grade: string, subject: string, unit: string, language: string) {
    const ai = getNextAI();
    // Alternating models based on key index to balance load further? 
    // For now, let's use Pro for quality content.
    const model = "gemini-1.5-flash"; 

    const prompt = `
      Create a Study Pack for:
      Grade: ${grade}, Subject: ${subject}, Unit: ${unit}, Language: ${language === 'si' ? 'Sinhala' : 'English'}
      
      Tasks:
      1. 10 Multiple Choice Questions (Medium/Hard) with clear explanations.
      2. 10 Flashcards (Concept on Front, Definition on Back).
      
      Return JSON only.
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        quiz: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    question: { type: Type.STRING },
                                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    correctIndex: { type: Type.INTEGER },
                                    explanation: { type: Type.STRING }
                                },
                                required: ["question", "options", "correctIndex", "explanation"]
                            }
                        },
                        flashcards: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    front: { type: Type.STRING },
                                    back: { type: Type.STRING }
                                },
                                required: ["front", "back"]
                            }
                        }
                    },
                    required: ["quiz", "flashcards"]
                }
            }
        });
        return JSON.parse(response.text?.trim() || "{}");
    } catch (e) {
        console.error(`Error generating content for ${unit}:`, e);
        return null;
    }
}

// --- MAIN LOOP ---
async function runAgent() {
    for (const target of TARGETS) {
        console.log(`\n📘 Processing: ${target.grade} - ${target.subject} (${target.language})`);
        
        // 1. Get Units
        console.log(`   ... Fetching syllabus structure`);
        const units = await generateUnitList(target.grade, target.subject, target.language);
        console.log(`   ✅ Found ${units.length} units.`);

        const safeGrade = createDocId(target.grade);
        const safeSubject = createDocId(target.subject);

        // 2. Iterate Units
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const safeUnitName = unit.replace(/Unit \d+[:.]\s*/i, '').trim();
            const currentKey = (keyIndex % API_KEYS.length) + 1;
            
            console.log(`   [Key ${currentKey}] ⏳ Generating content for: ${unit}...`);

            const content = await generateContent(target.grade, target.subject, unit, target.language);

            if (content) {
                // Save Quiz
                if (content.quiz && content.quiz.length > 0) {
                    const quizId = createDocId(safeUnitName, 'medium', target.language);
                    const quizRef = doc(db, 'languages', target.language, 'grades', safeGrade, 'subjects', safeSubject, 'quizzes', quizId);
                    await setDoc(quizRef, {
                        questions: content.quiz,
                        grade: target.grade,
                        subject: target.subject,
                        unit: safeUnitName,
                        language: target.language,
                        createdAt: new Date().toISOString(),
                        source: 'agent_script'
                    });
                }

                // Save Flashcards
                if (content.flashcards && content.flashcards.length > 0) {
                    const flashId = createDocId(safeUnitName, target.language);
                    const flashRef = doc(db, 'languages', target.language, 'grades', safeGrade, 'subjects', safeSubject, 'flashcards', flashId);
                    await setDoc(flashRef, {
                        cards: content.flashcards,
                        grade: target.grade,
                        subject: target.subject,
                        unit: safeUnitName,
                        language: target.language,
                        createdAt: new Date().toISOString(),
                        source: 'agent_script'
                    });
                }
                console.log(`   ✅ Saved to Cloud.`);
            } else {
                console.log(`   ❌ Failed to generate content for ${unit}`);
            }

            // Rate Limit Safety (Even with 3 keys, let's be polite)
            await sleep(2000); 
        }
    }
    console.log("\n🎉 Agent finished all tasks.");
    (process as any).exit(0);
}

runAgent().catch(console.error);