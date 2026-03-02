
import React, { useState } from 'react';
import { generateFlashcards } from '../services/geminiService';
import { Flashcard, Language } from '../types';
import { Button } from './ui/Button';
import { Layers, RotateCcw, ChevronRight, ChevronLeft, Brain, GraduationCap } from 'lucide-react';

interface FlashcardModeProps {
  language: Language;
}

export const FlashcardMode: React.FC<FlashcardModeProps> = ({ language }) => {
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [grade, setGrade] = useState('10 ශ්‍රේණිය (Grade 10)');
  const [count, setCount] = useState(10);
  
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const t = {
    si: {
      title: "ස්මාර්ට් ෆ්ලෑෂ් කාඩ්",
      desc: "පාඩම් කළ දේ මතකද බලන්න. මාතෘකාවක් ලබා දෙන්න, අපි කාඩ්පත් සාදා දෙන්නෙමු.",
      subjectPH: "විෂය (උදා: ජීව විද්‍යාව)",
      topicPH: "පාඩම (උදා: සෛල විභාජනය)",
      generate: "කාඩ්පත් සාදන්න",
      loading: "AI විසින් කාඩ්පත් සකසමින් පවතී...",
      empty: "කාඩ්පත් නැත",
      flip: "අනිත් පැත්ත",
      next: "ඊළඟ",
      prev: "පෙර",
      front: "ප්‍රශ්නය / වචනය",
      back: "පිළිතුර / තේරුම",
      reset: "නව මාතෘකාවක්"
    },
    en: {
      title: "Smart Flashcards",
      desc: "Active recall is the best way to study. Enter a topic to generate cards.",
      subjectPH: "Subject (Ex: Biology)",
      topicPH: "Topic (Ex: Cell Division)",
      generate: "Generate Cards",
      loading: "AI is creating your flashcards...",
      empty: "No cards yet",
      flip: "Flip Card",
      next: "Next",
      prev: "Previous",
      front: "Front",
      back: "Back",
      reset: "New Topic"
    }
  }[language];

  const handleGenerate = async () => {
    if (!subject || !topic) return;
    setIsLoading(true);
    setCards([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    try {
      const result = await generateFlashcards(subject, topic, count, grade, language);
      setCards(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const nextCard = () => {
    if (currentIndex < cards.length - 1) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex(c => c + 1), 150);
    }
  };

  const prevCard = () => {
    if (currentIndex > 0) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex(c => c - 1), 150);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-slate-500">{t.loading}</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mb-4">
          <Layers className="w-7 h-7 text-purple-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">{t.title}</h2>
        <p className="text-slate-500 mb-6 text-sm">{t.desc}</p>
        
        <div className="space-y-4">
            <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Grade</label>
            <div className="relative">
                <GraduationCap className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                   {["6 ශ්‍රේණිය (Grade 6)", "7 ශ්‍රේණිය (Grade 7)", "8 ශ්‍රේණිය (Grade 8)", 
                     "9 ශ්‍රේණිය (Grade 9)", "10 ශ්‍රේණිය (Grade 10)", "11 ශ්‍රේණිය (Grade 11)",
                     "12 ශ්‍රේණිය (Grade 12)", "13 ශ්‍රේණිය (Grade 13)"].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
            </div>
            </div>
          <input
            className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            placeholder={t.subjectPH}
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
          <input
            className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            placeholder={t.topicPH}
            value={topic}
            onChange={e => setTopic(e.target.value)}
          />
          <Button onClick={handleGenerate} className="w-full bg-purple-600 hover:bg-purple-700">{t.generate}</Button>
        </div>
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  return (
    <div className="max-w-xl mx-auto h-full flex flex-col items-center">
      {/* Header Controls */}
      <div className="w-full flex justify-between items-center mb-6">
        <Button variant="ghost" onClick={() => setCards([])} className="text-xs">
          <RotateCcw className="w-3 h-3 mr-1" /> {t.reset}
        </Button>
        <span className="text-sm font-bold text-slate-400">
          {currentIndex + 1} / {cards.length}
        </span>
      </div>

      {/* Card Container */}
      <div 
        className="relative w-full aspect-[4/3] perspective-1000 cursor-pointer group"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div className={`relative w-full h-full transition-all duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
          
          {/* Front */}
          <div className="absolute w-full h-full backface-hidden bg-white border-2 border-slate-100 rounded-3xl shadow-lg flex flex-col items-center justify-center p-8 text-center hover:border-purple-200 transition-colors">
            <span className="absolute top-4 left-4 text-xs font-bold text-slate-300 uppercase tracking-widest">{t.front}</span>
            <Brain className="w-8 h-8 text-purple-100 mb-4" />
            <p className="text-xl sm:text-2xl font-bold text-slate-800">{currentCard.front}</p>
            <p className="absolute bottom-4 text-xs text-slate-400 animate-pulse">{t.flip}</p>
          </div>

          {/* Back */}
          <div className="absolute w-full h-full backface-hidden bg-gradient-to-br from-purple-600 to-indigo-700 rounded-3xl shadow-lg flex flex-col items-center justify-center p-8 text-center rotate-y-180 text-white">
            <span className="absolute top-4 left-4 text-xs font-bold text-white/40 uppercase tracking-widest">{t.back}</span>
            <p className="text-lg sm:text-xl font-medium leading-relaxed">{currentCard.back}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-4 mt-8">
        <button 
          onClick={prevCard}
          disabled={currentIndex === 0}
          className="p-3 rounded-full bg-white border border-slate-200 shadow-sm disabled:opacity-50 hover:bg-slate-50 transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-slate-600" />
        </button>
        <button 
          onClick={nextCard}
          disabled={currentIndex === cards.length - 1}
          className="p-3 rounded-full bg-purple-600 shadow-lg shadow-purple-200 disabled:opacity-50 hover:bg-purple-700 transition-colors transform active:scale-95"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      </div>
      
      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
};
