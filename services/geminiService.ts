
import { GoogleGenAI, Type } from "@google/genai";
import { Subject, StudyPlan, QuizQuestion, Language, BusySlot, UserRoutine, WeeklySchedule, Flashcard } from '../types';
import { SYLLABUS_DB, normalizeSubject, SyllabusUnit, GradeSyllabus } from '../data/syllabusDatabase';
import { db } from './firebase';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, increment } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './firestoreUtils';
import Tesseract from 'tesseract.js';

const apiKeys = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.API_KEY,
  import.meta.env?.VITE_GEMINI_API_KEY,
  import.meta.env?.VITE_GEMINI_API_KEY_2,
  import.meta.env?.VITE_GEMINI_API_KEY_3
].filter(Boolean) as string[];

console.log("Gemini Service v2.2 - Production Update"); // Version Check
let currentKeyIndex = 0;

function getNextAiClient() {
    if (apiKeys.length === 0) throw new Error("API key is missing. Please set GEMINI_API_KEY or VITE_GEMINI_API_KEY.");
    const key = apiKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    return new GoogleGenAI({ apiKey: key });
}

// --- SMART HYBRID STRATEGY ---
const MODEL_COMPLEX = "gemini-3-flash-preview";
// Switched the 'Fast' model to be the primary for standard tasks to save money
const MODEL_FAST = "gemini-3-flash-preview"; 

const CACHE_PREFIX = 'nexus_plan_cache_';

/**
 * Generates a unique cache key.
 */
const getCacheKey = (params: any) => {
    const keyObj = {
        grade: params.grade,
        subjects: params.subjects.map((s: any) => s.name).sort().join(','),
        hours: params.hoursPerDay,
        examDate: params.routine.examDate,
        focus: params.focusArea,
        lang: params.language
    };
    return CACHE_PREFIX + btoa(encodeURIComponent(JSON.stringify(keyObj)));
};

/**
 * Helper to create safe Firestore Document IDs from user input
 * Removes special characters and spaces
 */
export const createDocId = (...parts: string[]) => {
    return parts
        .map(p => p.toLowerCase().trim().replace(/[^a-z0-9\u0D80-\u0DFF]+/gi, '_')) // Supports Sinhala chars + alphanumeric
        .join('__');
};

// --- OCR & CAMERA SOLVER ---

// Normalize text for hashing (strip whitespace, lower case)
const normalizeText = (text: string) => {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
};

// Simple hash function for text
const getTextHash = async (text: string) => {
    const msgBuffer = new TextEncoder().encode(normalizeText(text));
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Fallback OCR using Tesseract.js
const performFallbackOCR = async (imageUrl: string): Promise<{ text: string, confidence: number }> => {
    try {
        const result = await Tesseract.recognize(imageUrl, 'eng+sin', {
            logger: m => console.log(m)
        });
        return { text: result.data.text, confidence: result.data.confidence / 100 };
    } catch (e) {
        console.error("Fallback OCR failed", e);
        return { text: "", confidence: 0 };
    }
};

// Usage Accounting
const incrementUsage = async (userId: string, actionType: string) => {
    if (!db) return;
    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    const userRef = doc(db, 'users', userId, 'usage', monthKey);
    const globalRef = doc(db, 'usage_monthly', monthKey);

    try {
        // Use setDoc with merge: true for atomic increments
        await setDoc(userRef, { [actionType]: increment(1) }, { merge: true });
        await setDoc(globalRef, { total_actions: increment(1) }, { merge: true });
    } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, userRef.path);
    }
};

// Check Rate Limit
const checkRateLimit = async (userId: string, actionType: string): Promise<boolean> => {
    if (!db) return true; // Fail open if DB issue
    const today = new Date().toISOString().split('T')[0];
    const usageRef = doc(db, 'users', userId, 'daily_usage', today);
    
    try {
        const docSnap = await getDoc(usageRef);
        if (!docSnap.exists()) return true;
        
        const count = docSnap.data()[actionType] || 0;
        const limit = actionType === 'camera_solve' ? 14400 : 14400; // Free tier limits
        
        return count < limit;
    } catch (e) {
        try {
            handleFirestoreError(e, OperationType.GET, usageRef.path);
        } catch (err) {
            console.warn("Rate limit check failed (Offline/Error), allowing usage.", err);
        }
        return true;
    }
};

export const solveImage = async (imageUrl: string, userId: string, language: Language) => {
    // 1. Rate Limit
    if (!(await checkRateLimit(userId, 'camera_solve'))) {
        throw new Error("Daily limit exceeded");
    }

    // 2. OCR (Primary - Gemini Vision)
    const ai = getNextAiClient();
    let text = "";
    let ocrConfidence = 0;

    try {
        // Fetch image and convert to base64
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
        const base64Data = base64.split(',')[1];

        const visionResp = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
                { inlineData: { mimeType: "image/jpeg", data: base64Data } },
                { text: "Extract all text from this image exactly as is." }
            ]
        });
        text = visionResp.text || "";
        ocrConfidence = 0.9; // Gemini doesn't give confidence, assume high if successful
    } catch (e) {
        console.warn("Primary OCR failed", e);
        ocrConfidence = 0;
    }

    // 3. Fallback OCR
    if (ocrConfidence < 0.8 || !text) {
        const fallback = await performFallbackOCR(imageUrl);
        if (fallback.confidence > ocrConfidence) {
            text = fallback.text;
            ocrConfidence = fallback.confidence;
        }
    }

    if (!text) throw new Error("Could not read text from image");

    // 4. Cache Check
    const textHash = await getTextHash(text);
    if (db) {
        const cachedRef = doc(db, 'cached_answers', textHash);
        try {
            const cachedSnap = await getDoc(cachedRef);
            if (cachedSnap.exists()) {
                await incrementUsage(userId, 'camera_solve_cache');
                return cachedSnap.data();
            }
        } catch (e) {
            try {
                handleFirestoreError(e, OperationType.GET, cachedRef.path);
            } catch (err) {
                console.warn("Cache check failed (Offline/Error), skipping cache.", err);
            }
        }
    }

    // 5. RAG & Generation (Simplified RAG for this snippet)
    // In a full implementation, we would query a vector DB here.
    // For now, we'll use the text directly.
    
    const learningModeSnap = db ? await getDoc(doc(db, 'config', 'learning_mode')) : null;
    const learningMode = learningModeSnap?.exists() ? learningModeSnap.data().enabled : false;

    const prompt = `
        SYSTEM: You are an expert tutor. Use the provided text to answer the student's question.
        - If "learning_mode" is TRUE (${learningMode}), provide guided steps, NOT the final answer.
        - Output MUST be valid JSON.
        - Language: Sinhala

        QUESTION TEXT:
        ${text}

        OUTPUT JSON SCHEMA:
        {
          "answer_steps": ["step 1", "step 2"],
          "final_answer": "string",
          "rubric": ["point 1", "point 2"],
          "confidence": 0.0 to 1.0,
          "sources": ["syllabus_context_if_available"]
        }
    `;

    const genResp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });

    const answerJson = JSON.parse(genResp.text || "{}");
    answerJson.ocr_confidence = ocrConfidence;
    answerJson.sources = answerJson.sources || ["no syllabus context used"];

    // 6. Verification (Self-Correction)
    const verifyPrompt = `
        SYSTEM: Verify the generated answer against the question.
        - Check for hallucinations.
        - Output JSON.

        QUESTION: ${text}
        GENERATED: ${JSON.stringify(answerJson)}

        OUTPUT JSON SCHEMA:
        {
          "verified": boolean,
          "confidence": 0.0 to 1.0,
          "issues": ["issue 1"]
        }
    `;
    
    const verifyResp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: verifyPrompt,
        config: { responseMimeType: "application/json" }
    });
    const verifyJson = JSON.parse(verifyResp.text || "{}");

    answerJson.verified = verifyJson.verified;
    answerJson.confidence = verifyJson.confidence;

    // 7. Routing & Storage
    if (db) {
        if (!answerJson.verified || ocrConfidence < 0.70) {
            const queuePath = 'verification_queue';
            try {
                await addDoc(collection(db, queuePath), {
                    question: text,
                    answer: answerJson,
                    ocr_conf: ocrConfidence,
                    ver_conf: verifyJson.confidence,
                    status: 'pending',
                    createdAt: serverTimestamp()
                });
            } catch (e) {
                try {
                    handleFirestoreError(e, OperationType.CREATE, queuePath);
                } catch (err) {
                    console.warn("Failed to add to verification queue", err);
                }
            }
        }

        const cachedRef = doc(db, 'cached_answers', textHash);
        try {
            await setDoc(cachedRef, answerJson);
            await incrementUsage(userId, 'camera_solve');
        } catch (e) {
            try {
                handleFirestoreError(e, OperationType.WRITE, cachedRef.path);
            } catch (err) {
                console.warn("Failed to cache answer", err);
            }
        }
    }

    return answerJson;
};

async function executeWithKeyRotation(model: string, params: any) {
    let lastError;
    const maxAttemptsPerKey = 2;
    const totalMaxAttempts = apiKeys.length * maxAttemptsPerKey;
    
    for (let attempt = 0; attempt < totalMaxAttempts; attempt++) {
        const ai = getNextAiClient();
        try {
            const result = await ai.models.generateContent({
                ...params,
                model: model,
            });
            console.log(`✅ Successfully generated content using model: ${model}`);
            return result;
        } catch (error: any) {
            lastError = error;
            const isQuotaError = 
                error.message?.includes('429') || 
                error.status === 429 ||
                error.status === 503 ||
                error.message?.includes('Quota exceeded');

            const isNetworkError = 
                error.message?.includes('Rpc failed') || 
                error.message?.includes('xhr error') ||
                error.message?.includes('fetch failed');
                
            if ((isQuotaError || isNetworkError) && apiKeys.length > 0) {
                const waitTime = 2000 + (Math.random() * 1000);
                console.warn(`⚠️ Error (Quota/Network). Waiting ${Math.round(waitTime)}ms and rotating...`);
                await sleep(waitTime);
                continue;
            }
            throw error; 
        }
    }
    throw lastError;
}

async function generateWithFallback(
    primaryModel: string, 
    fallbackModel: string, 
    params: any
) {
    try {
        return await executeWithKeyRotation(primaryModel, params);
    } catch (error: any) {
        if (fallbackModel) {
            console.warn(`⚠️ Primary model (${primaryModel}) failed. Switching to fallback (${fallbackModel})...`);
            return await executeWithKeyRotation(fallbackModel, params);
        }
        throw error;
    }
}

// --- AI SYLLABUS FETCHING ---
export async function extractSyllabusFromPDF(pdfBase64: string, grade: string, language: string): Promise<{name: string, units: SyllabusUnit[]}[]> {
    const prompt = `
    This is a PDF of the official Sri Lankan National Institute of Education (NIE) syllabus for Grade ${grade}.
    Language: Sinhala

    Please extract the syllabus units/topics for ALL subjects found in this PDF.
    Return a JSON object where keys are subject names and values are arrays of objects with ONLY a 'unit' property.
    Do NOT generate explanations. This is to ensure maximum speed.
    
    Example Structure:
    {
      "Science": [{"unit": "Unit 1: Plant life"}, {"unit": "Unit 2: Motion"}],
      "Math": [{"unit": "Unit 1: Algebra"}]
    }
    `;

    try {
        const response = await executeWithKeyRotation(MODEL_COMPLEX, {
            contents: [
                {
                    inlineData: {
                        mimeType: "application/pdf",
                        data: pdfBase64
                    }
                },
                { text: prompt }
            ],
            config: {
                responseMimeType: "application/json"
            }
        });

        const text = response.text || "{}";
        const data = JSON.parse(text);
        return Object.entries(data).map(([name, units]) => ({ name, units: units as SyllabusUnit[] }));
    } catch (e) {
        console.error("Failed to extract syllabus from PDF:", e);
        throw new Error("Failed to read the PDF syllabus. Please ensure it's a valid NIE syllabus PDF.");
    }
}

export async function generatePackFromPDF(pdfBase64: string, grade: string, subject: string, unit: string, language: string): Promise<{ quiz: QuizQuestion[], flashcards: Flashcard[] }> {
    const prompt = `
    This is a PDF of the official Sri Lankan National Institute of Education (NIE) syllabus or a study material for Grade ${grade}, Subject: ${subject}.
    Language: Sinhala

    Please generate a comprehensive study pack for the unit: "${unit}".
    The pack should include:
    1. A quiz with 10 multiple-choice questions (MCQs).
    2. A set of 10 flashcards (term and definition).

    Return a JSON object with 'quiz' and 'flashcards' properties.
    
    Quiz Question Structure:
    { "question": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "..." }

    Flashcard Structure:
    { "front": "...", "back": "..." }
    `;

    try {
        const response = await executeWithKeyRotation(MODEL_COMPLEX, {
            contents: [
                {
                    inlineData: {
                        mimeType: "application/pdf",
                        data: pdfBase64
                    }
                },
                { text: prompt }
            ],
            config: {
                responseMimeType: "application/json"
            }
        });

        const text = response.text || "{}";
        const data = JSON.parse(text);
        return {
            quiz: (data.quiz || []) as QuizQuestion[],
            flashcards: (data.flashcards || []) as Flashcard[]
        };
    } catch (e) {
        console.error("Failed to generate pack from PDF:", e);
        throw new Error("Failed to generate study pack from the provided PDF.");
    }
}

async function fetchSyllabiWithAI(grade: string, subjects: string[], language: string): Promise<{name: string, units: SyllabusUnit[]}[]> {
    if (subjects.length === 0) return [];
    
    const prompt = `
    Find the official Sri Lankan National Institute of Education (NIE) syllabus for the following subjects in Grade ${grade}:
    Subjects: ${subjects.join(', ')}
    Language: Sinhala

    CRITICAL: You MUST find the exact units and topics as defined by the NIE Sri Lanka for the local curriculum. 
    Do not provide generic topics. Use your Google Search tool to verify the current NIE syllabus for each subject.
    
    Return a JSON object where keys are subject names and values are arrays of objects with ONLY a 'unit' property.
    Do NOT generate explanations. This is to ensure maximum speed.
    
    Example: 
    {
      "Science": [{"unit": "Unit 1: Plant life"}, {"unit": "Unit 2: Motion"}],
      "History": [{"unit": "Unit 1: Ancient Civilizations"}]
    }
    `;

    try {
        const response = await generateWithFallback(MODEL_FAST, MODEL_COMPLEX, {
            contents: prompt,
            config: {
                temperature: 0.1,
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json"
            }
        });

        const text = response.text || "{}";
        const data = JSON.parse(text);
        return Object.entries(data).map(([name, units]) => ({ name, units: units as SyllabusUnit[] }));
    } catch (e) {
        console.error("Failed to fetch AI syllabi:", e);
        return [];
    }
}

// --- HYBRID DB GENERATION (Firebase -> Local -> AI) ---
async function generateFromDB(
    subjects: Subject[],
    grade: string,
    examDateStr: string,
    language: Language,
    onProgress?: (p: number) => void,
    initialSyllabi: { name: string, units: SyllabusUnit[] }[] = []
): Promise<{ weeks: any[], tips: string[], isLocal: boolean } | null> {
    
    const relevantSyllabi: { name: string, units: SyllabusUnit[] }[] = [...initialSyllabi];
    const subjectsFoundInFirebase = new Set<string>(initialSyllabi.map(s => s.name));

    if (onProgress) onProgress(25);

    // 1. Try Fetching from Firebase Firestore for each subject
    if (db && relevantSyllabi.length < subjects.length) {
        const firestore = db;
        const safeGrade = createDocId(grade);
        const fetchPromises = subjects
            .filter(sub => !subjectsFoundInFirebase.has(sub.name))
            .map(async (sub) => {
            try {
                const normalizedName = normalizeSubject(sub.name);
                const safeSubject = createDocId(normalizedName);
                const docRef = doc(firestore, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'syllabus', 'main');
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.units && Array.isArray(data.units)) {
                        subjectsFoundInFirebase.add(sub.name);
                        relevantSyllabi.push({ name: sub.name, units: data.units as SyllabusUnit[] });
                    }
                }
            } catch (e) {
                handleFirestoreError(e, OperationType.GET, `languages/${language}/grades/${safeGrade}/subjects/.../syllabus/main`);
            }
        });

        await Promise.all(fetchPromises);
        
        if (subjectsFoundInFirebase.size > 0) {
             console.log(`✅ Fetched ${subjectsFoundInFirebase.size} syllabi from Firebase Firestore`);
        }
        if (onProgress) onProgress(40);
    }

    // 2. Fallback to Local DB for subjects NOT found in Firebase
    const localGradeData = SYLLABUS_DB[grade];
    if (localGradeData && subjects.length > subjectsFoundInFirebase.size) {
        console.log("ℹ️ Checking local DB for missing syllabi...");
        subjects.forEach(sub => {
            if (!subjectsFoundInFirebase.has(sub.name)) {
                const normalizedName = normalizeSubject(sub.name);
                if (localGradeData[normalizedName]) {
                    relevantSyllabi.push({ name: sub.name, units: localGradeData[normalizedName] });
                    console.log(` -> Found ${sub.name} in local fallback.`);
                }
            }
        });
        if (onProgress) onProgress(50);
    }

    // 3. Fallback to AI Search for any remaining missing subjects
    if (subjects.length > relevantSyllabi.length) {
        console.log("ℹ️ Fetching missing syllabi via AI Search (Batch Mode)...");
        
        const missingSubjectNames = subjects
            .filter(sub => !relevantSyllabi.find(s => s.name === sub.name))
            .map(sub => sub.name);
        
        if (missingSubjectNames.length > 0) {
            if (onProgress) onProgress(60);
            try {
                const aiResults = await fetchSyllabiWithAI(grade, missingSubjectNames, language);
                
                for (const res of aiResults) {
                    relevantSyllabi.push(res);
                    console.log(` -> AI successfully found ${res.units.length} units for ${res.name}.`);

                    // Cache to Firebase for future users
                    if (db) {
                        const safeGrade = createDocId(grade);
                        const safeSubject = createDocId(normalizeSubject(res.name));
                        const docRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'syllabus', 'main');
                        try {
                            await setDoc(docRef, { units: res.units, updatedAt: new Date().toISOString(), source: 'ai-search' });
                        } catch (e) {
                            try {
                                handleFirestoreError(e, OperationType.WRITE, docRef.path);
                            } catch (err) {
                                console.warn("Failed to cache syllabus (Permissions/Offline). Continuing...", err);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("AI Syllabus Search failed completely.", e);
                throw new Error("Failed to fetch accurate syllabus data from AI. Please check your internet connection or try again later.");
            }
        }
    }

    if (relevantSyllabi.length === 0) {
        console.warn("No syllabus data found in Firebase, Local DB, or via AI for selected subjects.");
        return null;
    }

    const today = new Date();
    const examDate = new Date(examDateStr);
    const diffTime = Math.abs(examDate.getTime() - today.getTime());
    const totalWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
    
    const weeks = [];
    let currentWeekStart = new Date();

    // Loop through available weeks
    for (let i = 1; i <= totalWeeks; i++) {
        const weekStart = new Date(currentWeekStart);
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        // Distribute units evenly across weeks
        const weeklyGoals: string[] = [];
        
        relevantSyllabi.forEach(syllabus => {
            let weekUnits: any[] = [];
            if (totalWeeks >= syllabus.units.length) {
                // More weeks than units. 1 unit per week until we run out.
                if (i - 1 < syllabus.units.length) {
                    weekUnits = [syllabus.units[i - 1]];
                }
            } else {
                // More units than weeks. Group units.
                const unitsPerWeek = syllabus.units.length / totalWeeks;
                const startIndex = Math.floor((i - 1) * unitsPerWeek);
                const endIndex = i === totalWeeks ? syllabus.units.length : Math.floor(i * unitsPerWeek);
                weekUnits = syllabus.units.slice(startIndex, endIndex);
            }

            if (weekUnits.length > 0) {
                const goalText = weekUnits.map(u => u.explanation ? `${u.unit} - ${u.explanation}` : u.unit).join(' & ');
                weeklyGoals.push(`${syllabus.name}: ${goalText}`);
            }
        });

        let phase = "Foundation";
        if (i > totalWeeks * 0.6) phase = "Consolidation";
        if (i > totalWeeks * 0.85) phase = "Final Revision";

        weeks.push({
            weekNumber: i,
            startDate: weekStart.toISOString().split('T')[0],
            endDate: weekEnd.toISOString().split('T')[0],
            phase: phase,
            goal: weeklyGoals.length > 0 ? weeklyGoals.join(" | ") : "Review & Practice",
            sessions: [] 
        });

        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }

    const tips = ["කෙටි විවේක ලබා ගනිමින් පාඩම් කරන්න.", "පසුගිය විභාග ප්‍රශ්න පත්‍ර සාකච්ඡා කරන්න."];

    return { weeks, tips, isLocal: true };
}


// --- AI GENERATION ---
// (Removed generateRoadmapBatch as it is no longer needed with the new AI Syllabus Fetching strategy)

// --- GLOBAL CACHE FUNCTIONS ---

const createPlanId = (grade: string, subjects: Subject[], examDate: string, language: string) => {
    const sortedSubjects = subjects.map(s => s.name).sort().join('_');
    return createDocId(grade, sortedSubjects, examDate, language);
};

async function getGlobalCachedPlan(grade: string, subjects: Subject[], examDate: string, language: string) {
    if (!db) return null;
    try {
        const planId = createPlanId(grade, subjects, examDate, language);
        const docRef = doc(db, 'study_plans', planId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            console.log("✅ Found global cached plan in Firestore!");
            return docSnap.data() as StudyPlan;
        }
    } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'study_plans');
    }
    return null;
}

async function saveGlobalCachedPlan(plan: StudyPlan, grade: string, subjects: Subject[], examDate: string, language: string) {
    if (!db) return;
    try {
        const planId = createPlanId(grade, subjects, examDate, language);
        const docRef = doc(db, 'study_plans', planId);
        await setDoc(docRef, {
            ...plan,
            createdAt: new Date().toISOString(),
            grade,
            subjects: subjects.map(s => s.name),
            language
        });
        console.log("💾 Saved plan to global Firestore cache.");
    } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'study_plans');
    }
}

export const generateStudyPlan = async (
  subjects: Subject[],
  hoursPerDay: number,
  focusArea: string,
  grade: string,
  language: Language,
  busySlots: BusySlot[] = [],
  routine: UserRoutine,
  restDay: string = 'None',
  onProgress?: (percent: number) => void
): Promise<StudyPlan> => {
  if (apiKeys.length === 0) throw new Error("API Key is missing");

  let currentProgress = 0;
  let progressTimer: any | null = null;

  const updateProgress = (val: number) => {
      currentProgress = val;
      if (onProgress) onProgress(val);
  };

  const smoothProgressTo = (target: number) => {
      if (progressTimer) clearInterval(progressTimer);
      progressTimer = setInterval(() => {
          if (currentProgress < target) {
              const increment = Math.random() > 0.7 ? 2 : 1;
              if (currentProgress + increment <= target) {
                  updateProgress(currentProgress + increment);
              }
          }
      }, 200);
  };

  const stopProgressSimulation = () => {
      if (progressTimer) clearInterval(progressTimer);
      progressTimer = null;
  };

  try {
      const cacheKey = getCacheKey({ subjects, hoursPerDay, focusArea, grade, language, routine });
      const cachedData = localStorage.getItem(cacheKey);
      if (cachedData) {
          stopProgressSimulation();
          updateProgress(100);
          const parsed = JSON.parse(cachedData);
          return { ...parsed, source: 'cache' };
      }

      updateProgress(5);
      smoothProgressTo(80);

      let relevantSyllabi: { name: string, units: SyllabusUnit[] }[] = [];

      // --- STRATEGY 1: CHECK GLOBAL FIRESTORE CACHE ---
      if (relevantSyllabi.length === 0) {
          const globalPlan = await getGlobalCachedPlan(grade, subjects, routine.examDate, language);
          if (globalPlan) {
              stopProgressSimulation();
              updateProgress(100);
              try { localStorage.setItem(cacheKey, JSON.stringify(globalPlan)); } catch (e) {}
              return { ...globalPlan, source: 'database' };
          }
      }

      // --- STRATEGY 2: TRY DATABASE (Firebase -> Local -> AI Search) ---
      let dbPlan = null;
      dbPlan = await generateFromDB(subjects, grade, routine.examDate, language, updateProgress, relevantSyllabi);
      
      if (!dbPlan) {
          throw new Error("Failed to generate study plan. Could not fetch syllabus data.");
      }

      // Generate first week sessions specifically to respect routine
      if (dbPlan.weeks.length > 0) {
          stopProgressSimulation();
          updateProgress(92);
          try {
              const firstWeekSessions = await generateWeeklySessions(
                  dbPlan.weeks[0],
                  subjects,
                  hoursPerDay,
                  grade,
                  language,
                  busySlots,
                  routine,
                  restDay
              );
              dbPlan.weeks[0].sessions = firstWeekSessions;
          } catch (e) {
              console.warn("Failed to generate initial week sessions", e);
          }
      }

      stopProgressSimulation();
      updateProgress(100);
      
      const plan: StudyPlan = {
          examDate: routine.examDate,
          weeks: dbPlan.weeks,
          tips: dbPlan.tips,
          sourceUrls: [],
          source: 'ai'
      };
      
      // NEW: Save to Global Firestore Cache
      await saveGlobalCachedPlan(plan, grade, subjects, routine.examDate, language);

      // Save to cache
      try { localStorage.setItem(cacheKey, JSON.stringify(plan)); } catch (e) {}
      return plan;
  } finally {
      stopProgressSimulation();
  }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Lazy load week details - Still uses Flash to be cheap
export const generateWeeklySessions = async (
    targetWeek: WeeklySchedule,
    subjects: Subject[],
    hoursPerDay: number,
    grade: string,
    language: Language,
    busySlots: BusySlot[],
    routine: UserRoutine,
    restDay: string
): Promise<any[]> => {
    if (apiKeys.length === 0) throw new Error("API Key is missing");

    // Add a small delay to prevent rate limiting when users click fast
    await sleep(500);

    const busySlotsStr = busySlots.map(b => `${b.day}: ${b.startTime}-${b.endTime}`).join(', ');
    const langContext = "Sinhala";

    const prompt = `
        Create DAILY SCHEDULE for **Week ${targetWeek.weekNumber}**.
        Grade: ${grade}
        Goal: ${targetWeek.goal}
        Date Range: ${targetWeek.startDate} to ${targetWeek.endDate}
        Hours/Day: ${hoursPerDay}
        Busy: ${busySlotsStr}
        Rest: ${restDay}
        School End: ${routine.schoolEndTime}
        Bed: ${routine.bedTime}
        
        **CRITICAL RULES:**
        1. Use Sri Lankan syllabus topics matching the Goal.
        2. Output JSON Array of sessions.
        3. **Day Names:** Use standard English or Sinhala day names.
        
        Language: ${langContext}.
    `;

    // Switched to MODEL_FAST (Flash)
    const response = await generateWithFallback(MODEL_FAST, MODEL_COMPLEX, {
        contents: prompt,
        config: {
            temperature: 0.2,
            // Disabled search to save time/cost
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                      day: { type: Type.STRING },
                      subject: { type: Type.STRING },
                      topic: { type: Type.STRING },
                      technique: { type: Type.STRING },
                      durationMinutes: { type: Type.NUMBER },
                      startTime: { type: Type.STRING }
                    },
                    required: ["day", "subject", "topic", "durationMinutes", "startTime"]
                }
            }
        }
    });

    const text = response.text;
    if (!text) throw new Error("No response");
    return JSON.parse(text.trim());
}


export const generateQuiz = async (
  subject: string, 
  topic: string, 
  subTopic: string, 
  questionCount: number,
  difficulty: string, 
  grade: string, 
  language: Language
): Promise<QuizQuestion[]> => {
  if (apiKeys.length === 0) throw new Error("API Key is missing");

  const safeGrade = createDocId(grade);
  const safeSubject = createDocId(subject);
  const safeTopic = topic || 'general';
  const docId = createDocId(safeTopic, difficulty, language);

  // 1. Try to fetch from DB first (Save Credits)
  if (db) {
    const docRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'quizzes', docId);
    try {
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            console.log(`✅ Quiz fetched from Firebase: ${docRef.path}`);
            return docSnap.data().questions as QuizQuestion[];
        }
    } catch (e) {
        handleFirestoreError(e, OperationType.GET, docRef.path);
    }
  }
  
  // 2. Fallback to AI Generation
  console.log("Creating new Quiz via AI...");
  const prompt = `
    You are an expert teacher for the Sri Lankan National Syllabus.
    Generate ${questionCount} Multiple Choice Questions (MCQs) for:
    Grade: ${grade}
    Subject: ${subject}
    Topic: ${topic} ${subTopic ? '- ' + subTopic : ''}
    Language: Sinhala
    Difficulty: ${difficulty}
    
    CRITICAL INSTRUCTIONS TO PREVENT ERRORS:
    1. NEVER invent or hallucinate facts. All questions and answers MUST be 100% factually accurate.
    2. Ensure questions are highly relevant to the Sri Lankan local curriculum (NIE - nie.lk).
    3. If the exact local syllabus detail is unknown, use universally accepted, accurate core concepts for this grade level.
    4. Output JSON only.
  `;

  const response = await generateWithFallback(MODEL_FAST, MODEL_COMPLEX, {
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
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
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  const questions = JSON.parse(text.trim()) as QuizQuestion[];

  // 3. Save to DB for next time
  if (db && questions.length > 0) {
    const docRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'quizzes', docId);
    try {
        await setDoc(docRef, { 
            questions,
            grade,
            subject,
            unit: safeTopic,
            difficulty,
            language,
            createdAt: new Date().toISOString() 
        });
        console.log(`💾 Quiz saved to Firebase: ${docRef.path}`);
    } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, docRef.path);
    }
  }

  return questions;
};

export const getStudyAdvice = async (query: string, language: Language): Promise<string> => {
  // Use Pro for advice/tutoring as it requires better reasoning and subject knowledge
  const context = "Answer in Sinhala. Use accurate terminology.";
  
  const prompt = `
    You are a helpful and knowledgeable academic tutor and study coach for a student in Sri Lanka. 
    The student asks: "${query}"
    
    Instructions:
    1. If this is a question about a specific school subject (Maths, Science, History, etc.) or a concept (e.g. "Explain photosynthesis", "Solve this equation"), provide a clear, accurate, and easy-to-understand explanation suitable for a student.
    2. If this is a question about study methods, stress management, or exams, provide practical and encouraging advice.
    3. Keep the tone friendly and supportive.
    4. ${context}
    5. Keep the response concise (under 200 words) but complete.
  `;

  const response = await generateWithFallback(MODEL_COMPLEX, MODEL_FAST, {
    contents: prompt,
    config: {
      temperature: 0.4,
    }
  });
  return response.text || "Error";
};

export const generateFlashcards = async (
    subject: string, 
    topic: string, 
    count: number, 
    grade: string, 
    language: Language
): Promise<Flashcard[]> => {
    if (apiKeys.length === 0) throw new Error("API Key is missing");
    
    const safeGrade = createDocId(grade);
    const safeSubject = createDocId(subject);
    const docId = createDocId(topic, language);

    // 1. Try to fetch from DB first
    if (db) {
        const docRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'flashcards', docId);
        try {
            const docSnap = await getDoc(docRef);
    
            if (docSnap.exists()) {
                console.log(`✅ Flashcards fetched from Firebase: ${docRef.path}`);
                return docSnap.data().cards as Flashcard[];
            }
        } catch (e) {
            handleFirestoreError(e, OperationType.GET, docRef.path);
        }
      }

    // 2. Fallback to AI
    console.log("Creating new Flashcards via AI...");
    const prompt = `
      You are an expert teacher for the Sri Lankan National Syllabus.
      Generate ${count} flashcards for:
      Grade: ${grade}
      Subject: ${subject}
      Topic: ${topic}
      Language: Sinhala
      
      CRITICAL INSTRUCTIONS TO PREVENT ERRORS:
      1. NEVER invent or hallucinate facts. All definitions MUST be 100% factually accurate.
      2. Ensure the content is highly relevant to the Sri Lankan local curriculum (NIE - nie.lk).
      3. If the exact local syllabus detail is unknown, use universally accepted, accurate core concepts for this grade level.
      4. Output JSON only.
    `;

    const response = await generateWithFallback(MODEL_FAST, MODEL_COMPLEX, {
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { front: { type: Type.STRING }, back: { type: Type.STRING } },
            required: ["front", "back"]
          }
        }
      }
    });
    const text = response.text;
    if (!text) throw new Error("No response");
    const cards = JSON.parse(text.trim()) as Flashcard[];

    // 3. Save to DB
    if (db && cards.length > 0) {
        const docRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'flashcards', docId);
        try {
            await setDoc(docRef, { 
                cards, 
                grade,
                subject,
                unit: topic,
                language,
                createdAt: new Date().toISOString() 
            });
            console.log(`💾 Flashcards saved to Firebase: ${docRef.path}`);
        } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, docRef.path);
        }
    }

    return cards;
};

// --- NEW ADMIN AUTO-GENERATION FUNCTIONS ---

// 1. Fetch List of Units for a Subject
export const generateSyllabusList = async (grade: string, subject: string, language: Language): Promise<string[]> => {
    const prompt = `
      You are an expert curriculum developer for the National Institute of Education (NIE) in Sri Lanka.
      Your task is to list the exact syllabus units for:
      Grade: ${grade}
      Subject: ${subject}
      Country: Sri Lanka (NIE Syllabus - nie.lk)
      Language: Sinhala
      
      CRITICAL INSTRUCTIONS:
      1. Provide the exact, official unit names as per the Sri Lankan local syllabus (National Institute of Education).
      2. Do not invent units. If you are unsure, provide the most standard topics for this grade and subject in Sri Lanka.
      3. Return a JSON String Array ONLY. Do not include any markdown formatting.
      
      Example Output: ["Unit 1: Motion", "Unit 2: Force"]
    `;
    
    const response = await generateWithFallback(MODEL_FAST, MODEL_COMPLEX, {
        contents: prompt,
        config: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
        }
    });
    
    return JSON.parse(response.text?.trim() || "[]");
};

// 2. Generate Content for a Specific Unit
export const generateFullUnitPack = async (grade: string, subject: string, unit: string, language: Language) => {
    const prompt = `
      You are an expert curriculum developer and teacher for the National Institute of Education (NIE) in Sri Lanka.
      Create a comprehensive Study Pack for:
      Grade: ${grade}
      Subject: ${subject}
      Unit: ${unit}
      Language: Sinhala
      
      Tasks:
      1. Create 10 Multiple Choice Questions (Medium to Hard difficulty) that test deep understanding of the unit.
      2. Create 10 Flashcards (Key Concept on Front, Clear Definition/Explanation on Back).
      
      CRITICAL INSTRUCTIONS:
      - Ensure all content is strictly relevant to the Sri Lankan local syllabus for the specified grade and unit.
      - Use accurate terminology in the requested language.
      - Return JSON only. Be concise in explanations to ensure the response is not truncated.
    `;
    
    const response = await generateWithFallback(MODEL_COMPLEX, MODEL_FAST, {
        contents: prompt,
        config: {
            temperature: 0.2,
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
    
    const rawText = response.text?.trim();
    if (!rawText) {
      throw new Error("AI returned an empty response for the study pack.");
    }

    try {
      return JSON.parse(rawText);
    } catch(e: any) {
      console.error("--- GEMINI JSON PARSE FAILED ---");
      console.error("RAW RESPONSE:", rawText);
      console.error("ERROR:", e);
      throw new Error(`Failed to parse study pack from AI. The response might be incomplete or malformed. Error: ${e.message}`);
    }
};
