
import React, { useState, useEffect, useRef } from 'react';
import { Subject, Difficulty, StudyPlan, Language, BusySlot, WeeklySchedule } from '../types';
import { generateStudyPlan, generateWeeklySessions } from '../services/geminiService';
import { Plus, Calendar, Clock, BookOpen, Activity, GraduationCap, Target, Sparkles, X, Link as LinkIcon, Briefcase, Moon, Home, ChevronDown, ChevronRight, Flag, Coffee, Loader2, Save, Trash2, CheckSquare, Zap, Lock, PlayCircle, Coins, Lightbulb } from 'lucide-react';
import { Button } from './ui/Button';

interface StudyPlannerProps {
  language: Language;
  points: number;
  spendPoints: (amount: number) => void;
}

const STORAGE_KEY = 'nexus_study_plan_v1';
const STREAK_KEY = 'nexus_study_streak';

export const StudyPlanner: React.FC<StudyPlannerProps> = ({ language, points, spendPoints }) => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.Medium);
  const [hours, setHours] = useState(2);
  const [grade, setGrade] = useState('10 ශ්‍රේණිය (Grade 10)');
  const [examTarget, setExamTarget] = useState('O/L');
  const [focus, setFocus] = useState('');
  
  // Routine State
  const [schoolEndTime, setSchoolEndTime] = useState('14:30');
  const [bedTime, setBedTime] = useState('22:00');
  const [examDate, setExamDate] = useState('');
  const [restDay, setRestDay] = useState<string>('None');
  
  // Busy Slot State
  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);
  const [newClassDay, setNewClassDay] = useState(language === 'si' ? 'සඳුදා' : 'Monday');
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

  // Streak State
  const [streak, setStreak] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0); // Progress State
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const clearStorage = () => {
    if (window.confirm(language === 'si' ? "ඔබට විශ්වාසද? ඔබගේ දැනට පවතින සැලැස්ම මැකී යනු ඇත." : "Are you sure? This will delete your current plan.")) {
        localStorage.removeItem(STORAGE_KEY);
        setPlan(null);
        setExpandedWeekIndex(0);
        setStreak(0);
        localStorage.removeItem(STREAK_KEY);
    }
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
      locked: "අගුළු දමා ඇත"
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
      locked: "Locked"
    }
  }[language];

  const grades = [
    "6 ශ්‍රේණිය (Grade 6)", "7 ශ්‍රේණිය (Grade 7)", "8 ශ්‍රේණිය (Grade 8)", 
    "9 ශ්‍රේණිය (Grade 9)", "10 ශ්‍රේණිය (Grade 10)", "11 ශ්‍රේණිය (Grade 11)",
    "12 ශ්‍රේණිය (Grade 12)", "13 ශ්‍රේණිය (Grade 13)"
  ];

  const getAvailableExamTargets = () => {
    if (grade.includes('10') || grade.includes('11')) {
      return [
        { id: 'O/L', label: t.ol },
        { id: 'Term Test', label: t.termTest },
        { id: 'O/L & Term Tests', label: t.olAndTerm }
      ];
    } else if (grade.includes('12') || grade.includes('13')) {
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
    { val: 'Sunday', label: language === 'si' ? 'ඉරිදා' : 'Sunday' },
    { val: 'Saturday', label: language === 'si' ? 'සෙනසුරාදා' : 'Saturday' },
    { val: 'Friday', label: language === 'si' ? 'සිකුරාදා' : 'Friday' }
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
        (p) => setProgress(p) // New callback
      );
      setPlan(generatedPlan);
      saveToStorage(generatedPlan);
    } catch (err) {
      setError(t.errorGen);
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20 lg:pb-0">
      
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

      {/* Input Section */}
      <div className="lg:col-span-4">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="mb-2">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              {t.title}
            </h2>
            <p className="text-[11px] text-slate-400">{t.subtitle}</p>
          </div>
          
          <div className="space-y-4">
            {/* Grade Selection */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t.selectGrade}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                  <GraduationCap className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full pl-8 pr-4 py-2 bg-slate-50 border-0 rounded-lg text-sm text-slate-700 font-medium focus:ring-1 focus:ring-indigo-500 transition-all hover:bg-slate-100/80"
                >
                  {grades.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                   <span className="text-slate-400 text-[10px]">▼</span>
                </div>
              </div>
            </div>

            {/* Exam Target Selection */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t.examTargetLabel}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                  <Target className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <select
                  value={examTarget}
                  onChange={(e) => setExamTarget(e.target.value)}
                  className="w-full pl-8 pr-4 py-2 bg-slate-50 border-0 rounded-lg text-sm text-slate-700 font-medium focus:ring-1 focus:ring-indigo-500 transition-all hover:bg-slate-100/80"
                >
                  {examTargets.map(target => (
                    <option key={target.id} value={target.id}>{target.label}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                   <span className="text-slate-400 text-[10px]">▼</span>
                </div>
              </div>
            </div>

            {/* Routine Section */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <label className="text-xs font-bold text-slate-700">{t.routineTitle}</label>
              </div>
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                   <label className="text-[10px] text-slate-500 block mb-1 flex items-center gap-1">
                      <Home className="w-3 h-3" /> {t.schoolEnd}
                   </label>
                   <input 
                     type="time" 
                     value={schoolEndTime}
                     onChange={(e) => setSchoolEndTime(e.target.value)}
                     className="w-full p-1.5 text-xs rounded border border-slate-200 focus:ring-1 focus:ring-indigo-500"
                   />
                </div>
                <div>
                   <label className="text-[10px] text-slate-500 block mb-1 flex items-center gap-1">
                      <Moon className="w-3 h-3" /> {t.bedTime}
                   </label>
                   <input 
                     type="time" 
                     value={bedTime}
                     onChange={(e) => setBedTime(e.target.value)}
                     className="w-full p-1.5 text-xs rounded border border-slate-200 focus:ring-1 focus:ring-indigo-500"
                   />
                </div>
                <div>
                   <label className="text-[10px] text-slate-500 block mb-1 flex items-center gap-1">
                      <Target className="w-3 h-3" /> {t.examDate}
                   </label>
                   <input 
                     type="date" 
                     value={examDate}
                     onChange={(e) => setExamDate(e.target.value)}
                     className="w-full p-1.5 text-xs rounded border border-slate-200 focus:ring-1 focus:ring-indigo-500"
                   />
                </div>
                <div>
                   <label className="text-[10px] text-slate-500 block mb-1 flex items-center gap-1">
                      <Coffee className="w-3 h-3" /> {t.restDay}
                   </label>
                   <select 
                     value={restDay}
                     onChange={(e) => setRestDay(e.target.value)}
                     className="w-full p-1.5 text-xs rounded border border-slate-200 focus:ring-1 focus:ring-indigo-500"
                   >
                     {restDayOptions.map(opt => (
                       <option key={opt.val} value={opt.val}>{opt.label}</option>
                     ))}
                   </select>
                </div>
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* Subject Input */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t.enterSubject}</label>
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                  </div>
                  <input
                    type="text"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder={t.subjectPlaceholder}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border-0 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 transition-all hover:bg-slate-100/80"
                    onKeyDown={(e) => e.key === 'Enter' && addSubject()}
                  />
                </div>
                
                <div className="flex gap-2">
                  <div className="relative flex-1">
                     <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                      className="w-full pl-8 pr-6 py-2 bg-slate-50 border-0 rounded-lg text-xs font-medium text-slate-600 focus:ring-1 focus:ring-indigo-500 appearance-none hover:bg-slate-100/80"
                    >
                      <option value={Difficulty.Easy}>{t.easy}</option>
                      <option value={Difficulty.Medium}>{t.medium}</option>
                      <option value={Difficulty.Hard}>{t.hard}</option>
                    </select>
                    <Activity className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-indigo-400 pointer-events-none" />
                  </div>
                  
                  <Button onClick={addSubject} className="aspect-square !p-0 w-[36px] h-[36px] rounded-lg flex items-center justify-center shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Tags Display */}
            {subjects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50/50 rounded-lg border border-slate-100/50 min-h-[40px]">
                {subjects.map(sub => (
                  <span key={sub.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
                    sub.difficulty === Difficulty.Hard ? 'bg-white text-rose-600 border-rose-100' :
                    sub.difficulty === Difficulty.Medium ? 'bg-white text-amber-600 border-amber-100' :
                    'bg-white text-emerald-600 border-emerald-100'
                  }`}>
                    {sub.name}
                    <button onClick={() => removeSubject(sub.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            
            <hr className="border-slate-100" />

            {/* Class / Busy Times Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <Briefcase className="w-3 h-3" /> {t.addClassTitle}
                </label>
                <button 
                  onClick={() => setShowClassInput(!showClassInput)}
                  className="text-[10px] text-indigo-600 font-medium hover:underline"
                >
                  {showClassInput ? 'Close' : '+ Add'}
                </button>
              </div>

              {showClassInput && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-3 space-y-2 animate-fade-in">
                  <select 
                    value={newClassDay} 
                    onChange={e => setNewClassDay(e.target.value)}
                    className="w-full p-2 text-xs rounded border border-slate-200 bg-white"
                  >
                    {t.days.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <div className="flex-1">
                       <label className="text-[9px] text-slate-400 block mb-0.5">{t.startTime}</label>
                       <input 
                         type="time" 
                         value={newClassStart}
                         onChange={e => setNewClassStart(e.target.value)}
                         className="w-full p-1.5 text-xs rounded border border-slate-200"
                       />
                    </div>
                    <div className="flex-1">
                       <label className="text-[9px] text-slate-400 block mb-0.5">{t.endTime}</label>
                       <input 
                         type="time" 
                         value={newClassEnd}
                         onChange={e => setNewClassEnd(e.target.value)}
                         className="w-full p-1.5 text-xs rounded border border-slate-200"
                       />
                    </div>
                  </div>
                  <input 
                    type="text" 
                    placeholder={t.classPlaceholder}
                    value={newClassLabel}
                    onChange={e => setNewClassLabel(e.target.value)}
                    className="w-full p-2 text-xs rounded border border-slate-200"
                  />
                  <Button onClick={addBusySlot} variant="secondary" className="w-full h-8 text-xs">{t.addClassBtn}</Button>
                </div>
              )}

              {busySlots.length > 0 && (
                <div className="space-y-1.5">
                  {busySlots.map(slot => (
                    <div key={slot.id} className="flex items-center justify-between bg-slate-100 px-2 py-1.5 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-2">
                         <span className="text-[10px] font-bold text-slate-600 bg-white px-1.5 rounded">{slot.day.slice(0, 3)}</span>
                         <div className="flex flex-col">
                           <span className="text-[10px] font-medium text-slate-800">{slot.label}</span>
                           <span className="text-[9px] text-slate-400">{slot.startTime} - {slot.endTime}</span>
                         </div>
                      </div>
                      <button onClick={() => removeBusySlot(slot.id)} className="text-slate-400 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <hr className="border-slate-100" />

            {/* Hours Slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                 <label className="text-xs font-medium text-slate-500">{t.hoursLabel}</label>
                 <span className="text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded text-[10px]">{hours}h</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                inputMode="decimal"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                 <span>1h</span>
                 <span>8h</span>
              </div>
            </div>

            {/* Focus Input */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t.focusLabel}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                  <Target className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <input
                  type="text"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder={t.focusPlaceholder}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border-0 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 transition-all hover:bg-slate-100/80"
                />
              </div>
            </div>

            {error && <p className="text-rose-500 text-xs bg-rose-50 p-2 rounded-lg flex items-center gap-2 border border-rose-100"><div className="w-1 h-1 rounded-full bg-rose-500" />{error}</p>}

            <Button 
                onClick={handleGenerate} 
                isLoading={isLoading} 
                className="w-full py-2.5 rounded-lg text-sm font-semibold shadow shadow-indigo-200 hover:shadow-md transition-all bg-gradient-to-r from-indigo-600 to-purple-600 border-0 mt-1"
            >
              {t.generateBtn}
            </Button>
            
            {/* PROGRESS BAR */}
            {isLoading && (
              <div className="w-full mt-4 animate-fade-in">
                  <div className="flex justify-between text-[10px] text-indigo-600 font-bold mb-1">
                      <span>{language === 'si' ? "සැලැස්ම සකසමින්..." : "Creating your roadmap..."}</span>
                      <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-indigo-100 rounded-full h-2.5 overflow-hidden">
                      <div 
                          className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
                          style={{ width: `${progress}%` }}
                      ></div>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1.5 text-center">
                      {progress < 30 
                        ? (language === 'si' ? "විෂය නිර්දේශය අධ්‍යයනය කරමින්..." : "Analyzing Syllabus...") 
                        : progress < 60 
                          ? (language === 'si' ? "මූලික සැලැස්ම සකසමින්..." : "Drafting Phase 1...") 
                          : (language === 'si' ? "දිගුකාලීන සැලැස්ම සම්පූර්ණ කරමින්..." : "Finalizing Long-term Plan...")
                      }
                  </p>
              </div>
            )}
            
            {/* Clear Data Button (Only if plan exists and NOT loading) */}
            {plan && !isLoading && (
                <button 
                  onClick={clearStorage}
                  className="w-full mt-2 py-2 flex items-center justify-center gap-2 text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> {t.newPlan}
                </button>
            )}
          </div>
        </div>
      </div>

      {/* Output Section */}
      <div className="lg:col-span-8">
        {plan ? (
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
                            onClick={clearStorage}
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
                                    week.phase.includes('Revision') ? 'bg-amber-100 text-amber-700' :
                                    week.phase.includes('Consolidation') ? 'bg-blue-100 text-blue-700' :
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

                        {!isGeneratingThisWeek && week.sessions.length > 0 && (
                            <div className="grid gap-3">
                            {t.days.map(day => {
                                const englishDay = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][t.days.indexOf(day)];
                                const sinhalaDay = ['සඳුදා', 'අඟහරුවාදා', 'බදාදා', 'බ්‍රහස්පතින්දා', 'සිකුරාදා', 'සෙනසුරාදා', 'ඉරිදා'][t.days.indexOf(day)];
                                
                                const daySessions = week.sessions.filter(s => 
                                s.day.toLowerCase().includes(englishDay.toLowerCase()) || 
                                s.day.includes(sinhalaDay) || 
                                s.day === day
                                );
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
                                                                    session.technique.includes('Review') ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'
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
        ) : (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-400 p-6 bg-white/50 rounded-2xl border-2 border-dashed border-slate-200 hover:border-slate-300 transition-colors">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-600 mb-1">{t.noPlan}</h3>
            <p className="text-xs text-slate-500 text-center max-w-xs">{t.noPlanDesc}</p>
          </div>
        )}
      </div>
    </div>
  );
};
