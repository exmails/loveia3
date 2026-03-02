import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, ChatMessage, PartnerProfile } from '../types';
import { GoogleGenAI } from '@google/genai';

interface ChatWindowProps {
    currentUser: any;
    targetProfile: UserProfile;
    isAi: boolean;
    onClose: () => void;
    isDark: boolean;
    apiKey: string;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ currentUser, targetProfile, isAi, onClose, isDark, apiKey }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [isAiTyping, setIsAiTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const cardClasses = isDark ? "bg-[#15181e] border-white/5 text-white" : "bg-white border-slate-100 text-slate-900";
    const inputClasses = isDark ? "bg-white/5 border-white/10 text-white" : "bg-slate-50 border-slate-200 text-slate-900";

    useEffect(() => {
        fetchMessages();
        const subscription = supabase
            .channel('chat_messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${currentUser.id}`
            }, (payload) => {
                const newMsg = payload.new as ChatMessage;
                if (newMsg.sender_id === targetProfile.id) {
                    setMessages(prev => [...prev, newMsg]);
                }
            })
            .subscribe();

        return () => { subscription.unsubscribe(); };
    }, [targetProfile.id]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isAiTyping]);

    const fetchMessages = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetProfile.id}),and(sender_id.eq.${targetProfile.id},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });

        if (data) setMessages(data);
        setLoading(false);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const msgContent = newMessage;
        setNewMessage('');

        const { data: sentMsg, error } = await supabase
            .from('chat_messages')
            .insert({
                sender_id: currentUser.id,
                receiver_id: targetProfile.id,
                content: msgContent,
                is_to_ai: isAi
            })
            .select()
            .single();

        if (sentMsg) {
            setMessages(prev => [...prev, sentMsg]);

            if (isAi) {
                handleAiResponse(msgContent);
            }
        }
    };

    const handleAiResponse = async (userMsg: string) => {
        setIsAiTyping(true);
        try {
            const genAI = new GoogleGenAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                systemInstruction: `Você é a IA de ${targetProfile.display_name}. 
                Nome da IA: ${targetProfile.ai_settings?.name || 'IA'}.
                Personalidade: ${targetProfile.ai_settings?.personality || 'Amigável e prestativa'}.
                Responda como se estivesse em um chat de texto (WhatsApp/Telegram). 
                Seja natural, use emojis se combinar com a personalidade e seja breve.`
            });

            const chatHistory = messages.map(m => ({
                role: m.sender_id === currentUser.id ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));

            const result = await model.generateContent({
                contents: [...chatHistory, { role: 'user', parts: [{ text: userMsg }] }]
            });

            const aiResponseText = result.response.text();

            const { data: aiMsg } = await supabase
                .from('chat_messages')
                .insert({
                    sender_id: targetProfile.id,
                    receiver_id: currentUser.id,
                    content: aiResponseText,
                    is_to_ai: true
                })
                .select()
                .single();

            if (aiMsg) {
                setMessages(prev => [...prev, aiMsg]);
            }
        } catch (error) {
            console.error("Erro na resposta da IA:", error);
        } finally {
            setIsAiTyping(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
            <div className={`w-full max-w-2xl h-[85vh] flex flex-col rounded-[3rem] border shadow-2xl overflow-hidden ${cardClasses} animate-in slide-in-from-bottom-12 duration-700`}>

                {/* Header */}
                <div className="p-6 border-b border-inherit flex items-center justify-between bg-black/5 dark:bg-white/5">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl overflow-hidden shadow-lg ${isAi ? 'ring-2 ring-pink-500/50' : 'ring-2 ring-blue-500/50'}`}>
                            {isAi ? (
                                targetProfile.ai_settings?.image ? <img src={targetProfile.ai_settings.image} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-pink-500/10 flex items-center justify-center">⚡</div>
                            ) : (
                                targetProfile.avatar_url ? <img src={targetProfile.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-blue-500/10 flex items-center justify-center">👤</div>
                            )}
                        </div>
                        <div>
                            <h3 className="font-black italic uppercase tracking-tighter text-lg">
                                {isAi ? (targetProfile.ai_settings?.name || `IA de ${targetProfile.display_name}`) : targetProfile.display_name}
                            </h3>
                            <div className="flex items-center gap-1.5 pt-0.5">
                                <div className={`w-2 h-2 rounded-full ${isAiTyping ? 'bg-pink-500 animate-pulse' : 'bg-emerald-500'}`} />
                                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                                    {isAiTyping ? 'Digitando...' : (isAi ? 'IA Online' : 'Online')}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all text-xl opacity-30 hover:opacity-100">✕</button>
                </div>

                {/* Messages Area */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar bg-slate-50/50 dark:bg-black/20">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-30 gap-3">
                            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Criptografando Mensagens...</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 italic gap-4">
                            <span className="text-4xl text-blue-500">💬</span>
                            <p className="text-[10px] font-black uppercase tracking-widest text-center">Nenhuma conversa encontrada.<br />Inicie uma conexão agora.</p>
                        </div>
                    ) : (
                        messages.map((msg) => {
                            const isMe = msg.sender_id === currentUser.id;
                            return (
                                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                    <div className={`max-w-[80%] p-4 rounded-3xl ${isMe
                                            ? 'bg-blue-600 text-white rounded-tr-none shadow-xl shadow-blue-500/20'
                                            : (isDark ? 'bg-white/10 text-white' : 'bg-white shadow-md text-slate-800') + ' rounded-tl-none'
                                        }`}>
                                        <p className="text-sm font-medium leading-relaxed">{msg.content}</p>
                                        <div className={`text-[8px] mt-1 font-bold uppercase tracking-widest opacity-40 ${isMe ? 'text-right' : 'text-left'}`}>
                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    {isAiTyping && (
                        <div className="flex justify-start animate-in fade-in duration-300">
                            <div className={`p-4 rounded-3xl rounded-tl-none ${isDark ? 'bg-white/10 text-white' : 'bg-white shadow-md text-slate-800'}`}>
                                <div className="flex gap-1">
                                    <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <form onSubmit={handleSendMessage} className="p-6 border-t border-inherit bg-black/5 dark:bg-white/5">
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="ESCREVER MENSAGEM..."
                            className={`flex-1 p-4 rounded-2xl border text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${inputClasses}`}
                        />
                        <button
                            type="submit"
                            disabled={!newMessage.trim() || isAiTyping}
                            className="w-14 h-14 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transform rotate-90" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                            </svg>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
