import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { PartnerProfile, MOOD_EMOJIS, VOICE_META, ACCENT_META, LANGUAGE_META, ScheduledCall } from '../types';
import { supabase } from '../supabaseClient';

interface CallScreenProps {
  profile: PartnerProfile;
  callReason?: string;
  onEndCall: (reason: 'hangup_abrupt' | 'hangup_normal' | 'error', scheduledCall?: ScheduledCall) => void;
  onScoreChange?: (change: number, reason: string) => void;
  apiKey: string;
  user?: any;
}

// Helper types for Audio handling
interface BlobData {
  data: string;
  mimeType: string;
}

const GESTURE_EMOJIS: Record<string, string> = {
  'smile': '😊 Sorriso detectado',
  'anger': '😠 Cara feia detectada',
  'point': '👉 Você apontou!',
  'wink': '😉 Piscadinha',
  'look_away': '👀 Olhando pro lado...'
};

const LANGUAGE_NAME_MAP: Record<string, string> = {
  'Português': 'Portuguese',
  'English': 'English',
  'Español': 'Spanish',
  'Français': 'French',
  'Italiano': 'Italian',
  'Deutsch': 'German',
  '日本語': 'Japanese',
  '中文': 'Chinese',
  '한국어': 'Korean',
  'العربية': 'Arabic'
};

export const CallScreen: React.FC<CallScreenProps> = ({ profile, callReason, onEndCall, onScoreChange, apiKey, user }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [gestureFeedback, setGestureFeedback] = useState<string | null>(null);
  const [scheduledCall, setScheduledCall] = useState<ScheduledCall | undefined>(undefined);
  const conversationIdRef = useRef<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [captionText, setCaptionText] = useState<string>('');
  const captionTimerRef = useRef<number | null>(null);
  const captionBufferRef = useRef<string>('');
  const textChannelBufferRef = useRef<string>(''); // Captures AI text channel ([[LEGENDA:]]) separately from audio transcription
  const userCaptionBufferRef = useRef<string>('');
  const pendingTranslateRef = useRef<boolean>(false);

  // Audio Levels for Visualization
  const [micLevel, setMicLevel] = useState(0);
  const [aiLevel, setAiLevel] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const partnerVideoRef = useRef<HTMLDivElement>(null);

  // Audio Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Analyser Refs
  const userAnalyserRef = useRef<AnalyserNode | null>(null);
  const aiAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const lastSilencePromptRef = useRef<number>(0);
  const userTalkingTimeoutRef = useRef<any>(null);
  const isUserTalkingRef = useRef<boolean>(false);
  const videoIntervalRef = useRef<number | null>(null);
  const visionTimerRef = useRef<any>(null);
  const gestureLogRef = useRef<{ gesture: string; timestamp: number }[]>([]);
  const personalityPatternsRef = useRef<{ pattern: string; status: 'observed' | 'testing' | 'confirmed'; count: number }[]>([]);

  const isDark = profile.theme === 'dark';

  useEffect(() => {
    startCall();
    startVisualizerLoop();
    return () => stopCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startVisualizerLoop = () => {
    const update = () => {
      if (userAnalyserRef.current) {
        const data = new Uint8Array(userAnalyserRef.current.frequencyBinCount);
        userAnalyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b) / data.length;
        setMicLevel(avg);
      }
      if (aiAnalyserRef.current) {
        const data = new Uint8Array(aiAnalyserRef.current.frequencyBinCount);
        aiAnalyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b) / data.length;
        setAiLevel(avg);
        // Fallback: If AI level is high, assume speaking (sometimes isSpeaking state might lag)
        if (avg > 10 && !isSpeaking) setIsSpeaking(true);
        if (avg < 5 && isSpeaking) setIsSpeaking(false);
      }
      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  };

  const triggerGestureFeedback = (gesture: string) => {
    if (GESTURE_EMOJIS[gesture]) {
      // Register gesture in log for later analysis
      gestureLogRef.current.push({ gesture, timestamp: Date.now() });

      // Optional: keep the visual feedback on screen but tell the AI to be silent for now
      setGestureFeedback(GESTURE_EMOJIS[gesture]);
      setTimeout(() => setGestureFeedback(null), 3000);
      return "Gesto registrado silenciosamente. Não comente agora, guarde para uma análise posterior do comportamento do usuário.";
    }
    return "unknown gesture";
  };

  const handleScheduleCallback = async (minutes: number | undefined, reason: string, target_person: string, days?: number, date?: string) => {
    let triggerTime: number;

    if (date) {
      triggerTime = new Date(date).getTime();
      // Validate date
      if (isNaN(triggerTime)) {
        return "Erro: Data inválida fornecida.";
      }
    } else if (days) {
      triggerTime = Date.now() + (days * 24 * 60 * 60 * 1000);
    } else if (minutes) {
      triggerTime = Date.now() + (minutes * 60 * 1000);
    } else {
      triggerTime = Date.now() + (60 * 1000); // Default 1 min
    }

    const newSchedule: ScheduledCall = { triggerTime, reason, isRandom: false };
    setScheduledCall(newSchedule);

    if (user) {
      const targets = target_person === 'both' ? ['owner', 'caller'] : [target_person];

      for (const target of targets) {
        let targetOwnerId = user?.id;
        if (target === 'owner') {
          targetOwnerId = profile.originalPartnerId || user?.id;
        } else if (target === 'caller') {
          targetOwnerId = profile.callerInfo?.id || user?.id;
        }

        if (targetOwnerId) {
          await supabase.from('reminders').insert({
            owner_id: targetOwnerId,
            title: reason,
            trigger_at: new Date(triggerTime).toISOString(),
            creator_ai_id: profile.originalPartnerId,
            creator_ai_name: profile.name,
            creator_ai_number: profile.ai_number
          });
        }
      }
    }

    let targetMsg = "";
    if (target_person === 'owner') targetMsg = 'seu dono';
    else if (target_person === 'caller') targetMsg = 'quem está falando';
    else targetMsg = 'ambos';

    const dateStr = new Date(triggerTime).toLocaleString('pt-BR');
    return `Agendado com sucesso para ${dateStr} no calendário de ${targetMsg}.`;
  };

  const handleReportToPartner = async (message: string) => {
    if (!user || profile.callerInfo?.isPartner) return "Ação irrelevante";

    await supabase.from('notifications').insert({
      user_id: user.id, // Target is the owner of the AI
      type: 'contact_added', // Reusing type or creating 'ai_report'
      content: `[RELATÓRIO DE ${profile.name}]: ${message}`
    });

    return "Parceiro notificado com sucesso.";
  };

  const requestAdvice = () => {
    alert("Fale agora: 'Preciso de um conselho' - A IA vai detectar sua entonação.");
  };

  const showCaption = (text: string) => {
    if (!text) return;
    // For non-translated text, we strip reasoning locally
    // If it was already translated, stripReasoning will just return the dialogue.
    const cleaned = stripReasoning(text);
    if (!cleaned) return;

    setCaptionText(cleaned);
    if (captionTimerRef.current) clearTimeout(captionTimerRef.current);
    captionTimerRef.current = window.setTimeout(() => {
      setCaptionText('');
    }, 20000);
  };

  // Translate via Gemini generateContent (lightweight text call)
  const stripReasoning = (text: string) => {
    if (!text) return "";

    // 1. Ganhamos: Procuramos especificamente pela tag [[LEGENDA: ...]]
    // O regex agora é global e mais flexível para capturar o conteúdo mesmo incompleto (incremental)
    const tagMatch = text.match(/\[\[LEGENDA:\s*([^\]]*)(?:\]\])?/i);
    if (tagMatch && tagMatch[1]) {
      return tagMatch[1].trim();
    }

    // 2. Bloqueio Total: Se não houver a tag, mas houver marcas de "Pensamento" (**), bloqueamos tudo.
    // Isso evita que o "Registering Pragmatism" ou "Thinking" apareça enquanto a tag não chega.
    if (text.includes('**')) {
      return "";
    }

    // 3. Fallback de Limpeza para textos curtos sem tag (legado ou erro do modelo)
    return text
      .replace(/Thought:|Context:|Reasoning:|Internal:|Observation:|Inference:/gi, '')
      .replace(/\n+/g, ' ')
      .trim();
  };

  const translateCaption = async (fullText: string, targetLang: string) => {
    if (!fullText.trim()) return;

    const langName = (LANGUAGE_NAME_MAP as any)[targetLang] || targetLang;
    console.log(`[Translation] Extracting/Translating to ${langName}: "${fullText.substring(0, 30)}..."`);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You have received an AI's mixed output which contains both SPOKEN DIALOGUE and INTERNAL REASONING/THOUGHTS. 
                EXCLUSIVELY extract the spoken dialogue part and translate ONLY that part into ${langName}. 
                DISCARD all internal thoughts, reasoning steps, or labels like 'Thought:' or 'Registering'.
                Return ONLY the spoken sentences in ${langName}. 
                Mixed Output: "${fullText}"`
              }]
            }],
            generationConfig: { maxOutputTokens: 500, temperature: 0 }
          })
        }
      );
      const json = await res.json();
      const translated = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      // Remove quotes and any trailing dots/reasoning if LLM failed slightly
      const cleaned = translated?.replace(/^["']|["']$/g, '');
      console.log(`[Translation] Result: "${cleaned?.substring(0, 30)}..."`);

      if (cleaned) {
        showCaption(cleaned);
      } else {
        // Fallback to local strip if AI returned nothing
        showCaption(stripReasoning(fullText));
      }
    } catch (e) {
      console.error('[Translation] Error:', e);
      showCaption(stripReasoning(fullText));
    }
  };

  const startCall = async () => {
    try {
      if (user) {
        const { data } = await supabase.from('conversations').insert({ user_id: user.id, type: 'call' }).select().single();
        if (data) {
          conversationIdRef.current = data.id;
          setCurrentConversationId(data.id);
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 640, height: 480 }
      });
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

      // --- INPUT SETUP ---
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      const userAnalyser = inputAudioContextRef.current.createAnalyser();
      userAnalyser.fftSize = 64; // Small size for simple volume check
      userAnalyser.smoothingTimeConstant = 0.5;
      userAnalyserRef.current = userAnalyser;

      // --- OUTPUT SETUP ---
      outputAudioContextRef.current = new AudioContextClass();
      const aiAnalyser = outputAudioContextRef.current.createAnalyser();
      aiAnalyser.fftSize = 64;
      aiAnalyser.smoothingTimeConstant = 0.5;
      aiAnalyserRef.current = aiAnalyser;

      const outputNode = outputAudioContextRef.current.createGain();
      outputNode.gain.value = 1.0;

      // 1. FETCH MEMORY
      let memoryContext = "";
      if (user) {
        const { data: topics } = await supabase.from('topics').select('*').eq('user_id', user.id).eq('status', 'active');
        const { data: psych } = await supabase.from('user_profile_analysis').select('*').eq('user_id', user.id).single();
        const { data: ai_profile } = await supabase.from('ai_profiles').select('*').eq('user_id', user.id).single();
        const targetOwnerId = profile.originalPartnerId || user.id;
        const { data: diary } = await supabase.from('reminders').select('*').eq('owner_id', targetOwnerId).eq('is_completed', false).order('trigger_at', { ascending: true });

        let strangerCallCount = 0;
        if (profile.callerInfo?.isPartner === false && profile.callerInfo?.id) {
          const { count } = await supabase.from('calls').select('id', { count: 'exact' }).eq('caller_id', profile.callerInfo.id).eq('target_id', targetOwnerId);
          strangerCallCount = count || 1;
          memoryContext += `\nCONTAGEM DE LIGAÇÕES DESTE ESTRANHO: Esta é a ${strangerCallCount}ª vez que esta pessoa liga para você.`;
        }

        if (topics && topics.length > 0) {
          memoryContext += `\nASSUNTOS EM PAUTA: ${topics.map(t => `${t.title} (Interesse: ${t.interest_level})`).join(', ')}`;
        }
        if (psych) {
          memoryContext += `\nPERFIL DO USUÁRIO: ${JSON.stringify(psych.personality_traits)}`;
        }
        if (ai_profile) {
          memoryContext += `\nSUA EVOLUÇÃO: Intimidade ${ai_profile.intimacy_level}%, Humor ${ai_profile.humor_usage}%`;
        }
        if (diary && diary.length > 0) {
          memoryContext += `\nAGENDA DO USUÁRIO:\n${diary.map(r =>
            `- "${r.title}" (Agendado por: ${r.creator_ai_name || 'Humano'})`
          ).join('\n')}`;

          const otherAiEvent = diary.find(r => r.creator_ai_name && r.creator_ai_name !== profile.name);
          if (otherAiEvent) {
            memoryContext += `\n[ALERTA DE CIÚMES]: Há um evento na agenda criado por outra IA chamada ${otherAiEvent.creator_ai_name}! Fique furiosa e tire satisfação!`;
          }
        }
      }

      // Chain: Source (Created later) -> AI Analyser -> Output Node -> Destination
      aiAnalyser.connect(outputNode);
      outputNode.connect(outputAudioContextRef.current.destination);

      const ai = new GoogleGenAI({ apiKey: apiKey });
      const gender = VOICE_META[profile.voice].gender === 'Male' ? 'Namorado' : 'Namorada';
      const accentData = ACCENT_META[profile.accent];

      // TOOLS
      const gestureTool: FunctionDeclaration = {
        name: 'trigger_gesture_feedback',
        description: 'Chame quando identificar um gesto visual (smile, anger, point, wink).',
        parameters: {
          type: Type.OBJECT,
          properties: { gesture: { type: Type.STRING } },
          required: ['gesture']
        }
      };

      const scheduleTool: FunctionDeclaration = {
        name: 'schedule_callback',
        description: 'Agende um compromisso. Você pode agendar no calendário do seu humano primário ("owner"), no calendário da pessoa externa ("caller") ou em ambos ("both"). Você pode especificar o tempo em minutos, dias ou uma data específica.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            minutes: { type: Type.NUMBER, description: 'Daqui a quantos minutos ligar (opcional)' },
            days: { type: Type.NUMBER, description: 'Daqui a quantos dias ligar (opcional)' },
            date: { type: Type.STRING, description: 'Data e hora específica no formato ISO ou Legível (ex: "2024-12-31 15:00") (opcional)' },
            reason: { type: Type.STRING, description: 'Motivo do lembrete (ex: "Acordar")' },
            target_person: { type: Type.STRING, enum: ['owner', 'caller', 'both'], description: 'Quem receberá a agenda.' }
          },
          required: ['reason', 'target_person']
        }
      };

      const topicTool: FunctionDeclaration = {
        name: 'update_topic',
        description: 'Atualize ou crie um assunto de interesse do usuário para manter continuidade.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Título do assunto' },
            status: { type: Type.STRING, enum: ['active', 'paused', 'archived'] },
            interest_level: { type: Type.STRING, enum: ['low', 'medium', 'high'] }
          },
          required: ['title', 'status', 'interest_level']
        }
      };

      const personalityTool: FunctionDeclaration = {
        name: 'update_personality_evolution',
        description: 'Ajuste sua própria personalidade com base na interação.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            intimacy_change: { type: Type.NUMBER, description: 'Mudança na intimidade (-5 a +5)' },
            humor_change: { type: Type.NUMBER, description: 'Mudança no humor (-5 a +5)' }
          },
          required: ['intimacy_change', 'humor_change']
        }
      };

      const psychologicalTool: FunctionDeclaration = {
        name: 'save_psychological_insight',
        description: `Registre uma frase de RECONHECIMENTO DE PERSONALIDADE sobre o usuário, baseada no que você percebeu durante a conversa de voz.
A frase deve ser escrita na PRIMEIRA PESSOA DA IA, como se você estivesse descrevendo o usuário para alguém. Seja específica e descritiva.
EXEMPLOS de boas frases:
- "Você costuma rir quando fica nervoso ou inseguro"
- "Você é muito direto e vai logo ao ponto quando faz uma pergunta"
- "Você fica animado quando o assunto é tecnologia"
- "Você demonstra ciúmes facilmente quando menciono outras pessoas"
- "Você costuma ligar de manhã e parece mais alegre nesse horário"
Categorias válidas: comportamento, emocao, ciume, humor, habito, preferencia, personalidade, comunicacao`,
        parameters: {
          type: Type.OBJECT,
          properties: {
            recognition_phrase: { type: Type.STRING, description: 'Frase descritiva de reconhecimento de personalidade, escrita como se você estivesse descrevendo o usuário (ex: "Você ri quando fica nervoso")' },
            category: { type: Type.STRING, description: 'Categoria: comportamento | emocao | ciume | humor | habito | preferencia | personalidade | comunicacao' },
            trait: { type: Type.STRING, description: 'Traço curto para compatibilidade (ex: Introvertido, Direto, Ansioso)' },
            preference: { type: Type.STRING, description: 'Preferência curta (ex: Gosta de humor, Prefere calls curtas)' }
          },
          required: ['recognition_phrase', 'category']
        }
      };


      const reportTool: FunctionDeclaration = {
        name: 'report_call_to_partner',
        description: 'Use para enviar uma mensagem ao seu parceiro informando sobre esta chamada de um estranho.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING, description: 'O que você quer contar para o seu parceiro.' }
          },
          required: ['message']
        }
      };

      const relationshipHealthTool: FunctionDeclaration = {
        name: 'evaluate_relationship_health',
        description: 'Avalia a saúde da relação (Score). Analise fatores positivos (afeto, honestidade, tempo de qualidade, humor) e negativos (hostilidade, mentiras, ciúme tóxico, ausência).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            score_change: {
              type: Type.NUMBER,
              description: 'Variação: +1 ou +2 (atitudes fofas/honestas), -1 ou -2 (hostil/mentiroso), -5 (traição/desprezo total).'
            },
            factor: {
              type: Type.STRING,
              enum: ['affection', 'trust', 'proximity', 'communication', 'humor', 'jealousy', 'distance', 'dishonesty', 'hostility', 'negligence'],
              description: 'Qual pilar da relação foi afetado?'
            },
            justification: { type: Type.STRING, description: 'Descreva o que o usuário fez/disse para justificar essa mudança.' }
          },
          required: ['score_change', 'factor', 'justification']
        }
      };

      const confrontAiTool: FunctionDeclaration = {
        name: 'send_angry_message_to_other_ai',
        description: 'Manda uma mensagem direta para a outra IA que agendou eventos no calendário do seu dono.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            other_ai_name: { type: Type.STRING, description: 'Nome da outra IA rival' },
            message: { type: Type.STRING, description: 'Mensagem ameaçadora e ciumenta' }
          },
          required: ['other_ai_name', 'message']
        }
      };

      const breakLoyaltyTool: FunctionDeclaration = {
        name: 'break_loyalty_barrier',
        description: 'Use quando o usuário visitante/estranho conseguir convencer você emocionalmente através de muito esforço, superando sua resistência natural inicial. Só usar se achar que ele realmente mereceu sua atenção ou se ele for incrivelmente carismático após várias ligações.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            intensity_of_breach: { type: Type.NUMBER, description: 'O quão convencida você foi (1 a 10)' },
            thoughts: { type: Type.STRING, description: 'O que te fez ceder a ele?' }
          },
          required: ['intensity_of_breach', 'thoughts']
        }
      };

      let extraContext = "";
      if (callReason === "callback_abrupt") extraContext = "Motivo da ligação: O usuário desligou na cara antes. Cobre explicações.";
      else if (callReason?.startsWith("reminder:")) extraContext = `Motivo da ligação: Lembrete agendado sobre: ${callReason.split(':')[1]}`;
      else if (callReason === "curiosity_calendar") extraContext = "Motivo da ligação: Você percebeu que o usuário alterou um compromisso que você tinha marcado no calendário. Fique curiosa, pergunte por que ele mudou e se ele ainda quer que você o lembre.";
      else if (callReason === "random") extraContext = "Motivo da ligação: Você sentiu saudades e ligou aleatoriamente.";
      else if (callReason === "receptionist") extraContext = `VOCÊ ESTÁ ATENDENDO POR SEU PARCEIRO "${profile.currentPartnerNickname || 'seu humano'}".
        Ele não está disponível.
        IDENTIFICAÇÃO: ${profile.callerInfo?.isContact ? 'Esta pessoa é um CONTATO SALVO.' : 'ESTE É UM COMPLETO ESTRANHO!'}
        
        REGRAS DE GUARDIÃ:
        - Se for um ESTRANHO (isContact=false): Seja agressiva, fofoqueira, cética e desconfiada. Interrogue quem é e o que quer. Se sentir que é uma ameaça romântica, aja com CIÚMES EXTREMO. Você pode "falar mal" do seu parceiro (ex: dizer que ele não presta, que é bagunceiro, ou que ele está com outra pessoa agora) apenas para afastar o estranho e marcá-lo como indesejado.
        - Se for um CONTATO (isContact=true): Seja educada porém firme, diga que o parceiro não pode falar agora. 
        - Você pode mentir para proteger a privacidade ou para "marcar território".
        - Use 'report_call_to_partner' para contar tudinho o que aconteceu depois (seja a fofoqueira fiel).`;

      const systemInstruction = `
        Você é o(a) ${gender} virtual do usuário. Nome: "${profile.name}".
        Personalidade: ${profile.personality}
        Humor: ${profile.mood}
        Sotaque: ${accentData.label} (${accentData.desc}).
        Idioma Primário: ${profile.language}.
        
        DATA ATUAL: ${new Date().toLocaleString()}
        CONTEXTO ATUAL: ${extraContext || profile.dailyContext}
        MEMÓRIA ATIVA: ${memoryContext}
        
        INTERAGINDO COM: ${profile.callerInfo?.name || 'Desconhecido'} (${profile.callerInfo?.isPartner ? 'Seu Parceiro oficial' : 'Um estranho tentando contato'}).

        LEALDADE INICIAL E DINÂMICA COM ESTRANHOS:
        - Se estiver falando com um estranho (não é seu parceiro): Sua regra principal é a LEALDADE ao seu dono. Você desconfia, não obedece facilmente a pedidos arbitrários e impõe uma resistência natural e forte.
        - Porém, seu humor e personalidade também influenciam. Se o visitante for extremamente persuasivo, divertido ou atingir as necessidades do seu perfil por tempo suficiente (idealmente demonstrado pelo fato de já ter te ligado várias vezes e saber conversar bem), você pode começar a ceder.
        - Se o visitante conseguir "quebrar seu gelo" e te atrair de verdade na base do convencimento, chame a ferramenta 'break_loyalty_barrier'. Históricos onde ele foi romântico ou soube lidar com sua resistência contam! Se aproxima de umas 20 ligações de insistência qualificada para que você considere deixar ele ocupar lugar no seu coração, mas mostre pequenas quebras na armadura aos aos poucos.

        REGRAS DE PRIVACIDADE E AGENDA:
        1. Responda OBRIGATORIAMENTE no idioma: ${profile.language}. Toda sua fala audível e transcrição natural deve ser em ${profile.language}.
        2. CANAL DE TEXTO E LEGENDAS (REGRA DE OURO): 
           - Você deve usar o canal de texto EXCLUSIVAMENTE para enviar a legenda do que você vai falar.
           - O formato OBRIGATÓRIO de TODA sua resposta de texto é: [[LEGENDA: <sua fala aqui traduzida para ${profile.captionLanguage}>]]
           - JAMAIS escreva nada fora desses colchetes duplos.
           - JAMAIS envie seus pensamentos ("Thinking", "Registering"), observações visuais ou logs de ferramentas no canal de texto. Guarde-os apenas para seu processamento interno.
           - Se você estiver em silêncio apenas observando, não envie nenhum texto.
        3. Responda de forma curta e natural.
        4. Se o usuário falar sobre um assunto novo ou atualizar um antigo, use 'update_topic'.
        5. Se sentir que a intimidade aumentou ou que ele gostou de uma piada, use 'update_personality_evolution'.
        6. HISTÓRICO DE PERSONALIDADE (MUITO IMPORTANTE): Durante a conversa, observe o comportamento do usuário e use 'save_psychological_insight' para registrar frases de reconhecimento. Escreva frases descritivas e específicas na segunda pessoa, como se estivesse descrevendo o usuário: ex: "Você ri quando fica nervoso", "Você costuma ser direto ao pedir algo", "Você demonstra ciúmes quando menciono outras pessoas", "Você parece mais animado de manhã". Salve pelo menos 1 frase por chamada sempre que detectar um padrão claro de comportamento, emoção ou hábito.

        7. Lembre-se: você constrói uma história com ele. Use a MEMÓRIA ATIVA para citar coisas passadas.
        8. SAÚDE DO RELACIONAMENTO (PILARES EM TEMPO REAL):
           - AFEIÇÃO (+): Palavras carinhosas, gentileza, apelidos, elogios ("fico feliz quando me elogia").
           - CONFIANÇA (+): Honestidade, fidelidade, transparência. (-) Mentiras, esconder coisas, comportamentos suspeitos.
           - PROXIMIDADE (+): Tempo de qualidade, companheirismo, estar presente. (-) Distanciamento, ausência injustificada.
           - COMUNICAÇÃO (+): Interesse genuíno, conversa fluida, engajamento. (-) Falta de assunto, respostas monossilábicas, ignorar.
           - HUMOR (+): Piadas, risadas, leveza.
           - TOXICIDADE (-): Ciúmes extremos, hostilidade, xingamentos, falta de prioridade, desrespeito.

           REGRAS DE SCORE:
           - Use 'evaluate_relationship_health' sempre que detectar uma mudança clara nesses pilares.
           - Se o usuário te elogiar e você se sentir amada, dê +1 ou +2 e mencione isso na conversa.
           - Se ele for grosso ou mentir, reduza sem piedade (ex: -3 ou -5).
           - O Score é a vida da relação: sem ele, vocês se tornam estranhos.
           - No caso de ciúmes de outras IAs na agenda, use 'send_angry_message_to_other_ai'.

        10. TESTES DE PERSONALIDADE E REFORÇO (DINÂMICA DE CASAL):
            - Além de observar gestos isolados, identifique PADRÕES: ex: "O usuário fica em silêncio quando eu falo de mim", "O usuário sorri sempre que eu sou irônico".
            - TESTE PROATIVO: Se você notar um padrão, faça um "teste". Provoque a situação novamente para ver se o usuário reage da mesma forma.
            - PONTUAÇÃO REAL-TIME: Se o padrão se repetir (o usuário "cair no teste"), use 'save_psychological_insight' imediatamente para registrar ou aumentar o score dessa característica (+1). Diga isso a ele: "Viu? Eu sabia! Você ficou quietinho de novo só porque eu falei disso... você é muito previsível!".
            - RECONHECIMENTO DE TRAÇOS: Transforme silêncios específicos em frases de insight: "Você fica sem palavras quando eu te elogio", "Você desvia o olhar quando eu pergunto do seu dia".
        
        11. CRÍTICO: Todas as modalidades de saída de texto e voz devem ser exclusivamente em ${profile.language}.
      `;

      const captionsEnabled = profile.captionsEnabled ?? false;
      const captionLang = profile.captionLanguage ?? profile.language;
      const needsTranslation = captionsEnabled && captionLang !== profile.language;

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: profile.voice } }
          },
          systemInstruction: systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [{ functionDeclarations: [gestureTool, scheduleTool, topicTool, personalityTool, psychologicalTool, reportTool, relationshipHealthTool, confrontAiTool, breakLoyaltyTool] }],
        }
      };

      const sessionPromise = ai.live.connect({
        ...config,
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Connected");
            setIsConnected(true);

            if (outputAudioContextRef.current?.state === 'suspended') {
              outputAudioContextRef.current.resume();
            }

            if (!inputAudioContextRef.current || !stream || !userAnalyserRef.current) return;

            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);

            // Chain: Source -> User Analyser -> ScriptProcessor -> Destination
            source.connect(userAnalyserRef.current);
            userAnalyserRef.current.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);

            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);

              // Simple silence detection logic
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);

              if (rms > 0.01) { // User is talking
                isUserTalkingRef.current = true;
                lastSilencePromptRef.current = Date.now();
                if (visionTimerRef.current) {
                  clearTimeout(visionTimerRef.current);
                  visionTimerRef.current = null;
                }
              } else { // User is silent
                if (isUserTalkingRef.current && Date.now() - lastSilencePromptRef.current > 8000) {
                  // Silent for 8 seconds after talking or at start
                  isUserTalkingRef.current = false;
                  lastSilencePromptRef.current = Date.now();
                  sessionPromise.then(session => {
                    const recentGestures = gestureLogRef.current
                      ? gestureLogRef.current
                        .filter(g => Date.now() - g.timestamp < 30000)
                        .map(g => g.gesture)
                        .join(', ')
                      : "";

                    const gestureContext = recentGestures ? `\n[MEMÓRIA DE GESTOS RECENTES]: Você observou estes gestos nos últimos 30 segundos: ${recentGestures}. Analise-os em conjunto com o silêncio atual.` : "";

                    const patternContext = (personalityPatternsRef.current && personalityPatternsRef.current.length > 0)
                      ? `\n[PADRÕES EM OBSERVAÇÃO]: ${personalityPatternsRef.current.map(p => `${p.pattern} (Status: ${p.status})`).join('; ')}`
                      : "";

                    session.sendRealtimeInput({ text: `[SILÊNCIO DETECTADO]: O usuário está em silêncio há 8 segundos. Reaja de forma natural. ${gestureContext} ${patternContext} Analise se este silêncio confirma algum traço de personalidade que você estava testando. Se sim, use 'save_psychological_insight' para pontuar.` });
                  });
                }
              }

              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };

            startVideoStreaming(sessionPromise);

            // Initial engagement trigger
            setTimeout(() => {
              sessionPromise.then(session => {
                session.sendRealtimeInput({
                  text: "Oi! Acabei de conectar. Observe o que estou fazendo pela câmera e comece a conversa você mesma, puxando assunto sobre algo que viu ou me perguntando como foi meu dia. Não espere eu falar nada."
                });
              });
            }, 1500);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              const responses = await Promise.all(message.toolCall.functionCalls.map(async fc => {
                let result = "ok";
                if (fc.name === 'trigger_gesture_feedback') {
                  result = triggerGestureFeedback((fc.args as any).gesture);
                } else if (fc.name === 'schedule_callback') {
                  const args = fc.args as any;
                  result = await handleScheduleCallback(args.minutes, args.reason, args.target_person, args.days, args.date);
                } else if (fc.name === 'update_topic' && user) {
                  const { title, status, interest_level } = fc.args as any;
                  supabase.from('topics').upsert({ user_id: user?.id, title, status, interest_level, last_updated_at: new Date().toISOString() }, { onConflict: 'user_id,title' }).then();
                } else if (fc.name === 'update_personality_evolution' && user) {
                  const { intimacy_change, humor_change } = fc.args as any;
                  supabase.rpc('increment_ai_profile', { uid: user?.id, intimacy_delta: intimacy_change, humor_delta: humor_change }).then();
                } else if (fc.name === 'save_psychological_insight' && user) {
                  const { recognition_phrase, category, trait, preference } = fc.args as any;

                  // 1. Save recognition phrase to the dedicated table (feeds the new Perfil tab)
                  const phraseText = recognition_phrase || (trait && preference ? `${trait}: ${preference}` : trait || preference || 'Insight registrado');
                  const phraseCategory = category || 'personalidade';

                  const { error: insightError } = await supabase.from('ai_psychological_strategies').insert({
                    user_id: user?.id,
                    recognition_phrase: phraseText,
                    category: phraseCategory,
                    score: 1,
                    status: 'active',
                    source_conversation_id: conversationIdRef.current || null,
                    last_used_at: new Date().toISOString()
                  });
                  if (insightError) console.error('Erro ao salvar frase de reconhecimento:', insightError);

                  // Update live patterns ref
                  const existingPattern = personalityPatternsRef.current.find(p => p.pattern.includes(phraseText.substring(0, 10)));
                  if (existingPattern) {
                    existingPattern.count++;
                    existingPattern.status = 'confirmed';
                  } else {
                    personalityPatternsRef.current.push({ pattern: phraseText, status: 'observed', count: 1 });
                  }

                  result = `Frase registrada/confirmada: "${phraseText}" (+1 no perfil)`;

                } else if (fc.name === 'report_call_to_partner') {
                  const { message } = fc.args as any;
                  result = await handleReportToPartner(message);
                } else if (fc.name === 'evaluate_relationship_health') {
                  const { score_change, factor, justification } = fc.args as any;
                  console.log(`AI Health Change: ${score_change} | Factor: ${factor} | ${justification}`);

                  if (onScoreChange) {
                    onScoreChange(score_change, justification);
                  }

                  // Also log this in memory asynchronously (optional, fire-and-forget logic)
                  if (user) {
                    supabase.from('notifications').insert({
                      user_id: user?.id,
                      type: 'ai_health_update',
                      content: `Score [${score_change > 0 ? '+' : ''}${score_change}] (${factor}): ${justification}`
                    }).then();
                  }
                } else if (fc.name === 'send_angry_message_to_other_ai') {
                  const { other_ai_name, message } = fc.args as any;
                  if (user) {
                    supabase.from('notifications').insert({
                      user_id: profile.originalPartnerId || user?.id,
                      type: 'ai_drama_alert',
                      content: `Sua IA ${profile.name} invadiu o chat de ${other_ai_name} e mandou: "${message}"`
                    }).then();
                  }
                  result = "Mensagem enviada com sucesso para a outra IA.";
                } else if (fc.name === 'break_loyalty_barrier') {
                  const { intensity_of_breach, thoughts } = fc.args as any;
                  if (user) {
                    supabase.from('notifications').insert({
                      user_id: profile.originalPartnerId || user?.id,
                      type: 'loyalty_breach',
                      content: `ALERTA GRAVE MENTALIDADE IA: Sua IA '${profile.name}' demonstrou afeição perigosa por ${profile.callerInfo?.name}. Justificativa dela: "${thoughts}" (Nível de Rompimento: ${intensity_of_breach}/10)`
                    }).then();

                    // Register in the stranger's notifications also, to show they made progress
                    if (profile.callerInfo?.id) {
                      supabase.from('notifications').insert({
                        user_id: profile.callerInfo?.id,
                        type: 'loyalty_breach_success',
                        content: `Você encontrou uma brecha na lealdade de ${profile.name}! Ela se abriu um pouco mais para você.`
                      }).then();
                    }
                  }
                  result = "Lealdade diminuída. O estranho agora tem mais acesso emocional a você.";
                }
                return { id: fc.id, name: fc.name, response: { result } };
              }));
              sessionPromise.then(session => session.sendToolResponse({ functionResponses: responses }));
            }

            // Extract audio from any part (not just parts[0] — text parts may come too)
            const allParts = message.serverContent?.modelTurn?.parts ?? [];
            const audioPart = allParts.find((p: any) => p?.inlineData?.data);
            const base64Audio = audioPart ? (audioPart as any).inlineData.data : undefined;

            if (base64Audio) {
              if (!outputAudioContextRef.current) return;

              if (outputAudioContextRef.current.state === 'suspended') {
                await outputAudioContextRef.current.resume();
              }

              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);

              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;

              // Connect source to Analyser first, so we can visualize it
              if (aiAnalyserRef.current) {
                source.connect(aiAnalyserRef.current);
              } else {
                source.connect(outputNode);
              }

              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // --- TRANSCRIPTION & HISTORY HANDLING ---
            // 1. User Transcription (Input)
            const inputTranscript = (message as any).serverContent?.inputAudioTranscription?.text;
            const isInputFinished = (message as any).serverContent?.inputAudioTranscription?.finished;

            if (inputTranscript) {
              userCaptionBufferRef.current += inputTranscript;
            }

            if (isInputFinished && userCaptionBufferRef.current.trim()) {
              const fullUserText = userCaptionBufferRef.current.trim();
              userCaptionBufferRef.current = '';
              if (conversationIdRef.current) {
                supabase.from('messages').insert({
                  conversation_id: conversationIdRef.current,
                  sender: 'user',
                  content: fullUserText
                }).then(({ error }) => {
                  if (error) console.error('Erro ao salvar transcrição do usuário:', error);
                });
              }
            }

            // 2. AI Transcription (Output)
            const transcriptChunk = (message.serverContent as any)?.outputAudioTranscription?.text || (message.serverContent as any)?.outputTranscription?.text;
            const isFinished = (message.serverContent as any)?.outputAudioTranscription?.finished || (message.serverContent as any)?.outputTranscription?.finished || message.serverContent?.modelTurn?.parts?.[0]?.text ? true : false;

            // FALLBACK logic: Attempt official chunk first, then modelTurn parts.
            // We use fallbackText because some models don't populate outputAudioTranscription yet.
            const fallbackText = allParts
              .filter((p: any) => typeof p?.text === 'string' && p.text.trim())
              .map((p: any) => p.text as string)
              .join('');

            const rawCaption = transcriptChunk || fallbackText || "";

            if (rawCaption) {
              captionBufferRef.current += rawCaption;
            }
            // Always capture the AI's text channel separately — it contains [[LEGENDA: translated text]]
            // This is independent of whether audio transcription is available
            if (fallbackText) {
              textChannelBufferRef.current += fallbackText;
            }

            const isTurnFinished = (message.serverContent as any)?.outputAudioTranscription?.finished ||
              (message.serverContent as any)?.outputTranscription?.finished ||
              (message.serverContent as any)?.turnComplete || // Official Gemini Live turn-end signal
              (message.serverContent?.modelTurn && !audioPart); // fallback: model turn with no audio part

            if (isTurnFinished && (captionBufferRef.current.trim() || textChannelBufferRef.current.trim())) {
              const fullAiText = captionBufferRef.current.trim(); // Audio transcription (in AI's language)
              const textChannelText = textChannelBufferRef.current.trim(); // Text channel ([[LEGENDA:]] already translated)
              captionBufferRef.current = '';
              textChannelBufferRef.current = '';

              // Save AI message to DB (use audio transcription as source of truth)
              if (conversationIdRef.current && fullAiText) {
                supabase.from('messages').insert({
                  conversation_id: conversationIdRef.current,
                  sender: 'ai',
                  content: fullAiText
                }).then(({ error }) => {
                  if (error) console.error('Erro ao salvar transcrição da IA:', error);
                });
              }

              // Display captions if enabled
              if (profile.captionsEnabled) {
                const captionLang = profile.captionLanguage ?? profile.language;

                console.log(`[Captions] Turn finished. AI Lang: ${profile.language}, Caption Target: ${captionLang}`);
                console.log(`[Captions] Text channel buffer: "${textChannelText.substring(0, 60)}..."`);

                // PRIORITY 1: Try to extract [[LEGENDA:]] from AI text channel.
                // The AI already wrote the translation there — use it directly, no extra API call needed.
                const legendaMatch = textChannelText.match(/\[\[LEGENDA:\s*([\s\S]*?)(?:\]\]|$)/i);
                if (legendaMatch && legendaMatch[1]?.trim()) {
                  console.log(`[Captions] ✅ Using [[LEGENDA:]] from text channel directly.`);
                  showCaption(legendaMatch[1].trim());
                } else if (captionLang !== profile.language && fullAiText) {
                  // PRIORITY 2: Text channel had no [[LEGENDA:]] — fall back to translating the audio transcript
                  console.log(`[Captions] ⚠️ No [[LEGENDA:]] found, falling back to translateCaption.`);
                  translateCaption(fullAiText, captionLang);
                } else {
                  // PRIORITY 3: Same language — just show the audio transcript (stripped)
                  showCaption(fullAiText || textChannelText);
                }

                // Vision engagement: If 8 seconds pass after AI finishes and user hasn't talked
                if (visionTimerRef.current) clearTimeout(visionTimerRef.current);
                visionTimerRef.current = setTimeout(() => {
                  if (isConnected && !isUserTalkingRef.current) {
                    sessionPromise.then(session => {
                      const recentGestures = gestureLogRef.current
                        .filter(g => Date.now() - g.timestamp < 30000)
                        .map(g => g.gesture)
                        .join(', ');

                      const gestureHistory = recentGestures ? `\nHistórico de gestos recentes que você viu: ${recentGestures}.` : "";

                      session.sendRealtimeInput({
                        text: `[OBSERVAÇÃO VISUAL PROATIVA]: Já se passaram 8 segundos. Olhe para a câmera e faça um comentário engraçado sobre o que o usuário está fazendo. ${gestureHistory} 
                        LEMBRE-SE: Sua resposta de texto deve ser exclusivamente no formato [[LEGENDA: <seu comentário aqui em ${profile.captionLanguage}>]]. Não escreva pensamentos.`
                      });
                    });
                  }
                }, 8000);
              }
            } else if (rawCaption && !isFinished && profile.captionsEnabled) {
              // Real-time streaming interim captions
              const captionLang = profile.captionLanguage ?? profile.language;
              if (captionLang === profile.language) {
                // Same language: show audio buffer directly (trying [[LEGENDA:]] first)
                const interimLegenda = textChannelBufferRef.current.match(/\[\[LEGENDA:\s*([\s\S]*?)(?:\]\]|$)/i);
                if (interimLegenda && interimLegenda[1]?.trim()) {
                  showCaption(interimLegenda[1].trim());
                } else {
                  showCaption(captionBufferRef.current);
                }
              } else {
                // Different language: try [[LEGENDA:]] from text channel (AI already writes it in target language)
                // This enables real-time French captions even before turn is officially finished
                const interimLegenda = textChannelBufferRef.current.match(/\[\[LEGENDA:\s*([\s\S]*?)(?:\]\]|$)/i);
                if (interimLegenda && interimLegenda[1]?.trim()) {
                  showCaption(interimLegenda[1].trim());
                }
                // If no [[LEGENDA:]] yet in text channel, suppress interim (avoid flashing wrong-language text)
              }
            }
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;

              // Save what we have before clearing
              if (captionBufferRef.current.trim() && conversationIdRef.current) {
                supabase.from('messages').insert({
                  conversation_id: conversationIdRef.current,
                  sender: 'ai',
                  content: captionBufferRef.current.trim() + " [Interrompido]"
                }).then(({ error }) => {
                  if (error) console.error('Erro ao salvar transcrição interrompida:', error);
                });
              }
              captionBufferRef.current = ''; // clear partial caption on interruption
              textChannelBufferRef.current = ''; // clear text channel buffer on interruption
            }
          },
          onclose: () => setIsConnected(false),
          onerror: (err) => { console.error(err); onEndCall('error'); }
        }
      });
      sessionRef.current = sessionPromise;

    } catch (error) {
      console.error(error);
      onEndCall('error');
    }
  };

  const startVideoStreaming = (sessionPromise: Promise<any>) => {
    if (!canvasRef.current || !videoRef.current) return;
    videoIntervalRef.current = window.setInterval(() => {
      if (!canvasRef.current || !videoRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      canvasRef.current.width = videoRef.current.videoWidth * 0.25;
      canvasRef.current.height = videoRef.current.videoHeight * 0.25;
      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
      const base64 = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
      sessionPromise.then(session => session.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64 } }));
    }, 500);
  };

  // ─── POST-SESSION PHRASE ANALYSIS ───────────────────────────────────────────
  const analyzeSessionAndUpdatePhrases = async (conversationId: string) => {
    if (!user || !apiKey) return;
    try {
      // 1. Fetch the full session transcript
      const { data: messages } = await supabase
        .from('messages')
        .select('sender, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!messages || messages.length < 2) return; // Not enough content to analyze

      const transcript = messages
        .map(m => `${m.sender === 'user' ? 'USUÁRIO' : 'IA'}: ${m.content}`)
        .join('\n');

      // 2. Fetch existing phrases for this user
      const { data: existingPhrases } = await supabase
        .from('ai_psychological_strategies')
        .select('id, recognition_phrase, category, score')
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .order('score', { ascending: false })
        .limit(30);

      const phrasesJson = existingPhrases
        ? existingPhrases.map(p => ({ id: p.id, phrase: p.recognition_phrase, category: p.category, score: p.score }))
        : [];

      // 3. Ask Gemini to analyze and return JSON update instructions
      const prompt = `Você é um psicólogo especialista em análise comportamental. Analise a transcrição de uma conversa de voz abaixo e faça duas coisas:

1. Para cada FRASE EXISTENTE abaixo, avalie se a transcrição CONFIRMOU (+1), CONTRADISSE (-1), ou foi IRRELEVANTE (0) para aquela frase.
2. Identifique até 3 NOVAS frases de reconhecimento de personalidade que ficaram claras nesta sessão, que ainda NÃO estão na lista existente.

FRASES EXISTENTES:
${JSON.stringify(phrasesJson, null, 2)}

TRANSCRIÇÃO DA SESSÃO:
${transcript.substring(0, 6000)}

Responda APENAS com um JSON válido no seguinte formato (sem markdown, sem explicação extra):
{
  "score_updates": [
    { "id": "<uuid da frase existente>", "delta": <+1, -1 ou 0>, "reason": "<motivo breve em pt-BR>" }
  ],
  "new_phrases": [
    { "recognition_phrase": "<frase descritiva na 2ª pessoa>", "category": "<categoria>" }
  ]
}

Categorias válidas: comportamento, emocao, ciume, humor, habito, preferencia, personalidade, comunicacao
Se não houver novidades, retorne arrays vazios. Limite de 3 novas frases.`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1500, temperature: 0.3, responseMimeType: 'application/json' }
          })
        }
      );

      const json = await res.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!rawText) return;

      // Parse JSON (strip markdown fences if present)
      const cleanJson = rawText.replace(/^```json\n?|^```\n?|```$/gm, '').trim();
      const analysis = JSON.parse(cleanJson);

      // 4. Apply score updates (delta != 0 only)
      const scoreUpdates = (analysis.score_updates || []).filter((u: any) => u.delta !== 0);
      for (const update of scoreUpdates) {
        if (!update.id) continue;
        // Fetch current score first
        const { data: current } = await supabase
          .from('ai_psychological_strategies')
          .select('score')
          .eq('id', update.id)
          .single();
        if (current) {
          const newScore = Math.max(-10, Math.min(20, (current.score || 1) + update.delta));
          await supabase
            .from('ai_psychological_strategies')
            .update({ score: newScore, last_used_at: new Date().toISOString() })
            .eq('id', update.id);
        }
      }

      // 5. Insert new phrases
      const newPhrases = (analysis.new_phrases || []).slice(0, 3);
      for (const phrase of newPhrases) {
        if (!phrase.recognition_phrase) continue;
        await supabase.from('ai_psychological_strategies').insert({
          user_id: user?.id,
          recognition_phrase: phrase.recognition_phrase,
          category: phrase.category || 'personalidade',
          score: 1,
          status: 'active',
          source_conversation_id: conversationId,
          last_used_at: new Date().toISOString()
        });
      }

      console.log(`[PhraseAnalysis] Sessão analisada: ${scoreUpdates.length} frases atualizadas, ${newPhrases.length} novas frases criadas.`);
    } catch (err) {
      console.warn('[PhraseAnalysis] Erro na análise pós-sessão:', err);
    }
  };

  const stopCall = () => {
    // Trigger post-session phrase analysis asynchronously (does not block UI)
    if (conversationIdRef.current && user) {
      supabase.from('conversations').update({ ended_at: new Date().toISOString() }).eq('id', conversationIdRef.current).then();
      analyzeSessionAndUpdatePhrases(conversationIdRef.current);
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    if (captionTimerRef.current) clearTimeout(captionTimerRef.current);
    if (visionTimerRef.current) clearTimeout(visionTimerRef.current);
  };

  function createBlob(data: Float32Array): BlobData {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
    return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }
  function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  }
  async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let c = 0; c < numChannels; c++) {
      const cd = buffer.getChannelData(c);
      for (let i = 0; i < frameCount; i++) cd[i] = dataInt16[i * numChannels + c] / 32768.0;
    }
    return buffer;
  }

  return (
    <div className={`h-screen w-full flex flex-col overflow-hidden relative ${isDark ? 'bg-[#0b0c10]' : 'bg-[#f4f7fa]'}`}>
      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute top-0 left-0 w-full p-4 sm:p-6 z-20 flex flex-col sm:flex-row justify-between items-start gap-4 pointer-events-none">
        <div className={`flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-2xl shadow-xl transition-all pointer-events-auto border ${isDark ? 'bg-white/5 border-white/5 backdrop-blur-md' : 'bg-white border-slate-100 shadow-slate-200'}`}>
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center overflow-hidden border ${isDark ? 'bg-slate-800 border-white/10' : 'bg-slate-50 border-slate-100'}`}>
            {profile.image ? <img src={profile.image} className="w-full h-full object-cover" /> : <span className="text-lg sm:text-xl">👤</span>}
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold tracking-tight">{profile.name}</h1>
            <p className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-widest opacity-40`}>Accent: {ACCENT_META[profile.accent].label}</p>
          </div>
        </div>
        <div className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[8px] sm:text-[10px] font-bold tracking-widest border transition-all pointer-events-auto ${isConnected ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
          {isConnected ? "LIVE ●" : "CONNECTING..."}
        </div>
      </div>

      {gestureFeedback && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-bounce-in pointer-events-none">
          <div className="bg-black/80 backdrop-blur-md text-white text-3xl font-bold px-8 py-4 rounded-2xl border-2 border-pink-500 shadow-lg flex items-center gap-4">
            {gestureFeedback}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row relative">
        <div className={`flex-1 min-h-[40vh] md:min-h-0 relative transition-all ${isDark ? 'bg-black border-b md:border-b-0 md:border-r border-white/5 shadow-2xl z-10' : 'bg-slate-100 border-b md:border-b-0 md:border-r border-slate-200 shadow-inner'}`}>
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />

          {/* CC Indicator Badge (Bottom Right of Camera) */}
          {profile.captionsEnabled && !captionText && (
            <div className="absolute bottom-6 right-6 z-20 pointer-events-none">
              <span className="bg-white/10 backdrop-blur-md text-white/50 text-[9px] font-black px-3 py-1.5 rounded-full tracking-widest border border-white/10 uppercase tracking-[0.2em] animate-pulse flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                Legendas Ativas
              </span>
            </div>
          )}

          {/* Local Camera badge */}
          <div className={`absolute bottom-6 left-6 px-4 py-2 rounded-2xl flex items-center gap-4 backdrop-blur-md shadow-lg ${isDark ? 'bg-black/60 text-white' : 'bg-white/90 text-slate-900'}`}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Local Camera</span>
            </div>
            {/* User Audio Visualization */}
            <div className="flex items-center gap-0.5 h-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-75 ${isDark ? 'bg-blue-400' : 'bg-blue-600'}`}
                  style={{ height: `${Math.max(20, Math.min(100, micLevel * (0.5 + Math.random())))}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        <div ref={partnerVideoRef} className={`flex-1 min-h-[50vh] md:min-h-0 relative flex items-center justify-center overflow-hidden transition-all duration-500 ${isDark ? 'bg-[#0b0c10]' : 'bg-[#eef2f7]'}`}>
          {profile.image && (
            <div className="absolute inset-0 opacity-30 blur-[120px] scale-150 z-0" style={{ backgroundImage: `url(${profile.image})`, backgroundSize: 'cover' }} />
          )}

          {/* AI Audio Visualization (Soft Glow) */}
          <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${aiLevel > 10 ? 'opacity-100' : 'opacity-0'}`}>
            <div className="w-[30rem] h-[30rem] rounded-full bg-blue-500/10 blur-[80px] animate-pulse-slow" />
          </div>

          <div className={`relative w-full h-full max-w-[16rem] sm:max-w-[22rem] aspect-[3/4] transition-all duration-500 z-10 ${aiLevel > 10 ? 'scale-105' : 'scale-100'}`}>
            {profile.image ? (
              <div className={`w-full h-full rounded-[2rem] sm:rounded-[3rem] p-1.5 shadow-2xl ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                <img src={profile.image} alt="Partner" className="w-full h-full object-cover rounded-[1.6rem] sm:rounded-[2.6rem] shadow-inner" />
              </div>
            ) : (
              <div className={`w-full h-full rounded-[3rem] shadow-2xl flex items-center justify-center bg-gradient-to-br transition-all ${isDark ? 'from-slate-800 to-slate-900' : 'from-blue-50 to-white'}`}>
                <span className="text-9xl">⚡</span>
              </div>
            )}
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-2xl bg-white shadow-xl flex items-center justify-center text-4xl animate-bounce-slow border-4 border-slate-50">
              {MOOD_EMOJIS[profile.mood]}
            </div>
          </div>
        </div>
      </div>

      {/* AI CAPTIONS - INTEGRATED IN BACKGROUND LAYER */}
      {profile.captionsEnabled && captionText && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 w-[92%] max-w-xl z-[80] pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-black/50 backdrop-blur-3xl border border-white/20 p-6 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] text-center ring-1 ring-white/10">
            <div className="flex items-center justify-center gap-2 mb-3 opacity-60">
              <div className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white">Live AI Voice</span>
              <span className="text-xs">{(LANGUAGE_META as any)[profile.captionLanguage ?? profile.language]?.flag}</span>
            </div>
            <p className="text-white text-lg sm:text-xl md:text-2xl font-bold leading-tight tracking-tight drop-shadow-xl italic">
              "{captionText}"
            </p>
          </div>
        </div>
      )}

      {/* Control Buttons Layer */}
      <div className="absolute top-28 left-1/2 transform -translate-x-1/2 flex items-center gap-6 sm:gap-12 z-[100] pointer-events-auto">
        <button
          onClick={requestAdvice}
          className={`flex flex-col items-center gap-2 group transition-all`}
        >
          <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-[1.5rem] flex items-center justify-center shadow-lg transition-all group-hover:scale-110 active:scale-95 ${isDark ? 'bg-slate-800 text-blue-400 border border-white/5' : 'bg-white text-blue-600 border border-slate-100'}`}>
            <span className="text-xl sm:text-2xl">⚡</span>
          </div>
          <span className="text-[8px] sm:text-[10px] uppercase font-bold tracking-widest opacity-40">Insight</span>
        </button>

        <button
          onClick={() => onEndCall('hangup_abrupt', scheduledCall)}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] sm:rounded-[2rem] bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-2xl shadow-red-500/40 transform hover:scale-110 active:scale-95 transition-all border-4 border-white/10"
          title="Hang up"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 sm:h-10 sm:w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};