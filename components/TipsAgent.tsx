
import React, { useState, useRef, useEffect } from 'react';
import { getStudyAdvice } from '../services/geminiService';
import { ChatMessage, Language } from '../types';
import { Send, Lightbulb, User, Sparkles, GraduationCap } from 'lucide-react';
import { Button } from './ui/Button';

interface TipsAgentProps {
  language: Language;
}

export const TipsAgent: React.FC<TipsAgentProps> = ({ language }) => {
  const t = {
    si: {
      welcome: "ආයුබෝවන්! මම ඔබේ AI ගුරුවරයා. විෂය කරුණු, ගණිත ගැටළු, හෝ පාඩම් කරන ක්‍රම ගැන ඕනෑම දෙයක් මගෙන් අසන්න.",
      title: "AI ගුරුවරයා",
      subtitle: "ඕනෑම විෂයක් ගැන ප්‍රශ්න අසන්න",
      placeholder: "උදා: නිව්ටන්ගේ නියම පැහැදිලි කරන්න...",
      error: "සමාවන්න, මට දැන් පිළිතුරු දීමට නොහැක. කරුණාකර මද වේලාවකින් උත්සාහ කරන්න."
    },
    en: {
      welcome: "Hello! I am your AI Tutor. Ask me about any subject topic, math problem, or study technique.",
      title: "AI Tutor",
      subtitle: "Ask questions on any subject",
      placeholder: "Ex: Explain photosynthesis...",
      error: "Sorry, I cannot answer right now. Please try again later."
    }
  }[language];

  const suggestions = [
    language === 'si' ? "පාඩම් කිරීමට හොඳම වෙලාව කීයද?" : "Best time to study?",
    language === 'si' ? "කම්මැලිකම නැති කරගන්නේ කොහොමද?" : "How to stop procrastinating?",
    language === 'si' ? "මතක තබා ගැනීමේ කෙටි ක්‍රම මොනවාද?" : "Memory techniques?"
  ];

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize or reset welcome message when language changes
  useEffect(() => {
    setMessages([{ id: 'init', role: 'model', text: t.welcome }]);
  }, [language]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim()) return;
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const responseText = await getStudyAdvice(textToSend, language);
      const botMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      const errorMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: t.error };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto h-[600px] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex items-center gap-3">
        <div className="bg-indigo-100 p-2 rounded-full">
            <GraduationCap className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
            <h3 className="font-bold text-indigo-900">{t.title}</h3>
            <p className="text-xs text-indigo-700">{t.subtitle}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50" ref={scrollRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-slate-200' : 'bg-indigo-600'}`}>
              {msg.role === 'user' ? <User className="w-4 h-4 text-slate-600" /> : <Sparkles className="w-4 h-4 text-white" />}
            </div>
            <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
              msg.role === 'user' 
                ? 'bg-white text-slate-800 border border-slate-200 rounded-tr-none' 
                : 'bg-indigo-600 text-white rounded-tl-none'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
               <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="bg-indigo-600 p-4 rounded-2xl rounded-tl-none flex items-center gap-1 h-10">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce delay-75"></span>
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce delay-150"></span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-slate-100">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar">
            {suggestions.map(s => (
                <button 
                  key={s} 
                  onClick={() => handleSend(s)}
                  className="whitespace-nowrap px-3 py-1.5 rounded-full bg-slate-100 hover:bg-indigo-50 text-xs font-medium text-slate-600 hover:text-indigo-600 border border-slate-200 transition-colors"
                >
                   {s}
                </button>
            ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={t.placeholder}
            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
          />
          <Button onClick={() => handleSend()} disabled={!input.trim() || isTyping} className="!px-4 !py-0 rounded-xl">
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
};
