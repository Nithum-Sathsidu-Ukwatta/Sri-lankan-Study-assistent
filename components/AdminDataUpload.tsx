import React, { useState, useEffect } from 'react';
import { db, auth } from '../services/firebase';
import { doc, writeBatch, setDoc, collection, addDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { handleFirestoreError, OperationType } from '../services/firestoreUtils';
import { Button } from './ui/Button';
import { Upload, FileJson, CheckCircle, AlertCircle, Database, FileText, Sparkles, Loader2, List, Activity, Wifi, LogIn, User as UserIcon } from 'lucide-react';
import { createDocId, generateSyllabusList, generateFullUnitPack, extractSyllabusFromPDF, generatePackFromPDF } from '../services/geminiService';
import { Language } from '../types';
import { SYLLABUS_DB, normalizeSubject } from '../data/syllabusDatabase';

export const AdminDataUpload: React.FC = () => {
    const [mode, setMode] = useState<'manual' | 'auto' | 'pdf'>('manual');
    const [useServiceAccount, setUseServiceAccount] = useState(false);
    const [uploadType, setUploadType] = useState<'syllabus' | 'pack'>('pack');
    const [grade, setGrade] = useState('10 ශ්‍රේණිය (Grade 10)');
    const [language, setLanguage] = useState<Language>('si');
    const [subject, setSubject] = useState('');
    const [isCustomSubject, setIsCustomSubject] = useState(false);
    const [mergeSyllabus, setMergeSyllabus] = useState(true);
    
    // Manual State
    const [jsonContent, setJsonContent] = useState<string>('');
    const [isUploading, setIsUploading] = useState(false);
    
    // PDF State
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [pdfBase64, setPdfBase64] = useState<string>('');
    
    // Auto State
    const [units, setUnits] = useState<string[]>([]);
    const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
    const [isFetchingUnits, setIsFetchingUnits] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [genProgress, setGenProgress] = useState(0);

    const [logs, setLogs] = useState<string[]>([]);
    const [user, setUser] = useState<User | null>(null);
    const [adminInitialized, setAdminInitialized] = useState<boolean | null>(null);

    useEffect(() => {
        const checkAdminStatus = async () => {
            try {
                const res = await fetch('/api/admin/status');
                const data = await res.json();
                setAdminInitialized(data.initialized);
                if (data.initialized) {
                    setUseServiceAccount(true);
                    addLog("🚀 Service Account detected and auto-enabled.");
                } else {
                    addLog("⚠️ Service Account not configured on server. Using Client SDK.");
                }
            } catch (e) {
                console.warn("Could not check admin status");
                setAdminInitialized(false);
            }
        };
        checkAdminStatus();

        if (!auth) return;
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            setUser(u);
            if (u) {
                addLog(`👤 Logged in as: ${u.email} (${u.emailVerified ? 'Verified' : 'Unverified'})`);
                console.log("Auth User:", u);
            } else {
                addLog("👤 Not logged in. Please sign in to perform admin actions.");
            }
        });
        return () => unsubscribe();
    }, []);

    const handleLogin = async () => {
        if (!auth) return;
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (e: any) {
            addLog(`❌ Login Error: ${e.message}`);
        }
    };

    const grades = [
        "6 ශ්‍රේණිය (Grade 6)",
        "7 ශ්‍රේණිය (Grade 7)",
        "8 ශ්‍රේණිය (Grade 8)",
        "9 ශ්‍රේණිය (Grade 9)",
        "10 ශ්‍රේණිය (Grade 10)",
        "11 ශ්‍රේණිය (Grade 11)",
        "12 ශ්‍රේණිය (Grade 12)",
        "13 ශ්‍රේණිය (Grade 13)"
    ];

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const adminSetDoc = async (docRef: any, data: any) => {
        if (useServiceAccount) {
            addLog(`📡 Sending to Service Account: ${docRef.path}`);
            try {
                const response = await fetch('/api/admin/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'set',
                        path: docRef.path,
                        data
                    })
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Server-side upload failed');
                }
                return result;
            } catch (e: any) {
                addLog(`❌ Service Account Error: ${e.message}`);
                throw e;
            }
        } else {
            addLog(`🌐 Writing via Client SDK: ${docRef.path}`);
            try {
                return await setDoc(docRef, data);
            } catch (e: any) {
                if (e.message.includes("permissions") || e.code === "permission-denied") {
                    addLog("⚠️ Permission Denied. Try enabling 'Service Account Mode' if configured.");
                }
                throw e;
            }
        }
    };

    // --- CONNECTION TESTER ---
    const handleTestConnection = async () => {
        if (!db) {
            addLog("❌ Error: Firestore instance is null. Check services/firebase.ts");
            return;
        }

        setIsUploading(true);
        addLog("🔄 Testing Firestore Connection...");

        try {
            // 1. Test Write
            const testCol = collection(db, '_connection_test');
            const docRef = await addDoc(testCol, {
                timestamp: new Date().toISOString(),
                test: true,
                platform: 'web'
            });
            addLog(`✅ Write Success: Created Doc ID ${docRef.id}`);

            // 2. Test Delete (Cleanup)
            await deleteDoc(docRef);
            addLog("✅ Delete Success: Cleaned up test document.");
            
            addLog("🎉 FIRESTORE IS WORKING PERFECTLY!");

        } catch (e: any) {
            console.error(e);
            addLog(`❌ CONNECTION FAILED: ${e.code || e.message}`);
            if (e.message.includes("offline")) addLog("👉 Check your internet connection.");
            if (e.message.includes("permission") || e.code === "permission-denied") addLog("👉 Check Firestore Security Rules in Firebase Console.");
            handleFirestoreError(e, OperationType.WRITE, '_connection_test');
        } finally {
            setIsUploading(false);
        }
    };

    // --- MANUAL HANDLERS ---
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                setJsonContent(event.target.result as string);
                setLogs(prev => [...prev, `File loaded: ${file.name}`]);
            }
        };
        reader.readAsText(file);
    };

    const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPdfFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                setPdfBase64(base64String.split(',')[1]); // Remove data:application/pdf;base64,
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePdfProcess = async () => {
        if (!db) {
            addLog("❌ Error: Firestore not initialized.");
            return;
        }
        if (!pdfBase64) {
            addLog("❌ No PDF file selected.");
            return;
        }

        setIsUploading(true);
        addLog(`🔄 Processing PDF for ${uploadType === 'syllabus' ? 'Syllabus Extraction' : 'Study Pack Generation'}...`);

        try {
            if (uploadType === 'syllabus') {
                const results = await extractSyllabusFromPDF(pdfBase64, grade, language);
                addLog(`✅ Extracted ${results.length} subjects from PDF.`);
                
                for (const sub of results) {
                    const finalSubjectName = subject ? subject : sub.name;
                    const safeSubject = createDocId(normalizeSubject(finalSubjectName));
                    const safeGrade = createDocId(grade);
                    const syllabusRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'syllabus', 'main');
                    
                    let finalUnits = sub.units;
                    if (mergeSyllabus) {
                        try {
                            const existingDoc = await getDoc(syllabusRef);
                            if (existingDoc.exists()) {
                                const existingData = existingDoc.data();
                                const existingUnits = existingData.units || [];
                                
                                // Merge by unit name to avoid duplicates
                                const unitMap = new Map();
                                existingUnits.forEach((u: any) => unitMap.set(u.unit, u));
                                sub.units.forEach((u: any) => unitMap.set(u.unit, u));
                                
                                finalUnits = Array.from(unitMap.values());
                                addLog(` -> Merged ${sub.units.length} new units with ${existingUnits.length} existing units for ${finalSubjectName}.`);
                            }
                        } catch (e: any) {
                            addLog(` ⚠️ Could not fetch existing syllabus for merging: ${e.message}`);
                        }
                    }

                    await adminSetDoc(syllabusRef, {
                        units: finalUnits,
                        grade: grade,
                        subject: finalSubjectName,
                        language: language,
                        updatedAt: new Date().toISOString(),
                        source: 'pdf_syllabus_extract'
                    });
                    addLog(` ✅ Saved Syllabus: ${syllabusRef.path}`);
                }
            } else {
                if (!subject) {
                    addLog("❌ Please enter a subject name for the study pack.");
                    setIsUploading(false);
                    return;
                }
                
                addLog(`ℹ️ Generating study packs for ${subject} from PDF...`);
                // First, we need to know what units are in this PDF.
                // We'll ask AI to extract units first, then generate packs for each.
                const syllabus = await extractSyllabusFromPDF(pdfBase64, grade, language);
                const targetSubject = syllabus.find((s: any) => normalizeSubject(s.name) === normalizeSubject(subject)) || syllabus[0];
                
                if (!targetSubject) {
                    addLog(`❌ Could not find subject ${subject} in the PDF.`);
                    setIsUploading(false);
                    return;
                }

                addLog(`✅ Found ${targetSubject.units.length} units for ${targetSubject.name}.`);
                
                for (let i = 0; i < targetSubject.units.length; i++) {
                    const unit = targetSubject.units[i];
                    addLog(`🔄 Generating Pack ${i+1}/${targetSubject.units.length}: ${unit.unit}...`);
                    
                    const pack = await generatePackFromPDF(pdfBase64, grade, targetSubject.name, unit.unit, language);
                    
                    const safeGrade = createDocId(grade);
                    const safeSubject = createDocId(normalizeSubject(targetSubject.name));
                    const safeUnitName = unit.unit.split(':')[0].trim();

                    // Save Quiz
                    if (pack.quiz.length > 0) {
                        const quizId = createDocId(safeUnitName, 'medium', language);
                        const quizRef = doc(db!, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'quizzes', quizId);
                        try {
                            await adminSetDoc(quizRef, {
                                questions: pack.quiz,
                                grade: grade,
                                subject: targetSubject.name,
                                unit: safeUnitName,
                                language: language,
                                createdAt: new Date().toISOString(),
                                source: 'pdf_auto_gen'
                            });
                            addLog(` -> Saved Quiz: ${quizRef.path}`);
                        } catch (err: any) {
                            console.error(`Error saving quiz at ${quizRef.path}:`, err);
                            handleFirestoreError(err, OperationType.WRITE, quizRef.path);
                        }
                    }

                    // Save Flashcards
                    if (pack.flashcards.length > 0) {
                        const flashId = createDocId(safeUnitName, language);
                        const flashRef = doc(db!, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'flashcards', flashId);
                        try {
                            await adminSetDoc(flashRef, {
                                cards: pack.flashcards,
                                grade: grade,
                                subject: targetSubject.name,
                                unit: safeUnitName,
                                language: language,
                                createdAt: new Date().toISOString(),
                                source: 'pdf_auto_gen'
                            });
                            addLog(` -> Saved Flashcards: ${flashRef.path}`);
                        } catch (err: any) {
                            console.error(`Error saving flashcards at ${flashRef.path}:`, err);
                            handleFirestoreError(err, OperationType.WRITE, flashRef.path);
                        }
                    }

                    if (i < targetSubject.units.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }
            addLog("🎉 PDF Processing Complete!");
        } catch (e: any) {
            console.error("PDF Processing Error:", e);
            addLog(`❌ PDF Error: ${e.message}`);
        } finally {
            setIsUploading(false);
        }
    };
    const handleUpload = async () => {
        if (!db) { addLog("Error: Firebase not initialized."); return; }
        if (!jsonContent) { addLog("Error: No JSON content loaded."); return; }

        setIsUploading(true);
        let opCount = 0;

        try {
            const data = JSON.parse(jsonContent);

            if (uploadType === 'syllabus') {
                const safeGrade = createDocId(grade);
                
                // Check if data is a multi-subject object or a single array
                if (!Array.isArray(data) && typeof data === 'object') {
                    addLog(`Detected multi-subject JSON. Processing ${Object.keys(data).length} subjects...`);
                    
                    for (const [subName, subUnits] of Object.entries(data)) {
                        const normalizedSubjectName = normalizeSubject(subName);
                        const safeSubject = createDocId(normalizedSubjectName);
                        const docRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'syllabus', 'main');
                        
                        const payload = { 
                            units: subUnits,
                            subject: subName,
                            grade: grade,
                            language: language,
                            createdAt: new Date().toISOString(),
                            source: 'admin_upload_multi'
                        };

                        await adminSetDoc(docRef, payload);
                        opCount++;
                        addLog(`Uploaded Syllabus for ${subName}: ${docRef.path}`);
                    }
                } else if (Array.isArray(data)) {
                    if (!subject) {
                        addLog("Error: Subject is required for single-array Syllabus upload.");
                        setIsUploading(false);
                        return;
                    }
                    const normalizedSubjectName = normalizeSubject(subject);
                    const safeSubject = createDocId(normalizedSubjectName);
                    const docRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'syllabus', 'main');
                    
                    const payload = { 
                        units: data,
                        subject: subject,
                        grade: grade,
                        language: language,
                        createdAt: new Date().toISOString(),
                        source: 'admin_upload'
                    };

                    await adminSetDoc(docRef, payload);
                    opCount++;
                    addLog(`Uploaded Syllabus: ${docRef.path}`);
                } else {
                    addLog("Error: Invalid JSON format for syllabus. Expected array or object.");
                }
            } 
            else if (uploadType === 'pack') {
                if (!subject) {
                    addLog("Error: Subject is required for Study Pack upload.");
                    setIsUploading(false);
                    return;
                }
                const safeGrade = createDocId(grade);
                const safeSubject = createDocId(normalizeSubject(subject));

                for (const [unitName, content] of Object.entries(data)) {
                    const unitData = content as any;
                    const safeUnitName = unitName.replace(/Unit \d+[:.]\s*/i, '').trim();

                    if (unitData.quiz && Array.isArray(unitData.quiz)) {
                        const quizId = createDocId(safeUnitName, 'medium', language);
                        const quizRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'quizzes', quizId);
                        await adminSetDoc(quizRef, { 
                            questions: unitData.quiz,
                            grade: grade,
                            subject: subject,
                            unit: safeUnitName,
                            language: language,
                            createdAt: new Date().toISOString(),
                            source: 'admin_upload'
                        });
                        opCount++;
                        addLog(`Uploaded Quiz: ${quizRef.path}`);
                    }

                    if (unitData.flashcards && Array.isArray(unitData.flashcards)) {
                        const flashId = createDocId(safeUnitName, language);
                        const flashRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'flashcards', flashId);
                        await adminSetDoc(flashRef, { 
                            cards: unitData.flashcards,
                            grade: grade,
                            subject: subject,
                            unit: safeUnitName,
                            language: language,
                            createdAt: new Date().toISOString(),
                            source: 'admin_upload'
                        });
                        opCount++;
                        addLog(`Uploaded Flashcards: ${flashRef.path}`);
                    }
                }
            }

            if (opCount > 0) {
                addLog(`✅ SUCCESS: Uploaded ${opCount} documents.`);
                setJsonContent('');
            } else {
                addLog("⚠️ Warning: No valid data found to upload.");
            }

        } catch (e: any) {
            console.error(e);
            addLog(`❌ ERROR: ${e.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    // --- AUTO HANDLERS ---
    const handleFetchUnits = async () => {
        if (!subject) return;
        setIsFetchingUnits(true);
        setUnits([]);
        setSelectedUnits([]);
        addLog(`Fetching unit list for ${grade} ${subject}...`);
        
        try {
            const fetched = await generateSyllabusList(grade, subject, language);
            setUnits(fetched);
            addLog(`Found ${fetched.length} units.`);
        } catch (e: any) {
            addLog(`Error fetching units: ${e.message}`);
        } finally {
            setIsFetchingUnits(false);
        }
    };

    const handleSetupAdmin = async () => {
        if (!user || !db) return;
        setIsUploading(true);
        addLog("🛠️ Setting up Admin Profile...");
        try {
            const userRef = doc(db, 'users', user.uid);
            await adminSetDoc(userRef, {
                uid: user.uid,
                email: user.email,
                role: 'admin',
                createdAt: new Date().toISOString()
            });
            addLog("✅ Admin Profile set up successfully!");
        } catch (e: any) {
            addLog(`❌ Setup Failed: ${e.message}`);
            handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
        } finally {
            setIsUploading(false);
        }
    };
    const handleGenerateAll = async () => {
        if (selectedUnits.length === 0 || !db) return;
        setIsGenerating(true);
        setGenProgress(0);
        addLog(`Starting AI generation for ${selectedUnits.length} units...`);

        try {
            const safeGrade = createDocId(grade);
            const safeSubject = createDocId(subject);
            for (let i = 0; i < selectedUnits.length; i++) {
                const unit = selectedUnits[i];
                const safeUnitName = unit.replace(/Unit \d+[:.]\s*/i, '').trim();
                
                addLog(`Generating content for: ${unit}...`);
                
                // 1. Ask AI
                const pack = await generateFullUnitPack(grade, subject, unit, language);
                
                // 2. Save to DB immediately
                if (pack.quiz && pack.quiz.length > 0) {
                    const quizId = createDocId(safeUnitName, 'medium', language);
                    const quizRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'quizzes', quizId);
                    try {
                        await adminSetDoc(quizRef, {
                            questions: pack.quiz,
                            grade: grade,
                            subject: subject,
                            unit: safeUnitName,
                            language: language,
                            createdAt: new Date().toISOString(),
                            source: 'ai_auto_gen'
                        });
                        addLog(` -> Saved Quiz: ${quizRef.path}`);
                    } catch (e: any) {
                        handleFirestoreError(e, OperationType.WRITE, quizRef.path);
                    }
                }
                
                if (pack.flashcards && pack.flashcards.length > 0) {
                    const flashId = createDocId(safeUnitName, language);
                    const flashRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'flashcards', flashId);
                    try {
                        await adminSetDoc(flashRef, {
                            cards: pack.flashcards,
                            grade: grade,
                            subject: subject,
                            unit: safeUnitName,
                            language: language,
                            createdAt: new Date().toISOString(),
                            source: 'ai_auto_gen'
                        });
                        addLog(` -> Saved Flashcards: ${flashRef.path}`);
                    } catch (e: any) {
                        handleFirestoreError(e, OperationType.WRITE, flashRef.path);
                    }
                }

                setGenProgress(((i + 1) / selectedUnits.length) * 100);

                // If it's not the last item, pause to avoid rate limiting
                if (i < selectedUnits.length - 1) {
                    addLog(`Pausing for 2s to manage API rate limits...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            addLog("✅ All selected units generated and saved!");
        } catch (e: any) {
            addLog(`❌ Generator Error: ${e.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-100 p-2 rounded-lg">
                            <Database className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Database Admin</h2>
                            <p className="text-sm text-slate-500">Populate content for students</p>
                        </div>
                    </div>
                    {/* Mode Toggle */}
                    <div className="flex items-center gap-3">
                        {user ? (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                                    <UserIcon className="w-3 h-3 text-slate-500" />
                                    <span className="text-[10px] font-bold text-slate-700 truncate max-w-[120px]">{user.email}</span>
                                </div>
                                <button 
                                    onClick={handleSetupAdmin}
                                    disabled={isUploading}
                                    className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-slate-900 transition-colors disabled:opacity-50"
                                    title="Ensure you have admin permissions in Firestore"
                                >
                                    Setup Admin
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={handleLogin}
                                className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-100 hover:bg-indigo-100 transition-colors"
                            >
                                <LogIn className="w-3 h-3" /> Sign In
                            </button>
                        )}
                        <div className="bg-slate-100 p-1 rounded-lg flex text-xs font-bold">
                            <button 
                                onClick={() => setMode('manual')}
                                className={`px-3 py-1.5 rounded-md transition-all ${mode === 'manual' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                            >
                                Manual JSON
                            </button>
                            <button 
                                onClick={() => setMode('pdf')}
                                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${mode === 'pdf' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                            >
                                <FileText className="w-3 h-3" /> PDF Upload
                            </button>
                            <button 
                                onClick={() => setMode('auto')}
                                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${mode === 'auto' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}
                            >
                                <Sparkles className="w-3 h-3" /> AI Auto-Gen
                            </button>
                        </div>
                        <div className="flex items-center gap-2 ml-4 border-l border-slate-200 pl-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={useServiceAccount} 
                                    onChange={(e) => setUseServiceAccount(e.target.checked)}
                                    disabled={adminInitialized === false}
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 disabled:opacity-50"
                                />
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-slate-600">Service Account Mode</span>
                                    {adminInitialized === false && (
                                        <span className="text-[10px] text-red-500 font-medium">Not Configured</span>
                                    )}
                                    {adminInitialized === true && (
                                        <span className="text-[10px] text-emerald-500 font-medium">Ready</span>
                                    )}
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Settings Column */}
                    <div className="space-y-4">
                        
                        {/* Grade (Common) */}
                        <div className="grid grid-cols-1 gap-3">
                             <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Grade</label>
                                <select 
                                    value={grade} 
                                    onChange={(e) => setGrade(e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-300 text-xs bg-white"
                                >
                                    {grades.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Mode Specific */}
                        {mode === 'manual' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Upload Type</label>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setUploadType('pack')}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm border ${uploadType === 'pack' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-600'}`}
                                        >
                                            Study Pack
                                        </button>
                                        <button 
                                            onClick={() => setUploadType('syllabus')}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm border ${uploadType === 'syllabus' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-600'}`}
                                        >
                                            Syllabus
                                        </button>
                                    </div>
                                </div>
                                {(uploadType === 'pack' || uploadType === 'syllabus') && (
                                    <div className="space-y-2">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
                                            <select 
                                                value={isCustomSubject ? 'custom' : subject}
                                                onChange={(e) => {
                                                    if (e.target.value === 'custom') {
                                                        setIsCustomSubject(true);
                                                        setSubject('');
                                                    } else {
                                                        setIsCustomSubject(false);
                                                        setSubject(e.target.value);
                                                    }
                                                }}
                                                className="w-full p-2.5 rounded-lg border border-slate-300 text-sm bg-white"
                                            >
                                                <option value="">Select a subject...</option>
                                                {(SYLLABUS_DB[grade] ? Object.keys(SYLLABUS_DB[grade]) : []).map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                                <option value="custom">+ Custom Subject</option>
                                            </select>
                                        </div>
                                        
                                        {isCustomSubject && (
                                            <input 
                                                type="text" 
                                                value={subject}
                                                onChange={(e) => setSubject(e.target.value)}
                                                placeholder="Enter custom subject name..."
                                                className="w-full p-2.5 rounded-lg border border-slate-300 text-sm"
                                            />
                                        )}
                                    </div>
                                )}
                                <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 relative">
                                    <input 
                                        type="file" 
                                        accept=".json"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                    <FileJson className="w-8 h-8 text-slate-400 mb-2" />
                                    <span className="text-sm text-slate-600 font-medium">Click to upload JSON</span>
                                    {jsonContent && <span className="text-xs text-green-600 mt-1 font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Selected</span>}
                                </div>
                                <Button onClick={handleUpload} disabled={isUploading || !jsonContent} className="w-full">
                                    {isUploading ? 'Uploading...' : 'Upload JSON'}
                                </Button>
                            </>
                        )}

                        {mode === 'pdf' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Process Type</label>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setUploadType('pack')}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm border ${uploadType === 'pack' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-600'}`}
                                        >
                                            Generate Packs
                                        </button>
                                        <button 
                                            onClick={() => setUploadType('syllabus')}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm border ${uploadType === 'syllabus' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-600'}`}
                                        >
                                            Extract Syllabus
                                        </button>
                                    </div>
                                </div>
                                {uploadType === 'pack' && (
                                    <div className="space-y-2">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Subject to Generate</label>
                                            <select 
                                                value={isCustomSubject ? 'custom' : subject}
                                                onChange={(e) => {
                                                    if (e.target.value === 'custom') {
                                                        setIsCustomSubject(true);
                                                        setSubject('');
                                                    } else {
                                                        setIsCustomSubject(false);
                                                        setSubject(e.target.value);
                                                    }
                                                }}
                                                className="w-full p-2.5 rounded-lg border border-slate-300 text-sm bg-white"
                                            >
                                                <option value="">Select a subject...</option>
                                                {(SYLLABUS_DB[grade] ? Object.keys(SYLLABUS_DB[grade]) : []).map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                                <option value="custom">+ Custom Subject</option>
                                            </select>
                                        </div>
                                        
                                        {isCustomSubject && (
                                            <input 
                                                type="text" 
                                                value={subject}
                                                onChange={(e) => setSubject(e.target.value)}
                                                placeholder="Enter custom subject name..."
                                                className="w-full p-2.5 rounded-lg border border-slate-300 text-sm"
                                            />
                                        )}
                                    </div>
                                )}
                                {uploadType === 'syllabus' && (
                                    <div className="space-y-2">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Subject Name (Optional)</label>
                                            <input 
                                                type="text" 
                                                value={subject}
                                                onChange={(e) => setSubject(e.target.value)}
                                                placeholder="e.g. Science (Leave blank to auto-detect)"
                                                className="w-full p-2.5 rounded-lg border border-slate-300 text-sm"
                                            />
                                            <p className="text-[10px] text-slate-400 mt-1">If provided, forces the extracted syllabus to use this subject name.</p>
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer p-2 bg-slate-50 rounded-lg border border-slate-200">
                                            <input 
                                                type="checkbox" 
                                                checked={mergeSyllabus} 
                                                onChange={(e) => setMergeSyllabus(e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-slate-700">Merge with existing syllabus</span>
                                                <span className="text-[10px] text-slate-500">Appends new units to existing ones (useful for multi-part PDFs)</span>
                                            </div>
                                        </label>
                                    </div>
                                )}
                                <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 relative">
                                    <input 
                                        type="file" 
                                        accept=".pdf"
                                        onChange={handlePdfChange}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                    <FileText className="w-8 h-8 text-slate-400 mb-2" />
                                    <span className="text-sm text-slate-600 font-medium">
                                        {pdfFile ? pdfFile.name : 'Click to select PDF'}
                                    </span>
                                </div>
                                <Button onClick={handlePdfProcess} disabled={isUploading || !pdfBase64} className="w-full">
                                    {isUploading ? 'Processing PDF...' : `Extract & Save ${uploadType === 'syllabus' ? 'Syllabus' : 'Study Packs'}`}
                                </Button>
                            </>
                        )}

                        {mode === 'auto' && (
                            <>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
                                    <div className="flex gap-2 mb-2">
                                        <select 
                                            value={isCustomSubject ? 'custom' : subject}
                                            onChange={(e) => {
                                                if (e.target.value === 'custom') {
                                                    setIsCustomSubject(true);
                                                    setSubject('');
                                                } else {
                                                    setIsCustomSubject(false);
                                                    setSubject(e.target.value);
                                                }
                                            }}
                                            className="flex-1 p-2.5 rounded-lg border border-slate-300 text-sm bg-white"
                                        >
                                            <option value="">Select a subject...</option>
                                            {(SYLLABUS_DB[grade] ? Object.keys(SYLLABUS_DB[grade]) : []).map(s => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                            <option value="custom">+ Custom Subject</option>
                                        </select>
                                        <Button onClick={handleFetchUnits} disabled={isFetchingUnits || !subject} className="shrink-0">
                                            {isFetchingUnits ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch Units'}
                                        </Button>
                                    </div>
                                    
                                    {isCustomSubject && (
                                        <input 
                                            type="text" 
                                            value={subject}
                                            onChange={(e) => setSubject(e.target.value)}
                                            placeholder="Enter custom subject name..."
                                            className="w-full p-2.5 rounded-lg border border-slate-300 text-sm mb-2"
                                        />
                                    )}
                                </div>

                                {units.length > 0 && (
                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 max-h-[300px] overflow-y-auto">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-slate-700">Select Units to Generate</span>
                                            <button 
                                                onClick={() => setSelectedUnits(selectedUnits.length === units.length ? [] : [...units])}
                                                className="text-[10px] text-indigo-600 font-medium hover:underline"
                                            >
                                                {selectedUnits.length === units.length ? 'Deselect All' : 'Select All'}
                                            </button>
                                        </div>
                                        <div className="space-y-1">
                                            {units.map(unit => (
                                                <div key={unit} className="flex items-center gap-2 p-1.5 hover:bg-white rounded cursor-pointer" onClick={() => {
                                                    if (selectedUnits.includes(unit)) setSelectedUnits(selectedUnits.filter(u => u !== unit));
                                                    else setSelectedUnits([...selectedUnits, unit]);
                                                }}>
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedUnits.includes(unit) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                                        {selectedUnits.includes(unit) && <CheckCircle className="w-3 h-3 text-white" />}
                                                    </div>
                                                    <span className="text-xs text-slate-700">{unit}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {units.length > 0 && (
                                    <div className="space-y-2">
                                        {isGenerating && (
                                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${genProgress}%` }}></div>
                                            </div>
                                        )}
                                        <Button 
                                            onClick={handleGenerateAll} 
                                            disabled={isGenerating || selectedUnits.length === 0} 
                                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600"
                                        >
                                            {isGenerating ? `Generating (${Math.round(genProgress)}%)...` : `Generate Content for ${selectedUnits.length} Units`}
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Logs Column */}
                    <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-y-auto max-h-[500px] border border-slate-800 flex flex-col">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                            <div className="flex items-center gap-2 text-slate-500">
                                <FileText className="w-4 h-4" />
                                <span>System Logs</span>
                            </div>
                            <button 
                                onClick={handleTestConnection}
                                disabled={isUploading}
                                className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1 rounded border border-slate-700 transition-colors"
                            >
                                <Wifi className="w-3 h-3" />
                                Test Connection
                            </button>
                        </div>
                        <div className="flex-1 space-y-1 overflow-x-auto">
                            {logs.length === 0 && <span className="text-slate-600 italic">Ready...</span>}
                            {logs.map((log, i) => (
                                <div key={i} className={`flex items-start ${log.includes('ERROR') || log.includes('FAILED') ? 'text-red-400' : log.includes('SUCCESS') || log.includes('PERFECTLY') ? 'text-green-400 font-bold' : ''}`}>
                                  <span className="mr-2">&gt;</span>
                                  <span className="flex-1 break-words">{log.substring(log.indexOf(']') + 2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};