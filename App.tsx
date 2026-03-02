
import React, { useState, useEffect } from 'react';
import { StudyPlanner } from './components/StudyPlanner';
import { QuizMode } from './components/QuizMode';
import { TipsAgent } from './components/TipsAgent';
import { FlashcardMode } from './components/FlashcardMode';
import { AdminDataUpload } from './components/AdminDataUpload';
import { AdBanner } from './components/AdBanner';
import { PointsStore } from './components/PointsStore'; // Import the new component
import { Calendar, Brain, MessageSquare, GraduationCap, Languages, Layers, Database, Coins } from 'lucide-react';
import { Language } from './types';
import { App as CapacitorApp } from '@capacitor/app';

type Tab = 'planner' | 'quiz' | 'flashcards' | 'tips' | 'admin';
const POINTS_KEY = 'nexus_user_points';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('planner');
  const [language, setLanguage] = useState<Language>('si');
  
  // --- Points System State ---
  const [points, setPoints] = useState<number>(0);
  const [isPointsStoreOpen, setIsPointsStoreOpen] = useState(false);

  useEffect(() => {
    const savedPoints = localStorage.getItem(POINTS_KEY);
    if (savedPoints) {
      setPoints(parseInt(savedPoints, 10));
    }
  }, []);

  const addPoints = (amount: number) => {
    setPoints(prev => {
      const newTotal = prev + amount;
      localStorage.setItem(POINTS_KEY, newTotal.toString());
      return newTotal;
    });
  };

  const spendPoints = (amount: number) => {
    setPoints(prev => {
      if (prev < amount) return prev; // Should not happen if button is disabled
      const newTotal = prev - amount;
      localStorage.setItem(POINTS_KEY, newTotal.toString());
      return newTotal;
    });
  };

  // --- Android Hardware Back Button Handling ---
  useEffect(() => {
    // Only works if running in Capacitor/Android
    const setupBackButton = async () => {
        try {
            await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
                if (activeTab !== 'planner') {
                    // If on any other tab, go back to Home (Planner)
                    setActiveTab('planner');
                } else {
                    // If on Planner, exit app (or minimize)
                    CapacitorApp.exitApp();
                }
            });
        } catch (e) {
            // Fails silently on web, which is expected
        }
    };
    setupBackButton();

    return () => {
        try { CapacitorApp.removeAllListeners(); } catch(e) {}
    };
  }, [activeTab]);

  const t = {
    si: {
      plannerTab: "කාලසටහන",
      quizTab: "අභ්‍යාස",
      flashTab: "කාඩ්පත්",
      tipsTab: "AI ගුරුවරයා",
      appTitle: "Nexus Study",
    },
    en: {
      plannerTab: "Plan",
      quizTab: "Quiz",
      flashTab: "Flashcards",
      tipsTab: "Tutor",
      appTitle: "Nexus Study",
    }
  }[language];

  return (
    <div className="min-h-screen bg-slate-50/80 text-slate-900 font-sans selection:bg-indigo-100 flex flex-col">
      {/* POINTS STORE MODAL */}
      {isPointsStoreOpen && (
        <PointsStore 
          points={points}
          addPoints={addPoints}
          onClose={() => setIsPointsStoreOpen(false)}
          language={language}
        />
      )}

      {/* Top Header - Adjusted for Android Notch (padding-top: safe-area) */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-purple-700 tracking-tight">
                {t.appTitle}
              </h1>
            </div>

            <div className="flex items-center gap-4">
              {/* Desktop Nav */}
              <nav className="hidden sm:flex bg-slate-100/50 p-1.5 rounded-2xl border border-slate-200/50">
                {[
                  { id: 'planner', icon: Calendar, label: t.plannerTab },
                  { id: 'quiz', icon: Brain, label: t.quizTab },
                  { id: 'flashcards', icon: Layers, label: t.flashTab },
                  { id: 'tips', icon: MessageSquare, label: t.tipsTab },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as Tab)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 ${
                      activeTab === tab.id 
                      ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200' 
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                ))}
              </nav>

              <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Points Display/Button */}
                <button 
                  onClick={() => setIsPointsStoreOpen(true)}
                  className="flex items-center gap-2 text-sm font-bold text-amber-600 hover:text-amber-700 transition-colors bg-amber-50 px-3 py-2 rounded-xl border border-amber-200 shadow-sm active:scale-95"
                >
                  <Coins className="w-4 h-4" />
                  <span>{points}</span>
                </button>

                {/* Language Toggle */}
                <button 
                    onClick={() => setLanguage(l => l === 'si' ? 'en' : 'si')}
                    className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm active:scale-95"
                >
                    <Languages className="w-4 h-4" />
                    <span>{language === 'si' ? 'SI' : 'EN'}</span>
                </button>

                 {/* Admin Button */}
                 <button 
                    onClick={() => setActiveTab('admin')}
                    className={`p-2 rounded-xl border transition-colors ${activeTab === 'admin' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400 hover:text-indigo-600'}`}
                    title="Database Admin / Upload"
                >
                    <Database className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-32 sm:pb-12 w-full">
        <div className="transition-all duration-300">
            {activeTab === 'planner' && <StudyPlanner language={language} points={points} spendPoints={spendPoints} />}
            {activeTab === 'quiz' && <QuizMode language={language} />}
            {activeTab === 'flashcards' && <FlashcardMode language={language} />}
            {activeTab === 'tips' && <TipsAgent language={language} />}
            {activeTab === 'admin' && <AdminDataUpload />}
        </div>
      </main>

      {/* Ad Banner Area */}
      <AdBanner />

      {/* Mobile Bottom Navigation Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)] z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex justify-between items-center">
        {[
            { id: 'planner', icon: Calendar, label: t.plannerTab },
            { id: 'quiz', icon: Brain, label: t.quizTab },
            { id: 'flashcards', icon: Layers, label: t.flashTab },
            { id: 'tips', icon: MessageSquare, label: t.tipsTab },
            { id: 'admin', icon: Database, label: 'Admin' }, 
        ].map((tab) => (
            <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)} 
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
            <div className={`p-1.5 rounded-full transition-all ${activeTab === tab.id ? 'bg-indigo-50' : 'bg-transparent'}`}>
                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'fill-indigo-600 text-indigo-600' : ''}`} />
            </div>
            <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
        ))}
      </nav>
      
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes success-pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        .animate-success-pop {
          animation: success-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes success-glow {
          0% { background-color: transparent; }
          30% { background-color: rgba(34, 197, 94, 0.15); }
          100% { background-color: transparent; }
        }
        .animate-success-glow {
          animation: success-glow 0.8s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default App;
