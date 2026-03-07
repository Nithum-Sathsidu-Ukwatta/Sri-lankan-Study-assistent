
import { GoogleGenAI, Type } from "@google/genai";
import { Subject, StudyPlan, QuizQuestion, Language, BusySlot, UserRoutine, WeeklySchedule, Flashcard } from '../types';
import { SYLLABUS_DB, normalizeSubject, SyllabusUnit, GradeSyllabus } from '../data/syllabusDatabase';
import { db } from './firebase';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, increment } from 'firebase/firestore';
import Tesseract from 'tesseract.js';

const apiKeys = [
  process.env.GEMINI_API_KEY,
  process.env.API_KEY,
  import.meta.env?.VITE_GEMINI_API_KEY
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
const MODEL_COMPLEX = "gemini-2.5-flash";
// Switched the 'Fast' model to be the primary for standard tasks to save money
const MODEL_FAST = "gemini-2.5-flash"; 

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
        console.error("Usage increment failed", e);
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
        const limit = actionType === 'camera_solve' ? 10 : 50; // Free tier limits
        
        return count < limit;
    } catch (e) {
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
            model: "gemini-2.5-flash",
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
        const cachedSnap = await getDoc(cachedRef);
        if (cachedSnap.exists()) {
            await incrementUsage(userId, 'camera_solve_cache');
            return cachedSnap.data();
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
        - Language: ${language === 'si' ? 'Sinhala' : 'English'}

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
        model: "gemini-2.5-flash",
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
        model: "gemini-2.5-flash",
        contents: verifyPrompt,
        config: { responseMimeType: "application/json" }
    });
    const verifyJson = JSON.parse(verifyResp.text || "{}");

    answerJson.verified = verifyJson.verified;
    answerJson.confidence = verifyJson.confidence;

    // 7. Routing & Storage
    if (db) {
        if (!answerJson.verified || ocrConfidence < 0.70) {
            await addDoc(collection(db, 'verification_queue'), {
                question: text,
                answer: answerJson,
                ocr_conf: ocrConfidence,
                ver_conf: verifyJson.confidence,
                status: 'pending',
                createdAt: serverTimestamp()
            });
        }

        await setDoc(doc(db, 'cached_answers', textHash), answerJson);
        await incrementUsage(userId, 'camera_solve');
    }

    return answerJson;
};

async function executeWithKeyRotation(model: string, params: any) {
    let lastError;
    const maxAttempts = Math.max(1, apiKeys.length);
    
    for (let i = 0; i < maxAttempts; i++) {
        const ai = getNextAiClient();
        try {
            return await ai.models.generateContent({
                ...params,
                model: model,
            });
        } catch (error: any) {
            lastError = error;
            const isQuotaError = 
                error.message?.includes('429') || 
                error.status === 429 ||
                error.status === 503;
                
            if (isQuotaError && apiKeys.length > 1) {
                console.warn(`⚠️ Key hit quota limit (429/503). Rotating to next key...`);
                continue;
            }
            throw error; // If it's not a quota error, throw immediately
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

// --- HYBRID DB GENERATION (Firebase -> Local -> AI) ---
async function generateFromDB(
    subjects: Subject[],
    grade: string,
    examDateStr: string,
    language: Language
): Promise<{ weeks: any[], tips: string[], isLocal: boolean } | null> {
    
    const relevantSyllabi: { name: string, units: SyllabusUnit[] }[] = [];
    const subjectsFoundInFirebase = new Set<string>();

    // 1. Try Fetching from Firebase Firestore for each subject
    if (db) {
        const firestore = db;
        const safeGrade = createDocId(grade);
        const fetchPromises = subjects.map(async (sub) => {
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
                console.warn(`Firebase fetch for ${sub.name} failed.`, e);
            }
        });

        await Promise.all(fetchPromises);
        
        if (subjectsFoundInFirebase.size > 0) {
             console.log(`✅ Fetched ${subjectsFoundInFirebase.size} syllabi from Firebase Firestore`);
        }
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
    }

    if (relevantSyllabi.length === 0) {
        console.warn("No syllabus data found in Firebase or Local DB for selected subjects.");
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

        // Round-robin assign units
        const weeklyGoals: string[] = [];
        
        relevantSyllabi.forEach(syllabus => {
            const unitIndex = Math.floor(((i - 1) / totalWeeks) * syllabus.units.length);
            if (syllabus.units[unitIndex]) {
                const u = syllabus.units[unitIndex];
                const goalText = u.explanation 
                    ? `${u.unit} - ${u.explanation}`
                    : u.unit;
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

    const tips = language === 'si' 
        ? ["කෙටි විවේක ලබා ගනිමින් පාඩම් කරන්න.", "පසුගිය විභාග ප්‍රශ්න පත්‍ර සාකච්ඡා කරන්න."]
        : ["Take short breaks using Pomodoro.", "Practice past papers regularly."];

    return { weeks, tips, isLocal: true };
}


// --- AI GENERATION ---
async function generateRoadmapBatch(
    startWeekNumber: number,
    startDateStr: string,
    endDateStr: string,
    isFirstBatch: boolean,
    params: {
        grade: string,
        subjectsStr: string,
        restDay: string,
        examContextInstruction: string,
        langContext: string,
        currentFormattedDate: string,
        examDate: string
    }
): Promise<any> {
    const prompt = `
    You are an expert curriculum developer for the National Institute of Education (NIE) in Sri Lanka. 
    Task: Create a **PARTIAL ROADMAP** (${startDateStr} to ${endDateStr}).
    Part ${isFirstBatch ? '1' : '2'} of plan.
    
    Context:
    - Grade: ${params.grade}
    - Subjects: ${params.subjectsStr}
    - Language: ${params.langContext}
    
    **CRITICAL RULES:**
    1. Do NOT invent or guess units. Use the exact Sri Lankan local syllabus.
    2. Use your search tool to find the official NIE (National Institute of Education Sri Lanka - nie.lk) syllabus for the specified grade and subjects to ensure the topics and their sequence are 100% accurate. Base the roadmap STRICTLY on the official curriculum.
    
    ${params.examContextInstruction}

    Strict Rules:
    1. **Accuracy:** Use search results for the syllabus. Do not guess.
    2. **Sequence:** Follow the official textbook/syllabus order precisely.
    3. **Start:** Begin at Week ${startWeekNumber}.
    4. **Goal Format:** The 'goal' field MUST be formatted as "Subject: Topic | Subject: Topic". Example: "History: Unit 1 - Kings | Science: Unit 1 - Plants".
    
    **TOKEN SAVING:**
    1. Output JSON only. No explanations.
    2. ALL weeks must have an empty 'sessions' array ([]). We will generate detailed sessions later.
    
    Output JSON: { "weeks": [{ "weekNumber": int, "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "phase": "string", "goal": "string", "sessions": [] }], "tips": ["string"] }
  `;

    // CHANGED: Use Pro model primarily for higher accuracy, with search enabled.
    const response = await generateWithFallback(MODEL_COMPLEX, MODEL_FAST, {
        contents: prompt,
        config: {
            temperature: 0.2,
            // tools: [{googleSearch: {}}], // Removed to fix JSON mime type error
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    weeks: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                weekNumber: { type: Type.INTEGER },
                                startDate: { type: Type.STRING },
                                endDate: { type: Type.STRING },
                                phase: { type: Type.STRING },
                                goal: { type: Type.STRING },
                                sessions: {
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
                                        required: ["day", "subject", "topic"]
                                    }
                                }
                            },
                            required: ["weekNumber", "startDate", "endDate", "phase", "goal", "sessions"]
                        }
                    },
                    tips: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
            }
        }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const data = JSON.parse(text.trim());

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sourceUrls = groundingChunks
        .map((chunk: any) => chunk.web?.uri)
        .filter((uri: string | undefined): uri is string => !!uri);

    return {
        weeks: data.weeks,
        tips: data.tips,
        sourceUrls: [...new Set(sourceUrls)]
    };
}

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
        console.warn("Global cache fetch failed", e);
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
        console.warn("Global cache save failed", e);
    }
}

// --- SYLLABUS EXTRACTION & AUTO-SAVE ---
async function extractAndSaveSyllabus(
    weeks: any[], 
    grade: string, 
    language: string,
    allSubjects: Subject[]
) {
    if (!db) return;
    
    const extractedSyllabi: Record<string, Set<string>> = {};
    
    // Initialize sets
    allSubjects.forEach(s => extractedSyllabi[s.name] = new Set());

    weeks.forEach(week => {
        if (!week.goal) return;
        // Expected format: "History: Unit 1 | Science: Unit 2"
        const parts = week.goal.split('|');
        parts.forEach((part: string) => {
            const colonIndex = part.indexOf(':');
            if (colonIndex > -1) {
                const subjectName = part.substring(0, colonIndex).trim();
                const topic = part.substring(colonIndex + 1).trim();
                
                // Fuzzy match subject
                const matchedSubject = allSubjects.find(s => 
                    s.name.toLowerCase() === subjectName.toLowerCase() ||
                    subjectName.toLowerCase().includes(s.name.toLowerCase())
                );

                if (matchedSubject) {
                    extractedSyllabi[matchedSubject.name].add(topic);
                }
            }
        });
    });

    const safeGrade = createDocId(grade);
    
    for (const subject of allSubjects) {
        const topics = Array.from(extractedSyllabi[subject.name] || []);
        if (topics.length > 0) {
            const safeSubject = createDocId(normalizeSubject(subject.name));
            const docRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'syllabus', 'main');
            
            try {
                // Only save if it doesn't exist to prevent overwriting full syllabi with partials
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) {
                     const units = topics.map(t => ({ unit: t }));
                     await setDoc(docRef, { units, updatedAt: new Date().toISOString(), source: 'auto-extracted' });
                     console.log(`💾 Auto-saved extracted syllabus for ${subject.name}`);
                }
            } catch (e) {
                console.warn("Auto-save syllabus failed", e);
            }
        }
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
          return JSON.parse(cachedData);
      }

      updateProgress(5);
      smoothProgressTo(20);

      // --- STRATEGY 0: CHECK GLOBAL FIRESTORE CACHE (New Feature) ---
      // Especially important for Grade 9+ as requested, but applied generally for efficiency
      const globalPlan = await getGlobalCachedPlan(grade, subjects, routine.examDate, language);
      if (globalPlan) {
          stopProgressSimulation();
          updateProgress(100);
          // Save to local cache for faster next load
          try { localStorage.setItem(cacheKey, JSON.stringify(globalPlan)); } catch (e) {}
          return globalPlan;
      }

      // --- STRATEGY 1: TRY DATABASE (Firebase -> Local) (0 Credits) ---
      // const dbPlan = await generateFromDB(subjects, grade, routine.examDate, language);
      const dbPlan: { weeks: any[], tips: string[], isLocal: boolean } | null = null; // Force AI generation as requested by user
      
      if (dbPlan !== null) {
        stopProgressSimulation();
        updateProgress(100);
        
        const plan: StudyPlan = {
            examDate: routine.examDate,
            weeks: (dbPlan as { weeks: any[], tips: string[], isLocal: boolean }).weeks,
            tips: (dbPlan as { weeks: any[], tips: string[], isLocal: boolean }).tips,
            sourceUrls: []
        };
        
        // Save to cache
        try { localStorage.setItem(cacheKey, JSON.stringify(plan)); } catch (e) {}
        return plan;
      }

      // --- STRATEGY 2: AI FALLBACK (Use Pro Model w/ Search) ---
      console.log("DB miss. Using AI (Pro Model w/ Search)...");
      
      const subjectsStr = subjects.map(s => `${s.name} (${s.difficulty})`).join(', ');
      
      const langContext = language === 'si' 
        ? "Sinhala language. Use Sinhala terms." 
        : "English language.";

      const today = new Date();
      const exam = new Date(routine.examDate);
      const diffTime = Math.abs(exam.getTime() - today.getTime());
      const daysUntilExam = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const currentFormattedDate = today.toISOString().split('T')[0];

      let examContextInstruction = `Target: Grade ${grade}`;

      // Context analysis done
      stopProgressSimulation();
      updateProgress(25);

      const batchParams = {
          grade,
          subjectsStr,
          restDay,
          examContextInstruction,
          langContext,
          currentFormattedDate,
          examDate: routine.examDate
      };

      let mergedWeeks: any[] = [];
      let mergedTips: string[] = [];
      let mergedSourceUrls: string[] = [];

      if (daysUntilExam > 140) { 
          // Split into batches to avoid output token limits
          const midTime = today.getTime() + (diffTime / 2);
          const midDateStr = new Date(midTime).toISOString().split('T')[0];
          const weeksInFirstBatch = Math.ceil((midTime - today.getTime()) / (1000 * 60 * 60 * 24 * 7));

          smoothProgressTo(55);
          const batch1 = await generateRoadmapBatch(1, currentFormattedDate, midDateStr, true, batchParams);
          
          stopProgressSimulation();
          updateProgress(60);
          mergedWeeks = [...batch1.weeks];
          mergedTips = [...batch1.tips];
          mergedSourceUrls = [...new Set([...mergedSourceUrls, ...(batch1.sourceUrls || [])])];

          smoothProgressTo(65);
          await new Promise(resolve => setTimeout(resolve, 1000));

          smoothProgressTo(90);
          const lastWeekNum = batch1.weeks[batch1.weeks.length - 1]?.weekNumber || weeksInFirstBatch;
          const batch2 = await generateRoadmapBatch(lastWeekNum + 1, midDateStr, routine.examDate, false, batchParams);
          
          stopProgressSimulation();
          updateProgress(95);
          mergedWeeks = [...mergedWeeks, ...batch2.weeks];
          mergedSourceUrls = [...new Set([...mergedSourceUrls, ...(batch2.sourceUrls || [])])];

      } else {
          smoothProgressTo(85); 
          const batch = await generateRoadmapBatch(1, currentFormattedDate, routine.examDate, true, batchParams);
          stopProgressSimulation();
          updateProgress(90);
          mergedWeeks = batch.weeks;
          mergedTips = batch.tips;
          mergedSourceUrls = [...new Set([...mergedSourceUrls, ...(batch.sourceUrls || [])])];
      }

      // Generate first week sessions specifically to respect routine
      if (mergedWeeks.length > 0) {
          stopProgressSimulation();
          updateProgress(92);
          try {
              const firstWeekSessions = await generateWeeklySessions(
                  mergedWeeks[0],
                  subjects,
                  hoursPerDay,
                  grade,
                  language,
                  busySlots,
                  routine,
                  restDay
              );
              mergedWeeks[0].sessions = firstWeekSessions;
          } catch (e) {
              console.warn("Failed to generate initial week sessions", e);
          }
      }

      const plan: StudyPlan = {
        examDate: routine.examDate,
        weeks: mergedWeeks,
        tips: mergedTips,
        sourceUrls: mergedSourceUrls,
      };

      // NEW: Save to Global Firestore Cache
      await saveGlobalCachedPlan(plan, grade, subjects, routine.examDate, language);

      // NEW: Extract and Save Syllabus Units for future "Strategy 1" usage
      await extractAndSaveSyllabus(mergedWeeks, grade, language, subjects);

      try {
        localStorage.setItem(cacheKey, JSON.stringify(plan));
      } catch (e) {
        console.warn("Cache full");
      }

      updateProgress(100);
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
    await sleep(1000);

    const busySlotsStr = busySlots.map(b => `${b.day}: ${b.startTime}-${b.endTime}`).join(', ');
    const langContext = language === 'si' ? "Sinhala" : "English";

    const prompt = `
        You are an expert curriculum developer for the National Institute of Education (NIE) in Sri Lanka.
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
        1. Do NOT invent or guess topics. Use the exact Sri Lankan local syllabus topics that align with the Goal.
        2. Output JSON Array of sessions.
        3. **Day Names:** Use standard English day names (Monday, Tuesday, etc.) or standard Sinhala day names (සඳුදා, අඟහරුවාදා, etc.) exactly as they appear in a calendar.
        
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
    try {
        const docRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'quizzes', docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            console.log(`✅ Quiz fetched from Firebase: ${docRef.path}`);
            return docSnap.data().questions as QuizQuestion[];
        }
    } catch (e) {
        console.warn("Quiz fetch error", e);
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
    Language: ${language === 'si' ? 'Sinhala' : 'English'}
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
    try {
        const docRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'quizzes', docId);
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
        console.warn("Failed to save quiz", e);
    }
  }

  return questions;
};

export const getStudyAdvice = async (query: string, language: Language): Promise<string> => {
  // Use Pro for advice/tutoring as it requires better reasoning and subject knowledge
  const context = language === 'si' ? "Answer in Sinhala. Use accurate terminology." : "Answer in English.";
  
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
        try {
            const docRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'flashcards', docId);
            const docSnap = await getDoc(docRef);
    
            if (docSnap.exists()) {
                console.log(`✅ Flashcards fetched from Firebase: ${docRef.path}`);
                return docSnap.data().cards as Flashcard[];
            }
        } catch (e) {
            console.warn("Flashcard fetch error", e);
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
      Language: ${language === 'si' ? 'Sinhala' : 'English'}
      
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
        try {
            const docRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'flashcards', docId);
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
            console.warn("Failed to save flashcards", e);
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
      Language: ${language === 'si' ? 'Sinhala' : 'English'}
      
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
      Language: ${language === 'si' ? 'Sinhala' : 'English'}
      
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
