
import React, { useState, useEffect, useRef } from 'react';
import { Subject, Difficulty, StudyPlan, Language, BusySlot, WeeklySchedule } from '../types';
import { generateStudyPlan, generateWeeklySessions, solveImage } from '../services/geminiService';
import { Plus, Calendar, Clock, BookOpen, Activity, GraduationCap, Target, Sparkles, X, Link as LinkIcon, Briefcase, Moon, Home, ChevronDown, ChevronRight, ChevronLeft, Flag, Coffee, Loader2, Save, Trash2, CheckSquare, Zap, Lock, PlayCircle, Coins, Lightbulb, Camera, Upload, AlertTriangle, Database } from 'lucide-react';
import { Button } from './ui/Button';

interface StudyPlannerProps {
  language: Language;
  points: number;
  spendPoints: (amount: number) => void;
  userId?: string; // Add userId prop
}

const STORAGE_KEY = 'nexus_study_plan_v1';
const STREAK_KEY = 'nexus_study_streak';

export const StudyPlanner: React.FC<StudyPlannerProps> = ({ language, points, spendPoints, userId = 'guest' }) => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.Medium);
  const [hours, setHours] = useState(2);
  const [grade, setGrade] = useState('10 ශ්‍රේණිය (Grade 10)');
  const [examTarget, setExamTarget] = useState('O/L');
  const [focus, setFocus] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  
  // Camera Solver State
  const [showCamera, setShowCamera] = useState(false);
  const [cameraImage, setCameraImage] = useState<string | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [solution, setSolution] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 3));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

  // Routine State
  const [schoolEndTime, setSchoolEndTime] = useState('14:30');
  const [bedTime, setBedTime] = useState('22:00');
  const [examDate, setExamDate] = useState('');
  const [restDay, setRestDay] = useState<string>('None');
  
  // Busy Slot State
  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);
  const [newClassDay, setNewClassDay] = useState('සඳුදා');
  const [newClassStart, setNewClassStart] = useState('08:00');
  const [newClassEnd, setNewClassEnd] = useState('10:00');
  const [newClassLabel, setNewClassLabel] = useState('');
  const [showClassInput, setShowClassInput] = useState(false);

  // Expanded State for Weeks
  const [expandedWeekIndex, setExpandedWeekIndex] = useState<number>(0);
  const [loadingWeek, setLoadingWeek] = useState<number | null>(null);

  // Auto-Generation State
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const autoGenTimeoutRef = useRef<any | null>(null);

  // Unlock State
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [weekToUnlock, setWeekToUnlock] = useState<number | null>(null);

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Streak State
  const [streak, setStreak] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0); // Progress State
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Camera Solver Handlers
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            setCameraImage(reader.result as string);
            setSolution(null);
        };
        reader.readAsDataURL(file);
    }
  };

  const handleSolve = async () => {
    if (!cameraImage) return;
    setIsSolving(true);
    try {
        const result = await solveImage(cameraImage, userId, language);
        setSolution(result);
    } catch (e: any) {
        setError(e.message || "Failed to solve image");
    } finally {
        setIsSolving(false);
    }
  };

  // Load from local storage on mount
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.plan) setPlan(parsed.plan);
        if (parsed.grade) setGrade(parsed.grade);
        if (parsed.examDate) setExamDate(parsed.examDate);
      } catch (e) {
        console.error("Failed to load saved plan", e);
      }
    }

    // Load Streak
    const savedStreak = localStorage.getItem(STREAK_KEY);
    if (savedStreak) {
        const { count, lastDate } = JSON.parse(savedStreak);
        const today = new Date().toDateString();
        const last = new Date(lastDate).toDateString();
        
        const diffTime = Math.abs(new Date(today).getTime() - new Date(last).getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        if (diffDays > 1) {
            setStreak(0);
        } else {
            setStreak(count);
        }
    }
  }, []);

  // --- BACKGROUND AUTO-GENERATION LOGIC ---
  useEffect(() => {
    if (!plan || isLoading || loadingWeek !== null || isAutoGenerating) return;
    const nextEmptyIndex = plan.weeks.findIndex(w => w.sessions.length === 0);
    if (nextEmptyIndex === -1) return;

    autoGenTimeoutRef.current = setTimeout(async () => {
        setIsAutoGenerating(true);
        try {
            const sessions = await generateWeeklySessions(
                plan.weeks[nextEmptyIndex],
                subjects,
                hours,
                grade,
                language,
                busySlots,
                { schoolEndTime, bedTime, examDate },
                restDay
            );
            setPlan(prevPlan => {
                if (!prevPlan) return null;
                const newWeeks = [...prevPlan.weeks];
                newWeeks[nextEmptyIndex] = { ...newWeeks[nextEmptyIndex], sessions };
                const updatedPlan = { ...prevPlan, weeks: newWeeks };
                saveToStorage(updatedPlan);
                return updatedPlan;
            });
        } catch (e) {
            // console.warn("Background generation paused", e);
        } finally {
            setIsAutoGenerating(false);
        }
    }, 6000);

    return () => {
        if (autoGenTimeoutRef.current) clearTimeout(autoGenTimeoutRef.current);
    };
  }, [plan, isLoading, loadingWeek, isAutoGenerating, subjects, hours, grade, language, busySlots, schoolEndTime, bedTime, examDate, restDay]);


  const updateStreak = () => {
    const today = new Date().toDateString();
    const savedStreak = localStorage.getItem(STREAK_KEY);
    let newCount = 1;

    if (savedStreak) {
        const { count, lastDate } = JSON.parse(savedStreak);
        const last = new Date(lastDate).toDateString();
        
        if (today === last) return;
        if (new Date(today).getTime() - new Date(last).getTime() < 172800000) { // Within 48 hours
            newCount = count + 1;
        }
    }
    setStreak(newCount);
    localStorage.setItem(STREAK_KEY, JSON.stringify({ count: newCount, lastDate: new Date().toISOString() }));
  };

  const saveToStorage = (newPlan: StudyPlan) => {
    const dataToSave = {
        plan: newPlan,
        grade,
        examDate,
        savedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  };

  const internalUnlockWeek = (weekIndex: number | null) => {
      if (weekIndex === null || !plan) return;
      const newWeeks = [...plan.weeks];
      newWeeks[weekIndex] = { ...newWeeks[weekIndex], isUnlocked: true };
      
      const updatedPlan = { ...plan, weeks: newWeeks };
      setPlan(updatedPlan);
      saveToStorage(updatedPlan);

      // Automatically expand the newly unlocked week
      toggleWeek(weekIndex);
  };

  const handleUnlockWithAd = () => {
      // Simulate "Watching Ad"
      setTimeout(() => {
          internalUnlockWeek(weekToUnlock);
          setShowUnlockModal(false);
          setWeekToUnlock(null);
      }, 1500);
  };

  const handleUnlockWithPoints = () => {
      if (points >= 50 && weekToUnlock !== null) {
        spendPoints(50);
        internalUnlockWeek(weekToUnlock);
        setShowUnlockModal(false);
        setWeekToUnlock(null);
      }
  };


  const toggleTaskCompletion = (weekIndex: number, sessionIndex: number) => {
    if (!plan) return;
    
    const newWeeks = [...plan.weeks];
    const session = newWeeks[weekIndex].sessions[sessionIndex];
    session.isCompleted = !session.isCompleted;
    
    if (session.isCompleted) {
        updateStreak();
    }

    const updatedPlan = { ...plan, weeks: newWeeks };
    setPlan(updatedPlan);
    saveToStorage(updatedPlan);
  };

  const calculateProgress = (sessions: any[]) => {
      if (!sessions || sessions.length === 0) return 0;
      const completed = sessions.filter(s => s.isCompleted).length;
      return Math.round((completed / sessions.length) * 100);
  };

  const handleClearStorageClick = () => {
    setShowDeleteModal(true);
  };

  const confirmClearStorage = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPlan(null);
    setExpandedWeekIndex(0);
    setStreak(0);
    localStorage.removeItem(STREAK_KEY);
    setCurrentStep(0);
    setShowDeleteModal(false);
  };

  const t = {
    si: {
      title: "පාඩම් සැලැස්ම",
      subtitle: "මතක ශක්තිය වර්ධනය වන ලෙස සකසමු",
      selectGrade: "ශ්‍රේණිය",
      examTargetLabel: "විභාග ඉලක්කය",
      ol: "සා.පෙළ (O/L)",
      termTest: "වාර විභාගය",
      al: "උ.පෙළ (A/L)",
      olAndTerm: "සා.පෙළ සහ වාර විභාග",
      alAndTerm: "උ.පෙළ සහ වාර විභාග",
      enterSubject: "විෂය ඇතුළත් කරන්න",
      subjectPlaceholder: "විෂය (උදා: ගණිතය)",
      addBtn: "එකතු කරන්න",
      hoursLabel: "දිනකට පැය",
      focusLabel: "ප්‍රධාන ඉලක්කය",
      focusPlaceholder: "උදා: සා.පෙළ විභාගය",
      generateBtn: "කාලසටහන සාදන්න",
      weeklyPlan: "විභාගය දක්වා සැලැස්ම",
      noPlan: "සැලැස්මක් සකසා නැත",
      noPlanDesc: "ඉහත විස්තර පුරවා 'කාලසටහන සාදන්න' ඔබන්න.",
      errorEmpty: "විෂයයන් කිහිපයක් එකතු කරන්න.",
      errorDate: "විභාග දිනය තෝරන්න.",
      errorGen: "දෝෂයක්. නැවත උත්සාහ කරන්න.",
      easy: "ලේසි",
      medium: "සාමාන්‍ය",
      hard: "අමාරු",
      tipsTitle: "මතකය වර්ධනයට උපදෙස්",
      days: ['සඳුදා', 'අඟහරුවාදා', 'බදාදා', 'බ්‍රහස්පතින්දා', 'සිකුරාදා', 'සෙනසුරාදා', 'ඉරිදා'],
      sources: "මූලාශ්‍ර",
      addClassTitle: "අමතර පන්ති",
      addClassBtn: "එකතු කරන්න",
      classLabel: "කාර්යය",
      classPlaceholder: "උදා: පන්තිය",
      startTime: "ආරම්භය",
      endTime: "අවසානය",
      routineTitle: "දින චර්යාව",
      schoolEnd: "පාසල ඇරී ගෙදර එන වේලාව",
      bedTime: "නිදාගන්නා වේලාව",
      examDate: "විභාග දිනය",
      restDay: "විවේක දිනය",
      restDayNone: "නැත",
      phase: "Phase",
      week: "සතිය",
      goal: "ඉලක්කය",
      generatingWeek: "සකසමින් පවතී...",
      clickToLoad: "Click to generate schedule",
      saved: "සුරැකි සැලැස්මකි",
      newPlan: "නව සැලැස්මක්",
      remove: "සැලැස්ම මකන්න",
      streak: "දින",
      progress: "ප්‍රගතිය",
      unlockTitle: "මෙම සතිය විවෘත කරන්න",
      unlockDesc: "ලකුණු භාවිතා කරන්න හෝ දැන්වීමක් නරඹන්න.",
      watchAd: "දැන්වීම නරඹා විවෘත කරන්න",
      unlockWithPoints: "ලකුණු 50 කින් විවෘත කරන්න",
      locked: "අගුළු දමා ඇත",
      cameraTitle: "කැමරා විසඳුම",
      cameraDesc: "ප්‍රශ්නයක ඡායාරූපයක් ගෙන ක්ෂණික විසඳුමක් ලබා ගන්න",
      solveBtn: "විසඳන්න",
      uploadBtn: "ඡායාරූපයක් තෝරන්න",
      subjects: "විෂයයන්",
      hoursPerDay: "දිනකට පැය ගණන",
      deleteConfirmTitle: "ඔබට විශ්වාසද?",
      deleteConfirmDesc: "ඔබගේ දැනට පවතින සැලැස්ම මැකී යනු ඇත.",
      deleteConfirmBtn: "මකන්න",
      cancelBtn: "අවලංගු කරන්න"
    },
    en: {
      title: "Study Plan",
      subtitle: "Backed by Memory Science",
      selectGrade: "Grade",
      examTargetLabel: "Exam Target",
      ol: "O/L",
      termTest: "Term Test",
      al: "A/L",
      olAndTerm: "O/L & Term Tests",
      alAndTerm: "A/L & Term Tests",
      enterSubject: "Add Subjects",
      subjectPlaceholder: "Subject (Ex: Math)",
      addBtn: "Add",
      hoursLabel: "Study Hours/Day",
      focusLabel: "Main Goal",
      focusPlaceholder: "Ex: O/L Exam",
      generateBtn: "Generate Schedule",
      weeklyPlan: "Roadmap to Exam",
      noPlan: "No plan generated",
      noPlanDesc: "Fill in the details and generate your plan.",
      errorEmpty: "Add at least one subject.",
      errorDate: "Select your exam date.",
      errorGen: "Error. Try again.",
      easy: "Easy",
      medium: "Medium",
      hard: "Hard",
      tipsTitle: "Memory Tips",
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      sources: "Sources",
      addClassTitle: "Extra Classes",
      addClassBtn: "Add",
      classLabel: "Class / Activity",
      classPlaceholder: "Ex: Math Class",
      startTime: "Start",
      endTime: "End",
      routineTitle: "Routine",
      schoolEnd: "School Home Time",
      bedTime: "Bed Time",
      examDate: "Exam Date",
      restDay: "Rest Day",
      restDayNone: "None",
      phase: "Phase",
      week: "Week",
      goal: "Goal",
      generatingWeek: "Generating...",
      clickToLoad: "Click to generate",
      saved: "Saved Plan",
      newPlan: "New Plan",
      remove: "Delete Plan",
      streak: "Day Streak",
      progress: "Progress",
      unlockTitle: "Unlock This Week",
      unlockDesc: "Use points or watch a short ad to unlock.",
      watchAd: "Watch Ad & Unlock",
      unlockWithPoints: "Unlock with 50 Points",
      locked: "Locked",
      cameraTitle: "Camera Solver",
      cameraDesc: "Take a photo of a question to get an instant solution",
      solveBtn: "Solve",
      uploadBtn: "Upload Photo",
      subjects: "Subjects",
      hoursPerDay: "Hours Per Day",
      deleteConfirmTitle: "Are you sure?",
      deleteConfirmDesc: "This will delete your current plan.",
      deleteConfirmBtn: "Delete",
      cancelBtn: "Cancel"
    }
  }[language];

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

  const getAvailableExamTargets = () => {
    if (grade?.includes('10') || grade?.includes('11')) {
      return [
        { id: 'O/L', label: t.ol },
        { id: 'Term Test', label: t.termTest },
        { id: 'O/L & Term Tests', label: t.olAndTerm }
      ];
    } else if (grade?.includes('12') || grade?.includes('13')) {
      return [
        { id: 'A/L', label: t.al },
        { id: 'Term Test', label: t.termTest },
        { id: 'A/L & Term Tests', label: t.alAndTerm }
      ];
    } else {
      return [
        { id: 'Term Test', label: t.termTest }
      ];
    }
  };

  const examTargets = getAvailableExamTargets();

  // Ensure selected exam target is valid for the current grade
  useEffect(() => {
    if (!examTargets.some(target => target.id === examTarget)) {
      setExamTarget(examTargets[0].id);
    }
  }, [grade, examTargets, examTarget]);

  const restDayOptions = [
    { val: 'None', label: t.restDayNone },
    { val: 'Sunday', label: 'ඉරිදා' },
    { val: 'Saturday', label: 'සෙනසුරාදා' },
    { val: 'Friday', label: 'සිකුරාදා' }
  ];

  const addSubject = () => {
    if (!newSubject.trim()) return;
    const subject: Subject = {
      id: Date.now().toString(),
      name: newSubject,
      difficulty,
    };
    setSubjects([...subjects, subject]);
    setNewSubject('');
  };

  const removeSubject = (id: string) => {
    setSubjects(subjects.filter(s => s.id !== id));
  };

  const addBusySlot = () => {
    if (!newClassLabel.trim()) return;
    const slot: BusySlot = {
      id: Date.now().toString(),
      day: newClassDay,
      startTime: newClassStart,
      endTime: newClassEnd,
      label: newClassLabel
    };
    setBusySlots([...busySlots, slot]);
    setNewClassLabel('');
    setShowClassInput(false);
  };

  const removeBusySlot = (id: string) => {
    setBusySlots(busySlots.filter(s => s.id !== id));
  };

  const handleGenerate = async () => {
    if (subjects.length === 0) {
      setError(t.errorEmpty);
      return;
    }
    if (!examDate) {
      setError(t.errorDate);
      return;
    }
    setError(null);
    setIsLoading(true);
    setProgress(0);
    setPlan(null);
    setExpandedWeekIndex(0);
    try {
      const generatedPlan = await generateStudyPlan(
        subjects, 
        hours, 
        focus || examTarget, 
        grade,
        language,
        busySlots,
        {
          schoolEndTime,
          bedTime,
          examDate
        },
        restDay,
        (p) => setProgress(p)
      );
      setPlan(generatedPlan);
      saveToStorage(generatedPlan);
    } catch (err: any) {
      setError(`${t.errorGen} (${err.message || err})`);
      console.error(err);
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  const toggleWeek = async (index: number) => {
    if (index >= 8 && !plan?.weeks[index].isUnlocked) {
        setWeekToUnlock(index);
        setShowUnlockModal(true);
        return;
    }

    if (expandedWeekIndex === index) {
        setExpandedWeekIndex(-1);
        return;
    }
    setExpandedWeekIndex(index);

    if (plan && plan.weeks[index].sessions.length === 0) {
        setLoadingWeek(index);
        try {
            const sessions = await generateWeeklySessions(
                plan.weeks[index],
                subjects,
                hours,
                grade,
                language,
                busySlots,
                { schoolEndTime, bedTime, examDate },
                restDay
            );
            
            const newWeeks = [...plan.weeks];
            newWeeks[index] = { ...newWeeks[index], sessions: sessions };
            const updatedPlan = { ...plan, weeks: newWeeks };
            setPlan(updatedPlan);
            saveToStorage(updatedPlan);
        } catch (e) {
            console.error("Failed to load week details", e);
        } finally {
            setLoadingWeek(null);
        }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200">
                <Calendar className="w-8 h-8 text-white" />
            </div>
            {t.title}
          </h1>
          <p className="text-slate-500 mt-2 text-sm md:text-base max-w-2xl">
            {t.subtitle}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
            <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2">
                <Coins className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                <span className="font-bold text-slate-700">{points}</span>
            </div>
            <Button onClick={() => setShowCamera(true)} variant="secondary" className="gap-2">
                <Camera className="w-4 h-4" />
                {t.cameraTitle}
            </Button>
        </div>
      </div>

      {/* Camera Solver Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-slate-800">
                        <Camera className="w-5 h-5 text-indigo-600" />
                        {t.cameraTitle}
                    </h3>
                    <button onClick={() => setShowCamera(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto">
                    {!solution ? (
                        <div className="space-y-6">
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/50 transition-all group"
                            >
                                {cameraImage ? (
                                    <img src={cameraImage} alt="Preview" className="max-h-64 rounded-lg shadow-md" />
                                ) : (
                                    <>
                                        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                            <Upload className="w-8 h-8 text-indigo-600" />
                                        </div>
                                        <p className="text-sm font-medium text-slate-600">{t.uploadBtn}</p>
                                        <p className="text-xs text-slate-400 mt-1">JPG, PNG supported</p>
                                    </>
                                )}
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept="image/*" 
                                    onChange={handleImageUpload}
                                />
                            </div>

                            {cameraImage && (
                                <Button 
                                    onClick={handleSolve} 
                                    isLoading={isSolving} 
                                    className="w-full py-3 text-base font-bold shadow-lg shadow-indigo-200"
                                >
                                    {t.solveBtn}
                                </Button>
                            )}
                            
                            {error && (
                                <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg flex items-center gap-2 text-rose-600 text-sm">
                                    <AlertTriangle className="w-4 h-4" />
                                    {error}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex items-center justify-between">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${solution.verified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {solution.verified ? 'Verified' : 'Pending Verification'}
                                </span>
                                <span className="text-xs text-slate-400">Confidence: {Math.round(solution.confidence * 100)}%</span>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-700 mb-2">Steps</h4>
                                    <div className="space-y-2">
                                        {solution.answer_steps.map((step: string, i: number) => (
                                            <div key={i} className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-100">
                                                <span className="font-bold text-indigo-600 mr-2">{i + 1}.</span>
                                                {step}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                                    <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-1">Final Answer</h4>
                                    <p className="text-lg font-bold text-indigo-900">{solution.final_answer}</p>
                                </div>
                                
                                {solution.rubric && (
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rubric</h4>
                                        <ul className="list-disc pl-4 space-y-1">
                                            {solution.rubric.map((point: string, i: number) => (
                                                <li key={i} className="text-xs text-slate-600">{point}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                            
                            <Button onClick={() => { setSolution(null); setCameraImage(null); }} variant="secondary" className="w-full">
                                Solve Another
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      <div className="pb-20 lg:pb-0">
      
      {/* UNLOCK MODAL */}
      {showUnlockModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center border border-indigo-100">
                  <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
                      <Lock className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">{t.unlockTitle}</h3>
                  <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                      {t.unlockDesc}
                  </p>
                  <div className="flex flex-col gap-3">
                      <button 
                        onClick={handleUnlockWithPoints}
                        disabled={points < 50}
                        className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          <Coins className="w-5 h-5" />
                          {t.unlockWithPoints}
                      </button>
                      <button 
                        onClick={handleUnlockWithAd}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
                      >
                          <PlayCircle className="w-5 h-5 fill-white text-indigo-600" />
                          {t.watchAd}
                      </button>
                      <button 
                        onClick={() => { setShowUnlockModal(false); setWeekToUnlock(null); }}
                        className="text-sm text-slate-400 font-medium hover:text-slate-600"
                      >
                          Cancel
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* DELETE MODAL */}
      {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center border border-red-100">
                  <div className="w-16 h-16 bg-gradient-to-tr from-red-500 to-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-200">
                      <Trash2 className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">{t.deleteConfirmTitle}</h3>
                  <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                      {t.deleteConfirmDesc}
                  </p>
                  <div className="flex flex-col gap-3">
                      <button 
                        onClick={confirmClearStorage}
                        className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
                      >
                          <Trash2 className="w-5 h-5" />
                          {t.deleteConfirmBtn}
                      </button>
                      <button 
                        onClick={() => setShowDeleteModal(false)}
                        className="text-sm text-slate-400 font-medium hover:text-slate-600"
                      >
                          {t.cancelBtn}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Input Section */}
      {/* Wizard Section */}
      {!plan && (
        <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-fade-in">
          {/* Wizard Header */}
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
             <h2 className="font-bold text-slate-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                {currentStep === 0 ? t.selectGrade : currentStep === 1 ? t.subjects : currentStep === 2 ? t.routineTitle : "Review"}
             </h2>
             <span className="text-xs font-medium text-slate-400">Step {currentStep + 1}/4</span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-slate-100 h-1">
             <div className="bg-indigo-600 h-1 transition-all duration-500 ease-out" style={{ width: `${(currentStep + 1) * 25}%` }} />
          </div>

          <div className="p-6 space-y-6">
             {/* STEP 0: Grade & Target */}
             {currentStep === 0 && (
                <div className="space-y-6 animate-fade-in">
                   {/* Grade Selection */}
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-2">{t.selectGrade}</label>
                     <div className="relative">
                       <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                         <GraduationCap className="h-5 w-5 text-indigo-400" />
                       </div>
                       <select
                         value={grade}
                         onChange={(e) => setGrade(e.target.value)}
                         className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                       >
                         {grades.map(g => (
                           <option key={g} value={g}>{g}</option>
                         ))}
                       </select>
                     </div>
                   </div>

                   {/* Exam Target Selection */}
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-2">{t.examTargetLabel}</label>
                     <div className="relative">
                       <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                         <Target className="h-5 w-5 text-indigo-400" />
                       </div>
                       <select
                         value={examTarget}
                         onChange={(e) => setExamTarget(e.target.value)}
                         className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                       >
                         {getAvailableExamTargets().map(target => (
                           <option key={target.id} value={target.id}>{target.label}</option>
                         ))}
                       </select>
                     </div>
                   </div>
                </div>
             )}

             {currentStep === 1 && (
                <div className="space-y-6 animate-fade-in">
                   {/* Add Subject */}
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-2">{t.subjects}</label>
                     <div className="flex gap-2">
                       <input
                         type="text"
                         value={newSubject}
                         onChange={(e) => setNewSubject(e.target.value)}
                         placeholder={t.subjectPlaceholder}
                         className="flex-1 pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                         onKeyDown={(e) => e.key === 'Enter' && addSubject()}
                       />
                       <Button onClick={addSubject} className="px-4 rounded-xl">
                         <Plus className="w-5 h-5" />
                       </Button>
                     </div>
                   </div>

                   {/* Subject List */}
                   <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                     {subjects.map(sub => (
                       <div key={sub.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group hover:border-indigo-200 transition-colors">
                         <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                             {sub.name.substring(0, 2).toUpperCase()}
                           </div>
                           <div>
                             <p className="text-sm font-bold text-slate-700">{sub.name}</p>
                             <p className="text-[10px] text-slate-400 uppercase tracking-wider">{sub.difficulty}</p>
                           </div>
                         </div>
                         <button onClick={() => removeSubject(sub.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                           <X className="w-4 h-4" />
                         </button>
                       </div>
                     ))}
                     {subjects.length === 0 && (
                       <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-100 rounded-xl">
                         No subjects added yet
                       </div>
                     )}
                   </div>
                </div>
             )}

             {/* STEP 2: Routine */}
             {currentStep === 2 && (
                <div className="space-y-6 animate-fade-in">
                   <div className="grid grid-cols-1 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                           <Home className="w-4 h-4 text-slate-400" /> {t.schoolEnd}
                        </label>
                        <input 
                          type="time" 
                          value={schoolEndTime}
                          onChange={(e) => setSchoolEndTime(e.target.value)}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                           <Moon className="w-4 h-4 text-slate-400" /> {t.bedTime}
                        </label>
                        <input 
                          type="time" 
                          value={bedTime}
                          onChange={(e) => setBedTime(e.target.value)}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                           <Calendar className="w-4 h-4 text-slate-400" /> {t.examDate}
                        </label>
                        <input 
                          type="date" 
                          value={examDate}
                          onChange={(e) => setExamDate(e.target.value)}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                           <Clock className="w-4 h-4 text-slate-400" /> {t.hoursPerDay}: <span className="text-indigo-600 font-bold">{hours}h</span>
                        </label>
                        <input 
                          type="range" 
                          min="1" 
                          max="8" 
                          step="0.5"
                          value={hours}
                          onChange={(e) => setHours(parseFloat(e.target.value))}
                          className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-xs text-slate-400 mt-1">
                          <span>1h</span>
                          <span>8h</span>
                        </div>
                     </div>
                   </div>
                </div>
             )}

             {/* STEP 3: Review */}
             {currentStep === 3 && (
                <div className="space-y-6 animate-fade-in text-center">
                   <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <Sparkles className="w-10 h-10 text-indigo-600" />
                   </div>
                   <h3 className="text-xl font-bold text-slate-800">Ready to Generate!</h3>
                   <p className="text-slate-500 text-sm max-w-xs mx-auto">
                      We will create a personalized study plan based on your {subjects.length} subjects and routine.
                   </p>
                   
                   <div className="bg-slate-50 p-4 rounded-xl text-left text-sm space-y-2 border border-slate-100">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Grade:</span>
                        <span className="font-medium text-slate-700">{grade}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Target:</span>
                        <span className="font-medium text-slate-700">{examTarget}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Subjects:</span>
                        <span className="font-medium text-slate-700">{subjects.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Daily Study:</span>
                        <span className="font-medium text-slate-700">{hours} hours</span>
                      </div>
                   </div>

                   {/* PROGRESS BAR */}
                   {isLoading && (
                     <div className="w-full mt-4 animate-fade-in text-left">
                         <div className="flex justify-between text-[10px] text-indigo-600 font-bold mb-1">
                             <span>{"සැලැස්ම සකසමින්..."}</span>
                             <span>{progress}%</span>
                         </div>
                         <div className="w-full bg-indigo-100 rounded-full h-2.5 overflow-hidden">
                             <div 
                                 className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
                                 style={{ width: `${progress}%` }}
                             ></div>
                         </div>
                     </div>
                   )}

                   {error && (
                     <div className="p-3 bg-rose-50 text-rose-600 text-sm rounded-lg border border-rose-100 flex items-center gap-2 justify-center">
                        <AlertTriangle className="w-4 h-4" />
                        {error}
                     </div>
                   )}
                </div>
             )}
          </div>

          {/* Navigation Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
             <Button 
               variant="secondary" 
               onClick={prevStep} 
               disabled={currentStep === 0}
               className="px-6"
             >
               <ChevronLeft className="w-4 h-4 mr-1" /> Back
             </Button>
             
             {currentStep < 3 ? (
                <Button onClick={nextStep} className="px-6 shadow-lg shadow-indigo-200">
                   Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
             ) : (
                <Button 
                  onClick={handleGenerate} 
                  isLoading={isLoading}
                  className="px-8 shadow-lg shadow-indigo-200 bg-gradient-to-r from-indigo-600 to-purple-600 border-0"
                >
                   {t.generateBtn} <Sparkles className="w-4 h-4 ml-2" />
                </Button>
             )}
          </div>
        </div>
      )}

      {/* Dashboard Section */}
      {plan && (
          <div className="space-y-4 animate-fade-in">
            {/* Main Goal / Roadmap Card */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white p-5 rounded-2xl shadow-lg shadow-indigo-100 relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4 opacity-90">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                            <Target className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="text-sm font-medium">{t.weeklyPlan}</h3>
                        {plan.source && (
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                plan.source === 'database' ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-100' :
                                plan.source === 'cache' ? 'bg-blue-500/20 border-blue-400/30 text-blue-100' :
                                'bg-purple-500/20 border-purple-400/30 text-purple-100'
                            }`}>
                                {plan.source === 'database' && <Database className="w-3 h-3" />}
                                {plan.source === 'cache' && <Save className="w-3 h-3" />}
                                {plan.source === 'ai' && <Sparkles className="w-3 h-3" />}
                                <span>{plan.source === 'database' ? 'Database' : plan.source === 'cache' ? 'Cached' : 'AI Generated'}</span>
                            </div>
                        )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {isAutoGenerating && (
                            <div className="flex items-center gap-1.5 bg-white/20 px-2 py-0.5 rounded-full backdrop-blur-sm animate-pulse">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span className="text-[10px] font-medium">Loading...</span>
                            </div>
                        )}
                        <button 
                            onClick={handleClearStorageClick}
                            className="flex items-center gap-1.5 bg-black/20 hover:bg-red-500/80 text-white px-3 py-1.5 rounded-lg backdrop-blur-sm transition-all text-xs font-medium"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t.remove}
                        </button>
                    </div>
                </div>
                <div className="flex justify-between items-end">
                    <div>
                        <p className="text-xl font-bold leading-tight">{plan.weeks.length} Week Roadmap</p>
                        <p className="text-xs text-white/70 mt-1">Exam Date: {plan.examDate}</p>
                    </div>
                    {/* Streak Counter */}
                    <div className="flex flex-col items-center bg-white/10 rounded-lg p-2 backdrop-blur-sm">
                        <div className="flex items-center gap-1">
                            <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" />
                            <span className="text-lg font-bold">{streak}</span>
                        </div>
                        <span className="text-[9px] uppercase tracking-wider text-white/80">{t.streak}</span>
                    </div>
                </div>
              </div>
              <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
            </div>

            {/* Weeks List */}
            <div className="space-y-3">
              {plan.weeks.map((week, index) => {
                const isExpanded = expandedWeekIndex === index;
                const isGeneratingThisWeek = loadingWeek === index;
                const isLocked = index >= 8 && !week.isUnlocked;
                const progress = calculateProgress(week.sessions);
                
                return (
                  <div key={week.weekNumber} className={`bg-white rounded-xl shadow-sm border transition-all duration-300 ${isExpanded ? 'border-indigo-200 ring-2 ring-indigo-50' : 'border-slate-100'}`}>
                    <button 
                      onClick={() => toggleWeek(index)}
                      className="w-full flex items-center justify-between p-4"
                    >
                      <div className="flex flex-col items-start gap-1 w-full max-w-[70%]">
                         <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${isExpanded ? 'text-indigo-700' : 'text-slate-700'}`}>
                              {`${t.week} ${week.weekNumber}`}
                            </span>
                            
                            {isLocked ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500 flex items-center gap-1">
                                    <Lock className="w-3 h-3" /> {t.locked}
                                </span>
                            ) : (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                    (week.phase || '').includes('Revision') ? 'bg-amber-100 text-amber-700' :
                                    (week.phase || '').includes('Consolidation') ? 'bg-blue-100 text-blue-700' :
                                    'bg-emerald-100 text-emerald-700'
                                    }`}>
                                    {week.phase}
                                </span>
                            )}
                         </div>
                         <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <Calendar className="w-3 h-3" />
                            {week.startDate} - {week.endDate}
                         </div>
                         {!isExpanded && !isLocked && (
                           <p className="text-xs text-slate-500 mt-1 line-clamp-1 text-left w-full">{week.goal}</p>
                         )}
                      </div>
                      
                      <div className="flex items-center gap-3">
                          {week.sessions.length > 0 && !isLocked && (
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-slate-400">{progress}%</span>
                                <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                </div>
                            </div>
                          )}
                          {isExpanded ? <ChevronDown className="w-5 h-5 text-indigo-500" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                      </div>
                    </button>

                    {isExpanded && !isLocked && (
                      <div className="px-4 pb-4 border-t border-slate-50 bg-slate-50/30 rounded-b-xl animate-fade-in">
                        <div className="mb-4 mt-3 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50">
                           <p className="text-xs text-indigo-800 font-medium flex items-center gap-2">
                             <Flag className="w-3 h-3" />
                             <span className="font-bold">{t.goal}:</span> {week.goal}
                           </p>
                        </div>

                        {isGeneratingThisWeek && (
                            <div className="flex flex-col items-center justify-center py-8 text-indigo-600">
                                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                <p className="text-xs font-medium">{t.generatingWeek}</p>
                            </div>
                        )}

                        {!isGeneratingThisWeek && week.sessions.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                                <Calendar className="w-8 h-8 mb-2 opacity-50" />
                                <p className="text-xs font-medium mb-3">{t.clickToLoad}</p>
                                <Button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setLoadingWeek(index);
                                        generateWeeklySessions(
                                            plan.weeks[index],
                                            subjects,
                                            hours,
                                            grade,
                                            language,
                                            busySlots,
                                            { schoolEndTime, bedTime, examDate },
                                            restDay
                                        ).then(sessions => {
                                            const newWeeks = [...plan.weeks];
                                            newWeeks[index] = { ...newWeeks[index], sessions: sessions };
                                            const updatedPlan = { ...plan, weeks: newWeeks };
                                            setPlan(updatedPlan);
                                            saveToStorage(updatedPlan);
                                        }).catch(e => console.error(e)).finally(() => setLoadingWeek(null));
                                    }}
                                    variant="secondary"
                                    className="text-xs h-8"
                                >
                                    Generate Schedule
                                </Button>
                            </div>
                        )}

                        {!isGeneratingThisWeek && week.sessions.length > 0 && (
                            <div className="grid gap-3">
                            {t.days.map(day => {
                                const englishDay = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][t.days.indexOf(day)];
                                const sinhalaDay = ['සඳුදා', 'අඟහරුවාදා', 'බදාදා', 'බ්‍රහස්පතින්දා', 'සිකුරාදා', 'සෙනසුරාදා', 'ඉරිදා'][t.days.indexOf(day)];
                                
                                const daySessions = week.sessions.filter(s => {
                                    const d = (s.day || '').toLowerCase().trim();
                                    return d.includes(englishDay.toLowerCase()) || 
                                           d.includes(sinhalaDay) || 
                                           d === day.toLowerCase().trim();
                                });
                                const dayBusySlots = busySlots.filter(s => 
                                s.day.toLowerCase() === englishDay.toLowerCase() || 
                                s.day === sinhalaDay
                                );
                                const isWeekend = englishDay === 'Saturday' || englishDay === 'Sunday';

                                if (daySessions.length === 0 && dayBusySlots.length === 0) return null;

                                return (
                                    <div key={day} className="bg-white p-3 rounded-lg border border-slate-200">
                                        <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                            {day}
                                        </h4>

                                        {!isWeekend && (
                                            <div className="mb-2 bg-slate-50 border border-slate-100 p-1.5 rounded flex items-center gap-2 opacity-60">
                                                <Home className="w-3 h-3 text-slate-400" />
                                                <span className="text-[10px] text-slate-400">School until {schoolEndTime}</span>
                                            </div>
                                        )}

                                        {dayBusySlots.map(slot => (
                                            <div key={slot.id} className="mb-2 bg-amber-50 border border-amber-100 p-1.5 rounded flex items-center gap-2">
                                                <Briefcase className="w-3 h-3 text-amber-400" />
                                                <div className="flex-1 leading-none">
                                                    <span className="text-[10px] font-bold text-amber-700">{slot.label}</span>
                                                    <span className="text-[9px] text-amber-600/70 ml-2">{slot.startTime}-{slot.endTime}</span>
                                                </div>
                                            </div>
                                        ))}

                                        <div className="space-y-2">
                                            {daySessions.map((session, daySessionIdx) => {
                                                const originalIndex = week.sessions.indexOf(session);
                                                
                                                return (
                                                <div 
                                                  key={daySessionIdx} 
                                                  className={`relative pl-3 border-l-2 py-1 transition-all ${session.isCompleted ? 'border-green-400 opacity-60 animate-success-glow' : 'border-indigo-100'}`}
                                                >
                                                    <div className="flex justify-between items-start gap-3">
                                                        <div className="flex flex-col">
                                                            <div className="flex justify-between items-start">
                                                            <span className={`text-[11px] font-bold ${session.isCompleted ? 'text-slate-500 line-through' : 'text-slate-700'}`}>{session.subject}</span>
                                                            </div>
                                                            <span className={`text-[10px] ${session.isCompleted ? 'text-slate-400' : 'text-slate-500'}`}>{session.topic}</span>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">{session.durationMinutes}m</span>
                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                                                    (session.technique || '').includes('Review') ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'
                                                                }`}>{session.technique}</span>
                                                            </div>
                                                        </div>
                                                        
                                                        <button 
                                                          onClick={(e) => { e.stopPropagation(); toggleTaskCompletion(index, originalIndex); }}
                                                          className={`shrink-0 w-6 h-6 rounded flex items-center justify-center border transition-all ${
                                                              session.isCompleted 
                                                              ? 'bg-green-500 border-green-500 text-white animate-success-pop' 
                                                              : 'bg-white border-slate-200 text-transparent hover:border-indigo-400'
                                                          }`}
                                                        >
                                                            <CheckSquare className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )})}
                                        </div>
                                    </div>
                                );
                            })}
                            </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Study Tips Section */}
            {plan.tips && plan.tips.length > 0 && (
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                <h3 className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" />
                  {t.tipsTitle}
                </h3>
                <ul className="space-y-2">
                  {plan.tips.map((tip, i) => (
                    <li key={i} className="flex gap-2 text-xs text-amber-900/80">
                      <span className="font-bold text-amber-500">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {plan.sourceUrls && plan.sourceUrls.length > 0 && (
              <div className="mt-4 p-4 bg-blue-50/50 rounded-xl border border-blue-100 text-xs text-blue-800">
                <p className="font-semibold mb-2 flex items-center gap-1">
                  <LinkIcon className="w-3 h-3" /> {t.sources}
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  {plan.sourceUrls.map((url, i) => (
                    <li key={i}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline truncate block max-w-full">
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
      )}
    </div>
    </div>
  );
};
