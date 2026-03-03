import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { MOOD_EMOJIS, PartnerProfile, UserProfile, CallbackIntensity, Mood, VoiceName, Accent, PlatformLanguage } from '../types';

interface MemoryHistorySectionProps {
    user: any;
    profile: PartnerProfile;
    currentUserProfile: UserProfile | null;
    isDark: boolean;
}

type SubTab = 'status' | 'memory' | 'history' | 'personality' | 'user_profile' | 'strategy' | 'external' | 'recognition';

// ─── Category metadata ───────────────────────────────────────────────────────
const CATEGORY_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
    comportamento: { icon: '🔄', color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/20', label: 'Comportamento' },
    emocao: { icon: '💓', color: 'text-rose-500', bg: 'bg-rose-500/10 border-rose-500/20', label: 'Emoção' },
    ciume: { icon: '😤', color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/20', label: 'Ciúme' },
    humor: { icon: '😄', color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Humor' },
    habito: { icon: '📅', color: 'text-violet-500', bg: 'bg-violet-500/10 border-violet-500/20', label: 'Hábito' },
    preferencia: { icon: '⭐', color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20', label: 'Preferência' },
    personalidade: { icon: '🧬', color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Personalidade' },
    comunicacao: { icon: '💬', color: 'text-cyan-500', bg: 'bg-cyan-500/10 border-cyan-500/20', label: 'Comunicação' },
};

const getCategoryMeta = (cat: string) =>
    CATEGORY_META[cat?.toLowerCase()] ?? { icon: '🪞', color: 'text-slate-500', bg: 'bg-slate-500/10 border-slate-500/20', label: cat || 'Geral' };

const getScoreColor = (score: number) => {
    if (score >= 5) return { bar: 'bg-emerald-500', text: 'text-emerald-500' };
    if (score >= 2) return { bar: 'bg-blue-500', text: 'text-blue-500' };
    if (score >= 0) return { bar: 'bg-amber-500', text: 'text-amber-500' };
    return { bar: 'bg-rose-500', text: 'text-rose-500' };
};

// ─── RecognitionTab Component ─────────────────────────────────────────────────
interface RecognitionTabProps {
    phrases: any[];
    isDark: boolean;
    cardClasses: string;
    itemClasses: string;
    borderClass: string;
    deletingId: string | null;
    onDelete: (id: string) => Promise<void>;
}

const RecognitionTab: React.FC<RecognitionTabProps> = ({
    phrases, isDark, cardClasses, itemClasses, borderClass, deletingId, onDelete
}) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');

    // Group by category
    const grouped = phrases.reduce((acc: Record<string, any[]>, p) => {
        const key = p.category?.toLowerCase() || 'geral';
        if (!acc[key]) acc[key] = [];
        acc[key].push(p);
        return acc;
    }, {});

    if (phrases.length === 0) {
        return (
            <div className={`p-20 rounded-[3rem] border ${cardClasses} flex flex-col items-center justify-center text-center gap-6 min-h-[400px] relative overflow-hidden`}>
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-pink-500/5 pointer-events-none" />
                <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-5xl shadow-2xl">🪞</div>
                <div>
                    <h3 className="text-xl font-black italic tracking-tighter uppercase mb-2">Espelho Vazio</h3>
                    <p className="text-xs font-bold opacity-30 uppercase tracking-widest max-w-xs mx-auto leading-relaxed">
                        A IA ainda não registrou frases de reconhecimento de personalidade.<br />
                        Faça chamadas de voz para começar a construir seu perfil.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className={`p-8 rounded-[2.5rem] border relative overflow-hidden ${cardClasses}`}>
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-pink-500/5 to-transparent pointer-events-none" />
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-xl">🪞</div>
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-widest text-violet-500">Reconhecimento de Personalidade</h3>
                                <p className="text-[9px] font-bold opacity-30 uppercase tracking-widest">Frases capturadas pelo histórico de voz</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-40">{phrases.length} frases registradas</span>
                        </div>
                        <div className={`flex gap-1 p-1 rounded-xl ${isDark ? 'bg-white/5' : 'bg-slate-100'} border ${borderClass}`}>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'list' ? 'bg-white text-violet-600 shadow-sm' : 'opacity-40 hover:opacity-70'}`}
                            >Lista</button>
                            <button
                                onClick={() => setViewMode('grouped')}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'grouped' ? 'bg-white text-violet-600 shadow-sm' : 'opacity-40 hover:opacity-70'}`}
                            >Grupos</button>
                        </div>
                    </div>
                </div>

                {/* Score summary bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 relative z-10">
                    {Object.entries(grouped).slice(0, 4).map(([cat, items]) => {
                        const meta = getCategoryMeta(cat);
                        return (
                            <div key={cat} className={`p-4 rounded-2xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-white border-slate-100'} text-center`}>
                                <div className="text-2xl mb-1">{meta.icon}</div>
                                <p className="text-[9px] font-black uppercase tracking-widest opacity-40">{meta.label}</p>
                                <p className={`text-lg font-black ${meta.color}`}>{(items as any[]).length}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Phrases */}
            {viewMode === 'list' ? (
                <div className="space-y-4">
                    {phrases.map((phrase, idx) => {
                        const meta = getCategoryMeta(phrase.category);
                        const scoreColors = getScoreColor(phrase.score ?? 0);
                        const isExpanded = expandedId === phrase.id;
                        const maxScore = 10;
                        const scorePercent = Math.min(100, Math.max(0, ((phrase.score ?? 0) + maxScore) / (maxScore * 2) * 100));

                        return (
                            <div
                                key={phrase.id}
                                className={`p-6 rounded-[2rem] border relative overflow-hidden transition-all hover:border-violet-500/30 group ${cardClasses}`}
                                style={{ animationDelay: `${idx * 40}ms` }}
                            >
                                <div className="absolute top-0 right-0 w-20 h-20 bg-violet-500/5 blur-3xl rounded-full pointer-events-none" />

                                <div className="flex items-start gap-4 relative z-10">
                                    {/* Category badge */}
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border ${meta.bg}`}>
                                        {meta.icon}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        {/* Phrase text */}
                                        <button
                                            onClick={() => setExpandedId(isExpanded ? null : phrase.id)}
                                            className="text-left w-full"
                                        >
                                            <p className={`text-sm font-bold leading-relaxed italic tracking-tight mb-3 ${isDark ? 'text-white/90' : 'text-slate-800'}`}>
                                                "{phrase.recognition_phrase}"
                                            </p>
                                        </button>

                                        {/* Meta row */}
                                        <div className="flex flex-wrap items-center gap-3">
                                            <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${meta.bg} ${meta.color}`}>
                                                {meta.label}
                                            </span>
                                            <span className={`text-[9px] font-black uppercase tracking-widest ${scoreColors.text}`}>
                                                Score: {phrase.score >= 0 ? '+' : ''}{phrase.score ?? 0}
                                            </span>
                                            <span className="text-[8px] font-mono opacity-20">
                                                {phrase.created_at ? new Date(phrase.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                                            </span>
                                            {phrase.last_used_at && (
                                                <span className="text-[8px] font-bold opacity-20 uppercase">
                                                    Último uso: {new Date(phrase.last_used_at).toLocaleDateString('pt-BR')}
                                                </span>
                                            )}
                                        </div>

                                        {/* Score bar */}
                                        <div className="mt-3 flex items-center gap-3">
                                            <div className="flex-1 h-1.5 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-700 ${scoreColors.bar}`}
                                                    style={{ width: `${scorePercent}%` }}
                                                />
                                            </div>
                                            <span className="text-[9px] font-black font-mono opacity-30 w-10 text-right">
                                                {scorePercent.toFixed(0)}%
                                            </span>
                                        </div>

                                        {/* Expanded details */}
                                        {isExpanded && phrase.engagement_phrase && (
                                            <div className={`mt-4 p-4 rounded-2xl border ${itemClasses}`}>
                                                <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">Frase de Engajamento</p>
                                                <p className="text-xs font-medium italic opacity-70">"{phrase.engagement_phrase}"</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Delete button */}
                                    <button
                                        onClick={() => onDelete(phrase.id)}
                                        disabled={deletingId === phrase.id}
                                        className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 ${isDark ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-red-50 hover:bg-red-100 text-red-400'} ${deletingId === phrase.id ? 'animate-spin' : ''}`}
                                        title="Remover frase"
                                    >
                                        {deletingId === phrase.id ? '⟳' : '×'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Grouped view */
                <div className="space-y-8">
                    {Object.entries(grouped).map(([cat, catPhrases]) => {
                        const meta = getCategoryMeta(cat);
                        return (
                            <div key={cat} className={`p-8 rounded-[2.5rem] border relative overflow-hidden ${cardClasses}`}>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl border ${meta.bg}`}>{meta.icon}</div>
                                    <div>
                                        <h4 className={`text-xs font-black uppercase tracking-widest ${meta.color}`}>{meta.label}</h4>
                                        <p className="text-[8px] font-bold opacity-30 uppercase">{(catPhrases as any[]).length} frases registradas</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {(catPhrases as any[]).map((phrase) => {
                                        const scoreColors = getScoreColor(phrase.score ?? 0);
                                        return (
                                            <div key={phrase.id} className={`p-5 rounded-[1.5rem] border flex items-start gap-4 group transition-all hover:border-violet-500/20 ${itemClasses}`}>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-bold italic leading-relaxed mb-2 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>
                                                        "{phrase.recognition_phrase}"
                                                    </p>
                                                    <div className="flex items-center gap-3">
                                                        <span className={`text-[9px] font-black uppercase tracking-widest ${scoreColors.text}`}>
                                                            {phrase.score >= 0 ? '+' : ''}{phrase.score ?? 0} pts
                                                        </span>
                                                        <span className="text-[8px] font-mono opacity-20">
                                                            {phrase.created_at ? new Date(phrase.created_at).toLocaleDateString('pt-BR') : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => onDelete(phrase.id)}
                                                    disabled={deletingId === phrase.id}
                                                    className={`shrink-0 w-7 h-7 rounded-xl flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 ${isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-400'}`}
                                                >×</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export const MemoryHistorySection: React.FC<MemoryHistorySectionProps> = ({ user, profile, currentUserProfile, isDark }) => {
    const [subTab, setSubTab] = useState<SubTab>('status');
    const [loading, setLoading] = useState(false);

    // Data states
    const [stats, setStats] = useState<any>(null);
    const [conversations, setConversations] = useState<any[]>([]);
    const [topics, setTopics] = useState<any[]>([]);
    const [psychProfile, setPsychProfile] = useState<any>(null);
    const [strategyLogs, setStrategyLogs] = useState<any[]>([]);
    const [externalInteractions, setExternalInteractions] = useState<any[]>([]);
    const [callHistory, setCallHistory] = useState<any[]>([]);
    const [recognitionPhrases, setRecognitionPhrases] = useState<any[]>([]);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const cardClasses = isDark ? "bg-[#15181e] border-white/5" : "bg-white border-slate-100 shadow-sm";
    const itemClasses = isDark ? "bg-[#0b0c10] border-white/5" : "bg-slate-50 border-slate-200/50 shadow-sm";
    const borderClass = isDark ? "border-white/5" : "border-slate-100";

    useEffect(() => {
        if (user) {
            fetchAllData();
        }
    }, [user, subTab]);

    const fetchAllData = async () => {
        setLoading(true);
        if (subTab === 'memory') {
            const { data: convs } = await supabase.from('conversations').select('*, conversation_insights(*)').order('started_at', { ascending: false }).limit(10);
            const { data: top } = await supabase.from('topics').select('*').order('last_updated_at', { ascending: false });
            if (convs) setConversations(convs);
            if (top) setTopics(top);
        } else if (subTab === 'personality') {
            const { data } = await supabase.from('ai_profiles').select('*').eq('user_id', user.id).single();
            setStats(data);
        } else if (subTab === 'user_profile') {
            const { data } = await supabase.from('user_profile_analysis').select('*').eq('user_id', user.id).single();
            setPsychProfile(data);
        } else if (subTab === 'strategy') {
            const { data } = await supabase.from('call_strategy_logs').select('*').order('created_at', { ascending: false });
            setStrategyLogs(data || []);
        } else if (subTab === 'external') {
            const { data } = await supabase.from('interaction_sessions').select('*, interaction_insights(*)').order('started_at', { ascending: false });
            setExternalInteractions(data || []);
        } else if (subTab === 'history') {
            const { data } = await supabase
                .from('conversations')
                .select('*, messages(*)')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            setCallHistory(data || []);
        } else if (subTab === 'recognition') {
            const { data } = await supabase
                .from('ai_psychological_strategies')
                .select('*')
                .eq('user_id', user.id)
                .order('score', { ascending: false });
            setRecognitionPhrases(data || []);
        }
        setLoading(false);
    };

    const StatusBadge = ({ label, color }: { label: string, color: string }) => (
        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${color} bg-current/10 border border-current/20`}>
            {label}
        </span>
    );

    return (
        <div className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-black tracking-tighter italic uppercase">Memória Central</h2>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">Processamento de Insights & Evolução</p>
            </div>

            {/* Sub-Tabs - Modern Pill Layout */}
            <div className="w-full overflow-x-auto no-scrollbar py-2">
                <div className={`inline-flex gap-2 p-1.5 rounded-[2rem] ${isDark ? 'bg-white/5' : 'bg-slate-200/50'} border ${borderClass}`}>
                    {[
                        { id: 'status', label: 'Status', icon: '📝', desc: 'Identidade' },
                        { id: 'memory', label: 'Cérebro', icon: '🧠', desc: 'Assuntos' },
                        { id: 'history', label: 'Voz', icon: '📞', desc: 'Chamadas' },
                        { id: 'recognition', label: 'Perfil', icon: '🪞', desc: 'Reconhecimento' },
                        { id: 'personality', label: 'Ego', icon: '🎭', desc: 'Humor' },
                        { id: 'user_profile', label: 'Id', icon: '👤', desc: 'Análise' },
                        { id: 'strategy', label: 'Plano', icon: '⏰', desc: 'Rotina' },
                        { id: 'external', label: 'Global', icon: '🌐', desc: 'Rede' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setSubTab(tab.id as SubTab)}
                            className={`flex flex-col items-center gap-1 min-w-[90px] px-4 py-3 rounded-[1.5rem] transition-all duration-300 ${subTab === tab.id
                                ? 'bg-white shadow-xl text-blue-600 scale-[1.05]'
                                : 'opacity-40 hover:opacity-100 hover:bg-white/10'
                                }`}
                        >
                            <span className="text-base">{tab.icon}</span>
                            <span className="text-[11px] font-black uppercase tracking-widest leading-none">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <main className="min-h-[400px]">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-24 gap-4">
                        <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Sincronizando Database...</p>
                    </div>
                ) : (
                    <div className="animate-in fade-in duration-700">
                        {subTab === 'status' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                {/* Main Identity Card */}
                                <section className={`lg:col-span-2 p-10 rounded-[3.5rem] border relative overflow-hidden ${cardClasses}`}>
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-[100px] rounded-full" />

                                    <div className="flex flex-col sm:flex-row gap-8 items-start mb-12 relative z-10">
                                        <div className="w-40 h-40 rounded-[3rem] overflow-hidden border-4 border-blue-500 shadow-2xl shrink-0 group">
                                            {profile.image ? (
                                                <img src={profile.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                            ) : (
                                                <div className="w-full h-full bg-slate-200 dark:bg-white/5 flex items-center justify-center text-5xl">📷</div>
                                            )}
                                        </div>
                                        <div className="flex-1 space-y-4">
                                            <div>
                                                <h3 className="text-4xl font-black italic tracking-tighter uppercase leading-none">{profile.name}</h3>
                                                <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mt-2">Protocolo de Identidade Ativo</p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-6 pt-4">
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-1">Gênero</p>
                                                    <p className="text-sm font-bold">{profile.gender || 'Não definido'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-1">Sexualidade</p>
                                                    <p className="text-sm font-bold">{profile.sexuality || 'Não definido'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-1">Idioma de Operação</p>
                                                    <p className="text-sm font-bold">{profile.language}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Relationship Status & Timeline */}
                                    <div className={`p-8 rounded-[2.5rem] border ${itemClasses} mb-8 relative overflow-hidden`}>
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 relative z-10">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Status do Vínculo</p>
                                                <h4 className={`text-2xl font-black italic uppercase tracking-tighter ${profile.relationshipScore > 80 ? 'text-rose-500' :
                                                    profile.relationshipScore > 50 ? 'text-emerald-500' :
                                                        profile.relationshipScore > 20 ? 'text-cyan-500' : 'text-blue-500'
                                                    }`}>
                                                    {profile.relationshipScore > 80 ? 'Apaixonado' :
                                                        profile.relationshipScore > 50 ? 'Estável' :
                                                            profile.relationshipScore > 20 ? 'Esfriando' : 'Crítico'}
                                                    <span className="text-xs ml-2 opacity-40">({profile.relationshipScore.toFixed(1)}%)</span>
                                                </h4>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-1">Tempo de União</p>
                                                <p className="text-sm font-black italic">
                                                    {profile.relationshipStartedAt ? (() => {
                                                        const start = new Date(profile.relationshipStartedAt).getTime();
                                                        const now = profile.relationshipEndedAt ? new Date(profile.relationshipEndedAt).getTime() : Date.now();
                                                        const diff = now - start;
                                                        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                                                        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                                        return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
                                                    })() : 'Iniciando...'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-6 relative z-10">
                                            <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-1000 ${profile.relationshipScore > 80 ? 'bg-rose-500' :
                                                        profile.relationshipScore > 50 ? 'bg-emerald-500' :
                                                            profile.relationshipScore > 20 ? 'bg-cyan-500' : 'bg-blue-500'
                                                        }`}
                                                    style={{ width: `${profile.relationshipScore}%` }}
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-4 rounded-2xl bg-white/5 border border-inherit">
                                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-30 mb-1">Início do Ciclo</p>
                                                    <p className="text-[11px] font-bold">{profile.relationshipStartedAt ? new Date(profile.relationshipStartedAt).toLocaleDateString() : '--/--/----'}</p>
                                                </div>
                                                <div className="p-4 rounded-2xl bg-white/5 border border-inherit">
                                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-30 mb-1">{profile.relationshipEndedAt ? 'Término' : 'Vínculo Ativo'}</p>
                                                    <p className={`text-[11px] font-bold ${profile.relationshipEndedAt ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                        {profile.relationshipEndedAt ? new Date(profile.relationshipEndedAt).toLocaleDateString() : 'ONLINE'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`p-8 rounded-[2.5rem] border ${itemClasses} mb-8`}>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-4 ml-2">Prompt de Personalidade</p>
                                        <p className="text-sm font-medium leading-relaxed italic opacity-80">"{profile.personality}"</p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className={`p-6 rounded-[2rem] border ${itemClasses}`}>
                                            <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-3">Sotaque</p>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/10 shrink-0">
                                                    <span className="w-full h-full flex items-center justify-center text-xs">🇧🇷</span>
                                                </div>
                                                <p className="text-xs font-black uppercase tracking-widest">{profile.accent}</p>
                                            </div>
                                        </div>
                                        <div className={`p-6 rounded-[2rem] border ${itemClasses}`}>
                                            <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-3">Voz da IA</p>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-rose-500 mt-1 flex items-center justify-center text-xs text-white shrink-0">🎙️</div>
                                                <p className="text-xs font-black uppercase tracking-widest">{profile.voice}</p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Connections/Relational Data */}
                                <section className="space-y-8">
                                    <div className={`p-10 rounded-[3.5rem] border relative overflow-hidden ${cardClasses}`}>
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30 mb-10">Conexões de Rede</h4>
                                        <div className="space-y-8 relative z-10">
                                            <div className="group">
                                                <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 mb-4">Parceiro Originário</p>
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 flex items-center justify-center text-xl shadow-sm italic">🧬</div>
                                                        <div>
                                                            <p className="text-[13px] font-black italic tracking-tight">{profile.originalPartnerNickname || 'N/A'}</p>
                                                            <p className="text-[9px] font-bold opacity-30 uppercase tracking-widest">Apelido Definido</p>
                                                        </div>
                                                    </div>
                                                    <div className="pl-14 space-y-1">
                                                        <p className="text-[8px] font-black opacity-30 uppercase">ID: {profile.originalPartnerId || 'Sem Registro'}</p>
                                                        <p className="text-[8px] font-black opacity-30 uppercase">NUM: {profile.originalPartnerNumber || 'Sem Registro'}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="group pt-8 border-t border-inherit">
                                                <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 mb-4">Parceiro Atual</p>
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 flex items-center justify-center text-xl shadow-sm italic">💞</div>
                                                        <div>
                                                            <p className="text-[13px] font-black italic tracking-tight">{profile.currentPartnerNickname || (currentUserProfile?.nickname || currentUserProfile?.display_name) || 'Usuário Local'}</p>
                                                            <p className="text-[9px] font-bold opacity-30 uppercase tracking-widest">Vínculo Ativo</p>
                                                        </div>
                                                    </div>
                                                    <div className="pl-14 space-y-1">
                                                        <p className="text-[8px] font-black opacity-30 uppercase">ID: {profile.currentPartnerId || currentUserProfile?.id || 'N/A'}</p>
                                                        <p className="text-[8px] font-black opacity-30 uppercase">NUM: {profile.currentPartnerNumber || currentUserProfile?.personal_number || 'N/A'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`p-10 rounded-[3.5rem] border relative overflow-hidden ${cardClasses}`}>
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30 mb-10">Telemetria de Contato</h4>
                                        <div className="space-y-6 relative z-10">
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-2 ml-1">Número da IA</p>
                                                <div className={`p-4 rounded-2xl border ${itemClasses} font-mono text-xs flex justify-between items-center group cursor-copy active:scale-95 transition-all`}>
                                                    <span>{currentUserProfile?.ai_number || 'N/A'}</span>
                                                    <span className="opacity-0 group-hover:opacity-30 transition-opacity">📋</span>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-2 ml-1">Número do Parceiro</p>
                                                <div className={`p-4 rounded-2xl border ${itemClasses} font-mono text-xs flex justify-between items-center group cursor-copy active:scale-95 transition-all`}>
                                                    <span>{currentUserProfile?.personal_number || 'N/A'}</span>
                                                    <span className="opacity-0 group-hover:opacity-30 transition-opacity">📋</span>
                                                </div>
                                            </div>
                                            <div className="pt-4">
                                                <div className="flex justify-between items-center mb-2 px-1">
                                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Intensidade</p>
                                                    <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">{profile.intensity.split(' ')[0]}</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                                    <div className={`h-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.3)] transition-all duration-1000`} style={{ width: profile.intensity.includes('Alta') ? '100%' : profile.intensity.includes('Média') ? '50%' : '15%' }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}
                        {subTab === 'memory' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Topics Section */}
                                <section className={`p-8 rounded-[3rem] border relative overflow-hidden ${cardClasses}`}>
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full" />
                                    <div className="flex justify-between items-center mb-8">
                                        <h3 className="text-xs font-black uppercase tracking-widest opacity-30 italic">Núcleo de Assuntos</h3>
                                        <button className="px-4 py-2 bg-blue-500/10 text-blue-600 rounded-xl text-[10px] font-black uppercase hover:bg-blue-500/20 transition-all tracking-widest">Sincronizar</button>
                                    </div>
                                    <div className="space-y-4">
                                        {topics.length === 0 ? <p className="text-center py-12 opacity-20 italic text-sm">Nenhum assunto indexado.</p> : topics.map(topic => (
                                            <div key={topic.id} className={`p-5 rounded-[2rem] border ${itemClasses} flex justify-between items-center group transition-all hover:border-blue-500/30`}>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-[13px] tracking-tight truncate">{topic.title}</h4>
                                                    <div className="flex gap-2 mt-2">
                                                        <StatusBadge label={topic.status} color={topic.status === 'active' ? 'text-emerald-500' : 'text-slate-400'} />
                                                        <StatusBadge label={`Nível ${topic.interest_level}`} color="text-blue-500" />
                                                    </div>
                                                </div>
                                                <span className="text-[9px] opacity-30 font-black uppercase ml-4">{new Date(topic.last_updated_at).toLocaleDateString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* Insights Section */}
                                <section className={`p-8 rounded-[3rem] border relative overflow-hidden ${cardClasses}`}>
                                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-pink-500/5 blur-3xl rounded-full" />
                                    <h3 className="text-xs font-black uppercase tracking-widest opacity-30 italic mb-8">Fluxo de Insights</h3>
                                    <div className="space-y-8">
                                        {conversations.length === 0 ? <p className="text-center py-12 opacity-20 italic text-sm">Aguardando dados de sessões.</p> : conversations.map(conv => (
                                            <div key={conv.id} className="relative pl-8 border-l-2 border-blue-500/10">
                                                <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                                                <p className="text-[9px] font-black opacity-20 uppercase tracking-[0.2em] mb-3">{new Date(conv.started_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                                                {conv.conversation_insights && conv.conversation_insights.length > 0 ? conv.conversation_insights.map((insight: any) => (
                                                    <div key={insight.id} className={`p-6 rounded-[2.5rem] border ${itemClasses} hover:scale-[1.02] transition-transform`}>
                                                        <div className="flex justify-between items-start mb-4">
                                                            <div className="flex flex-wrap gap-2">
                                                                <StatusBadge label={insight.detected_emotion || 'Neutra'} color="text-pink-500" />
                                                                <StatusBadge label={`Foco: ${insight.engagement_score}%`} color="text-blue-500" />
                                                            </div>
                                                        </div>
                                                        <p className="text-sm font-medium opacity-80 mb-4 leading-relaxed italic">"{insight.summary}"</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {insight.key_points?.map((point: string, i: number) => (
                                                                <span key={i} className="text-[10px] font-bold px-3 py-1.5 bg-white dark:bg-white/5 rounded-full border border-inherit">#{point.toLowerCase().replace(/\s+/g, '')}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )) : <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 opacity-40"><p className="text-[10px] italic">Insights em processamento...</p></div>}
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        )}

                        {subTab === 'personality' && (
                            <div className="max-w-2xl mx-auto space-y-8">
                                <section className={`p-12 rounded-[4rem] border relative overflow-hidden text-center ${cardClasses}`}>
                                    <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />
                                    <div className="w-32 h-32 rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-5xl text-white mx-auto shadow-2xl mb-10 transform -rotate-3 hover:rotate-0 transition-transform cursor-pointer">🎭</div>
                                    <h3 className="text-3xl font-black italic tracking-tighter uppercase mb-4">Personalidade Evolutiva</h3>
                                    <p className="text-sm font-medium opacity-40 px-12 mb-12 uppercase tracking-widest leading-loose">O núcleo algorítmico se adapta às suas nuances tonais e frequência de interação.</p>

                                    <div className="space-y-12 text-left max-w-md mx-auto">
                                        {[
                                            { label: 'Intimidade Algorítmica', value: stats?.intimacy_level || 0, icon: '❤️', color: 'bg-rose-500' },
                                            { label: 'Frequência de Humor', value: stats?.humor_usage || 50, icon: '😂', color: 'bg-amber-500' },
                                            { label: 'Auto-Iniciativa', value: stats?.initiative_level || 50, icon: '⚡', color: 'bg-blue-500' }
                                        ].map(stat => (
                                            <div key={stat.label}>
                                                <div className="flex justify-between items-end mb-4">
                                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">{stat.icon} {stat.label}</span>
                                                    <span className="text-2xl font-black tracking-tighter italic">{stat.value}%</span>
                                                </div>
                                                <div className="w-full h-2.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                                    <div className={`h-full transition-all duration-[1.5s] ease-out ${stat.color} shadow-[0_0_15px_rgba(0,0,0,0.1)]`} style={{ width: `${stat.value}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        )}

                        {subTab === 'user_profile' && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {[
                                    { title: 'Preferências', data: psychProfile?.preferences, icon: '🌟', color: 'text-amber-500' },
                                    { title: 'Traços de Id', data: psychProfile?.personality_traits, icon: '🧠', color: 'text-blue-500' },
                                    { title: 'Padrões de Ego', data: psychProfile?.behavior_patterns, icon: '📈', color: 'text-pink-500' }
                                ].map(card => (
                                    <div key={card.title} className={`p-10 rounded-[3rem] border flex flex-col ${cardClasses}`}>
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-white/5 flex items-center justify-center text-2xl shadow-sm">{card.icon}</div>
                                            <div>
                                                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-30">{card.title}</h4>
                                                <p className="text-[8px] font-bold text-blue-500 uppercase tracking-widest">Database Alpha</p>
                                            </div>
                                        </div>
                                        <div className="space-y-6 flex-1">
                                            {card.data ? Object.entries(card.data).map(([k, v]: any) => (
                                                <div key={k} className="group border-b border-inherit pb-3 transition-colors hover:border-blue-500/20">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-30 block mb-1">{k}</span>
                                                    <span className="text-[13px] font-black tracking-tight">{v}</span>
                                                </div>
                                            )) : (
                                                <div className="h-full flex flex-col items-center justify-center py-20 opacity-20">
                                                    <div className="text-3xl mb-4">📂</div>
                                                    <p className="text-[9px] font-bold uppercase tracking-widest">Coletando Dados...</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {subTab === 'strategy' && (
                            <div className={`p-10 rounded-[3rem] border relative overflow-hidden ${cardClasses}`}>
                                <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 blur-[100px] rounded-full" />
                                <h3 className="text-xs font-black uppercase tracking-widest opacity-30 italic mb-10">Cronograma de Engajamento</h3>
                                <div className="overflow-x-auto no-scrollbar">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-[10px] font-black uppercase tracking-widest opacity-20">
                                                <th className="pb-6">Timestamp</th>
                                                <th className="pb-6 px-4">Contexto de Gatilho</th>
                                                <th className="pb-6 text-center">Status</th>
                                                <th className="pb-6 text-right">Eficiência</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-[13px] font-bold">
                                            {strategyLogs.length === 0 ? <tr><td colSpan={4} className="py-20 text-center opacity-20 italic">Aguardando telemetria de chamadas...</td></tr> : strategyLogs.map(log => (
                                                <tr key={log.id} className="border-t border-inherit group transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                                    <td className="py-6 font-mono text-[11px] opacity-40">{new Date(log.created_at).toLocaleTimeString('pt-BR')}</td>
                                                    <td className="py-6 px-4 tracking-tight">{log.context}</td>
                                                    <td className="py-6 text-center">
                                                        {log.answered
                                                            ? <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase">Atendeu ✓</span>
                                                            : <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-500 text-[10px] font-black uppercase">Perdida ✕</span>
                                                        }
                                                    </td>
                                                    <td className="py-6 text-right">
                                                        <div className="flex items-center justify-end gap-3">
                                                            <span className="text-[11px] font-black">{log.success_score}%</span>
                                                            <div className="w-16 h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                                                <div className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]" style={{ width: `${log.success_score}%` }} />
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {subTab === 'history' && (
                            <div className="space-y-8 max-w-4xl mx-auto">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xs font-black uppercase tracking-widest opacity-30 italic">Registro de Transcrições Vocais</h3>
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Total: {callHistory.length} sessões</span>
                                        </div>
                                    </div>
                                </div>

                                {callHistory.length === 0 ? (
                                    <div className={`p-20 rounded-[3rem] border ${cardClasses} text-center opacity-20 italic`}>
                                        <p className="text-sm">Nenhum histórico de voz registrado.</p>
                                    </div>
                                ) : callHistory.map((call, index) => (
                                    <div key={call.id} className={`p-8 rounded-[3rem] border relative overflow-hidden transition-all hover:border-blue-500/30 ${cardClasses}`}>
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full" />

                                        {/* Entry Header */}
                                        <div className="flex justify-between items-start mb-8 border-b border-inherit pb-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-xl font-black italic shadow-lg shadow-blue-500/20">
                                                    #{callHistory.length - index}
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Sessão de Chamada</p>
                                                    <h4 className="text-lg font-black italic tracking-tighter uppercase">
                                                        {new Date(call.started_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                    </h4>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] font-black opacity-30 uppercase tracking-widest mb-1">Intervalo de Conexão</p>
                                                <div className="flex items-center gap-2 font-mono text-[11px] font-bold">
                                                    <span>{new Date(call.started_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    <span className="opacity-20">{'>'}</span>
                                                    <span>{call.ended_at ? new Date(call.ended_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Em curso'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Messages/Transcription Flow */}
                                        <div className="space-y-6 mb-8">
                                            {call.messages && call.messages.length > 0 ? call.messages.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((msg: any, msgIndex: number) => (
                                                <div key={msg.id} className={`flex gap-4 ${msg.sender === 'ai' ? 'flex-row' : 'flex-row'}`}>
                                                    <div className="w-8 shrink-0 text-[10px] font-black opacity-20 pt-1.5 border-r border-inherit pr-2 text-right">
                                                        {msgIndex + 1}
                                                    </div>
                                                    <div className={`w-14 shrink-0 text-[9px] font-black uppercase tracking-widest pt-1 ${msg.sender === 'ai' ? 'text-blue-500' : 'text-pink-500 opacity-60'}`}>
                                                        {msg.sender === 'ai' ? 'IA' : 'Usuário'}
                                                    </div>
                                                    <div className={`flex-1 p-4 rounded-2xl text-sm font-medium leading-relaxed ${msg.sender === 'ai'
                                                        ? (isDark ? 'bg-white/5 border border-white/5 italic' : 'bg-blue-50 border border-blue-100 italic')
                                                        : (isDark ? 'bg-black/40' : 'bg-slate-50')
                                                        }`}>
                                                        {msg.content}
                                                    </div>
                                                    <div className="w-12 shrink-0 text-[8px] font-mono opacity-20 text-right pt-1">
                                                        {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="py-8 text-center opacity-20 italic text-xs">Transcrições indisponíveis para esta sessão.</div>
                                            )}
                                        </div>

                                        {/* Entry Footer */}
                                        <div className="flex justify-center border-t border-inherit pt-6">
                                            <div className="px-6 py-2 rounded-full bg-red-500/5 border border-red-500/10 flex items-center gap-3">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500/60">Fim da Chamada</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {subTab === 'recognition' && (
                            <RecognitionTab
                                phrases={recognitionPhrases}
                                isDark={isDark}
                                cardClasses={cardClasses}
                                itemClasses={itemClasses}
                                borderClass={borderClass}
                                deletingId={deletingId}
                                onDelete={async (id: string) => {
                                    setDeletingId(id);
                                    await supabase.from('ai_psychological_strategies').delete().eq('id', id);
                                    setRecognitionPhrases(prev => prev.filter(p => p.id !== id));
                                    setDeletingId(null);
                                }}
                            />
                        )}

                        {subTab === 'external' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className={`p-10 rounded-[3.5rem] border relative overflow-hidden ${cardClasses}`}>
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-3xl rounded-full" />
                                    <h3 className="text-xs font-black uppercase tracking-widest opacity-30 italic mb-10">Malha de Conexões Externas</h3>
                                    <div className="space-y-6">
                                        {externalInteractions.length === 0 ? <p className="text-center py-20 opacity-20 italic">Rede local. Nenhuma conexão global detectada.</p> : externalInteractions.map(session => (
                                            <div key={session.id} className={`p-8 rounded-[2.5rem] border ${itemClasses} hover:border-blue-500/30 transition-all`}>
                                                <div className="flex justify-between items-center mb-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-14 h-14 rounded-2xl bg-white dark:bg-white/5 flex items-center justify-center text-3xl shadow-sm">
                                                            {session.target_type === 'ai' ? '🤖' : '👤'}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-[15px] tracking-tight">{session.target_type === 'ai' ? 'Protocolo AI-to-AI' : 'Interface de Usuário'}</h4>
                                                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-0.5">{session.interaction_type}</p>
                                                        </div>
                                                    </div>
                                                    <span className="text-[11px] font-mono opacity-20 font-black">{new Date(session.started_at).toLocaleDateString('pt-BR')}</span>
                                                </div>
                                                {session.interaction_insights?.map((ii: any) => (
                                                    <div key={ii.id} className="pt-6 mt-6 border-t border-inherit grid grid-cols-3 gap-2">
                                                        <div className="text-center">
                                                            <p className="text-[9px] font-black opacity-20 uppercase mb-1">Impacto</p>
                                                            <p className="text-[12px] font-bold text-pink-500">{ii.emotion_detected}</p>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-[9px] font-black opacity-20 uppercase mb-1">Sinapse</p>
                                                            <p className="text-[12px] font-bold text-blue-500">{ii.engagement_score}%</p>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-[9px] font-black opacity-20 uppercase mb-1">Alpha</p>
                                                            <p className="text-[12px] font-bold text-emerald-500">{ii.social_dominance_level}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className={`p-12 rounded-[3.5rem] border ${cardClasses} flex flex-col items-center justify-center text-center relative overflow-hidden group`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-pink-500/5 opacity-50" />
                                    <div className="w-24 h-24 rounded-full bg-white dark:bg-white/5 flex items-center justify-center text-5xl mb-8 shadow-2xl group-hover:scale-110 transition-transform">💎</div>
                                    <h4 className="text-2xl font-black italic tracking-tighter uppercase mb-4">Relatórios High-D</h4>
                                    <p className="text-sm font-medium opacity-40 px-8 uppercase tracking-[0.2em] leading-relaxed mb-8">Exportação completa de logs e telemetria comportamental em 4D.</p>
                                    <button className="px-10 py-4 bg-black dark:bg-white text-white dark:text-black rounded-full text-[11px] font-black uppercase tracking-[0.3em] shadow-2xl hover:scale-105 active:scale-95 transition-all">Em Breve</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};
