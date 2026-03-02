
import React, { useState, useEffect } from 'react';
import { generateQuiz } from '../services/geminiService';
import { QuizQuestion, Difficulty, Language } from '../types';
import { Button } from './ui/Button';
import { Brain, CheckCircle, XCircle, ChevronRight, RefreshCw, Trophy, GraduationCap, Layers, Hash, Clock } from 'lucide-react';

interface QuizModeProps {
  language: Language;
}

export const QuizMode: React.FC<QuizModeProps> = ({ language }) => {
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [subTopic, setSubTopic] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.Medium);
  const [grade, setGrade] = useState('10 ශ්‍රේණිය (Grade 10)');
  const [quizFinished, setQuizFinished] = useState(false);
  
  // Timer State
  const [timeLeft, setTimeLeft] = useState(0);

  const t = {
    si: {
      loading: `AI විසින් ${grade} පෙළපොත් ඇසුරෙන් ප්‍රශ්න ${questionCount}ක් සකසමින් පවතී...`,
      finishTitle: "අභ්‍යාසය අවසන්!",
      scoreText: (s: number, t: number) => `ඔබේ ලකුණු: ${t} න් ${s} යි.`,
      resetBtn: "නැවත සකසන්න",
      retryBtn: "යළි උත්සාහ කරන්න",
      title: "දැනුම මනින අභ්‍යාස",
      desc: "ඔබේ විෂය නිර්දේශයට (NIE) අදාළව AI මගින් සකසන ලද ප්‍රශ්න පත්‍රයක් ලබාගන්න.",
      gradeLabel: "ශ්‍රේණිය",
      subjectLabel: "විෂය (Subject)",
      subjectPlaceholder: "උදා: විද්‍යාව, ඉතිහාසය",
      topicLabel: "පාඩම (Topic) - අවශ්‍ය නම්",
      topicPlaceholder: "උදා: බලය, 2 වන ලෝක යුද්ධය",
      subTopicLabel: "උප මාතෘකාව (Sub-topic) - අවශ්‍ය නම්",
      subTopicPlaceholder: "උදා: නිව්ටන්ගේ නියම",
      countLabel: "ප්‍රශ්න ගණන",
      diffLabel: "අසීරුතාව",
      startBtn: "ප්‍රශ්න විචාරය අරඹන්න",
      qPrefix: "ප්‍රශ්නය",
      points: "ලකුණු",
      explanation: "පැහැදිලි කිරීම",
      next: "ඊළඟ ප්‍රශ්නය",
      finish: "අවසානයි",
      easy: "ලේසි",
      medium: "සාමාන්‍ය",
      hard: "අමාරු",
      error: "ප්‍රශ්න පත්‍රය සෑදීමට නොහැකි විය. කරුණාකර නැවත උත්සාහ කරන්න.",
      timeLeft: "ඉතිරි කාලය",
      timesUp: "කාලය අවසන්!",
    },
    en: {
      loading: `AI is generating ${questionCount} questions from ${grade} textbooks...`,
      finishTitle: "Quiz Completed!",
      scoreText: (s: number, t: number) => `Your score: ${s} out of ${t}.`,
      resetBtn: "Reset",
      retryBtn: "Try Again",
      title: "Knowledge Quiz",
      desc: "Get an AI-generated quiz based on your NIE syllabus.",
      gradeLabel: "Grade",
      subjectLabel: "Subject",
      subjectPlaceholder: "Ex: Science, History",
      topicLabel: "Topic (Optional)",
      topicPlaceholder: "Ex: Force, World War II",
      subTopicLabel: "Sub-topic (Optional)",
      subTopicPlaceholder: "Ex: Newton's Laws",
      countLabel: "Number of Questions",
      diffLabel: "Difficulty",
      startBtn: "Start Quiz",
      qPrefix: "Question",
      points: "Points",
      explanation: "Explanation",
      next: "Next Question",
      finish: "Finish",
      easy: "Easy",
      medium: "Medium",
      hard: "Hard",
      error: "Could not generate quiz. Please try again.",
      timeLeft: "Time Left",
      timesUp: "Time's Up!",
    }
  }[language];

  const grades = [
    "6 ශ්‍රේණිය (Grade 6)", "7 ශ්‍රේණිය (Grade 7)", "8 ශ්‍රේණිය (Grade 8)", 
    "9 ශ්‍රේණිය (Grade 9)", "10 ශ්‍රේණිය (Grade 10)", "11 ශ්‍රේණිය (Grade 11)",
    "12 ශ්‍රේණිය (Grade 12)", "13 ශ්‍රේණිය (Grade 13)"
  ];

  const startQuiz = async () => {
    if (!subject.trim()) return;
    setIsLoading(true);
    setQuizFinished(false);
    setScore(0);
    setCurrentIndex(0);
    setQuestions([]);
    
    try {
      const qs = await generateQuiz(subject, topic, subTopic, questionCount, difficulty, grade, language);
      // Set time: 1 minute per question
      setTimeLeft(qs.length * 60); 
      setQuestions(qs);
    } catch (e) {
      console.error(e);
      alert(t.error);
    } finally {
      setIsLoading(false);
    }
  };

  // Timer Effect
  useEffect(() => {
    if (!questions.length || quizFinished) return;

    if (timeLeft <= 0) {
      setQuizFinished(true);
      return;
    }

    const timerId = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timerId);
  }, [timeLeft, questions.length, quizFinished]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswer = (index: number) => {
    if (selectedOption !== null) return; // Prevent changing answer
    setSelectedOption(index);
    setShowExplanation(true);
    
    if (index === questions[currentIndex].correctIndex) {
      setScore(s => s + 1);
    }
  };

  const nextQuestion = () => {
    setSelectedOption(null);
    setShowExplanation(false);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setQuizFinished(true);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-slate-600 font-medium">{t.loading}</p>
      </div>
    );
  }

  if (quizFinished) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center animate-fade-in">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mb-6">
            <Trophy className="w-10 h-10 text-yellow-600" />
        </div>
        <h3 className="text-2xl font-bold text-slate-800 mb-2">{timeLeft <= 0 ? t.timesUp : t.finishTitle}</h3>
        <p className="text-slate-600 mb-6 text-lg">
          {language === 'si' 
            ? <>ඔබේ ලකුණු: <span className="font-bold text-indigo-600">{questions.length}</span> න් <span className="font-bold text-indigo-600">{score}</span> යි.</>
            : <>Your Score: <span className="font-bold text-indigo-600">{score}</span> out of <span className="font-bold text-indigo-600">{questions.length}</span></>
          }
        </p>
        
        <div className="flex gap-4">
            <Button onClick={() => setQuestions([])} variant="secondary">{t.resetBtn}</Button>
            <Button onClick={startQuiz}>{t.retryBtn}</Button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center">
        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Brain className="w-8 h-8 text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">{t.title}</h2>
        <p className="text-slate-500 mb-8">{t.desc}</p>
        
        <div className="space-y-4 text-left">
          {/* Grade Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.gradeLabel}</label>
            <div className="relative">
                <GraduationCap className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                >
                  {grades.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
            </div>
          </div>

          {/* Subject Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.subjectLabel} <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t.subjectPlaceholder}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {/* Topic & Subtopic */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.topicLabel}</label>
              <input 
                type="text" 
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t.topicPlaceholder}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.subTopicLabel}</label>
              <input 
                type="text" 
                value={subTopic}
                onChange={(e) => setSubTopic(e.target.value)}
                placeholder={t.subTopicPlaceholder}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
          </div>

          {/* Question Count */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.countLabel}: {questionCount}</label>
            <div className="flex items-center gap-4">
              <Hash className="w-5 h-5 text-slate-400" />
              <input
                type="range"
                min="1"
                max="20"
                step="1"
                value={questionCount}
                onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <span className="text-sm font-bold text-indigo-600 min-w-[20px]">{questionCount}</span>
            </div>
          </div>
          
          {/* Difficulty */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.diffLabel}</label>
            <div className="grid grid-cols-3 gap-2">
              {[Difficulty.Easy, Difficulty.Medium, Difficulty.Hard].map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors border ${
                    difficulty === d 
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {d === Difficulty.Easy ? t.easy : d === Difficulty.Medium ? t.medium : t.hard}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={startQuiz} className="w-full py-3 text-lg mt-4">{t.startBtn}</Button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex justify-between items-center text-sm font-medium text-slate-500">
        <span className="flex items-center gap-2">
           {t.qPrefix} {currentIndex + 1} / {questions.length}
        </span>
        
        <div className="flex items-center gap-4">
            {/* Countdown Timer */}
            <div className={`flex items-center gap-1.5 ${timeLeft < 10 ? 'text-rose-600 font-bold animate-pulse' : 'text-slate-600'}`}>
                <Clock className="w-4 h-4" />
                <span className="font-mono">{formatTime(timeLeft)}</span>
            </div>
            <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs">{t.points}: {score}</span>
        </div>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-md border border-slate-100">
        <h3 className="text-xl font-semibold text-slate-900 mb-6 leading-relaxed">
            {currentQ.question}
        </h3>

        <div className="space-y-3">
          {currentQ.options.map((option, idx) => {
            let stateClass = "border-slate-200 hover:bg-slate-50 hover:border-slate-300";
            if (selectedOption !== null) {
                if (idx === currentQ.correctIndex) stateClass = "bg-green-50 border-green-200 text-green-800";
                else if (idx === selectedOption) stateClass = "bg-red-50 border-red-200 text-red-800";
                else stateClass = "opacity-50 border-slate-100";
            }
            
            return (
              <button
                key={idx}
                onClick={() => handleAnswer(idx)}
                disabled={selectedOption !== null}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all flex justify-between items-center ${stateClass}`}
              >
                <span>{option}</span>
                {selectedOption !== null && idx === currentQ.correctIndex && <CheckCircle className="w-5 h-5 text-green-600" />}
                {selectedOption !== null && idx === selectedOption && idx !== currentQ.correctIndex && <XCircle className="w-5 h-5 text-red-600" />}
              </button>
            );
          })}
        </div>

        {showExplanation && (
          <div className="mt-6 bg-blue-50 p-4 rounded-xl border border-blue-100 animate-fade-in">
            <h4 className="font-semibold text-blue-900 mb-1 flex items-center gap-2">
                <Brain className="w-4 h-4" /> {t.explanation}
            </h4>
            <p className="text-blue-800 text-sm leading-relaxed">{currentQ.explanation}</p>
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <Button 
            onClick={nextQuestion} 
            disabled={selectedOption === null}
            className="w-full sm:w-auto"
          >
            {currentIndex === questions.length - 1 ? t.finish : t.next} 
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
