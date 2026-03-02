
import React, { useState } from 'react';
import { Language } from '../types';
import { Coins, X, PlayCircle, ShoppingCart, Bug, Send } from 'lucide-react';
import { Button } from './ui/Button';

interface PointsStoreProps {
    points: number;
    addPoints: (amount: number) => void;
    onClose: () => void;
    language: Language;
}

export const PointsStore: React.FC<PointsStoreProps> = ({ points, addPoints, onClose, language }) => {
    const [bugReport, setBugReport] = useState('');
    const [adLoading, setAdLoading] = useState(false);
    const [reportSubmitted, setReportSubmitted] = useState(false);

    const t = {
        si: {
            title: "ලකුණු එකතු කරන්න",
            yourPoints: "ඔබේ ලකුණු",
            earnTitle: "ලකුණු උපයන්න",
            watchAd: "දැන්වීමක් නරඹන්න",
            watchAdPts: "+10",
            buyPoints: "ලකුණු 100ක් මිලදී ගන්න",
            buyPointsPts: "+100",
            bugTitle: "වැරැද්දක් වාර්තා කරන්න",
            bugDesc: "විෂය නිර්දේශයේ වැරැද්දක් සොයා ගත්තාද? අපට දන්වා ලකුණු 25ක් දිනාගන්න.",
            bugPlaceholder: "කරුණාකර මෙහි වැරැද්ද විස්තර කරන්න...",
            submitReport: "වාර්තාව යවන්න",
            submitted: "ඔබේ වාර්තාව ලැබුණි. ස්තූතියි!",
            watchingAd: "දැන්වීම පෙන්වමින්..."
        },
        en: {
            title: "Points Store",
            yourPoints: "Your Points",
            earnTitle: "Earn Points",
            watchAd: "Watch an Ad",
            watchAdPts: "+10",
            buyPoints: "Buy 100 Points",
            buyPointsPts: "+100",
            bugTitle: "Report a Bug",
            bugDesc: "Found a mistake in the syllabus? Let us know and earn 25 points!",
            bugPlaceholder: "Please describe the bug here...",
            submitReport: "Submit Report",
            submitted: "Report submitted. Thank you!",
            watchingAd: "Watching Ad..."
        }
    }[language];

    const handleWatchAd = () => {
        setAdLoading(true);
        setTimeout(() => {
            addPoints(10);
            setAdLoading(false);
        }, 2000); // Simulate watching an ad
    };

    const handleBugSubmit = () => {
        if (!bugReport.trim()) return;
        addPoints(25);
        setBugReport('');
        setReportSubmitted(true);
        setTimeout(() => setReportSubmitted(false), 3000); // Reset message after 3s
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 relative">
                <button onClick={onClose} className="absolute top-3 right-3 p-2 rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
                    <X className="w-5 h-5" />
                </button>

                <div className="p-6 border-b border-slate-100 text-center">
                    <div className="w-16 h-16 bg-gradient-to-tr from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg shadow-amber-200">
                        <Coins className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">{t.title}</h3>
                    <p className="text-sm text-slate-500">{t.yourPoints}: <span className="font-bold text-amber-600">{points}</span></p>
                </div>

                <div className="p-6 space-y-6 bg-slate-50/50">
                    {/* Earn Points Section */}
                    <div>
                        <h4 className="font-bold text-slate-700 mb-3">{t.earnTitle}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                onClick={handleWatchAd}
                                disabled={adLoading}
                                className="p-4 bg-white border border-slate-200 rounded-xl text-left hover:border-indigo-300 hover:bg-indigo-50 transition-all flex items-center justify-between"
                            >
                                <div>
                                    <p className="font-semibold text-slate-800">{adLoading ? t.watchingAd : t.watchAd}</p>
                                    <div className="flex items-center gap-1 text-indigo-600">
                                        <PlayCircle className="w-4 h-4" />
                                        <span className="text-xs font-bold">{t.watchAdPts}</span>
                                    </div>
                                </div>
                                {adLoading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-500"></div>}
                            </button>
                            <button
                                onClick={() => addPoints(100)}
                                className="p-4 bg-white border border-slate-200 rounded-xl text-left hover:border-green-300 hover:bg-green-50 transition-all flex items-center justify-between"
                            >
                                <div>
                                    <p className="font-semibold text-slate-800">{t.buyPoints}</p>
                                    <div className="flex items-center gap-1 text-green-600">
                                        <ShoppingCart className="w-4 h-4" />
                                        <span className="text-xs font-bold">{t.buyPointsPts}</span>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Bug Report Section */}
                    <div>
                        <h4 className="font-bold text-slate-700 mb-2">{t.bugTitle}</h4>
                        <p className="text-xs text-slate-500 mb-3">{t.bugDesc}</p>
                        <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                            <textarea
                                value={bugReport}
                                onChange={(e) => setBugReport(e.target.value)}
                                placeholder={t.bugPlaceholder}
                                className="w-full h-20 p-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                            />
                            {reportSubmitted ? (
                                <p className="text-green-600 text-xs font-medium text-center py-2">{t.submitted}</p>
                            ) : (
                                <Button
                                    onClick={handleBugSubmit}
                                    disabled={!bugReport.trim()}
                                    className="w-full"
                                    variant="secondary"
                                >
                                    <Send className="w-4 h-4" />
                                    {t.submitReport}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
