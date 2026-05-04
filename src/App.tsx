import { APP_VERSION } from './constants';
import React, { useState, useEffect, useMemo, useRef, Component } from 'react';
import { 
  Clock, 
  Settings as SettingsIcon, 
  FileText, 
  Play, 
  Pause, 
  RotateCcw, 
  Square, 
  Car, 
  Calendar,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Download,
  Upload,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  AlertTriangle,
  Camera,
  X,
  Search,
  Smartphone,
  Bot,
  Send,
  Check,
  Share2,
  Image as ImageIcon,
  Bus,
  Plus,
  RefreshCw,
  Maximize2
} from 'lucide-react';
import { format, startOfDay, endOfDay, isSameDay, parseISO, startOfMonth, endOfMonth, isWithinInterval, subMonths, addMonths, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'motion/react';
import QuickPinchZoom, { make3dTransformValue } from 'react-quick-pinch-zoom';
import { cn } from './lib/utils';
import { Punch, PunchType, DayLog, AppSettings, Theme, Damage } from './types';
import { auth, googleProvider } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { TrackingView } from './components/TrackingView';
import { get, set, clear } from 'idb-keyval';

const STORAGE_KEY = 'ponto_frota_data';
const SETTINGS_KEY = 'ponto_frota_settings';

const getStorageSize = async () => {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      if (estimate.usage !== undefined) {
        return (estimate.usage / 1024 / 1024).toFixed(2); // MB
      }
    }
    
    // Fallback to localStorage calculation if estimate is not available
    let total = 0;
    for (let x in localStorage) {
      if (localStorage.hasOwnProperty(x)) {
        total += ((localStorage[x].length + x.length) * 2);
      }
    }
    return (total / 1024 / 1024).toFixed(2); // MB
  } catch (e) {
    return "0.00";
  }
};

const calculateWorkedHours = (log: DayLog, allLogs: DayLog[]) => {
  if (log.isDayOff) {
    return {
      total: 'FOLGA',
      extra: null,
      totalMinutes: 0,
      extraMinutes: 0,
      isDayOff: true,
      resolvedPunches: {}
    };
  }
  const punches = [...log.punches].sort((a, b) => a.timestamp - b.timestamp);
  const entrada = punches.find(p => p.type === 'entrada');
  if (!entrada) return null;

  let fim = punches.find(p => p.type === 'fim');
  let pausa = punches.find(p => p.type === 'pausa');
  let retorno = punches.find(p => p.type === 'retorno');

  // Look in the next day's log if 'fim' is missing (overnight shift)
  let isOvernight = false;
  if (!fim) {
    const nextDate = format(addDays(parseISO(log.date), 1), 'yyyy-MM-dd');
    const nextLog = allLogs.find(l => l.date === nextDate);
    if (nextLog) {
      fim = nextLog.punches.find(p => p.type === 'fim');
      if (fim) {
        isOvernight = true;
        if (!pausa) pausa = nextLog.punches.find(p => p.type === 'pausa');
        if (!retorno) retorno = nextLog.punches.find(p => p.type === 'retorno');
      }
    }
  }

  if (!fim) return null;

  let fimTs = fim.timestamp;
  let pausaTs = pausa?.timestamp;
  let retornoTs = retorno?.timestamp;

  // Fix timestamps if they are logically on the next day
  if (isOvernight || fimTs < entrada.timestamp) {
    if (fimTs < entrada.timestamp) fimTs += 24 * 60 * 60 * 1000;
  }
  if (pausaTs && pausaTs < entrada.timestamp) {
    pausaTs += 24 * 60 * 60 * 1000;
  }
  if (retornoTs && retornoTs < entrada.timestamp) {
    retornoTs += 24 * 60 * 60 * 1000;
  }

  let workedMs = 0;
  if (pausaTs && retornoTs && pausaTs < retornoTs && entrada.timestamp < pausaTs && retornoTs < fimTs) {
    workedMs = (pausaTs - entrada.timestamp) + (fimTs - retornoTs);
  } else if (entrada.timestamp < fimTs) {
    workedMs = fimTs - entrada.timestamp;
  } else {
    return null;
  }

  const totalMinutes = workedMs / (1000 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  
  const limitMinutes = 7 * 60 + 20; // 7:20
  const extraMinutes = Math.max(0, totalMinutes - limitMinutes);
  const extraHours = Math.floor(extraMinutes / 60);
  const extraMins = Math.floor(extraMinutes % 60);

  return {
    total: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
    extra: extraMinutes > 0 ? `${extraHours.toString().padStart(2, '0')}:${extraMins.toString().padStart(2, '0')}` : null,
    totalMinutes,
    extraMinutes,
    resolvedPunches: {
      entrada,
      pausa,
      retorno,
      fim
    }
  };
};

const DEFAULT_SETTINGS: AppSettings = {
  carPrefixes: [],
  selectedPrefix: '',
  theme: 'light',
  alarmsEnabled: false,
  notificationsEnabled: false,
  alarmTimes: {
    entrada: '08:00',
    pausa: '12:00',
    retorno: '13:00',
    fim: '17:00'
  },
  activeAlarms: {
    entrada: true,
    pausa: true,
    retorno: true,
    fim: true
  },
  scalePhotos: [],
  profilePhoto: undefined
};

function ClockDisplay() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="text-6xl sm:text-7xl font-mono font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-slate-800 to-slate-500 dark:from-white dark:to-slate-400 drop-shadow-sm">
      {format(time, 'HH:mm:ss')}
    </div>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="100" y="210" width="100" height="24" rx="4" fill="#20C4CB"/>
      <rect x="80" y="260" width="30" height="24" rx="4" fill="#20C4CB"/>
      <rect x="130" y="260" width="120" height="24" rx="4" fill="#20C4CB"/>
      <rect x="30" y="310" width="30" height="24" rx="4" fill="#20C4CB"/>
      <rect x="80" y="310" width="130" height="24" rx="4" fill="#20C4CB"/>
      <path d="M 215 365 A 120 120 0 1 0 215 195" stroke="currentColor" strokeWidth="32" strokeLinecap="round"/>
      <rect x="250" y="100" width="100" height="28" rx="8" fill="currentColor"/>
      <rect x="275" y="128" width="50" height="28" fill="currentColor"/>
      <g transform="rotate(45 396 184)">
        <rect x="396" y="168" width="32" height="32" rx="8" fill="currentColor"/>
      </g>
      <circle cx="300" cy="280" r="24" fill="currentColor"/>
      <path d="M 285 295 L 355 215 A 8 8 0 0 1 365 225 L 305 300 Z" fill="currentColor"/>
    </svg>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[600px] max-h-[600px] rounded-full bg-indigo-500/10 blur-[80px] animate-pulse" />
      </div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="z-10 flex flex-col items-center"
      >
        <div className="w-24 h-24 bg-white dark:bg-slate-900 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-500/20 border border-slate-100 dark:border-slate-800 relative">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-[2rem] border-2 border-transparent border-t-indigo-500 border-r-indigo-500 opacity-50"
          />
          <Logo className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
          Ponto & Frota
        </h1>
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </motion.div>
    </div>
  );
}

function LoginView() {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-indigo-500/20 blur-[100px]" />
        <div className="absolute top-[60%] -right-[10%] w-[60%] h-[60%] rounded-full bg-blue-500/20 blur-[100px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-[2.5rem] p-10 shadow-2xl border border-white/50 dark:border-slate-700/50 z-10"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-[2rem] flex items-center justify-center mb-8 shadow-xl shadow-indigo-500/30 text-white">
            <Logo className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 mb-3 text-center tracking-tight">
            Ponto & Frota
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-center text-lg leading-relaxed">
            Controle sua jornada e vistorias de forma simples e rápida.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-2xl text-rose-600 dark:text-rose-400 text-sm text-center font-medium">
            {errorMsg}
          </div>
        )}

        <button 
          onClick={async () => {
            try {
              setErrorMsg(null);
              await signInWithPopup(auth, googleProvider);
            } catch (error: any) {
              console.error("Login error:", error);
              if (error.code === 'auth/popup-closed-by-user') {
                setErrorMsg("O login foi cancelado. Tente novamente.");
              } else if (error.code === 'auth/unauthorized-domain') {
                setErrorMsg("Este domínio não está autorizado no Firebase. Adicione-o no painel de Autenticação.");
              } else {
                setErrorMsg("Erro ao fazer login: " + (error.message || "Tente novamente."));
              }
            }
          }}
          className="w-full flex items-center justify-center gap-4 py-4 px-6 rounded-2xl font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-all focus:ring-4 focus:ring-indigo-500/20 active:scale-[0.98]"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continuar com o Google
        </button>
        
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Ao entrar, você concorda com nossos Termos de Serviço e Política de Privacidade.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'clock' | 'history' | 'settings' | 'schedule' | 'tracking'>(() => {
    const saved = localStorage.getItem('ponto_frota_active_tab');
    const validTabs = ['clock', 'history', 'settings', 'schedule', 'tracking'];
    if (saved && validTabs.includes(saved)) {
      return saved as any;
    }
    return 'clock';
  });

  useEffect(() => {
    localStorage.setItem('ponto_frota_active_tab', activeTab);
  }, [activeTab]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [logs, setLogs] = useState<DayLog[]>([]);
  const [isLogsLoaded, setIsLogsLoaded] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [pendingAIAlarm, setPendingAIAlarm] = useState<{message: string, timeStr: string, intentUrl: string} | null>(null);
  const [storageUsage, setStorageUsage] = useState("0.00");
  const [isStorageAvailable, setIsStorageAvailable] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Migrate from localStorage to IndexedDB if needed
        const localSettings = localStorage.getItem(`ponto_frota_settings_${currentUser.uid}`);
        if (localSettings) {
          try {
            await set(`ponto_frota_settings_${currentUser.uid}`, JSON.parse(localSettings));
            localStorage.removeItem(`ponto_frota_settings_${currentUser.uid}`);
          } catch (e) {
            console.error("Migration error for settings:", e);
          }
        }
        const localLogs = localStorage.getItem(`ponto_frota_logs_${currentUser.uid}`);
        if (localLogs) {
          try {
            await set(`ponto_frota_logs_${currentUser.uid}`, JSON.parse(localLogs));
            localStorage.removeItem(`ponto_frota_logs_${currentUser.uid}`);
          } catch (e) {
            console.error("Migration error for logs:", e);
          }
        }

        // Load settings from IndexedDB
        try {
          const savedSettings = await get(`ponto_frota_settings_${currentUser.uid}`);
          if (savedSettings) {
            if (savedSettings.scalePhoto && (!savedSettings.scalePhotos || savedSettings.scalePhotos.length === 0)) {
              savedSettings.scalePhotos = [savedSettings.scalePhoto];
              delete savedSettings.scalePhoto;
            }
            setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
          } else {
            setSettings(DEFAULT_SETTINGS);
          }
        } catch (e) {
          console.error("Error loading settings:", e);
          setSettings(DEFAULT_SETTINGS);
        }

        // Load logs from IndexedDB
        try {
          const savedLogs = await get(`ponto_frota_logs_${currentUser.uid}`);
          if (savedLogs) {
            setLogs(savedLogs);
          } else {
            setLogs([]);
          }
        } catch (e) {
          console.error("Error loading logs:", e);
          setLogs([]);
        }
      } else {
        setSettings(DEFAULT_SETTINGS);
        setLogs([]);
      }
      setUser(currentUser);
      setIsAuthReady(true);
      setIsLogsLoaded(true);
    }, (error) => {
      console.error("Auth error:", error);
      setIsAuthReady(true);
      setIsLogsLoaded(true);
    });
    return () => unsubscribeAuth();
  }, []);

  // Persist logs to IndexedDB whenever they change
  useEffect(() => {
    if (user && isLogsLoaded) {
      set(`ponto_frota_logs_${user.uid}`, logs).catch(e => {
        console.error("Failed to save logs to IndexedDB", e);
        setToast({ message: "Erro ao salvar dados localmente.", type: 'error' });
      });
    }
  }, [logs, user, isLogsLoaded]);

  // Persist settings to IndexedDB whenever they change
  useEffect(() => {
    if (user) {
      set(`ponto_frota_settings_${user.uid}`, settings).catch(e => {
        console.error("Failed to save settings to IndexedDB", e);
        setToast({ message: "Erro ao salvar configurações localmente.", type: 'error' });
      });
    }
  }, [settings, user]);

  const speakText = async (text: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Diga com clareza e tom profissional: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioData = atob(base64Audio);
        const arrayBuffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < audioData.length; i++) {
          view[i] = audioData.charCodeAt(i);
        }

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.onended = () => setIsSpeaking(false);
        source.start();
      } else {
        setIsSpeaking(false);
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setIsSpeaking(false);
      setToast({ message: "Erro ao gerar áudio!", type: 'info' });
    }
  };

  const processAICommand = async (command: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: command }] }],
        config: {
          systemInstruction: "Você é um assistente virtual do aplicativo Ponto & Frota. Seu objetivo é ajudar o usuário a configurar alarmes. Se o usuário pedir para ser lembrado de algo (como tomar remédio, entrada, pausa, etc) em um horário específico, chame a ferramenta set_alarm com a mensagem e o horário.",
          tools: [{
            functionDeclarations: [{
              name: "set_alarm",
              description: "Cria um alarme nativo no sistema operacional do usuário (Android).",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    description: "Ação a ser executada, deve ser 'set_alarm'."
                  },
                  message: {
                    type: Type.STRING,
                    description: "A mensagem ou título do alarme (ex: 'Tomar remédio', 'Pausa', 'Entrada')."
                  },
                  time: {
                    type: Type.STRING,
                    description: "O horário do alarme no formato HH:MM (ex: '08:00', '20:00')."
                  }
                },
                required: ["action", "message", "time"]
              }
            }]
          }]
        }
      });

      const functionCall = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;
      
      if (functionCall && (functionCall.name === "set_alarm" || functionCall.name === "createNativeAlarm")) {
        const args = functionCall.args as any;
        const timeStr = args.time || args.timeStr;
        const message = args.message || args.type || "Alarme";
        
        console.log("AI configurando alarme:", { message, timeStr });

        // Se for um dos tipos padrão, atualiza as configurações
        const standardTypes = ['entrada', 'pausa', 'retorno', 'fim'];
        const typeMatch = standardTypes.find(t => message.toLowerCase().includes(t));
        if (typeMatch) {
          setSettings(prev => ({
            ...prev,
            alarmsEnabled: true,
            activeAlarms: { ...prev.activeAlarms, [typeMatch]: true },
            alarmTimes: { ...prev.alarmTimes, [typeMatch]: timeStr }
          }));
        }
        
        // Dispara o alarme nativo
        const [hour, minute] = timeStr.split(':');
        const intentUrl = `intent://#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${hour};i.android.intent.extra.alarm.MINUTES=${minute};S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(message)};B.android.intent.extra.alarm.SKIP_UI=false;end`;
        
        // Tenta abrir a URL diretamente (melhor suporte em PWAs do que link.click)
        window.location.href = intentUrl;
        
        // Salva no estado para exibir um botão de confirmação caso o navegador bloqueie o redirecionamento automático
        setPendingAIAlarm({ message, timeStr, intentUrl });
        
        setToast({ message: `Alarme "${message}" configurado para ${timeStr}!`, type: 'success' });
      } else {
        const textResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) {
          setToast({ message: textResponse, type: 'info' });
        } else {
          setToast({ message: "Não entendi o comando. Tente falar o horário e o motivo.", type: 'error' });
        }
      }
    } catch (error) {
      console.error("Error processing AI command:", error);
      setToast({ message: "Erro ao processar comando da IA.", type: 'error' });
    }
  };

  useEffect(() => {
    const updateUsage = async () => {
      const usage = await getStorageSize();
      setStorageUsage(usage);
    };
    updateUsage();
  }, [logs, settings]);

  useEffect(() => {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      setIsStorageAvailable(true);
    } catch (e) {
      setIsStorageAvailable(false);
      setToast({ message: "Atenção: O navegador está bloqueando o salvamento de dados!", type: 'info' });
    }
  }, []);

  const [currentMinute, setCurrentMinute] = useState(format(new Date(), 'HH:mm'));
  const [manualTime, setManualTime] = useState(format(new Date(), 'HH:mm'));
  const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [pendingPunch, setPendingPunch] = useState<PunchType | null>(null);
  const [tempTime, setTempTime] = useState('');
  const [activeAlarm, setActiveAlarm] = useState<PunchType | null>(null);
  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(null);
  const [dismissedAlarms, setDismissedAlarms] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const alarmWorkerRef = useRef<Worker | null>(null);
  const stateRef = useRef({ settings, logs, dismissedAlarms, activeAlarm, pendingPunch, snoozeUntil, currentMinute });
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);
  const [wakeLock, setWakeLock] = useState<any>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    stateRef.current = { settings, logs, dismissedAlarms, activeAlarm, pendingPunch, snoozeUntil, currentMinute };
  }, [settings, logs, dismissedAlarms, activeAlarm, pendingPunch, snoozeUntil, currentMinute]);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  
  const installApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setToast({ 
        message: "Para instalar, toque nos três pontinhos do navegador e escolha 'Adicionar à tela de início'.", 
        type: 'info' 
      });
    }
  };
  
  const [damagePhoto, setDamagePhoto] = useState<string | null>(() => {
    return localStorage.getItem('damagePhoto');
  });
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);

  const tabs: ('clock' | 'history' | 'schedule' | 'tracking' | 'settings')[] = ['clock', 'history', 'schedule', 'tracking', 'settings'];
  
  const handleSwipe = (direction: number) => {
    const currentIndex = tabs.indexOf(activeTab);
    if (direction > 0 && currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1]);
    } else if (direction < 0 && currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1]);
    }
  };

  // Persist damage modal state
  useEffect(() => {
    if (damagePhoto) {
      try {
        localStorage.setItem('damagePhoto', damagePhoto);
      } catch (e) {
        console.warn("Failed to save photo to localStorage (likely too large)", e);
      }
    } else {
      localStorage.removeItem('damagePhoto');
    }
  }, [damagePhoto]);

  // Initialize audio and check notification permission
  useEffect(() => {
    const audio = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg'); // Distinct alarm sound
    audio.loop = true;
    audio.preload = 'auto';
    alarmAudioRef.current = audio;

    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      setToast({ message: "Seu navegador não suporta notificações.", type: 'error' });
      return;
    }
    
    if (Notification.permission === 'denied') {
      setToast({ message: "Permissão de notificação bloqueada. Ative manualmente nas configurações do navegador.", type: 'error' });
      return;
    }

    setToast({ message: "Por favor, clique em 'Permitir' na notificação do navegador para ativar os lembretes.", type: 'info' });
    
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      setSettings(prev => ({ ...prev, notificationsEnabled: true }));
      setToast({ message: "Notificações ativadas com sucesso!", type: 'success' });
    } else {
      setToast({ message: "Permissão de notificação negada.", type: 'error' });
    }
  };

  const showNotification = (type: PunchType) => {
    if (!("Notification" in window) || Notification.permission !== "granted" || !settings.notificationsEnabled) return;
    
    const title = "Lembrete de Ponto";
    const options: NotificationOptions = {
      body: `Está na hora de registrar sua ${type}!`,
      icon: "/favicon.ico",
      tag: `alarm_${type}`,
      renotify: true,
      requireInteraction: true,
      vibrate: [500, 200, 500, 200, 500],
      data: { url: window.location.origin } // Adicionando a URL para o clique
    };

    // Always use service worker registration to show notifications
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, options);
      });
    } else {
      console.warn("Service worker not available for notifications");
    }
  };

  // Version Check
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const response = await fetch(`${window.location.origin}${import.meta.env.BASE_URL}version.json?t=${Date.now()}`);
        if (!response.ok) return;
        const data = await response.json();
        if (data.version !== APP_VERSION) {
          setUpdateAvailable(true);
        }
      } catch (e) {
        // Silently ignore update check failures (e.g. offline or network error)
      }
    };
    checkVersion();
    const interval = setInterval(checkVersion, 60 * 60 * 1000); // Check every hour
    return () => clearInterval(interval);
  }, []);

  // Wake Lock logic to prevent screen from locking
  useEffect(() => {
    let lock: any = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && activeTab === 'clock' && settings.alarmsEnabled) {
        try {
          lock = await (navigator as any).wakeLock.request('screen');
          setWakeLock(lock);
        } catch (err) {
          console.warn('Wake lock failed:', err);
        }
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (lock) {
        lock.release().then(() => setWakeLock(null));
      }
    };
  }, [activeTab, settings.alarmsEnabled]);

  const unlockAudio = async () => {
    try {
      if (silentAudioRef.current) {
        await silentAudioRef.current.play();
        console.log("Modo de segurança ativo: Áudio em segundo plano rodando.");
      }
      if (alarmAudioRef.current && !isAudioUnlocked) {
        await alarmAudioRef.current.play();
        alarmAudioRef.current.pause();
        alarmAudioRef.current.currentTime = 0;
        setIsAudioUnlocked(true);
      }
      alarmWorkerRef.current?.postMessage('start');
    } catch (e) {
      console.log("Audio unlock failed", e);
      setToast({ message: "Clique na tela para permitir o alarme em segundo plano.", type: 'info' });
    }
  };

  const desativarAlarme = () => {
    silentAudioRef.current?.pause();
    alarmWorkerRef.current?.postMessage('stop');
  };

  // Initialize Web Worker and Silent Audio
  useEffect(() => {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }

    const silentAudioSrc = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
    silentAudioRef.current = new Audio(silentAudioSrc);
    silentAudioRef.current.loop = true;

    alarmWorkerRef.current = new Worker(new URL('./alarmWorker.ts', import.meta.url), { type: 'module' });

    alarmWorkerRef.current.onmessage = (e) => {
      if (e.data === 'tick') {
        const now = new Date();
        const minute = format(now, 'HH:mm');
        
        // Update UI clock
        if (minute !== stateRef.current.currentMinute) {
          setCurrentMinute(minute);
        }

        const state = stateRef.current;
        if (!state.settings.alarmsEnabled || state.activeAlarm || state.pendingPunch) return;

        const nowMs = now.getTime();
        if (state.snoozeUntil && nowMs < state.snoozeUntil) return;

        const todayStr = format(now, 'yyyy-MM-dd');
        const todayLog = state.logs.find(l => l.date === todayStr);

        const [currentHour, currentMinuteVal] = minute.split(':').map(Number);
        const currentMinutesFromMidnight = currentHour * 60 + currentMinuteVal;

        (['entrada', 'pausa', 'retorno', 'fim'] as PunchType[]).forEach(type => {
          if (state.settings.activeAlarms[type]) {
            const alarmTime = state.settings.alarmTimes[type];
            const [alarmHour, alarmMinute] = alarmTime.split(':').map(Number);
            const alarmMinutesFromMidnight = alarmHour * 60 + alarmMinute;

            const hasPunched = todayLog?.punches.some(p => p.type === type);
            const alarmKey = `${todayStr}_${type}`;

            if (!hasPunched && currentMinutesFromMidnight >= alarmMinutesFromMidnight && !state.dismissedAlarms[alarmKey]) {
              console.log(`Disparando alarme para ${type} às ${alarmTime}`);
              setActiveAlarm(type);
              showNotification(type);
              if ('vibrate' in navigator) {
                navigator.vibrate([500, 200, 500, 200, 500]);
              }
            }
          }
        });
      }
    };

    return () => {
      alarmWorkerRef.current?.terminate();
      silentAudioRef.current?.pause();
    };
  }, []);

  // Handle alarm sound
  useEffect(() => {
    if (activeAlarm) {
      alarmAudioRef.current?.play().catch(e => console.log("Audio play blocked by browser", e));
    } else {
      alarmAudioRef.current?.pause();
      if (alarmAudioRef.current) alarmAudioRef.current.currentTime = 0;
    }
  }, [activeAlarm]);

  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  // Save data
  // Removed global useEffect to avoid deletion issues and redundant writes.
  // We now save explicitly in event handlers.

  useEffect(() => {
    if (user) {
      try {
        localStorage.setItem(`ponto_frota_settings_${user.uid}`, JSON.stringify(settings));
      } catch (e) {
        console.warn("Failed to save settings", e);
        if (e instanceof Error && e.name === 'QuotaExceededError') {
          setToast({ message: "Memória cheia! A foto da escala é muito grande para salvar no navegador.", type: 'error' });
        }
      }
    }
  }, [settings, user]);

  const todayStr = manualDate;
  
  const todayLog = useMemo(() => {
    return logs.find(log => log.date === todayStr);
  }, [logs, todayStr]);

  const saveLogToFirestore = async (log: DayLog) => {
    // Cloud sync disabled, logs are persisted via useEffect to localStorage
    return;
  };

  const handleShare = async (title: string, text: string, url: string) => {
    if (navigator.share) {
      try {
        const shareData: ShareData = { title, text };
        
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          const file = new File([blob], 'foto_relatorio.jpg', { type: 'image/jpeg' });
          
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            shareData.files = [file];
          } else {
            shareData.url = url;
          }
        } catch (e) {
          console.error("Error preparing file for share:", e);
          shareData.url = url;
        }

        await navigator.share(shareData);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
          try {
            await navigator.share({ title, text, url });
          } catch (e) {}
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setToast({ message: "Link copiado!", type: 'info' });
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handlePunch = async (type: PunchType, time: string) => {
    if (!type || !time) return;

    const [hours, minutes] = time.split(':').map(Number);
    const [year, month, day] = manualDate.split('-').map(Number);
    const punchDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
    const dateStr = format(punchDate, 'yyyy-MM-dd');

    const prefixToUse = (settings.selectedPrefix || '').trim();

    const newPunch: Punch = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      timestamp: punchDate.getTime(),
      carPrefix: prefixToUse
    };

    let logToSave: DayLog | null = null;

    // Update local state and get the final log to save
    setLogs(prev => {
      const existingLog = prev.find(l => l.date === dateStr);
      const finalLog: DayLog = existingLog ? {
        ...existingLog,
        // Update main prefix to the most recent one used
        carPrefix: prefixToUse || existingLog.carPrefix,
        punches: [...existingLog.punches, newPunch].sort((a, b) => a.timestamp - b.timestamp)
      } : {
        date: dateStr,
        carPrefix: prefixToUse,
        punches: [newPunch]
      };
      
      logToSave = finalLog;

      const idx = prev.findIndex(l => l.date === dateStr);
      if (idx >= 0) {
        const newLogs = [...prev];
        newLogs[idx] = finalLog;
        return newLogs;
      }
      return [...prev, finalLog];
    });

    // Update Firestore
    if (logToSave) {
      await saveLogToFirestore(logToSave);
    }
    
    // Reset UI state
    setPendingPunch(null);
    setSettings(prev => ({ ...prev, selectedPrefix: '' }));
    setToast({ message: `${type.toUpperCase()} registrada e salva!`, type: 'success' });
    setTimeout(() => setToast(null), 3000);
  };

  const handleToggleDayOff = async () => {
    if (!user) return;
    const dateStr = manualDate;
    const isDayOff = !todayLog?.isDayOff;

    setLogs(prev => {
      const existingLog = prev.find(l => l.date === dateStr);
      let finalLog: DayLog;

      if (existingLog) {
        finalLog = { ...existingLog, isDayOff };
      } else {
        finalLog = {
          date: dateStr,
          carPrefix: '',
          punches: [],
          isDayOff
        };
      }

      const idx = prev.findIndex(l => l.date === dateStr);
      if (idx >= 0) {
        const newLogs = [...prev];
        newLogs[idx] = finalLog;
        return newLogs;
      }
      return [...prev, finalLog];
    });

    setToast({ message: isDayOff ? "Dia de folga registrado!" : "Folga removida!", type: 'success' });
  };

  const openPunchModal = (type: PunchType) => {
    setTempTime(format(new Date(), 'HH:mm'));
    setPendingPunch(type);
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploadingPhoto(true);
    
    // Safety timeout to prevent getting stuck in "sending" state
    const safetyTimeout = setTimeout(() => {
      setIsUploadingPhoto(false);
      setToast({ message: "O envio está demorando muito. Tente novamente.", type: 'error' });
    }, 45000);

    try {
      // Resize image before upload to save data and prevent timeouts
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve, reject) => {
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      });

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageData;
      });

      const canvas = document.createElement('canvas');
      // Reduce size further to ensure it fits well within Firestore's 1MB document limit
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      
      // Convert to Base64 for faster saving as requested
      const base64Data = canvas.toDataURL('image/jpeg', 0.5);
      
      try {
        // Auto-save directly to the report
        const dateStr = manualDate;
        const prefixToUse = (settings.selectedPrefix || '').trim();

        const newDamage: Damage = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().getTime(),
          description: "Foto do Relatório",
          photoUrl: base64Data
        };

        let finalLog: DayLog | null = null;

        // Optimistic UI update
        setLogs(prev => {
          const existingLog = prev.find(l => l.date === dateStr);
          finalLog = existingLog ? {
            ...existingLog,
            carPrefix: prefixToUse || existingLog.carPrefix,
            damages: [...(existingLog.damages || []), newDamage]
          } : {
            date: dateStr,
            carPrefix: prefixToUse,
            punches: [],
            damages: [newDamage]
          };
          
          const idx = prev.findIndex(l => l.date === dateStr);
          if (idx >= 0) {
            const newLogs = [...prev];
            newLogs[idx] = finalLog;
            return newLogs;
          }
          return [...prev, finalLog];
        });

        if (finalLog) {
          await saveLogToFirestore(finalLog);
        }
        setSettings(prev => ({ ...prev, selectedPrefix: '' }));
        setToast({ message: "Foto salva no relatório!", type: 'success' });
      } catch (error: any) {
        console.error("Photo capture error:", error);
        setToast({ message: "Erro ao salvar foto.", type: 'error' });
      } finally {
        clearTimeout(safetyTimeout);
        setIsUploadingPhoto(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error("Photo capture error:", error);
      setToast({ message: "Erro ao processar foto.", type: 'error' });
      setIsUploadingPhoto(false);
      clearTimeout(safetyTimeout);
    }
  };

  const lastPunchType = todayLog?.punches[todayLog.punches.length - 1]?.type;

  if (!isAuthReady) return <LoadingScreen />;
  if (!user) return <LoginView />;

  return (
    <div className={cn(
      "min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans pb-20 transition-colors duration-300",
      settings.theme === 'dark' && "dark"
    )}>
      {/* Enlarged Photo Overlay */}
      {enlargedPhoto && (
        <div 
          className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center"
        >
          <div className="absolute top-4 right-4 z-[110]">
            <button 
              onClick={() => setEnlargedPhoto(null)}
              className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <QuickPinchZoom
              onUpdate={({ x, y, scale }) => {
                const el = document.getElementById('zoom-img');
                if (el) {
                  el.style.setProperty('transform', make3dTransformValue({ x, y, scale }));
                }
              }}
            >
              <img 
                id="zoom-img"
                src={enlargedPhoto} 
                alt="Foto Ampliada" 
                className="max-w-full max-h-full object-contain transition-transform duration-75 will-change-transform"
                referrerPolicy="no-referrer"
              />
            </QuickPinchZoom>
          </div>
          
          <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none">
            <p className="bg-black/50 backdrop-blur px-4 py-2 rounded-full text-white/70 text-xs font-medium">
              Use dois dedos para dar zoom e arrastar
            </p>
          </div>
        </div>
      )}

      {/* Update Notification */}
      {updateAvailable && (
        <div className="fixed bottom-24 left-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-indigo-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 border border-indigo-500">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-xl">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <p className="font-bold text-sm">Nova versão disponível!</p>
                <p className="text-xs text-indigo-100">Atualize para ver as novidades.</p>
              </div>
            </div>
            <button 
              onClick={async () => {
                try {
                  if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (const registration of registrations) {
                      await registration.unregister();
                    }
                  }
                  // Clear all caches
                  if ('caches' in window) {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                  }
                } catch (err) {
                  console.error("Error clearing cache/SW:", err);
                }
                window.location.reload();
              }}
              className="bg-white text-indigo-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors shadow-sm active:scale-95"
            >
              Atualizar Agora
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 sticky top-0 z-50 transition-all duration-300 shadow-sm">
        {!isStorageAvailable && (
          <div className="fixed top-0 left-0 right-0 bg-rose-500 text-white text-[10px] font-bold text-center py-1 uppercase tracking-widest z-[100]">
            Atenção: Navegador bloqueando salvamento de dados!
          </div>
        )}
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3.5">
            {!isAudioUnlocked && settings.alarmsEnabled && (
              <button 
                onClick={unlockAudio}
                className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 p-2 rounded-xl animate-pulse"
                title="Ativar Som"
              >
                <VolumeX className="w-5 h-5" />
              </button>
            )}
            <div className="relative">
              <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-500/20 flex items-center justify-center">
                <Bus className="text-white w-5 h-5" />
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
            </div>
            <div className="flex flex-col">
              <h1 className="font-bold text-lg tracking-tight text-slate-900 dark:text-white leading-none">
                Ponto & Frota
              </h1>
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mt-1">Gestão Inteligente</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveTab('settings')}
              className="relative group active:scale-95 transition-transform"
            >
              <div className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-800 shadow-md overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center ring-2 ring-transparent group-hover:ring-indigo-500/30 transition-all">
                {settings.profilePhoto ? (
                  <img 
                    src={settings.profilePhoto} 
                    alt="Perfil" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="text-sm font-bold text-slate-400 dark:text-slate-500">
                    {user?.displayName?.charAt(0) || user?.email?.charAt(0) || '?'}
                  </div>
                )}
              </div>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 pt-8 overflow-x-hidden">
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(_e, info) => {
            const threshold = 100;
            const edgeThreshold = 60; // Distância da borda para considerar o swipe
            const startX = info.point.x - info.offset.x;
            
            const isFromLeftEdge = startX < edgeThreshold;
            const isFromRightEdge = startX > window.innerWidth - edgeThreshold;

            if (isFromLeftEdge && info.offset.x > threshold) {
              handleSwipe(1); // Swipe Right -> Previous Tab
            } else if (isFromRightEdge && info.offset.x < -threshold) {
              handleSwipe(-1); // Swipe Left -> Next Tab
            }
          }}
          className="min-h-[calc(100vh-160px)]"
        >
          <AnimatePresence mode="wait">
            {activeTab === 'clock' && (
            <motion.div
              key="clock"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Clock Display */}
              <div className="text-center space-y-2">
                <ClockDisplay />
                <div className="flex flex-col items-center gap-1">
                  <input 
                    type="date" 
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="text-slate-500 dark:text-slate-400 font-medium bg-transparent border-none focus:ring-0 text-center cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  />
                </div>
              </div>

              {/* Prefix Input */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm flex items-center gap-3 transition-all focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500/50">
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/30 p-2.5 rounded-xl shrink-0 shadow-sm border border-indigo-100/50 dark:border-indigo-800/50">
                  <Car className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5 block">Prefixo do Veículo</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text"
                      placeholder="Digite o prefixo..."
                      value={settings.selectedPrefix || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSettings(prev => ({ ...prev, selectedPrefix: val }));
                      }}
                      className="flex-1 bg-transparent border-none p-0 focus:ring-0 font-bold text-base text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600"
                    />
                    {settings.selectedPrefix && (
                      <button 
                        onClick={() => {
                          setSettings(prev => ({ ...prev, selectedPrefix: '' }));
                        }}
                        className="text-slate-300 hover:text-rose-500 transition-colors mr-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4">
                  <PunchButton 
                    label="Entrada" 
                    icon={<Play className="w-5 h-5" />}
                    color="bg-emerald-500"
                    active={!lastPunchType && !todayLog?.isDayOff}
                    onClick={() => openPunchModal('entrada')}
                  />
                  <PunchButton 
                    label="Pausa" 
                    icon={<Pause className="w-5 h-5" />}
                    color="bg-amber-500"
                    active={(lastPunchType === 'entrada' || lastPunchType === 'retorno') && !todayLog?.isDayOff}
                    onClick={() => openPunchModal('pausa')}
                  />
                  <PunchButton 
                    label="Retorno" 
                    icon={<RotateCcw className="w-5 h-5" />}
                    color="bg-blue-500"
                    active={lastPunchType === 'pausa' && !todayLog?.isDayOff}
                    onClick={() => openPunchModal('retorno')}
                  />
                <PunchButton 
                  label="Fim" 
                  icon={<Square className="w-5 h-5" />}
                  color="bg-rose-500"
                  active={(lastPunchType === 'entrada' || lastPunchType === 'retorno') && !todayLog?.isDayOff}
                  onClick={() => openPunchModal('fim')}
                />
              </div>

              {/* Day Off Button */}
              <button
                onClick={handleToggleDayOff}
                className={cn(
                  "w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 border-2",
                  todayLog?.isDayOff 
                    ? "bg-amber-100 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-400"
                    : "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                )}
              >
                <Calendar className={cn("w-5 h-5", todayLog?.isDayOff ? "text-amber-500" : "text-slate-400")} />
                {todayLog?.isDayOff ? "Remover Dia de Folga" : "Marcar como Dia de Folga"}
              </button>

              {/* Photo Capture Button - Redesigned */}
              <div className="relative group">
                <button 
                  onClick={() => !isUploadingPhoto && fileInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className={cn(
                    "w-full py-5 rounded-2xl font-black text-white shadow-xl active:scale-[0.98] transition-all uppercase tracking-widest flex items-center justify-center gap-4 border-b-4",
                    isUploadingPhoto 
                      ? "bg-slate-400 border-slate-500 cursor-wait" 
                      : "bg-gradient-to-r from-indigo-600 to-violet-600 shadow-indigo-200 dark:shadow-indigo-900/40 border-indigo-800"
                  )}
                >
                  <div className="bg-white/20 p-2 rounded-xl">
                    {isUploadingPhoto ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Camera className="w-6 h-6" />
                    )}
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-sm leading-none mb-1">
                      {isUploadingPhoto ? "Enviando Foto..." : "Câmera do Relatório"}
                    </span>
                    <span className="text-[10px] opacity-70 font-bold tracking-normal">
                      {isUploadingPhoto ? "Aguarde um momento" : "Toque para tirar foto"}
                    </span>
                  </div>
                </button>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  ref={fileInputRef} 
                  onChange={handlePhotoCapture} 
                  className="hidden" 
                />
              </div>

              {/* Today's Timeline */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
                <h3 className="font-semibold mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    Registros do Dia
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">{format(parseISO(manualDate), 'dd/MM/yyyy')}</span>
                </h3>
                <div className="py-2">
                  {todayLog?.isDayOff ? (
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-amber-50 dark:bg-amber-900/10 border border-dashed border-amber-200 dark:border-amber-800/50 rounded-xl p-4 text-center"
                    >
                      <p className="text-amber-600 dark:text-amber-500 font-black uppercase tracking-widest text-xs">
                        Dia de Descanso / Folga
                      </p>
                      <p className="text-[10px] text-amber-500/70 dark:text-amber-500/50 mt-1">
                        Nenhum registro de ponto necessário hoje
                      </p>
                    </motion.div>
                  ) : !todayLog || todayLog.punches.length === 0 ? (
                    <p className="text-slate-400 dark:text-slate-500 text-sm italic text-center py-4">Nenhum registro hoje</p>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 grid grid-cols-4 gap-2">
                        {['entrada', 'pausa', 'retorno', 'fim'].map(type => {
                          const punch = todayLog.punches.find(p => p.type === type);
                          return (
                            <div key={type} className="flex flex-col items-center">
                              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter mb-1">{type}</span>
                              <span className={cn(
                                "text-sm font-mono font-bold px-2 py-1 rounded-lg w-full text-center transition-colors",
                                punch 
                                  ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" 
                                  : "bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-700"
                              )}>
                                {punch ? format(punch.timestamp, 'HH:mm') : '--:--'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <button 
                        onClick={async () => {
                          if (todayLog && todayLog.punches.length > 0) {
                            const newPunches = [...todayLog.punches];
                            newPunches.pop();
                            const updatedLog = { ...todayLog, punches: newPunches };
                            // Optimistic update
                            setLogs(prev => prev.map(l => l.date === todayLog.date ? updatedLog : l));
                            await saveLogToFirestore(updatedLog);
                          }
                        }}
                        className="p-2 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 transition-colors self-end mb-1"
                        title="Remover último registro"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Photos and Occurrences List for Today */}
                  {todayLog?.damages && todayLog.damages.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Camera className="w-3 h-3 text-indigo-500" />
                        Fotos e Ocorrências
                      </h4>
                      <div className="grid grid-cols-1 gap-2">
                        {todayLog.damages.map(damage => (
                          <div key={damage.id} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800/50 group">
                            <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-700 relative">
                              {damage.photoUrl && <img src={damage.photoUrl} alt="Foto" className="w-full h-full object-cover cursor-pointer" onClick={() => setEnlargedPhoto(damage.photoUrl)} referrerPolicy="no-referrer" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{damage.description}</p>
                              <p className="text-[9px] text-slate-400 dark:text-slate-500">{format(damage.timestamp, 'HH:mm')}</p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleShare('Foto do Relatório', damage.description, damage.photoUrl)}
                                className="p-2 text-slate-400 hover:text-indigo-500 transition-colors"
                                title="Compartilhar Foto"
                              >
                                <Share2 className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={async () => {
                                  if (todayLog) {
                                    const updatedLog = {
                                      ...todayLog,
                                      damages: todayLog.damages?.filter(d => d.id !== damage.id)
                                    };
                                    // Optimistic update
                                    setLogs(prev => prev.map(l => l.date === todayLog.date ? updatedLog : l));
                                    await saveLogToFirestore(updatedLog);
                                  }
                                }}
                                className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                                title="Excluir Foto"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <HistoryView 
              logs={logs} 
              setLogs={setLogs}
              settings={settings} 
              speakText={speakText}
              isSpeaking={isSpeaking}
              setEnlargedPhoto={setEnlargedPhoto}
              user={user}
              saveLogToFirestore={saveLogToFirestore}
              setToast={setToast}
              handleShare={handleShare}
            />
          )}

          {activeTab === 'schedule' && (
            <ScheduleView 
              settings={settings} 
              setSettings={setSettings} 
              user={user}
              setToast={setToast}
              setEnlargedPhoto={setEnlargedPhoto}
              handleShare={handleShare}
            />
          )}

          {activeTab === 'tracking' && (
            <TrackingView />
          )}

          {activeTab === 'settings' && (
            <SettingsView 
              settings={settings} 
              setSettings={setSettings} 
              alarmAudioRef={alarmAudioRef}
              setIsAudioUnlocked={setIsAudioUnlocked}
              notificationPermission={notificationPermission}
              requestNotificationPermission={requestNotificationPermission}
              logs={logs}
              setLogs={setLogs}
              storageUsage={storageUsage}
              deferredPrompt={deferredPrompt}
              installApp={installApp}
              user={user}
              setToast={setToast}
              profileInputRef={profileInputRef}
              processAICommand={processAICommand}
              pendingAIAlarm={pendingAIAlarm}
              setPendingAIAlarm={setPendingAIAlarm}
              unlockAudio={unlockAudio}
              desativarAlarme={desativarAlarme}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </main>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-24 left-1/2 -translate-x-1/2 z-[150] px-6 py-3 rounded-2xl font-bold shadow-2xl flex items-center gap-3 text-white",
              toast.type === 'success' && "bg-emerald-600",
              toast.type === 'error' && "bg-rose-600",
              toast.type === 'info' && "bg-slate-900 dark:bg-indigo-600"
            )}
          >
            <div className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              toast.type === 'success' && "bg-white",
              toast.type === 'error' && "bg-white",
              toast.type === 'info' && "bg-green-400"
            )} />
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alarm Modal */}
      <AnimatePresence>
        {activeAlarm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-rose-600 dark:bg-rose-900"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.8, y: 100 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 100 }}
              className="w-full h-full flex flex-col items-center justify-between p-12 relative z-10 text-white"
            >
              <div className="text-center space-y-4 mt-12">
                <div className="bg-white/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto animate-pulse">
                  <Logo className="w-12 h-12 text-white" />
                </div>
                <h2 className="text-4xl font-black uppercase tracking-tighter">Hora do Ponto!</h2>
                <p className="text-white/80 text-lg font-medium">
                  Registro de <span className="text-white font-bold underline decoration-2 underline-offset-4">{activeAlarm}</span> pendente.
                </p>
              </div>

              <div className="w-full max-w-xs space-y-4 mb-12">
                <button 
                  onClick={() => {
                    const type = activeAlarm;
                    if (type) {
                      const todayStr = format(new Date(), 'yyyy-MM-dd');
                      setDismissedAlarms(prev => ({ ...prev, [`${todayStr}_${type}`]: true }));
                      setActiveAlarm(null);
                      setSnoozeUntil(null);
                      openPunchModal(type);
                    }
                  }}
                  className="w-full py-6 rounded-3xl font-black bg-white text-rose-600 shadow-2xl active:scale-95 transition-all text-xl uppercase tracking-widest"
                >
                  Registrar Agora
                </button>
                
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => {
                      const fiveMinutes = 5 * 60 * 1000;
                      setSnoozeUntil(new Date().getTime() + fiveMinutes);
                      setActiveAlarm(null);
                    }}
                    className="py-4 rounded-2xl font-bold bg-white/20 text-white hover:bg-white/30 transition-all uppercase text-sm tracking-widest"
                  >
                    Soneca (5m)
                  </button>
                  <button 
                    onClick={() => {
                      const todayStr = format(new Date(), 'yyyy-MM-dd');
                      setDismissedAlarms(prev => ({ ...prev, [`${todayStr}_${activeAlarm}`]: true }));
                      setActiveAlarm(null);
                      setSnoozeUntil(null);
                    }}
                    className="py-4 rounded-2xl font-bold bg-white/10 text-white/60 hover:bg-white/20 transition-all uppercase text-sm tracking-widest"
                  >
                    Ignorar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Update Notification */}
      <AnimatePresence>
        {updateAvailable && (
          <div className="fixed bottom-20 left-6 right-6 z-[200] bg-indigo-600 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between">
            <p className="text-sm font-bold">Nova versão disponível!</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-white text-indigo-600 px-4 py-2 rounded-xl font-bold text-sm"
            >
              Atualizar
            </button>
          </div>
        )}
      </AnimatePresence>

      {/* Punch Modal */}
      <AnimatePresence>
        {pendingPunch && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingPunch(null)}
              className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-xs rounded-3xl p-8 shadow-2xl relative z-10 space-y-6 transition-colors"
            >
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold capitalize text-slate-800 dark:text-slate-100">Registrar {pendingPunch}</h3>
                
                {pendingPunch === 'fim' && (() => {
                  let currentLog = logs.find(l => l.date === manualDate && l.carPrefix === settings.selectedPrefix);
                  
                  // If no log today, check yesterday for an overnight shift
                  if (!currentLog) {
                    const yesterdayDate = format(subDays(parseISO(manualDate), 1), 'yyyy-MM-dd');
                    currentLog = logs.find(l => l.date === yesterdayDate && l.carPrefix === settings.selectedPrefix);
                  }

                  if (currentLog) {
                    // Create a temporary log with the pending 'fim' punch to calculate hours
                    const tempFimTimestamp = new Date(`${manualDate}T${tempTime}`).getTime();
                    const tempLog: DayLog = {
                      ...currentLog,
                      punches: [...currentLog.punches.filter(p => p.type !== 'fim'), {
                        id: 'temp',
                        type: 'fim',
                        timestamp: tempFimTimestamp,
                        carPrefix: settings.selectedPrefix
                      }]
                    };
                    const stats = calculateWorkedHours(tempLog, logs);
                    if (stats) {
                      return (
                        <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800">
                          <div className="flex justify-around items-center">
                            <div className="text-center">
                              <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest">Total Hoje</p>
                              <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{stats.total}h</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[8px] font-bold text-rose-400 uppercase tracking-widest">Extra Hoje</p>
                              <p className="text-lg font-black text-rose-600 dark:text-rose-400">{stats.extra || '00:00'}h</p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  }
                  return null;
                })()}
              </div>

              <div className="flex justify-center">
                <input 
                  type="time" 
                  value={tempTime}
                  onChange={(e) => setTempTime(e.target.value)}
                  className="text-4xl font-mono font-bold tracking-tighter text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-100 dark:border-indigo-800 rounded-2xl px-6 py-4 focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setPendingPunch(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handlePunch(pendingPunch, tempTime)}
                  className="flex-1 py-3 rounded-xl font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40 active:scale-95 transition-all"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-200/50 dark:border-slate-800/50 px-6 py-3 z-10 transition-colors">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <NavButton 
            active={activeTab === 'clock'} 
            onClick={() => setActiveTab('clock')}
            icon={<Logo className="w-6 h-6" />}
            label="Ponto"
          />
          <NavButton 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')}
            icon={<FileText className="w-6 h-6" />}
            label="Relatórios"
          />
          <NavButton 
            active={activeTab === 'schedule'} 
            onClick={() => setActiveTab('schedule')}
            icon={<Calendar className="w-6 h-6" />}
            label="Escala"
          />
          <NavButton 
            active={activeTab === 'tracking'} 
            onClick={() => setActiveTab('tracking')}
            icon={<Bus className="w-6 h-6" />}
            label="Rastreio"
          />
          <NavButton 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')}
            icon={<SettingsIcon className="w-6 h-6" />}
            label="Ajustes"
          />
        </div>
      </nav>
    </div>
  );
}

function PunchButton({ label, icon, color, active, onClick }: { 
  label: string, 
  icon: React.ReactNode, 
  color: string, 
  active: boolean,
  onClick: () => void 
}) {
  return (
    <button
      disabled={!active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-6 rounded-[1.5rem] transition-all duration-300 relative overflow-hidden group",
        active 
          ? `${color} text-white shadow-xl hover:shadow-2xl hover:-translate-y-1 active:scale-95 active:translate-y-0` 
          : "bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60"
      )}
    >
      {active && (
        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      )}
      <div className="relative z-10 flex flex-col items-center gap-3">
        {icon}
        <span className="font-bold text-sm uppercase tracking-widest">{label}</span>
      </div>
    </button>
  );
}

function NavButton({ active, onClick, icon, label }: { 
  active: boolean, 
  onClick: () => void, 
  icon: React.ReactNode,
  label: string
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 transition-all duration-300 px-4 py-2 rounded-2xl",
        active 
          ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 scale-105" 
          : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
      )}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

function ScheduleView({ settings, setSettings, user, setToast, setEnlargedPhoto, handleShare }: {
  settings: AppSettings,
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
  user: any,
  setToast: (toast: { message: string, type: 'success' | 'error' | 'info' } | null) => void,
  setEnlargedPhoto: (photoUrl: string | null) => void,
  handleShare: (title: string, text: string, url: string) => Promise<void>
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [deletingScaleIndex, setDeletingScaleIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && user) {
      setIsUploading(true);
      const reader = new FileReader();
      
      reader.onerror = () => {
        setToast({ message: "Erro ao ler arquivo!", type: 'error' });
        setIsUploading(false);
      };

      reader.onload = async (event) => {
        const img = new Image();
        
        img.onerror = () => {
          setToast({ message: "Erro ao carregar imagem!", type: 'error' });
          setIsUploading(false);
        };

        img.onload = async () => {
          try {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1000;
            const MAX_HEIGHT = 1400;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Could not get canvas context");
            
            ctx.drawImage(img, 0, 0, width, height);
            
            const base64Data = canvas.toDataURL('image/jpeg', 0.6);
            
            // Upload to Firebase Storage
            const newPhotos = [...(settings.scalePhotos || []), base64Data];
            
            // Update settings state
            setSettings(prev => ({ 
              ...prev, 
              scalePhotos: newPhotos 
            }));

            setToast({ message: "Escala salva localmente!", type: 'success' });
          } catch (err) {
            console.error("Scale photo error:", err);
            setToast({ message: "Erro ao salvar foto!", type: 'error' });
          } finally {
            setIsUploading(false);
            if (e.target) e.target.value = '';
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      if (e.target) e.target.value = '';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 pb-20"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Mural de Escalas</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Guarde fotos das suas escalas de trabalho</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {isUploading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          <span className="text-sm font-bold pr-1">Adicionar</span>
        </button>
        <input 
          type="file" 
          accept="image/*" 
          capture="environment"
          ref={fileInputRef}
          onChange={handlePhotoCapture}
          className="hidden"
        />
      </div>

      {settings.scalePhotos && settings.scalePhotos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {settings.scalePhotos.map((photo, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="flex flex-col gap-3"
            >
              <div 
                className="relative rounded-3xl overflow-hidden border-4 border-white dark:border-slate-800 shadow-xl aspect-[3/4] cursor-pointer"
                onClick={() => setEnlargedPhoto(photo)}
              >
                <img 
                  src={photo} 
                  alt={`Escala ${index + 1}`} 
                  className="w-full h-full object-cover bg-slate-100 dark:bg-slate-900"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute bottom-3 right-3">
                  <div className="bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full font-bold">
                    #{index + 1}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 px-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEnlargedPhoto(photo);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 active:scale-95 transition-all text-xs font-bold"
                >
                  <Maximize2 className="w-4 h-4" /> Ampliar
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShare("Minha Escala", "Confira minha escala de trabalho", photo);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 active:scale-95 transition-all text-xs font-bold"
                >
                  <Share2 className="w-4 h-4" /> Enviar
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setEnlargedPhoto(null);
                    setDeletingScaleIndex(index);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 active:scale-95 transition-all text-xs font-bold"
                >
                  <Trash2 className="w-4 h-4" /> Excluir
                </button>
              </div>
            </motion.div>
          ))}
          
          {/* Add more placeholder */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="aspect-[3/4] w-full border-4 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
              <Plus className="w-8 h-8" />
            </div>
            <p className="font-bold text-sm">Adicionar Foto</p>
          </button>
        </div>
      ) : (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="aspect-[3/4] w-full border-4 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center gap-4 text-slate-400 dark:text-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          <div className="p-6 bg-slate-100 dark:bg-slate-800 rounded-full">
            <ImageIcon className="w-12 h-12" />
          </div>
          <div className="text-center">
            <p className="font-bold text-lg">Mural Vazio</p>
            <p className="text-sm">Toque para tirar foto da sua escala</p>
          </div>
        </div>
      )}

      <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-3xl border border-indigo-100 dark:border-indigo-800/50">
        <h4 className="font-bold text-indigo-900 dark:text-indigo-300 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Dica
        </h4>
        <p className="text-sm text-indigo-700 dark:text-indigo-400 leading-relaxed">
          Tire uma foto nítida da sua tabela de escala mensal ou semanal para ter sempre à mão quando precisar consultar seus horários.
        </p>
      </div>

      {/* Delete Scale Photo Modal */}
      {deletingScaleIndex !== null && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Excluir Escala
              </h3>
              <button onClick={() => setDeletingScaleIndex(null)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Tem certeza que deseja excluir esta escala permanentemente? Esta ação não pode ser desfeita.
            </p>

            <div className="flex gap-3">
              <button 
                onClick={() => setDeletingScaleIndex(null)}
                className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold py-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  try {
                    const newPhotos = [...(settings.scalePhotos || [])];
                    newPhotos.splice(deletingScaleIndex, 1);
                    setSettings(prev => ({ ...prev, scalePhotos: newPhotos }));
                    setToast({ message: "Escala removida com sucesso", type: 'info' });
                  } catch (err) {
                    console.error("Error deleting scale photo:", err);
                    setToast({ message: "Erro ao remover escala", type: 'error' });
                  } finally {
                    setDeletingScaleIndex(null);
                  }
                }}
                className="flex-1 bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200 dark:shadow-rose-900/20"
              >
                Excluir
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function HistoryView({ logs, setLogs, settings, speakText, isSpeaking, setEnlargedPhoto, user, saveLogToFirestore, setToast, handleShare }: { 
  logs: DayLog[], 
  setLogs: React.Dispatch<React.SetStateAction<DayLog[]>>,
  settings: AppSettings,
  speakText: (text: string) => Promise<void>,
  isSpeaking: boolean,
  setEnlargedPhoto: (photoUrl: string | null) => void,
  user: any,
  saveLogToFirestore: (log: DayLog) => Promise<void>,
  setToast: (toast: { message: string, type: 'success' | 'error' | 'info' } | null) => void,
  handleShare: (title: string, text: string, url: string) => Promise<void>
}) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'damages'>('daily');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editingLog, setEditingLog] = useState<DayLog | null>(null);
  const [deletingLog, setDeletingLog] = useState<DayLog | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState<{ log: DayLog, damageId: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editTimes, setEditTimes] = useState<Record<string, string>>({});
  const [editPrefix, setEditPrefix] = useState('');
  const [attachingPhotoLog, setAttachingPhotoLog] = useState<DayLog | null>(null);
  const historyFileInputRef = useRef<HTMLInputElement>(null);

  const handleHistoryPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && user && attachingPhotoLog) {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const base64Data = canvas.toDataURL('image/jpeg', 0.5);
          
          try {
            const newDamage: Damage = {
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().getTime(),
              description: "Foto anexada via histórico",
              photoUrl: base64Data
            };

            let finalLog: DayLog | null = null;

            // Update local state
            setLogs(prev => {
              const idx = prev.findIndex(l => l.date === attachingPhotoLog.date);
              if (idx >= 0) {
                finalLog = {
                  ...prev[idx],
                  damages: [...(prev[idx].damages || []), newDamage]
                };
                const newLogs = [...prev];
                newLogs[idx] = finalLog;
                return newLogs;
              }
              return prev;
            });

            // Save to Firestore
            if (finalLog) {
              await saveLogToFirestore(finalLog);
            }

            setToast({ message: "Foto anexada com sucesso!", type: 'success' });
          } catch (error) {
            console.error("Erro ao anexar foto:", error);
            setToast({ message: "Erro ao anexar foto!", type: 'error' });
          } finally {
            setIsUploading(false);
            setAttachingPhotoLog(null);
            if (historyFileInputRef.current) historyFileInputRef.current.value = '';
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const filteredLogs = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    
    return logs
      .filter(log => {
        const date = parseISO(log.date);
        return isWithinInterval(date, { start, end });
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [logs, currentMonth]);

  const getBase64FromUrl = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Error converting image to base64:", error);
      return "";
    }
  };

  const exportToPDF = async () => {
    console.log("Gerando documento PDF...");
    if (filteredLogs.length === 0) {
      console.warn("Nenhum log para exportar.");
      return;
    }

    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.text(`Relatório de Ponto`, 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Período: ${format(currentMonth, 'MMMM yyyy', { locale: ptBR })}`, 14, 30);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 37);

    const headers = [['Data', 'Veículo', 'Entrada', 'Pausa', 'Retorno', 'Fim', 'Total', 'Extra']];
    const rows = filteredLogs.map(log => {
      const stats = calculateWorkedHours(log, logs);
      if (log.isDayOff) {
        return [
          format(parseISO(log.date), 'dd/MM/yyyy'),
          '---',
          '---',
          '---',
          '---',
          '---',
          'FOLGA',
          '00:00'
        ];
      }
      const getPunchTime = (type: string) => {
        const p = stats?.resolvedPunches?.[type as keyof typeof stats.resolvedPunches] || log.punches.find(punch => punch.type === type);
        return p ? format(p.timestamp, 'HH:mm') : '--:--';
      };
      return [
        format(parseISO(log.date), 'dd/MM/yyyy'),
        log.carPrefix || '---',
        getPunchTime('entrada'),
        getPunchTime('pausa'),
        getPunchTime('retorno'),
        getPunchTime('fim'),
        stats ? stats.total : '--:--',
        stats?.extra ? stats.extra : '00:00'
      ];
    });

    autoTable(doc, {
      head: headers,
      body: rows,
      startY: 45,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] }, // Indigo-600
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 20 },
        6: { cellWidth: 15 },
        7: { cellWidth: 15 },
      }
    });

    // Calculate monthly totals
    let totalMins = 0;
    let totalExtraMins = 0;
    let workedDays = 0;
    let offDays = 0;

    filteredLogs.forEach(log => {
      const stats = calculateWorkedHours(log, logs);
      if (log.isDayOff) {
        offDays++;
      } else if (stats) {
        totalMins += stats.totalMinutes;
        totalExtraMins += stats.extraMinutes;
        workedDays++;
      }
    });

    const totalHours = Math.floor(totalMins / 60);
    const totalMinutes = Math.floor(totalMins % 60);
    const extraHours = Math.floor(totalExtraMins / 60);
    const extraMinutes = Math.floor(totalExtraMins % 60);

    const finalY = (doc as any).lastAutoTable.finalY || 45;
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Resumo do Mês:`, 14, finalY + 10);
    doc.text(`Dias Trabalhados: ${workedDays}`, 14, finalY + 16);
    doc.text(`Dias de Folga: ${offDays}`, 14, finalY + 22);
    doc.text(`Total de Horas: ${totalHours}h ${totalMinutes}m`, 14, finalY + 28);
    doc.text(`Total de Extras: ${extraHours}h ${extraMinutes}m`, 14, finalY + 34);

    // Add Damages section
    const logsWithDamages = filteredLogs.filter(l => l.damages && l.damages.length > 0);
    if (logsWithDamages.length > 0) {
      const damagesY = finalY + 45;
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text('Fotos e Avarias por Dia', 14, damagesY);

      let currentY = damagesY + 10;

      for (const log of logsWithDamages) {
        if (log.damages && log.damages.length > 0) {
          if (currentY > 250) {
            doc.addPage();
            currentY = 20;
          }

          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text(`Data: ${format(parseISO(log.date), 'dd/MM/yyyy')} - Veículo: ${log.carPrefix || '---'}`, 14, currentY);
          
          currentY += 5;
          let currentX = 14;
          const imgWidth = 40;
          const imgHeight = 30;
          const spacing = 5;
          const maxRowHeight = imgHeight + 5;

          for (const damage of log.damages) {
            if (currentX + imgWidth > 200) {
              currentX = 14;
              currentY += maxRowHeight;
              if (currentY > 250) {
                doc.addPage();
                currentY = 20;
              }
            }

            try {
              const base64 = await getBase64FromUrl(damage.photoUrl);
              if (base64) {
                doc.addImage(base64, 'JPEG', currentX, currentY, imgWidth, imgHeight);
                currentX += imgWidth + spacing;
              }
            } catch (e) {
              console.error("Failed to load image for PDF", e);
            }
          }
          currentY += maxRowHeight + 10; // Add space before the next day
        }
      }
    }

    doc.save(`relatorio_${format(currentMonth, 'yyyy-MM')}.pdf`);
  };

  const sharePDF = async () => {
    if (filteredLogs.length === 0) return;

    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.text(`Relatório de Ponto`, 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Período: ${format(currentMonth, 'MMMM yyyy', { locale: ptBR })}`, 14, 30);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 37);

    const headers = [['Data', 'Veículo', 'Entrada', 'Pausa', 'Retorno', 'Fim', 'Total', 'Extra']];
    const rows = filteredLogs.map(log => {
      const stats = calculateWorkedHours(log, logs);
      if (log.isDayOff) {
        return [
          format(parseISO(log.date), 'dd/MM/yyyy'),
          '---',
          '---',
          '---',
          '---',
          '---',
          'FOLGA',
          '00:00'
        ];
      }
      const getPunchTime = (type: string) => {
        const p = stats?.resolvedPunches?.[type as keyof typeof stats.resolvedPunches] || log.punches.find(punch => punch.type === type);
        return p ? format(p.timestamp, 'HH:mm') : '--:--';
      };
      return [
        format(parseISO(log.date), 'dd/MM/yyyy'),
        log.carPrefix || '---',
        getPunchTime('entrada'),
        getPunchTime('pausa'),
        getPunchTime('retorno'),
        getPunchTime('fim'),
        stats ? stats.total : '--:--',
        stats?.extra ? stats.extra : '00:00'
      ];
    });

    autoTable(doc, {
      head: headers,
      body: rows,
      startY: 45,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] }, // Indigo-600
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 20 },
        6: { cellWidth: 15 },
        7: { cellWidth: 15 },
      }
    });

    // Calculate monthly totals for share
    let totalMinsShare = 0;
    let totalExtraMinsShare = 0;
    let workedDaysShare = 0;
    let offDaysShare = 0;

    filteredLogs.forEach(log => {
      const stats = calculateWorkedHours(log, logs);
      if (log.isDayOff) {
        offDaysShare++;
      } else if (stats) {
        totalMinsShare += stats.totalMinutes;
        totalExtraMinsShare += stats.extraMinutes;
        workedDaysShare++;
      }
    });

    const totalHoursShare = Math.floor(totalMinsShare / 60);
    const totalMinutesShare = Math.floor(totalMinsShare % 60);
    const extraHoursShare = Math.floor(totalExtraMinsShare / 60);
    const extraMinutesShare = Math.floor(totalExtraMinsShare % 60);

    const finalYShare = (doc as any).lastAutoTable.finalY || 45;
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Resumo do Mês:`, 14, finalYShare + 10);
    doc.text(`Dias Trabalhados: ${workedDaysShare}`, 14, finalYShare + 16);
    doc.text(`Dias de Folga: ${offDaysShare}`, 14, finalYShare + 22);
    doc.text(`Total de Horas: ${totalHoursShare}h ${totalMinutesShare}m`, 14, finalYShare + 28);
    doc.text(`Total de Extras: ${extraHoursShare}h ${extraMinutesShare}m`, 14, finalYShare + 34);

    // Add Damages section
    const logsWithDamagesShare = filteredLogs.filter(l => l.damages && l.damages.length > 0);
    if (logsWithDamagesShare.length > 0) {
      const damagesYShare = finalYShare + 45;
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text('Fotos e Avarias por Dia', 14, damagesYShare);

      let currentY = damagesYShare + 10;

      for (const log of logsWithDamagesShare) {
        if (log.damages && log.damages.length > 0) {
          if (currentY > 250) {
            doc.addPage();
            currentY = 20;
          }

          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text(`Data: ${format(parseISO(log.date), 'dd/MM/yyyy')} - Veículo: ${log.carPrefix || '---'}`, 14, currentY);
          
          currentY += 5;
          let currentX = 14;
          const imgWidth = 40;
          const imgHeight = 30;
          const spacing = 5;
          const maxRowHeight = imgHeight + 5;

          for (const damage of log.damages) {
            if (currentX + imgWidth > 200) {
              currentX = 14;
              currentY += maxRowHeight;
              if (currentY > 250) {
                doc.addPage();
                currentY = 20;
              }
            }

            try {
              const base64 = await getBase64FromUrl(damage.photoUrl);
              if (base64) {
                doc.addImage(base64, 'JPEG', currentX, currentY, imgWidth, imgHeight);
                currentX += imgWidth + spacing;
              }
            } catch (e) {
              console.error("Failed to load image for PDF", e);
            }
          }
          currentY += maxRowHeight + 10; // Add space before the next day
        }
      }
    }

    const pdfBlob = doc.output('blob');
    const fileName = `relatorio_${format(currentMonth, 'yyyy-MM')}.pdf`;
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: 'Relatório de Ponto',
          text: `Relatório de ponto - ${format(currentMonth, 'MMMM yyyy', { locale: ptBR })}`
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing PDF:', err);
          doc.save(fileName);
        }
      }
    } else {
      doc.save(fileName);
    }
  };

  const exportToCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = ['Data', 'Veiculo', 'Entrada', 'Pausa', 'Retorno', 'Fim', 'Total', 'Extra', 'Avarias'];
    const rows = filteredLogs.map(log => {
      const stats = calculateWorkedHours(log, logs);
      if (log.isDayOff) {
        return [
          format(parseISO(log.date), 'dd/MM/yyyy'),
          '',
          '',
          '',
          '',
          '',
          'FOLGA',
          '00:00',
          log.damages?.length ? `${log.damages.length} avaria(s)` : 'Nenhuma'
        ].join(';');
      }
      const getPunchTime = (type: string) => {
        const p = stats?.resolvedPunches?.[type as keyof typeof stats.resolvedPunches] || log.punches.find(punch => punch.type === type);
        return p ? format(p.timestamp, 'HH:mm') : '';
      };
      const damagesCount = log.damages?.length || 0;
      return [
        format(parseISO(log.date), 'dd/MM/yyyy'),
        log.carPrefix || '',
        getPunchTime('entrada'),
        getPunchTime('pausa'),
        getPunchTime('retorno'),
        getPunchTime('fim'),
        stats ? stats.total : '',
        stats?.extra ? stats.extra : '00:00',
        damagesCount > 0 ? `${damagesCount} avaria(s)` : 'Nenhuma'
      ].join(';');
    });

    const csvContent = [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ponto_frota_${format(currentMonth, 'yyyy-MM')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div
      key="history"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Relatórios</h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              console.log("Iniciando exportação para PDF...");
              exportToPDF();
            }}
            disabled={filteredLogs.length === 0}
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            title="Exportar PDF"
          >
            <FileText className="w-5 h-5" />
            <span className="text-xs font-bold hidden sm:inline">PDF</span>
          </button>
          <button 
            onClick={sharePDF}
            disabled={filteredLogs.length === 0}
            className="p-2 bg-indigo-600 border border-indigo-500 rounded-lg text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none"
            title="Compartilhar PDF (WhatsApp/Email)"
          >
            <Share2 className="w-5 h-5" />
            <span className="text-xs font-bold hidden sm:inline">Enviar</span>
          </button>
          <button 
            onClick={exportToCSV}
            disabled={filteredLogs.length === 0}
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-200 dark:hover:border-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            title="Exportar CSV (Excel)"
          >
            <Download className="w-5 h-5" />
            <span className="text-xs font-bold hidden sm:inline">CSV</span>
          </button>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button 
              onClick={() => setViewMode('daily')}
              className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", viewMode === 'daily' ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400")}
            >
              DIA
            </button>
            <button 
              onClick={() => setViewMode('monthly')}
              className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", viewMode === 'monthly' ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400")}
            >
              MÊS
            </button>
            <button 
              onClick={() => setViewMode('damages')}
              className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", viewMode === 'damages' ? "bg-white dark:bg-slate-700 shadow-sm text-rose-600 dark:text-rose-300" : "text-slate-500 dark:text-slate-400")}
            >
              AVARIAS
            </button>
          </div>
        </div>
      </div>

      {/* Hidden File Input for History Photo */}
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        ref={historyFileInputRef} 
        onChange={handleHistoryPhotoCapture} 
        className="hidden" 
      />

      {/* Monthly Summary Card - Always visible at top */}
      {filteredLogs.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4 transition-colors">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <Calendar className="w-5 h-5" />
              <h3 className="font-bold text-sm uppercase tracking-widest">Resumo do Período</h3>
            </div>
            <button 
              onClick={() => {
                let totalMins = 0;
                let totalExtraMins = 0;
                filteredLogs.forEach(log => {
                  const stats = calculateWorkedHours(log, logs);
                  if (stats) {
                    totalMins += stats.totalMinutes;
                    totalExtraMins += stats.extraMinutes;
                  }
                });
                const totalHours = Math.floor(totalMins / 60);
                const extraHours = Math.floor(totalExtraMins / 60);
                speakText(`Resumo do período. Total de ${filteredLogs.length} dias trabalhados, ${totalHours} horas e ${extraHours} horas extras.`);
              }}
              disabled={isSpeaking}
              className={cn(
                "p-2 rounded-lg transition-colors",
                isSpeaking ? "text-slate-300 dark:text-slate-700" : "text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
              )}
              title="Ouvir resumo"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
          
          {(() => {
            let totalMins = 0;
            let totalExtraMins = 0;
            let workedDays = 0;
            let offDays = 0;
            
            filteredLogs.forEach(log => {
              const stats = calculateWorkedHours(log, logs);
              if (log.isDayOff) {
                offDays++;
              } else if (stats) {
                totalMins += stats.totalMinutes;
                totalExtraMins += stats.extraMinutes;
                workedDays++;
              }
            });
            
            const totalHours = Math.floor(totalMins / 60);
            const totalMinutes = Math.floor(totalMins % 60);
            const extraHours = Math.floor(totalExtraMins / 60);
            const extraMinutes = Math.floor(totalExtraMins % 60);
            
            return (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  <p className="text-slate-400 dark:text-slate-500 text-[8px] font-bold uppercase tracking-wider mb-1">Trabalho / Folga</p>
                  <p className="text-lg font-black text-slate-700 dark:text-slate-200">{workedDays} / {offDays}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  <p className="text-slate-400 dark:text-slate-500 text-[8px] font-bold uppercase tracking-wider mb-1">Horas</p>
                  <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{totalHours}h {totalMinutes}m</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  <p className="text-slate-400 dark:text-slate-500 text-[8px] font-bold uppercase tracking-wider mb-1">Extras</p>
                  <p className="text-lg font-black text-rose-500">{extraHours}h {extraMinutes}m</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-bold capitalize text-slate-800 dark:text-slate-100">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Monthly Summary */}
      {viewMode === 'monthly' && filteredLogs.length > 0 && (
        <div className="bg-indigo-600 text-white rounded-2xl p-6 shadow-lg shadow-indigo-100 dark:shadow-indigo-900/40 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold">Resumo Detalhado</h3>
          </div>
          
          {(() => {
            let totalMins = 0;
            let totalExtraMins = 0;
            let workedDays = 0;
            let offDays = 0;

            filteredLogs.forEach(log => {
              const stats = calculateWorkedHours(log, logs);
              if (log.isDayOff) {
                offDays++;
              } else if (stats) {
                totalMins += stats.totalMinutes;
                totalExtraMins += stats.extraMinutes;
                workedDays++;
              }
            });
            
            const totalHours = Math.floor(totalMins / 60);
            const totalMinutes = Math.floor(totalMins % 60);
            const extraHours = Math.floor(totalExtraMins / 60);
            const extraMinutes = Math.floor(totalExtraMins % 60);
            
            return (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 p-4 rounded-xl">
                  <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-wider mb-1">Dias Trabalhados</p>
                  <p className="text-2xl font-bold">{workedDays}</p>
                </div>
                <div className="bg-white/10 p-4 rounded-xl">
                  <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-wider mb-1">Dias de Folga</p>
                  <p className="text-2xl font-bold text-amber-200">{offDays}</p>
                </div>
                <div className="bg-white/10 p-4 rounded-xl">
                  <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-wider mb-1">Total Horas</p>
                  <p className="text-2xl font-bold">{totalHours}h {totalMinutes}m</p>
                </div>
                <div className="bg-white/10 p-4 rounded-xl">
                  <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-wider mb-1">Total Extras</p>
                  <p className="text-2xl font-bold text-rose-200">{extraHours}h {extraMinutes}m</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Logs List */}
      <div className="space-y-4 pb-10">
        {viewMode === 'damages' ? (
          filteredLogs.filter(l => l.damages && l.damages.length > 0).length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 transition-colors">
              <Camera className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-3" />
              <p className="text-slate-400 dark:text-slate-500 font-medium">Nenhuma foto encontrada</p>
            </div>
          ) : (
            filteredLogs.filter(l => l.damages && l.damages.length > 0).map((log, idx) => (
              <div key={`damages-${log.date}-${log.carPrefix}-${idx}`} className="space-y-3">
                <div className="flex items-center gap-2 px-2">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    {format(parseISO(log.date), "dd 'de' MMMM", { locale: ptBR })}
                  </span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {log.damages?.map(damage => (
                    <div key={damage.id} className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
                      <div className="aspect-video w-full bg-slate-100 dark:bg-slate-800 relative group">
                        {damage.photoUrl && <img src={damage.photoUrl} alt="Foto" className="w-full h-full object-cover cursor-pointer" onClick={() => setEnlargedPhoto(damage.photoUrl)} referrerPolicy="no-referrer" />}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                           <button 
                             onClick={() => setEnlargedPhoto(damage.photoUrl)}
                             className="bg-white text-slate-900 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl"
                           >
                             Ver Foto
                           </button>
                           <button 
                             onClick={() => handleShare('Foto do Relatório', damage.description, damage.photoUrl)}
                             className="bg-indigo-600 text-white p-2 rounded-full shadow-xl"
                           >
                             <Share2 className="w-4 h-4" />
                           </button>
                           <button 
                             onClick={() => setDeletingPhoto({ log, damageId: damage.id })}
                             className="bg-rose-600 text-white p-2 rounded-full shadow-xl"
                             title="Excluir Foto"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <p className="font-bold text-slate-800 dark:text-slate-100 leading-tight">{damage.description}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500 dark:text-slate-400">
                              {format(damage.timestamp, 'HH:mm')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
                          <Car className="w-3 h-3" />
                          {log.carPrefix || 'Sem Prefixo'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )
        ) : (
          filteredLogs.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 transition-colors">
              <FileText className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-3" />
              <p className="text-slate-400 dark:text-slate-500 font-medium">Nenhum registro encontrado</p>
            </div>
          ) : (
            filteredLogs.map((log, idx) => (
              <div 
                key={`${log.date}-${log.carPrefix}-${idx}`} 
                className={cn(
                  "rounded-2xl p-5 shadow-sm border space-y-4 transition-colors",
                  log.isDayOff 
                    ? "bg-amber-50/30 dark:bg-amber-900/5 border-amber-200 dark:border-amber-800/50" 
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                )}
              >
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {format(parseISO(log.date), "dd 'de' MMMM", { locale: ptBR })}
                  </span>
                  <div className="flex items-center gap-3">
                    {(() => {
                      const stats = calculateWorkedHours(log, logs);
                      if (stats) {
                        if (stats.isDayOff) {
                          return (
                            <span className="text-[10px] font-black text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded-full border border-amber-100 dark:border-amber-800/50 uppercase tracking-widest">
                              Folga
                            </span>
                          );
                        }
                        return (
                          <div className="flex items-center gap-2 mr-1">
                            <div className="flex flex-col items-end">
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter leading-none">Total</span>
                              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 leading-none">{stats.total}h</span>
                            </div>
                            <div className="flex flex-col items-end bg-rose-50 dark:bg-rose-900/20 px-2 py-1 rounded-lg border border-rose-100 dark:border-rose-900/30">
                              <span className="text-[8px] font-bold text-rose-400 uppercase tracking-tighter leading-none">Extra</span>
                              <span className="text-[10px] font-bold text-rose-500 leading-none">{stats.extra || '00:00'}h</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {!log.isDayOff && <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{log.carPrefix || 'Sem Prefixo'}</span>}
                    <button 
                      onClick={() => {
                        setAttachingPhotoLog(log);
                        setTimeout(() => historyFileInputRef.current?.click(), 100);
                      }}
                      className="p-1 text-slate-300 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      title="Adicionar Foto"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        setEditingLog(log);
                        setEditPrefix(log.carPrefix || '');
                        const times: Record<string, string> = {};
                        ['entrada', 'pausa', 'retorno', 'fim'].forEach(type => {
                          const p = log.punches.find(punch => punch.type === type);
                          times[type] = p ? format(p.timestamp, 'HH:mm') : '';
                        });
                        setEditTimes(times);
                      }}
                      className="p-1 text-slate-300 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      title="Editar Registro"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button 
                      onClick={async () => {
                        const doc = new jsPDF();
                        doc.setFontSize(18);
                        doc.text(`Relatório de Ponto Diário`, 14, 22);
                        doc.setFontSize(11);
                        doc.text(`Veículo: ${log.carPrefix || '---'}`, 14, 30);
                        doc.text(`Data: ${format(parseISO(log.date), 'dd/MM/yyyy')}`, 14, 37);

                        const stats = calculateWorkedHours(log, logs);
                        if (log.isDayOff) {
                          autoTable(doc, {
                            head: [['Entrada', 'Pausa', 'Retorno', 'Fim', 'Total', 'Extra']],
                            body: [['---', '---', '---', '---', 'FOLGA', '00:00']],
                            startY: 45,
                            theme: 'grid',
                            headStyles: { fillColor: [79, 70, 229] }
                          });
                        } else {
                          const getPunchTime = (type: string) => {
                            const p = stats?.resolvedPunches?.[type as keyof typeof stats.resolvedPunches] || log.punches.find(punch => punch.type === type);
                            return p ? format(p.timestamp, 'HH:mm') : '--:--';
                          };

                          autoTable(doc, {
                            head: [['Entrada', 'Pausa', 'Retorno', 'Fim', 'Total', 'Extra']],
                            body: [[
                              getPunchTime('entrada'),
                              getPunchTime('pausa'),
                              getPunchTime('retorno'),
                              getPunchTime('fim'),
                              stats ? stats.total : '--:--',
                              stats?.extra ? stats.extra : '00:00'
                            ]],
                            startY: 45,
                            theme: 'grid',
                            headStyles: { fillColor: [79, 70, 229] }
                          });
                        }

                        if (log.damages && log.damages.length > 0) {
                          const finalY = (doc as any).lastAutoTable.finalY || 45;
                          doc.setFontSize(14);
                          doc.text('Fotos e Ocorrências', 14, finalY + 15);
                          let currentY = finalY + 22;

                          for (const damage of log.damages) {
                            doc.setFontSize(10);
                            doc.text(`${damage.description} (${format(damage.timestamp, 'HH:mm')})`, 14, currentY);
                            try {
                              const base64 = await getBase64FromUrl(damage.photoUrl);
                              if (base64) {
                                doc.addImage(base64, 'JPEG', 14, currentY + 2, 40, 30);
                                currentY += 38;
                              } else {
                                currentY += 10;
                              }
                            } catch (e) {
                              console.error("Error adding image to PDF:", e);
                              currentY += 10;
                            }
                          }
                        }

                        doc.save(`ponto_${log.carPrefix || 'sem_prefixo'}_${log.date}.pdf`);
                      }}
                      className="p-1 text-slate-300 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      title="Exportar PDF do Dia"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setDeletingLog(log)}
                      className="p-1 text-slate-300 dark:text-slate-600 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                      title="Excluir Registro"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {!log.isDayOff ? (
                  <div className="grid grid-cols-4 gap-2">
                    {['entrada', 'pausa', 'retorno', 'fim'].map(type => {
                      const punch = log.punches.find(p => p.type === type);
                      return (
                        <div key={type} className="flex flex-col items-center">
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter mb-1">{type}</span>
                          <span className={cn(
                            "text-[11px] font-mono font-bold px-1 py-1 rounded-md w-full text-center transition-colors",
                            punch 
                              ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" 
                              : "bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-700"
                          )}>
                            {punch ? format(punch.timestamp, 'HH:mm') : '--:--'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-2 px-4 bg-amber-50/50 dark:bg-amber-900/10 rounded-xl border border-dashed border-amber-200 dark:border-amber-800/50 text-center">
                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest">Dia de Descanso / Folga</p>
                  </div>
                )}

                    {log.damages && log.damages.length > 0 && (
                      <div className="pt-3 border-t border-slate-50 dark:border-slate-800/50 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                          <span className="text-[9px] font-bold text-rose-500 uppercase tracking-widest">
                            {log.damages.length} {log.damages.length === 1 ? 'Avaria' : 'Avarias'}
                          </span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                          {log.damages.map(damage => (
                            <div key={damage.id} className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm relative group">
                              {damage.photoUrl && (
                                <>
                                  <img 
                                    src={damage.photoUrl} 
                                    alt="Avaria" 
                                    className="w-full h-full object-cover cursor-pointer" 
                                    onClick={() => setEnlargedPhoto(damage.photoUrl)} 
                                    referrerPolicy="no-referrer" 
                                  />
                                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingPhoto({ log, damageId: damage.id });
                                    }}
                                    className="absolute top-1 right-1 bg-rose-600 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
              </div>
            ))
          )
        )
      }
      </div>
      
      {/* Edit Modal */}
      {editingLog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">Editar Registro</h3>
              <button onClick={() => setEditingLog(null)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Prefixo</span>
                <input 
                  type="text" 
                  value={editPrefix}
                  onChange={(e) => setEditPrefix(e.target.value)}
                  placeholder="Nº Prefixo"
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none w-32 text-right"
                />
              </div>
              {['entrada', 'pausa', 'retorno', 'fim'].map(type => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">{type}</span>
                  <input 
                    type="time" 
                    value={editTimes[type] || ''}
                    onChange={(e) => setEditTimes(prev => ({ ...prev, [type]: e.target.value }))}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              ))}
            </div>

            <button 
              onClick={() => {
                if (editingLog) {
                  const [year, month, day] = editingLog.date.split('-').map(Number);
                  const newPunches: Punch[] = [];
                  
                  ['entrada', 'pausa', 'retorno', 'fim'].forEach(type => {
                    if (editTimes[type]) {
                      const [hours, minutes] = editTimes[type].split(':').map(Number);
                      const punchDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
                      newPunches.push({
                        id: Math.random().toString(36).substr(2, 9),
                        type: type as PunchType,
                        timestamp: punchDate.getTime(),
                        carPrefix: editPrefix
                      });
                    }
                  });
                  
                  const updatedLog = {
                    ...editingLog,
                    carPrefix: editPrefix,
                    punches: newPunches.sort((a, b) => a.timestamp - b.timestamp)
                  };
                  
                  setLogs(prev => prev.map(l => l.date === editingLog.date ? updatedLog : l));
                  saveLogToFirestore(updatedLog);
                  setEditingLog(null);
                }
              }}
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20"
            >
              Salvar Alterações
            </button>
          </motion.div>
        </div>
      )}

      {/* Delete Photo Modal */}
      {deletingPhoto && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Excluir Foto
              </h3>
              <button onClick={() => setDeletingPhoto(null)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Tem certeza que deseja excluir esta foto do relatório? Esta ação não pode ser desfeita.
            </p>

            <div className="flex gap-3">
              <button 
                onClick={() => setDeletingPhoto(null)}
                className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold py-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  if (user && deletingPhoto) {
                    setIsDeleting(true);
                    const { log, damageId } = deletingPhoto;
                    const updatedDamages = log.damages?.filter(d => d.id !== damageId) || [];
                    const updatedLog = { ...log, damages: updatedDamages };
                    
                    try {
                      // Optimistic update
                      setLogs(prev => prev.map(l => l.date === log.date ? updatedLog : l));
                      await saveLogToFirestore(updatedLog);
                      setToast({ message: "Foto excluída com sucesso!", type: 'success' });
                    } catch (error) {
                      console.error("Error deleting photo:", error);
                      setToast({ message: "Erro ao excluir foto.", type: 'error' });
                    } finally {
                      setIsDeleting(false);
                      setDeletingPhoto(null);
                    }
                  }
                }}
                disabled={isDeleting}
                className="flex-1 bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200 dark:shadow-rose-900/20 disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : "Excluir"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingLog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Excluir Relatório
              </h3>
              <button onClick={() => setDeletingLog(null)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Tem certeza que deseja excluir o relatório do dia <span className="font-bold text-slate-800 dark:text-slate-200">{format(parseISO(deletingLog.date), "dd/MM/yyyy")}</span>? Esta ação não pode ser desfeita.
            </p>

            <div className="flex gap-3">
              <button 
                onClick={() => setDeletingLog(null)}
                className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold py-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  if (user && deletingLog) {
                    setIsDeleting(true);
                    try {
                      // Optimistic update
                      setLogs(prev => prev.filter(l => l.date !== deletingLog.date));
                      setToast({ message: "Relatório excluído com sucesso!", type: 'success' });
                    } catch (error) {
                      console.error("Delete error:", error);
                    } finally {
                      setIsDeleting(false);
                      setDeletingLog(null);
                    }
                  }
                }}
                disabled={isDeleting}
                className="flex-1 bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200 dark:shadow-rose-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait"
              >
                {isDeleting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Excluir
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function SettingsView({ 
  settings, 
  setSettings,
  alarmAudioRef,
  setIsAudioUnlocked,
  notificationPermission,
  requestNotificationPermission,
  logs,
  setLogs,
  storageUsage,
  deferredPrompt,
  installApp,
  user,
  setToast,
  profileInputRef,
  processAICommand,
  pendingAIAlarm,
  setPendingAIAlarm,
  unlockAudio,
  desativarAlarme
}: { 
  settings: AppSettings, 
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
  alarmAudioRef: React.RefObject<HTMLAudioElement | null>,
  setIsAudioUnlocked: (u: boolean) => void,
  notificationPermission: NotificationPermission,
  requestNotificationPermission: () => Promise<void>,
  logs: DayLog[],
  setLogs: (l: DayLog[]) => void,
  storageUsage: string,
  deferredPrompt: any,
  installApp: () => void,
  user: any,
  setToast: (toast: { message: string, type: 'success' | 'error' | 'info' } | null) => void,
  profileInputRef: React.RefObject<HTMLInputElement | null>,
  processAICommand: (command: string) => Promise<void>,
  pendingAIAlarm: {message: string, timeStr: string, intentUrl: string} | null,
  setPendingAIAlarm: (val: {message: string, timeStr: string, intentUrl: string} | null) => void,
  unlockAudio: () => Promise<void>,
  desativarAlarme: () => void
}) {
  const saveSettings = () => {
    // This is now handled directly by setSettings in most places,
    // but we keep it for consistency if needed.
  };

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);

  const handleResetApp = async () => {
    try {
      // 1. Limpa o estado do React
      setLogs([]);
      setSettings(DEFAULT_SETTINGS);
      
      // 2. Limpa localStorage, sessionStorage e IndexedDB
      localStorage.clear();
      sessionStorage.clear();
      await clear();
      
      // 3. Força o recarregamento da página para o estado inicial
      setToast({ message: "App resetado com sucesso!", type: 'success' });
      setTimeout(() => {
        window.location.href = window.location.origin + window.location.pathname;
      }, 1500);
    } catch (e) {
      console.error("Erro ao resetar app", e);
      setToast({ message: "Erro ao resetar app!", type: 'error' });
      localStorage.clear();
      clear().catch(console.error);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  };

  const createNativeAlarm = (type: string, timeStr: string) => {
    if (!timeStr) {
      setToast({ message: "Defina um horário primeiro.", type: 'info' });
      return;
    }
    const [hour, minute] = timeStr.split(':');
    
    // Android Intent URL for setting an alarm natively
    const intentUrl = `intent://#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${hour};i.android.intent.extra.alarm.MINUTES=${minute};S.android.intent.extra.alarm.MESSAGE=Ponto Frota - ${type.toUpperCase()};B.android.intent.extra.alarm.SKIP_UI=false;end`;
    
    const link = document.createElement('a');
    link.href = intentUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-8"
    >
      {/* Reset Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Resetar Aplicativo
              </h3>
              <button onClick={() => setIsResetModalOpen(false)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              TEM CERTEZA ABSOLUTA? Isso apagará TODOS os registros, fotos e configurações permanentemente e resetará o app.
            </p>

            <div className="flex gap-3">
              <button 
                onClick={() => setIsResetModalOpen(false)}
                className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold py-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleResetApp}
                className="flex-1 bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200 dark:shadow-rose-900/20"
              >
                Resetar Tudo
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <h2 className="text-2xl font-bold">Configurações</h2>

      <section className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border-4 border-white dark:border-slate-800 shadow-md">
              {settings.profilePhoto ? (
                <img 
                  src={settings.profilePhoto} 
                  alt="Perfil" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-black text-slate-300 dark:text-slate-600">
                  {user?.displayName?.charAt(0) || user?.email?.charAt(0) || '?'}
                </div>
              )}
            </div>
            <button 
              onClick={() => profileInputRef.current?.click()}
              className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input 
              type="file" 
              accept="image/*" 
              capture="user"
              className="hidden" 
              ref={profileInputRef}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                      const canvas = document.createElement('canvas');
                      let width = img.width;
                      let height = img.height;
                      const maxSize = 300;

                      if (width > height) {
                        if (width > maxSize) {
                          height *= maxSize / width;
                          width = maxSize;
                        }
                      } else {
                        if (height > maxSize) {
                          width *= maxSize / height;
                          height = maxSize;
                        }
                      }

                      canvas.width = width;
                      canvas.height = height;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        const base64 = canvas.toDataURL('image/jpeg', 0.8);
                        setSettings(prev => ({ ...prev, profilePhoto: base64 }));
                        setToast({ message: "Foto de perfil atualizada!", type: 'success' });
                      }
                    };
                    img.src = event.target?.result as string;
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-black text-slate-800 dark:text-white truncate">
              {user?.displayName || user?.email?.split('@')[0] || 'Usuário'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
            <button 
              onClick={() => profileInputRef.current?.click()}
              className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Alterar foto de perfil
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-500 dark:text-slate-400 text-sm uppercase tracking-widest">Notificações do Sistema</h3>
          <button 
            onClick={() => {
              if (notificationPermission === 'default') {
                requestNotificationPermission();
              } else if (notificationPermission === 'denied') {
                setToast({ message: "As notificações foram bloqueadas pelo seu navegador. Por favor, ative-as nas configurações do site.", type: 'info' });
              } else {
                setSettings(prev => ({ ...prev, notificationsEnabled: !prev.notificationsEnabled }));
              }
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
              notificationPermission === 'granted'
                ? settings.notificationsEnabled
                  ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                : notificationPermission === 'denied'
                  ? "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
                  : "bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20"
            )}
          >
            {notificationPermission === 'granted' ? (
              settings.notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />
            ) : notificationPermission === 'denied' ? (
              <BellOff className="w-4 h-4" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
            {notificationPermission === 'granted' 
              ? settings.notificationsEnabled ? 'Ativadas' : 'Desativadas' 
              : notificationPermission === 'denied'
                ? 'Bloqueadas'
                : 'Ativar'}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {notificationPermission === 'granted' 
            ? 'Você pode desativar as notificações aqui se não quiser receber alertas visuais.'
            : 'Ative as notificações para receber alertas mesmo com o aplicativo em segundo plano ou com a tela bloqueada.'}
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="font-bold text-slate-500 dark:text-slate-400 text-sm uppercase tracking-widest">Tema do Aplicativo</h3>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
          <button 
            onClick={() => setSettings(prev => ({ ...prev, theme: 'light' }))}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all",
              settings.theme === 'light' 
                ? "bg-white text-indigo-600 shadow-sm" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Sun className="w-4 h-4" />
            Claro
          </button>
          <button 
            onClick={() => setSettings(prev => ({ ...prev, theme: 'dark' }))}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all",
              settings.theme === 'dark' 
                ? "bg-slate-700 text-white shadow-sm" 
                : "text-slate-500 hover:text-slate-400"
            )}
          >
            <Moon className="w-4 h-4" />
            Escuro
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-500 dark:text-slate-400 text-sm uppercase tracking-widest">Alarmes de Lembrete</h3>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                if (alarmAudioRef.current) {
                  alarmAudioRef.current.play().then(() => {
                    setIsAudioUnlocked(true);
                    setTimeout(() => {
                      alarmAudioRef.current?.pause();
                      if (alarmAudioRef.current) alarmAudioRef.current.currentTime = 0;
                    }, 3000);
                  }).catch(e => {
                    setToast({ message: "Clique na tela primeiro para permitir o som!", type: 'info' });
                  });
                }
              }}
              className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 transition-colors"
              title="Testar Som"
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <button 
              onClick={async () => {
                const isEnabling = !settings.alarmsEnabled;
                setSettings(prev => ({ ...prev, alarmsEnabled: isEnabling }));
                if (isEnabling) {
                  requestNotificationPermission();
                  await unlockAudio();
                } else {
                  desativarAlarme();
                }
              }}
              className={cn(
                "w-12 h-6 rounded-full p-1 transition-colors",
                settings.alarmsEnabled ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-800"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full transition-transform",
                settings.alarmsEnabled ? "translate-x-6" : "translate-x-0"
              )} />
            </button>
          </div>
        </div>
        
        {settings.alarmsEnabled && (
          <div className="grid grid-cols-1 gap-3">
            {pendingAIAlarm && (
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-indigo-700">
                <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
                  O navegador bloqueou a abertura automática do relógio. Clique abaixo para confirmar:
                </p>
                <a 
                  href={pendingAIAlarm.intentUrl}
                  onClick={() => setPendingAIAlarm(null)}
                  className="flex items-center justify-center gap-2 w-full py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Smartphone className="w-4 h-4" />
                  Confirmar: {pendingAIAlarm.message} às {pendingAIAlarm.timeStr}
                </a>
              </div>
            )}

            {(['entrada', 'pausa', 'retorno', 'fim'] as PunchType[]).map(type => (
              <div key={type} className="flex items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 transition-colors">
                <button 
                  onClick={() => {
                    const isEnabling = !settings.activeAlarms[type];
                    setSettings(prev => ({
                      ...prev,
                      activeAlarms: { ...prev.activeAlarms, [type]: isEnabling }
                    }));
                    
                    if (isEnabling) {
                      const timeStr = settings.alarmTimes[type];
                      const [hour, minute] = timeStr.split(':');
                      
                      // Ajuste fino: Adicionando parâmetros extras para maior compatibilidade
                      // B.android.intent.extra.alarm.VIBRATE=true: Garante que o alarme vibre
                      // S.android.intent.extra.alarm.MESSAGE: Nome do alarme
                      const intentUrl = `intent://#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${hour};i.android.intent.extra.alarm.MINUTES=${minute};S.android.intent.extra.alarm.MESSAGE=Ponto Frota - ${type.toUpperCase()};B.android.intent.extra.alarm.SKIP_UI=false;B.android.intent.extra.alarm.VIBRATE=true;end`;
                      
                      // Verifica se é um dispositivo Android antes de tentar disparar
                      if (/Android/i.test(navigator.userAgent)) {
                        window.location.href = intentUrl;
                        setPendingAIAlarm({ message: `Ponto Frota - ${type.toUpperCase()}`, timeStr, intentUrl });
                      } else {
                        setToast({ message: "O alarme nativo só funciona em dispositivos Android.", type: 'info' });
                      }
                    }
                  }}
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                    settings.activeAlarms[type] ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                  )}
                >
                  <Clock className="w-5 h-5" />
                </button>
                <div className="flex-1">
                  <p className="text-sm font-bold capitalize text-slate-800 dark:text-slate-100">{type}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Lembrar se não registrado</p>
                </div>
                <input 
                  type="time" 
                  value={settings.alarmTimes[type]}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    alarmTimes: { ...prev.alarmTimes, [type]: e.target.value }
                  }))}
                  className="bg-slate-50 dark:bg-slate-800 border-none rounded-lg px-3 py-2 text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-500"
                />
                <a
                  href={`intent://#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${settings.alarmTimes[type].split(':')[0]};i.android.intent.extra.alarm.MINUTES=${settings.alarmTimes[type].split(':')[1]};S.android.intent.extra.alarm.MESSAGE=Ponto Frota - ${type.toUpperCase()};B.android.intent.extra.alarm.SKIP_UI=false;B.android.intent.extra.alarm.VIBRATE=true;end`}
                  className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-200 transition-colors"
                  title="Testar Alarme"
                >
                  <Smartphone className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <div className="grid grid-cols-1 gap-3">
          <button 
            onClick={async () => {
              await signOut(auth);
            }}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold bg-rose-600 text-white shadow-lg shadow-rose-200 dark:shadow-none hover:bg-rose-700 transition-all"
          >
            Sair da Conta
          </button>

          {/* Botão de Instalação sempre visível */}
          <button 
            onClick={installApp}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all"
          >
            <Smartphone className="w-5 h-5" />
            Instalar Aplicativo no Celular
          </button>

          {/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as any).standalone && (
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800">
              <p className="text-indigo-700 dark:text-indigo-300 text-xs font-medium leading-relaxed flex items-center gap-2">
                <Smartphone className="w-4 h-4 flex-shrink-0" />
                Para instalar no iPhone: Toque no ícone de <strong>Compartilhar</strong> e depois em <strong>"Adicionar à Tela de Início"</strong>.
              </p>
            </div>
          )}




          <button 
            onClick={() => setIsResetModalOpen(true)}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-all border border-transparent hover:border-rose-200"
          >
            <Trash2 className="w-5 h-5" />
            Apagar Tudo e Resetar App
          </button>
        </div>
      </section>

      <section className="space-y-4 pt-6 mt-6 border-t border-slate-100 dark:border-slate-800">
        <h3 className="font-bold text-slate-500 dark:text-slate-400 text-sm uppercase tracking-widest">Informações do Sistema</h3>
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Versão do App</span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{APP_VERSION}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Domínio Atual</span>
            <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[180px]" title={window.location.hostname}>
              {window.location.hostname}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Armazenamento</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">{storageUsage}</span>
          </div>
          
          <div className="grid grid-cols-1 gap-2 mt-2">
            <button 
              onClick={async () => {
                try {
                  const response = await fetch(`${window.location.origin}${import.meta.env.BASE_URL}version.json?t=${Date.now()}`);
                  if (!response.ok) throw new Error('Network response was not ok');
                  const data = await response.json();
                  if (data.version !== APP_VERSION) {
                    setToast({ message: "Nova versão encontrada! Atualizando...", type: 'info' });
                    setTimeout(() => window.location.reload(), 1500);
                  } else {
                    setToast({ message: "Você já está na versão mais recente.", type: 'success' });
                  }
                } catch (e) {
                  setToast({ message: "Erro ao verificar atualizações.", type: 'error' });
                }
              }}
              className="py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3 h-3" />
              Verificar
            </button>
            <button 
              onClick={() => setShowClearCacheConfirm(true)}
              className="py-2.5 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-3 h-3" />
              Limpar Cache
            </button>
          </div>
        </div>
      </section>

      <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 transition-colors">
        <p className="text-indigo-700 dark:text-indigo-300 text-sm font-medium leading-relaxed">
          Os prefixos configurados aqui estarão disponíveis para seleção rápida na tela principal e nos filtros de relatórios.
        </p>
      </div>

      {/* Modal de Limpar Cache */}
      <AnimatePresence>
        {showClearCacheConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-700"
            >
              <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mb-4 mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white text-center mb-2">
                Limpar Cache?
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-center text-sm mb-6">
                Isso irá limpar todo o cache do navegador, forçar a atualização do aplicativo e deslogar você. Deseja continuar?
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowClearCacheConfirm(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={async () => {
                    try {
                      if ('serviceWorker' in navigator) {
                        const registrations = await navigator.serviceWorker.getRegistrations();
                        for (const registration of registrations) {
                          await registration.unregister();
                        }
                      }
                      if ('caches' in window) {
                        const cacheNames = await caches.keys();
                        await Promise.all(cacheNames.map(name => caches.delete(name)));
                      }
                      window.location.reload();
                    } catch (err) {
                      setToast({ message: "Erro ao limpar cache.", type: 'error' });
                      setShowClearCacheConfirm(false);
                    }
                  }}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200 dark:shadow-none"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
