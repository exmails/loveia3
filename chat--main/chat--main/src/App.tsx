import { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Settings, 
  Trash2, 
  Cpu, 
  Key, 
  User, 
  Bot, 
  Menu,
  X,
  Plus,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GeminiService, type ChatMessage } from './services/geminiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: 'Fast and efficient for most tasks' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', description: 'Advanced reasoning and complex tasks' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Balanced performance and speed' },
  { id: 'gemini-2.5-flash-lite-latest', name: 'Gemini Flash Lite', description: 'Lightweight and extremely fast' },
  { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image', description: 'Optimized for image-related tasks' },
  { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image', description: 'High-quality image generation' },
];

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Config state
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [customApiKey, setCustomApiKey] = useState(process.env.GEMINI_API_KEY || '');
  const [systemInstruction, setSystemInstruction] = useState('You are a helpful and professional AI assistant.');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const service = new GeminiService({
        model: selectedModel,
        apiKey: customApiKey || undefined,
      });

      const history = messages.slice(-10); // Keep last 10 messages for context
      
      let assistantContent = '';
      setMessages(prev => [...prev, { role: 'model', content: '' }]);

      const stream = service.sendMessageStream(input, history, systemInstruction);
      
      for await (const chunk of stream) {
        assistantContent += chunk;
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: 'model', content: assistantContent };
          return newMessages;
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { 
        role: 'model', 
        content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Verifique sua chave de API ou conexão.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="w-72 bg-white border-r border-zinc-200 flex flex-col z-20"
          >
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-zinc-900">
                <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center text-white">
                  <Bot size={18} />
                </div>
                <span>Gemini Pro</span>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 hover:bg-zinc-100 rounded-md text-zinc-500 lg:hidden"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <button 
                onClick={clearChat}
                className="w-full flex items-center gap-2 p-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors border border-zinc-200"
              >
                <Plus size={16} />
                Novo Chat
              </button>

              <div className="pt-4 pb-2 px-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                Recentes
              </div>
              
              <div className="space-y-1">
                <button className="w-full flex items-center gap-2 p-2 text-sm text-zinc-600 hover:bg-zinc-50 rounded-md text-left truncate">
                  <MessageSquare size={14} className="shrink-0" />
                  <span>Conversa atual</span>
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-100 space-y-2">
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="w-full flex items-center gap-2 p-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
              >
                <Settings size={16} />
                Configurações
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-zinc-200 flex items-center justify-between px-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-zinc-100 rounded-md text-zinc-600"
              >
                <Menu size={20} />
              </button>
            )}
            <div>
              <h1 className="text-sm font-semibold text-zinc-900">
                {MODELS.find(m => m.id === selectedModel)?.name}
              </h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                Status: Online
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={clearChat}
              className="p-2 hover:bg-red-50 hover:text-red-600 rounded-md text-zinc-400 transition-colors"
              title="Limpar conversa"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-md mx-auto">
              <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center text-zinc-400">
                <Bot size={32} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-zinc-900 mb-2">Como posso ajudar hoje?</h2>
                <p className="text-sm text-zinc-500">
                  Comece uma conversa com o Gemini. Você pode fazer perguntas, pedir para escrever código ou apenas bater um papo.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {['Explique física quântica', 'Escreva um poema', 'Dicas de viagem', 'Ajuda com código'].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="p-3 text-xs text-zinc-600 bg-white border border-zinc-200 rounded-xl hover:border-zinc-400 transition-all text-left"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full space-y-8">
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className={cn(
                    "flex gap-4 group",
                    msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    msg.role === 'user' ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-600"
                  )}>
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className={cn(
                    "max-w-[85%] space-y-1",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "p-4 rounded-2xl text-sm",
                      msg.role === 'user' 
                        ? "bg-zinc-900 text-white rounded-tr-none" 
                        : "bg-white border border-zinc-200 text-zinc-800 rounded-tl-none shadow-sm"
                    )}>
                      <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-400 px-1">
                      {msg.role === 'user' ? 'Você' : 'Gemini'}
                    </span>
                  </div>
                </motion.div>
              ))}
              {isLoading && messages[messages.length - 1].role === 'user' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-4"
                >
                  <div className="w-8 h-8 rounded-lg bg-zinc-200 flex items-center justify-center text-zinc-600">
                    <Bot size={16} />
                  </div>
                  <div className="bg-white border border-zinc-200 p-4 rounded-2xl rounded-tl-none shadow-sm">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-gradient-to-t from-zinc-50 via-zinc-50 to-transparent">
          <div className="max-w-3xl mx-auto relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem..."
              rows={1}
              className="w-full bg-white border border-zinc-200 rounded-2xl py-4 pl-4 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all resize-none shadow-sm"
              style={{ minHeight: '56px', maxHeight: '200px' }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              className={cn(
                "absolute right-2 bottom-2 p-2.5 rounded-xl transition-all",
                input.trim() && !isLoading 
                  ? "bg-zinc-900 text-white hover:scale-105 active:scale-95" 
                  : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
              )}
            >
              <Send size={18} />
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 text-center mt-3">
            O Gemini pode cometer erros. Considere verificar informações importantes.
          </p>
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900">Configurações</h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-full text-zinc-500"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                {/* Model Selection */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    <Cpu size={14} />
                    Modelo de IA
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {MODELS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => setSelectedModel(model.id)}
                        className={cn(
                          "flex flex-col items-start p-3 rounded-xl border text-left transition-all",
                          selectedModel === model.id 
                            ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900" 
                            : "border-zinc-200 hover:border-zinc-300"
                        )}
                      >
                        <span className="text-sm font-medium text-zinc-900">{model.name}</span>
                        <span className="text-xs text-zinc-500">{model.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* API Key */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    <Key size={14} />
                    Chave de API (Opcional)
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      placeholder="Insira sua chave de API personalizada..."
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    Por padrão, usamos a chave de API configurada no ambiente. Insira uma aqui se quiser usar sua própria chave.
                  </p>
                </div>

                {/* System Instruction */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    <Settings size={14} />
                    Instrução do Sistema
                  </label>
                  <textarea
                    value={systemInstruction}
                    onChange={(e) => setSystemInstruction(e.target.value)}
                    rows={3}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all resize-none"
                  />
                </div>
              </div>

              <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex justify-end">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-6 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-medium hover:bg-zinc-800 transition-colors"
                >
                  Salvar e Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
