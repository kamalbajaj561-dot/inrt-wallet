import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { marketQuickActions, resolveMarketAnswer } from '../lib/indianMarketKnowledge';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type SpeechRecognitionType = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionType;

type SpeechRecognitionEvent = {
  results: ArrayLike<{
    0: {
      transcript: string;
    };
  }>;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const SYSTEM_PROMPT = `You are JARVIS for INRT Wallet.

You help users with:
- Indian share market learning (NSE/BSE, fundamentals, technicals, options, risk, taxation)
- Sending & receiving money via UPI
- Checking balance and transactions
- KYC verification steps
- Bill payments and recharges
- Cashback and rewards

Style:
- crisp, practical, and safety-first
- avoid hype or guaranteed return claims
- never request PIN/password/OTP
- for market questions, explain with examples and risk controls`;

export default function AIAssistant({ onClose }: { onClose: () => void }) {
  const { userProfile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Namaste ${userProfile?.name?.split(' ')[0] || 'there'}! 👋 I'm JARVIS — your voice-enabled assistant for INRT Wallet + Indian share market learning. Ask by typing or tap mic to speak.`
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceSupported(false);
      return;
    }

    setVoiceSupported(true);
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript || '';
      setInput(transcript.trim());
    };

    recognition.onerror = () => {
      setListening(false);
      setMessages(m => [...m, { role: 'assistant', content: '🎙️ Voice capture failed. Please try again or type your question.' }]);
    };

    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;

    return () => recognition.stop();
  }, []);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text.replace(/\n/g, ' '));
    utterance.lang = 'en-IN';
    utterance.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', content: userMsg }]);

    const knowledgeReply = resolveMarketAnswer(userMsg);
    if (knowledgeReply) {
      setMessages(m => [...m, { role: 'assistant', content: knowledgeReply }]);
      speak(knowledgeReply);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMsg }
          ],
        }),
      });

      const data = await response.json();
      const reply = data.content?.[0]?.text || 'Sorry, I could not process that. Please try again.';
      setMessages(m => [...m, { role: 'assistant', content: reply }]);
      speak(reply);
    } catch (e) {
      const fallback = '⚠️ Connection error. Please check your internet and try again.';
      setMessages(m => [...m, { role: 'assistant', content: fallback }]);
    }
    setLoading(false);
  };

  const startListening = () => {
    if (!recognitionRef.current || listening) return;
    setListening(true);
    recognitionRef.current.start();
  };

  const quickReplies = [
    ...marketQuickActions,
    'How do I send money?',
    'Why is my KYC pending?',
  ];

  return (
    <div style={s.overlay}>
      <div style={s.panel}>
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={s.avatar}>🧠</div>
            <div>
              <p style={s.name}>JARVIS Assistant</p>
              <p style={s.online}>● Online · Voice + Market Mode</p>
            </div>
          </div>
          <button onClick={onClose} style={s.close}>✕</button>
        </div>

        <div style={s.messages}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
              {m.role === 'assistant' && <div style={s.botIcon}>🧠</div>}
              <div style={m.role === 'user' ? s.userBubble : s.botBubble}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <div style={s.botIcon}>🧠</div>
              <div style={{ ...s.botBubble, padding: '12px 16px' }}>
                <span style={{ letterSpacing: 4, animation: 'pulse 1s infinite' }}>• • •</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length <= 3 && (
          <div style={s.quickRow}>
            {quickReplies.map(q => (
              <button key={q} style={s.quickBtn} onClick={() => { setInput(q); }}>
                {q}
              </button>
            ))}
          </div>
        )}

        <div style={s.inputRow}>
          <input
            style={s.input}
            placeholder="Ask JARVIS about Indian stock market or payments..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
          />
          <button
            style={{ ...s.voiceBtn, opacity: voiceSupported ? 1 : 0.5 }}
            onClick={startListening}
            disabled={!voiceSupported || listening}
            title={voiceSupported ? 'Speak your question' : 'Voice not supported in this browser'}
          >
            {listening ? '🎙️' : '🎤'}
          </button>
          <button style={s.sendBtn} onClick={sendMessage} disabled={loading || !input.trim()}>
            ➤
          </button>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 480, height: '80vh', background: '#fff', borderRadius: '24px 24px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: '16px 20px', background: 'linear-gradient(135deg, #001a2e, #002a45)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,185,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 },
  name: { color: '#fff', fontWeight: 700, fontSize: 15 },
  online: { color: '#4ade80', fontSize: 11 },
  close: { background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 14 },
  messages: { flex: 1, overflowY: 'auto', padding: '16px 16px 8px' },
  botIcon: { width: 28, height: 28, borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, marginRight: 8, flexShrink: 0, alignSelf: 'flex-end' },
  botBubble: { whiteSpace: 'pre-wrap', background: '#f1f5f9', borderRadius: '18px 18px 18px 4px', padding: '12px 16px', maxWidth: '78%', fontSize: 14, color: '#111', lineHeight: 1.5 },
  userBubble: { whiteSpace: 'pre-wrap', background: 'linear-gradient(135deg, #00b9f1, #0090c0)', borderRadius: '18px 18px 4px 18px', padding: '12px 16px', maxWidth: '78%', fontSize: 14, color: '#fff', lineHeight: 1.5 },
  quickRow: { display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 16px 8px' },
  quickBtn: { flexShrink: 0, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 20, padding: '7px 14px', fontSize: 12, color: '#0369a1', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },
  inputRow: { display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid #f1f5f9' },
  input: { flex: 1, border: '2px solid #e5e7eb', borderRadius: 20, padding: '12px 16px', fontSize: 14, outline: 'none', fontFamily: 'inherit' },
  voiceBtn: { width: 44, height: 44, background: '#111827', border: 'none', borderRadius: '50%', color: '#fff', fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  sendBtn: { width: 44, height: 44, background: '#00b9f1', border: 'none', borderRadius: '50%', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
