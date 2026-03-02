import React, { useState } from 'react';
import { db } from '../services/firebase';
import { doc, writeBatch, setDoc, collection, addDoc, deleteDoc } from 'firebase/firestore';
import { Button } from './ui/Button';
import { Upload, FileJson, CheckCircle, AlertCircle, Database, FileText, Sparkles, Loader2, List, Activity, Wifi } from 'lucide-react';
import { createDocId, generateSyllabusList, generateFullUnitPack } from '../services/geminiService';
import { Language } from '../types';
import { normalizeSubject } from '../data/syllabusDatabase';

export const AdminDataUpload: React.FC = () => {
    const [mode, setMode] = useState<'manual' | 'auto'>('manual');
    const [uploadType, setUploadType] = useState<'syllabus' | 'pack'>('pack');
    const [grade, setGrade] = useState('10 ශ්‍රේණිය (Grade 10)');
    const [language, setLanguage] = useState<Language>('si');
    const [subject, setSubject] = useState('');
    
    // Manual State
    const [jsonContent, setJsonContent] = useState<string>('');
    const [isUploading, setIsUploading] = useState(false);
    
    // Auto State
    const [units, setUnits] = useState<string[]>([]);
    const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
    const [isFetchingUnits, setIsFetchingUnits] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [genProgress, setGenProgress] = useState(0);

    const [logs, setLogs] = useState<string[]>([]);

    const grades = [
        "6 ශ්‍රේණිය (Grade 6)", "7 ශ්‍රේණිය (Grade 7)", "8 ශ්‍රේණිය (Grade 8)", 
        "9 ශ්‍රේණිය (Grade 9)", "10 ශ්‍රේණිය (Grade 10)", "11 ශ්‍රේණිය (Grade 11)",
        "12 ශ්‍රේණිය (Grade 12)", "13 ශ්‍රේණිය (Grade 13)"
    ];

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

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

    const handleUpload = async () => {
        if (!db) { addLog("Error: Firebase not initialized."); return; }
        if (!jsonContent) { addLog("Error: No JSON content loaded."); return; }

        setIsUploading(true);
        const batch = writeBatch(db);
        let opCount = 0;

        try {
            const data = JSON.parse(jsonContent);

            if (uploadType === 'syllabus') {
                if (!subject) {
                    addLog("Error: Subject is required for Syllabus upload.");
                    setIsUploading(false);
                    return;
                }
                const safeGrade = createDocId(grade);
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

                batch.set(docRef, payload);
                opCount++;
                addLog(`Queued Syllabus: ${docRef.path}`);
            } 
            else if (uploadType === 'pack') {
                if (!subject) {
                    addLog("Error: Subject is required for Study Pack upload.");
                    setIsUploading(false);
                    return;
                }
                const safeGrade = createDocId(grade);
                const safeSubject = createDocId(subject);

                for (const [unitName, content] of Object.entries(data)) {
                    const unitData = content as any;
                    const safeUnitName = unitName.replace(/Unit \d+[:.]\s*/i, '').trim();

                    if (unitData.quiz && Array.isArray(unitData.quiz)) {
                        const quizId = createDocId(safeUnitName, 'medium', language);
                        const quizRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'quizzes', quizId);
                        batch.set(quizRef, { 
                            questions: unitData.quiz,
                            grade: grade,
                            subject: subject,
                            unit: safeUnitName,
                            language: language,
                            createdAt: new Date().toISOString(),
                            source: 'admin_upload'
                        });
                        opCount++;
                        addLog(`Queued Quiz: ${quizRef.path}`);
                    }

                    if (unitData.flashcards && Array.isArray(unitData.flashcards)) {
                        const flashId = createDocId(safeUnitName, language);
                        const flashRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'flashcards', flashId);
                        batch.set(flashRef, { 
                            cards: unitData.flashcards,
                            grade: grade,
                            subject: subject,
                            unit: safeUnitName,
                            language: language,
                            createdAt: new Date().toISOString(),
                            source: 'admin_upload'
                        });
                        opCount++;
                        addLog(`Queued Flashcards: ${flashRef.path}`);
                    }
                }
            }

            if (opCount > 0) {
                await batch.commit();
                addLog(`✅ SUCCESS: Committed ${opCount} documents to hierarchical collections.`);
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
                    await setDoc(quizRef, {
                        questions: pack.quiz,
                        grade: grade,
                        subject: subject,
                        unit: safeUnitName,
                        language: language,
                        createdAt: new Date().toISOString(),
                        source: 'ai_auto_gen'
                    });
                    addLog(` -> Saved Quiz: ${quizRef.path}`);
                }
                
                if (pack.flashcards && pack.flashcards.length > 0) {
                    const flashId = createDocId(safeUnitName, language);
                    const flashRef = doc(db, 'languages', language, 'grades', safeGrade, 'subjects', safeSubject, 'flashcards', flashId);
                    await setDoc(flashRef, {
                        cards: pack.flashcards,
                        grade: grade,
                        subject: subject,
                        unit: safeUnitName,
                        language: language,
                        createdAt: new Date().toISOString(),
                        source: 'ai_auto_gen'
                    });
                     addLog(` -> Saved Flashcards: ${flashRef.path}`);
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
                    <div className="bg-slate-100 p-1 rounded-lg flex text-xs font-bold">
                        <button 
                            onClick={() => setMode('manual')}
                            className={`px-3 py-1.5 rounded-md transition-all ${mode === 'manual' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                        >
                            Manual JSON
                        </button>
                        <button 
                            onClick={() => setMode('auto')}
                            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${mode === 'auto' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}
                        >
                            <Sparkles className="w-3 h-3" /> AI Auto-Gen
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Settings Column */}
                    <div className="space-y-4">
                        
                        {/* Grade & Language (Common) */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Language</label>
                                <select 
                                    value={language} 
                                    onChange={(e) => setLanguage(e.target.value as any)}
                                    className="w-full p-2 rounded-lg border border-slate-300 text-xs bg-white"
                                >
                                    <option value="si">Sinhala</option>
                                    <option value="en">English</option>
                                </select>
                            </div>
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
                        {mode === 'manual' ? (
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
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
                                        <input 
                                            type="text" 
                                            value={subject}
                                            onChange={(e) => setSubject(e.target.value)}
                                            placeholder="Ex: Science"
                                            className="w-full p-2.5 rounded-lg border border-slate-300 text-sm"
                                        />
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
                        ) : (
                            <>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={subject}
                                            onChange={(e) => setSubject(e.target.value)}
                                            placeholder="Ex: History"
                                            className="flex-1 p-2.5 rounded-lg border border-slate-300 text-sm"
                                        />
                                        <Button onClick={handleFetchUnits} disabled={isFetchingUnits || !subject} className="shrink-0">
                                            {isFetchingUnits ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch Units'}
                                        </Button>
                                    </div>
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