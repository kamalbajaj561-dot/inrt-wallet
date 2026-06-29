/**
 * INRT Wallet — CryptoPage.tsx
 * Complete self-custody Polygon wallet built into the app.
 * Users NEVER need MetaMask — INRT Wallet IS the wallet.
 *
 * Tabs: Wallet | Send | Receive | History | About
 * Replace: src/pages/CryptoPage.tsx
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate }                  from 'react-router-dom';
import { useAuth }                      from '../context/AuthContext';
import { doc, onSnapshot }              from 'firebase/firestore';
import { db as firestoreDb }            from '../lib/firebase';

const API = import.meta.env.VITE_API_URL || '';
const CONTRACT = import.meta.env.VITE_INRT_CONTRACT_ADDRESS || '0x7d5c6bc8ce5677d9101aaa4d585b3ddf6f9e0d09';

// ── Design tokens ─────────────────────────────────────────────
const bg       = '#050914';
const card     = 'rgba(255,255,255,0.04)';
const border   = 'rgba(255,255,255,0.08)';
const white    = '#fff';
const muted    = 'rgba(255,255,255,0.45)';
const dim      = 'rgba(255,255,255,0.2)';
const purple   = '#7B2FBE';
const purpleL  = '#E0B0FF';
const poly     = '#8247E5';
const teal     = '#00e5cc';
const green    = '#00C853';
const orange   = '#FF9500';
const red      = '#FF3B30';

type Tab = 'wallet' | 'send' | 'receive' | 'history' | 'about';
type SendMode = 'inrt' | 'polygon';
type SendStep = 'form' | 'review' | 'pin' | 'processing' | 'done' | 'failed';

// ── PIN Pad ────────────────────────────────────────────────────
function PinPad({ title, onComplete, onCancel }: { title: string; onComplete: (pin: string) => void; onCancel: () => void }) {
  const [pin, setPin] = useState<string[]>([]);
  const tap = (d: string) => {
    if (pin.length >= 6) return;
    const next = [...pin, d];
    setPin(next);
    if (next.length === 6) setTimeout(() => onComplete(next.join('')), 200);
  };
  return (
    <div style={{ textAlign: 'center' as const }}>
      <p style={{ color: muted, fontSize: 14, margin: '0 0 6px' }}>{title}</p>
      <p style={{ color: dim, fontSize: 12, margin: '0 0 20px' }}>Enter 6-digit PIN</p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 28 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? purple : 'rgba(255,255,255,0.1)', transition: 'background 0.15s' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, maxWidth: 240, margin: '0 auto 16px' }}>
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k, i) => (
          <button key={i}
            onClick={() => k === '⌫' ? setPin(p => p.slice(0, -1)) : k !== '' && tap(String(k))}
            style={{ height: 56, borderRadius: 14, border: '1px solid ' + border, background: k === '' ? 'transparent' : card, fontSize: k === '⌫' ? 20 : 22, fontWeight: 700, color: white, cursor: k === '' ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            {k}
          </button>
        ))}
      </div>
      <button onClick={onCancel} style={{ background: 'none', border: 'none', color: muted, fontSize: 13, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Cancel</button>
    </div>
  );
}

// ── Recovery phrase display ────────────────────────────────────
function RecoveryPhrase({ phrase, onConfirm }: { phrase: string; onConfirm: () => void }) {
  const words = phrase.split(' ');
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)', borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
        <p style={{ color: red, fontWeight: 700, fontSize: 13, margin: '0 0 6px' }}>⚠️ Write these 12 words on paper</p>
        <p style={{ color: muted, fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          These words are the ONLY way to recover your wallet. Never share them. Never screenshot them. Write them on paper and store safely.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
        {words.map((word, i) => (
          <div key={i} style={{ background: card, border: '1px solid ' + border, borderRadius: 10, padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: dim, fontSize: 11, minWidth: 16 }}>{i + 1}.</span>
            <span style={{ color: white, fontWeight: 700, fontSize: 13 }}>{word}</span>
          </div>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20, cursor: 'pointer' }}>
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16 }} />
        <span style={{ color: muted, fontSize: 13, lineHeight: 1.5 }}>I have written down all 12 words in order and stored them safely.</span>
      </label>
      <button onClick={onConfirm} disabled={!confirmed}
        style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: confirmed ? 'linear-gradient(135deg,' + poly + ',' + purple + ')' : 'rgba(255,255,255,0.06)', color: confirmed ? white : dim, fontWeight: 700, fontSize: 15, cursor: confirmed ? 'pointer' : 'not-allowed', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
        I've Saved My Recovery Phrase →
      </button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function CryptoPage() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  // ── State ────────────────────────────────────────────────────
  const [profile,      setProfile]      = useState<any>(null);
  const [ready,        setReady]        = useState(false);
  const [tab,          setTab]          = useState<Tab>('wallet');

  // Wallet creation
  const [creating,     setCreating]     = useState(false);
  const [createStep,   setCreateStep]   = useState<'intro'|'pin'|'phrase'|'done'>('intro');
  const [mnemonic,     setMnemonic]     = useState('');
  const [createErr,    setCreateErr]    = useState('');

  // Balances
  const [onChainBal,   setOnChainBal]   = useState<number|null>(null);
  const [maticBal,     setMaticBal]     = useState<number|null>(null);
  const [totalSupply,  setTotalSupply]  = useState<number|null>(null);
  const [balLoading,   setBalLoading]   = useState(false);

  // Send
  const [sendMode,     setSendMode]     = useState<SendMode>('inrt');
  const [sendStep,     setSendStep]     = useState<SendStep>('form');
  const [toAddress,    setToAddress]    = useState('');
  const [recipient,    setRecipient]    = useState<{name:string;verified:boolean}|null>(null);
  const [lookupErr,    setLookupErr]    = useState('');
  const [lookupLoad,   setLookupLoad]   = useState(false);
  const [sendAmt,      setSendAmt]      = useState('');
  const [sendNote,     setSendNote]     = useState('');
  const [sendErr,      setSendErr]      = useState('');
  const [txHash,       setTxHash]       = useState('');
  const [elapsed,      setElapsed]      = useState(0);
  const [durationMs,   setDurationMs]   = useState(0);
  const [txRef,        setTxRef]        = useState('');
  const pollRef  = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // History
  const [history,      setHistory]      = useState<any[]>([]);
  const [histLoad,     setHistLoad]     = useState(false);

  // ── Subscribe to Firestore ────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(firestoreDb, 'users', user.uid), snap => {
      if (snap.exists()) { setProfile(snap.data()); setReady(true); }
    });
    return () => unsub();
  }, [user?.uid]);

  const inrtBal      = Number(profile?.inrtBalance   ?? 0);
  const polygonWallet = profile?.polygonWallet        || null;
  const hasWallet    = !!polygonWallet;

  // ── Load on-chain balance ─────────────────────────────────────
  const loadBalances = async () => {
    if (!polygonWallet || !user?.uid) return;
    setBalLoading(true);
    try {
      const r = await fetch(`${API}/wallet/balance/${user.uid}`);
      const d = await r.json();
      if (d.onChainBalance !== undefined) setOnChainBal(d.onChainBalance);
      if (d.maticBalance   !== undefined) setMaticBal(d.maticBalance);
    } catch {}
    try {
      const r2 = await fetch(`${API}/polygon/supply`);
      const d2 = await r2.json();
      if (d2.totalSupply !== undefined) setTotalSupply(d2.totalSupply);
    } catch {}
    setBalLoading(false);
  };

  useEffect(() => { if (hasWallet) loadBalances(); }, [hasWallet, polygonWallet]);

  // ── Load history ──────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'history' || !user?.uid) return;
    setHistLoad(true);
    const url = polygonWallet
      ? `${API}/wallet/history/${polygonWallet}`
      : `${API}/inrt/history/${user.uid}`;
    fetch(url).then(r => r.json()).then(d => setHistory(d.transactions || [])).catch(() => {}).finally(() => setHistLoad(false));
  }, [tab, user?.uid, polygonWallet]);

  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(timerRef.current); }, []);

  // ── INRT address lookup ───────────────────────────────────────
  useEffect(() => {
    if (sendMode !== 'inrt') return;
    const addr = toAddress.toUpperCase().trim();
    if (addr.length < 15) { setRecipient(null); setLookupErr(''); return; }
    setLookupLoad(true); setLookupErr(''); setRecipient(null);
    const t = setTimeout(() => {
      fetch(`${API}/inrt/lookup/${addr}`)
        .then(r => r.json())
        .then(d => { if (d.success) setRecipient({ name: d.name, verified: d.verified }); else setLookupErr(d.error || 'Not found'); })
        .catch(() => setLookupErr('Lookup failed'))
        .finally(() => setLookupLoad(false));
    }, 500);
    return () => clearTimeout(t);
  }, [toAddress, sendMode]);

  // ── Create wallet ─────────────────────────────────────────────
  const handleCreateWallet = async (pin: string) => {
    setCreating(true); setCreateErr('');
    try {
      const r = await fetch(`${API}/wallet/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user!.uid, pin }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Wallet creation failed');
      setMnemonic(d.mnemonic);
      setCreateStep('phrase');
    } catch (e: any) { setCreateErr(e.message); setCreateStep('intro'); }
    setCreating(false);
  };

  // ── Send INRT (internal) ──────────────────────────────────────
  const handleSendInrt = async () => {
    setSendErr('');
    try {
      const r = await fetch(`${API}/inrt/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromUserId: user!.uid, toAddress, amount: parseFloat(sendAmt), note: sendNote }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Send failed');
      setTxRef(d.ref);
      setSendStep('processing');
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 100), 100);
      pollRef.current = setInterval(async () => {
        try {
          const pr = await fetch(`${API}/inrt/transfer/${d.ref}`);
          const pd = await pr.json();
          if (pd.status === 'completed') {
            clearInterval(pollRef.current); clearInterval(timerRef.current);
            setDurationMs(pd.durationMs); setSendStep('done');
          } else if (pd.status === 'failed') {
            clearInterval(pollRef.current); clearInterval(timerRef.current);
            setSendStep('failed');
          }
        } catch {}
      }, 300);
    } catch (e: any) { setSendErr(e.message); setSendStep('review'); }
  };

  // ── Send on-chain (Polygon) ───────────────────────────────────
  const handleSendOnChain = async (pin: string) => {
    setSendErr(''); setSendStep('processing'); setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(e => e + 100), 100);
    try {
      const r = await fetch(`${API}/wallet/send-onchain`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user!.uid, toAddress, amount: parseFloat(sendAmt), note: sendNote, pin }),
      });
      const d = await r.json();
      clearInterval(timerRef.current);
      if (!r.ok) throw new Error(d.error || 'Transaction failed');
      setTxHash(d.txHash);
      setDurationMs(elapsed);
      setSendStep('done');
    } catch (e: any) {
      clearInterval(timerRef.current);
      setSendErr(e.message);
      setSendStep('failed');
    }
  };

  const resetSend = () => {
    setSendStep('form'); setToAddress(''); setSendAmt(''); setSendNote('');
    setRecipient(null); setTxRef(''); setTxHash(''); setSendErr(''); setElapsed(0); setDurationMs(0);
    clearInterval(pollRef.current); clearInterval(timerRef.current);
  };

  const fmtMs   = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  const short   = (addr: string) => addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '';
  const isValid0x = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr.trim());

  if (!ready) return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '3px solid rgba(130,71,229,0.2)', borderTopColor: poly, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: bg, fontFamily: "'Plus Jakarta Sans',sans-serif", paddingBottom: 40 }}>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(160deg,' + poly + ' 0%,' + purple + ' 55%,' + bg + ' 100%)', padding: '52px 20px 28px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, width: 38, height: 38, color: white, cursor: 'pointer', fontSize: 18 }}>←</button>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0 }}>Polygon Mainnet</p>
            <h1 style={{ color: white, fontSize: 20, fontWeight: 800, margin: 0, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>INRT Wallet</h1>
          </div>
          {hasWallet && (
            <div style={{ marginLeft: 'auto', background: 'rgba(0,200,83,0.15)', border: '1px solid rgba(0,200,83,0.3)', borderRadius: 20, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: green }} />
              <span style={{ color: green, fontSize: 11, fontWeight: 700 }}>Connected</span>
            </div>
          )}
        </div>

        {hasWallet ? (
          <div style={{ textAlign: 'center' as const }}>
            <p style={{ color: 'rgba(224,176,255,0.5)', fontSize: 11, margin: '0 0 6px', letterSpacing: 1 }}>TOTAL INRT BALANCE</p>
            <p style={{ color: white, fontSize: 44, fontWeight: 800, margin: '0 0 4px', fontFamily: "'Plus Jakarta Sans',sans-serif", lineHeight: 1 }}>
              {inrtBal.toLocaleString('en-IN')}
            </p>
            <p style={{ color: 'rgba(224,176,255,0.5)', fontSize: 14, margin: '0 0 14px' }}>INRT · ≈ ₹{inrtBal.toLocaleString('en-IN')}</p>
            <p style={{ color: dim, fontSize: 11, fontFamily: 'monospace', margin: 0 }}>{polygonWallet}</p>
          </div>
        ) : (
          <div style={{ textAlign: 'center' as const }}>
            <p style={{ color: purpleL, fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>🔐 No wallet yet</p>
            <p style={{ color: muted, fontSize: 13, margin: 0 }}>Create your built-in Polygon wallet below</p>
          </div>
        )}
      </div>

      {/* ── TABS ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, padding: '12px 16px 0', overflowX: 'auto' as const, background: bg }}>
        {(['wallet','send','receive','history','about'] as Tab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'send') resetSend(); }}
            style={{ padding: '8px 14px', borderRadius: 20, border: '1.5px solid ' + (tab === t ? purple : border), background: tab === t ? purple : 'transparent', color: tab === t ? white : muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: "'Plus Jakarta Sans',sans-serif", flexShrink: 0 }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ padding: '14px 16px' }}>

        {/* ══════════ WALLET TAB ══════════ */}
        {tab === 'wallet' && !hasWallet && (
          <div>
            {createStep === 'intro' && (
              <div>
                <div style={{ background: card, border: '1px solid ' + border, borderRadius: 18, padding: '24px 16px', marginBottom: 14, textAlign: 'center' as const }}>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>🔐</div>
                  <p style={{ color: white, fontWeight: 800, fontSize: 18, margin: '0 0 8px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Create Your INRT Wallet</p>
                  <p style={{ color: muted, fontSize: 13, margin: '0 0 20px', lineHeight: 1.7 }}>
                    Generate a secure Polygon wallet built directly into INRT Wallet. No MetaMask needed. You own your keys.
                  </p>
                  {[
                    ['🔑', 'Self-custody', 'Your private key, encrypted with your PIN'],
                    ['📝', 'Recovery phrase', '12 words to restore your wallet anywhere'],
                    ['🌍', 'Global transfers', 'Send INRT to any wallet in the world'],
                    ['⛓️', 'On blockchain', 'Every transaction on Polygon forever'],
                  ].map(([icon, title, desc]) => (
                    <div key={title as string} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'left' as const }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                      <div>
                        <p style={{ color: white, fontWeight: 700, fontSize: 13, margin: 0 }}>{title as string}</p>
                        <p style={{ color: muted, fontSize: 12, margin: '2px 0 0' }}>{desc as string}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {createErr && <p style={{ color: red, fontSize: 13, marginBottom: 12, textAlign: 'center' as const }}>{createErr}</p>}
                <button onClick={() => setCreateStep('pin')}
                  style={{ width: '100%', padding: '18px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,' + poly + ',' + purple + ')', color: white, fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", boxShadow: '0 8px 24px rgba(130,71,229,0.4)' }}>
                  🔐 Create My Wallet
                </button>
              </div>
            )}

            {createStep === 'pin' && (
              <div style={{ background: card, border: '1px solid ' + border, borderRadius: 18, padding: '24px 16px' }}>
                <p style={{ color: white, fontWeight: 800, fontSize: 16, margin: '0 0 6px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Set Wallet PIN</p>
                <p style={{ color: muted, fontSize: 12, margin: '0 0 20px', lineHeight: 1.6 }}>This PIN encrypts your private key. You'll need it to send transactions. Don't forget it.</p>
                {creating ? (
                  <div style={{ textAlign: 'center' as const, padding: 32 }}>
                    <div style={{ width: 48, height: 48, border: '4px solid rgba(130,71,229,0.15)', borderTopColor: poly, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: muted, fontSize: 14 }}>Generating secure wallet…</p>
                  </div>
                ) : (
                  <PinPad title="Choose a 6-digit PIN" onComplete={handleCreateWallet} onCancel={() => setCreateStep('intro')} />
                )}
              </div>
            )}

            {createStep === 'phrase' && mnemonic && (
              <div style={{ background: card, border: '1px solid ' + border, borderRadius: 18, padding: '20px 16px' }}>
                <p style={{ color: white, fontWeight: 800, fontSize: 16, margin: '0 0 4px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Your Recovery Phrase</p>
                <p style={{ color: muted, fontSize: 12, margin: '0 0 16px' }}>Write these 12 words on paper — in order</p>
                <RecoveryPhrase phrase={mnemonic} onConfirm={() => setCreateStep('done')} />
              </div>
            )}

            {createStep === 'done' && (
              <div style={{ textAlign: 'center' as const, padding: '40px 0' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(0,200,83,0.1)', border: '2px solid ' + green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, margin: '0 auto 20px' }}>✅</div>
                <p style={{ color: white, fontWeight: 800, fontSize: 20, margin: '0 0 8px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Wallet Created!</p>
                <p style={{ color: muted, fontSize: 14, margin: '0 0 24px' }}>Your Polygon wallet is ready. Reload to see your wallet.</p>
                <button onClick={() => window.location.reload()}
                  style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,' + poly + ',' + purple + ')', color: white, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Open My Wallet →
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'wallet' && hasWallet && (
          <div>
            {/* Balance cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'rgba(130,71,229,0.12)', border: '1px solid rgba(130,71,229,0.3)', borderRadius: 16, padding: '16px' }}>
                <p style={{ color: purpleL, fontSize: 10, margin: '0 0 6px', letterSpacing: 0.5, fontWeight: 700 }}>ON-CHAIN INRT</p>
                <p style={{ color: white, fontSize: 22, fontWeight: 800, margin: '0 0 2px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  {balLoading ? '…' : onChainBal !== null ? onChainBal.toLocaleString() : '—'}
                </p>
                <p style={{ color: dim, fontSize: 10, margin: 0 }}>On Polygon</p>
              </div>
              <div style={{ background: card, border: '1px solid ' + border, borderRadius: 16, padding: '16px' }}>
                <p style={{ color: muted, fontSize: 10, margin: '0 0 6px', letterSpacing: 0.5, fontWeight: 700 }}>INTERNAL INRT</p>
                <p style={{ color: white, fontSize: 22, fontWeight: 800, margin: '0 0 2px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  {inrtBal.toLocaleString()}
                </p>
                <p style={{ color: dim, fontSize: 10, margin: 0 }}>In-app balance</p>
              </div>
            </div>

            {/* Wallet address */}
            <div style={{ background: card, border: '1px solid ' + border, borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
              <p style={{ color: muted, fontSize: 10, fontWeight: 700, margin: '0 0 6px', letterSpacing: 0.5 }}>YOUR POLYGON WALLET</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <p style={{ color: white, fontSize: 13, fontFamily: 'monospace', margin: 0, flex: 1, wordBreak: 'break-all' as const }}>{polygonWallet}</p>
                <button onClick={() => navigator.clipboard.writeText(polygonWallet).then(() => alert('Copied!'))}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid ' + border, borderRadius: 8, padding: '6px 10px', color: teal, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Copy
                </button>
              </div>
              <a href={'https://polygonscan.com/address/' + polygonWallet} target="_blank" rel="noopener noreferrer"
                style={{ color: poly, fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'block', marginTop: 8 }}>
                🔍 View on Polygonscan →
              </a>
            </div>

            {/* MATIC balance */}
            {maticBal !== null && (
              <div style={{ background: 'rgba(255,149,0,' + (maticBal < 0.01 ? '0.1' : '0.04') + ')', border: '1px solid rgba(255,149,0,' + (maticBal < 0.01 ? '0.3' : '0.1') + ')', borderRadius: 14, padding: '12px 16px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ color: muted, fontSize: 10, fontWeight: 700, margin: '0 0 2px', letterSpacing: 0.5 }}>MATIC (GAS FEES)</p>
                    <p style={{ color: white, fontWeight: 700, fontSize: 14, margin: 0 }}>{maticBal} MATIC</p>
                  </div>
                  {maticBal < 0.01 && <span style={{ color: orange, fontSize: 11, fontWeight: 700 }}>⚠️ Low — buy on WazirX</span>}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { icon: '📤', label: 'Send',    onClick: () => setTab('send')    },
                { icon: '📥', label: 'Receive', onClick: () => setTab('receive') },
                { icon: '🪙', label: 'Buy INRT',onClick: () => navigate('/checkout') },
              ].map(btn => (
                <button key={btn.label} onClick={btn.onClick}
                  style={{ background: card, border: '1px solid ' + border, borderRadius: 14, padding: '14px 8px', cursor: 'pointer', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 22 }}>{btn.icon}</span>
                  <span style={{ color: white, fontSize: 12, fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{btn.label}</span>
                </button>
              ))}
            </div>

            <button onClick={loadBalances} style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 10, border: '1px solid ' + border, background: 'transparent', color: muted, fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              🔄 Refresh Balances
            </button>
          </div>
        )}

        {/* ══════════ SEND TAB ══════════ */}
        {tab === 'send' && (
          <div>
            {/* Send mode toggle */}
            {sendStep === 'form' && (
              <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 4, border: '1px solid ' + border }}>
                {([['inrt','🏠 INRT Address'],['polygon','⛓️ Polygon (0x)']] as [SendMode, string][]).map(([m, l]) => (
                  <button key={m} onClick={() => { setSendMode(m); setToAddress(''); setRecipient(null); setLookupErr(''); }}
                    style={{ flex: 1, padding: '11px', borderRadius: 11, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: "'Plus Jakarta Sans',sans-serif", background: sendMode === m ? 'linear-gradient(135deg,' + poly + ',' + purple + ')' : 'transparent', color: sendMode === m ? white : muted }}>
                    {l}
                  </button>
                ))}
              </div>
            )}

            {/* Form */}
            {sendStep === 'form' && (
              <div style={{ background: card, border: '1px solid ' + border, borderRadius: 18, padding: '18px 16px' }}>
                <p style={{ color: muted, fontSize: 12, margin: '0 0 4px' }}>
                  {sendMode === 'inrt' ? 'Balance: ' + inrtBal.toLocaleString() + ' INRT' : hasWallet ? 'Your wallet: ' + short(polygonWallet) : 'Create a wallet first'}
                </p>

                {sendMode === 'inrt' ? (
                  <>
                    <p style={{ color: muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 8px' }}>RECIPIENT INRT ADDRESS</p>
                    <input value={toAddress} onChange={e => setToAddress(e.target.value.toUpperCase())} placeholder="INRT-XXXX-XXXX-XXXX" maxLength={20}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1.5px solid ' + border, borderRadius: 12, padding: '13px 14px', color: white, fontSize: 15, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 8, letterSpacing: 1 }} />
                    {lookupLoad && <p style={{ color: muted, fontSize: 12, margin: '0 0 10px' }}>🔍 Looking up…</p>}
                    {lookupErr  && <p style={{ color: red,   fontSize: 12, margin: '0 0 10px' }}>⚠️ {lookupErr}</p>}
                    {recipient  && (
                      <div style={{ background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 16 }}>✅</span>
                        <div>
                          <p style={{ color: white, fontWeight: 700, fontSize: 13, margin: 0 }}>{recipient.name}</p>
                          <p style={{ color: green, fontSize: 11, margin: 0 }}>{recipient.verified ? 'KYC Verified ✓' : 'Address confirmed'}</p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {!hasWallet && (
                      <div style={{ background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.2)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                        <p style={{ color: orange, fontWeight: 700, fontSize: 13, margin: '0 0 6px' }}>⚠️ Create wallet first</p>
                        <button onClick={() => setTab('wallet')} style={{ background: 'none', border: 'none', color: teal, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Go to Wallet tab →</button>
                      </div>
                    )}
                    <p style={{ color: muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 8px' }}>RECIPIENT POLYGON ADDRESS (0x...)</p>
                    <input value={toAddress} onChange={e => setToAddress(e.target.value)} placeholder="0x1234...abcd"
                      style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1.5px solid ' + (toAddress && !isValid0x(toAddress) ? red : border), borderRadius: 12, padding: '13px 14px', color: white, fontSize: 14, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 6 }} />
                    {toAddress && !isValid0x(toAddress) && <p style={{ color: red, fontSize: 12, margin: '0 0 10px' }}>Invalid Polygon address</p>}
                    {toAddress && isValid0x(toAddress) && (
                      <div style={{ background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.25)', borderRadius: 10, padding: '8px 14px', marginBottom: 12 }}>
                        <p style={{ color: green, fontSize: 12, fontWeight: 700, margin: 0 }}>✅ Valid Polygon address</p>
                      </div>
                    )}
                    <p style={{ color: dim, fontSize: 12, margin: '0 0 12px' }}>⚡ This sends real INRT on Polygon blockchain. Gas fee: ~₹0.01</p>
                  </>
                )}

                <p style={{ color: muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 8px' }}>AMOUNT (INRT)</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '14px 16px', border: '1.5px solid ' + (sendAmt ? purple : border), marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>🪙</span>
                  <input type="number" value={sendAmt} onChange={e => setSendAmt(e.target.value)} placeholder="0"
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 28, color: white }} />
                </div>
                <p style={{ color: muted, fontSize: 12, margin: '0 0 12px' }}>≈ ₹{parseFloat(sendAmt || '0').toLocaleString()} · No fees</p>

                <input value={sendNote} onChange={e => setSendNote(e.target.value)} placeholder="Note (optional)"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + border, borderRadius: 12, padding: '12px 14px', color: white, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, marginBottom: 14, fontFamily: "'Plus Jakarta Sans',sans-serif" }} />

                {parseFloat(sendAmt || '0') > inrtBal && (
                  <p style={{ color: red, fontSize: 12, marginBottom: 10, textAlign: 'center' as const }}>Insufficient INRT · <button onClick={() => navigate('/checkout')} style={{ background: 'none', border: 'none', color: purpleL, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>Buy INRT →</button></p>
                )}

                <button
                  onClick={() => setSendStep('review')}
                  disabled={
                    !sendAmt || parseFloat(sendAmt) <= 0 || parseFloat(sendAmt) > inrtBal ||
                    (sendMode === 'inrt' && !recipient) ||
                    (sendMode === 'polygon' && (!isValid0x(toAddress) || !hasWallet))
                  }
                  style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,' + purple + ',#5B17A3)', color: white, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", opacity: (!sendAmt || parseFloat(sendAmt) <= 0) ? 0.5 : 1 }}>
                  Continue →
                </button>
              </div>
            )}

            {/* Review */}
            {sendStep === 'review' && (
              <div style={{ background: card, border: '1px solid ' + border, borderRadius: 18, padding: '18px 16px' }}>
                <p style={{ color: white, fontWeight: 800, fontSize: 15, margin: '0 0 16px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Confirm Transfer</p>
                <div style={{ textAlign: 'center' as const, marginBottom: 16 }}>
                  <p style={{ color: white, fontSize: 38, fontWeight: 800, margin: '0 0 4px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{parseFloat(sendAmt).toLocaleString()} <span style={{ fontSize: 18, color: purpleL }}>INRT</span></p>
                  <p style={{ color: muted, fontSize: 13, margin: 0 }}>≈ ₹{parseFloat(sendAmt).toLocaleString()}</p>
                </div>
                {[
                  ['To', sendMode === 'inrt' ? (recipient?.name || toAddress) : short(toAddress)],
                  ['Address', toAddress],
                  ['Network', sendMode === 'inrt' ? 'INRT Internal' : 'Polygon Mainnet ⛓️'],
                  ['Fee', '₹0 (Free)'],
                  ...(sendNote ? [['Note', sendNote]] : []),
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: muted, fontSize: 13 }}>{k}</span>
                    <span style={{ color: k === 'Fee' ? green : white, fontWeight: 600, fontSize: 12, fontFamily: k === 'Address' ? 'monospace' : 'inherit', maxWidth: '60%', textAlign: 'right' as const, wordBreak: 'break-all' as const }}>{v}</span>
                  </div>
                ))}
                {sendErr && <p style={{ color: red, fontSize: 13, marginTop: 10 }}>{sendErr}</p>}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button onClick={() => setSendStep('form')} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid ' + border, background: 'transparent', color: muted, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Back</button>
                  <button onClick={() => setSendStep('pin')} style={{ flex: 2, padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,' + purple + ',#5B17A3)', color: white, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Confirm & Enter PIN</button>
                </div>
              </div>
            )}

            {/* PIN entry */}
            {sendStep === 'pin' && (
              <div style={{ background: card, border: '1px solid ' + border, borderRadius: 18, padding: '20px 16px' }}>
                <PinPad
                  title={sendMode === 'polygon' ? 'Enter PIN to sign blockchain transaction' : 'Enter PIN to confirm'}
                  onComplete={sendMode === 'polygon' ? handleSendOnChain : (() => { setSendStep('processing'); handleSendInrt(); })}
                  onCancel={() => setSendStep('review')}
                />
              </div>
            )}

            {/* Processing */}
            {sendStep === 'processing' && (
              <div style={{ background: card, border: '1px solid ' + border, borderRadius: 18, padding: '36px 16px', textAlign: 'center' as const }}>
                <div style={{ width: 60, height: 60, border: '4px solid rgba(123,47,190,0.15)', borderTopColor: purple, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
                <p style={{ color: white, fontWeight: 800, fontSize: 17, margin: '0 0 6px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  {sendMode === 'polygon' ? 'Broadcasting to Polygon…' : 'Sending INRT…'}
                </p>
                <p style={{ color: muted, fontSize: 13, margin: '0 0 20px' }}>
                  {sendMode === 'polygon' ? 'Signing and submitting blockchain transaction' : 'Delivering to recipient'}
                </p>
                <div style={{ background: 'rgba(130,71,229,0.1)', border: '1px solid rgba(130,71,229,0.25)', borderRadius: 12, padding: '14px' }}>
                  <p style={{ color: dim, fontSize: 10, margin: '0 0 4px', letterSpacing: 1 }}>ELAPSED</p>
                  <p style={{ color: purpleL, fontSize: 28, fontWeight: 800, margin: 0, fontFamily: 'monospace' }}>{fmtMs(elapsed)}</p>
                </div>
              </div>
            )}

            {/* Done */}
            {sendStep === 'done' && (
              <div style={{ background: card, border: '1px solid rgba(0,200,83,0.25)', borderRadius: 18, padding: '30px 16px', textAlign: 'center' as const }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(0,200,83,0.1)', border: '2px solid ' + green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px' }}>✅</div>
                <p style={{ color: white, fontWeight: 800, fontSize: 20, margin: '0 0 6px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Transfer Complete!</p>
                <p style={{ color: muted, fontSize: 13, margin: '0 0 16px' }}>{parseFloat(sendAmt).toLocaleString()} INRT sent</p>
                <div style={{ background: 'rgba(0,229,204,0.08)', border: '1px solid rgba(0,229,204,0.25)', borderRadius: 12, padding: '14px', marginBottom: 14 }}>
                  <p style={{ color: dim, fontSize: 10, margin: '0 0 4px', letterSpacing: 1 }}>⚡ DELIVERED IN</p>
                  <p style={{ color: teal, fontSize: 28, fontWeight: 800, margin: 0, fontFamily: 'monospace' }}>{fmtMs(durationMs || elapsed)}</p>
                </div>
                {txHash && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ color: dim, fontSize: 11, margin: '0 0 4px' }}>Transaction Hash</p>
                    <p style={{ color: white, fontSize: 12, fontFamily: 'monospace', margin: '0 0 6px', wordBreak: 'break-all' as const }}>{short(txHash)}</p>
                    <a href={'https://polygonscan.com/tx/' + txHash} target="_blank" rel="noopener noreferrer"
                      style={{ color: poly, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                      🔍 View on Polygonscan →
                    </a>
                  </div>
                )}
                <button onClick={resetSend} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,' + purple + ',#5B17A3)', color: white, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Send Another
                </button>
              </div>
            )}

            {/* Failed */}
            {sendStep === 'failed' && (
              <div style={{ background: card, border: '1px solid rgba(255,59,48,0.25)', borderRadius: 18, padding: '30px 16px', textAlign: 'center' as const }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,59,48,0.1)', border: '2px solid ' + red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px' }}>❌</div>
                <p style={{ color: white, fontWeight: 800, fontSize: 18, margin: '0 0 6px' }}>Transfer Failed</p>
                {sendErr && <p style={{ color: muted, fontSize: 13, margin: '0 0 16px', lineHeight: 1.6 }}>{sendErr}</p>}
                <button onClick={resetSend} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: purple, color: white, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Try Again</button>
              </div>
            )}
          </div>
        )}

        {/* ══════════ RECEIVE TAB ══════════ */}
        {tab === 'receive' && (
          <div style={{ textAlign: 'center' as const }}>
            {hasWallet ? (
              <>
                <div style={{ background: card, border: '1px solid ' + border, borderRadius: 18, padding: '24px 16px', marginBottom: 14 }}>
                  <p style={{ color: muted, fontSize: 12, margin: '0 0 16px' }}>Share this address to receive INRT from any wallet worldwide</p>
                  <div style={{ display: 'inline-block', padding: 14, background: white, borderRadius: 14, marginBottom: 14 }}>
                    <img src={'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(polygonWallet)} alt="QR" style={{ width: 200, height: 200, display: 'block' }} />
                  </div>
                  <p style={{ color: muted, fontSize: 10, fontWeight: 700, margin: '0 0 6px', letterSpacing: 0.5 }}>POLYGON WALLET ADDRESS</p>
                  <p style={{ color: white, fontWeight: 700, fontSize: 13, fontFamily: 'monospace', margin: '0 0 14px', wordBreak: 'break-all' as const }}>{polygonWallet}</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => navigator.clipboard.writeText(polygonWallet).then(() => alert('Copied!'))}
                      style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid ' + border, background: 'transparent', color: teal, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                      📋 Copy Address
                    </button>
                    <button onClick={() => navigator.share && navigator.share({ title: 'My INRT Wallet', text: polygonWallet })}
                      style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,' + poly + ',' + purple + ')', color: white, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                      📤 Share
                    </button>
                  </div>
                </div>
                {profile?.inrtAddress && (
                  <div style={{ background: card, border: '1px solid ' + border, borderRadius: 14, padding: '14px 16px', textAlign: 'left' as const }}>
                    <p style={{ color: muted, fontSize: 10, fontWeight: 700, margin: '0 0 6px', letterSpacing: 0.5 }}>INTERNAL INRT ADDRESS</p>
                    <p style={{ color: white, fontFamily: 'monospace', fontSize: 13, margin: '0 0 6px' }}>{profile.inrtAddress}</p>
                    <p style={{ color: dim, fontSize: 11, margin: 0 }}>For transfers within INRT Wallet app only</p>
                  </div>
                )}
              </>
            ) : (
              <div style={{ background: card, border: '1px solid ' + border, borderRadius: 18, padding: '40px 20px' }}>
                <p style={{ fontSize: 36, marginBottom: 12 }}>🔐</p>
                <p style={{ color: white, fontWeight: 700, fontSize: 15, margin: '0 0 8px' }}>No wallet yet</p>
                <p style={{ color: muted, fontSize: 13, margin: '0 0 16px' }}>Create your wallet first to get a receive address</p>
                <button onClick={() => setTab('wallet')} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,' + poly + ',' + purple + ')', color: white, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Create Wallet →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════════ HISTORY TAB ══════════ */}
        {tab === 'history' && (
          <div>
            {histLoad ? (
              <div style={{ textAlign: 'center' as const, padding: 40, color: muted }}>Loading…</div>
            ) : history.length === 0 ? (
              <div style={{ background: card, border: '1px solid ' + border, borderRadius: 18, padding: '40px 20px', textAlign: 'center' as const }}>
                <p style={{ fontSize: 32, marginBottom: 10 }}>🪙</p>
                <p style={{ color: white, fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>No transactions yet</p>
                <p style={{ color: muted, fontSize: 13, margin: 0 }}>Buy or send INRT to see history here</p>
              </div>
            ) : (
              <div style={{ background: card, border: '1px solid ' + border, borderRadius: 18, overflow: 'hidden' }}>
                {history.map((tx: any, i: number) => (
                  <div key={tx.id || tx.hash || i} style={{ padding: '14px 16px', borderBottom: i < history.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: tx.type === 'credit' || tx.to === polygonWallet?.toLowerCase() ? 'rgba(0,200,83,0.1)' : 'rgba(123,47,190,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                          {tx.type === 'convert' ? '🔁' : tx.type === 'credit' || (tx.to && tx.to === polygonWallet?.toLowerCase()) ? '📥' : '📤'}
                        </div>
                        <div>
                          <p style={{ color: white, fontWeight: 700, fontSize: 13, margin: 0, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {tx.note || (tx.to === polygonWallet?.toLowerCase() ? 'Received' : 'Sent')}
                          </p>
                          <p style={{ color: dim, fontSize: 11, margin: '2px 0 0' }}>
                            {tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : tx.createdAt ? new Date(tx.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                          </p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' as const }}>
                        <p style={{ color: tx.type === 'credit' ? green : white, fontWeight: 800, fontSize: 13, margin: 0 }}>
                          {tx.type === 'credit' ? '+' : tx.type === 'debit' ? '−' : ''}{tx.amount?.toLocaleString() || (tx.value ? (parseInt(tx.value) / 1e18).toFixed(2) : '')} INRT
                        </p>
                        {(tx.hash || tx.txHash) && (
                          <a href={'https://polygonscan.com/tx/' + (tx.hash || tx.txHash)} target="_blank" rel="noopener noreferrer"
                            style={{ color: poly, fontSize: 10, fontWeight: 700, textDecoration: 'none' }}>
                            ⛓️ Polygonscan →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════ ABOUT TAB ══════════ */}
        {tab === 'about' && (
          <div>
            <div style={{ background: card, border: '1px solid ' + border, borderRadius: 18, padding: '20px 16px', marginBottom: 14 }}>
              <p style={{ color: white, fontWeight: 800, fontSize: 15, margin: '0 0 16px', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>🪙 INRT Token Info</p>
              {[
                ['Token Name', 'INRT'],
                ['Symbol', 'INRT'],
                ['Network', 'Polygon Mainnet'],
                ['Standard', 'ERC-20'],
                ['Peg', '1 INRT = ₹1 always'],
                ['Decimals', '18'],
                ['Total Supply', totalSupply !== null ? totalSupply.toLocaleString() + ' INRT' : 'Loading…'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: muted, fontSize: 13 }}>{k}</span>
                  <span style={{ color: white, fontWeight: 600, fontSize: 13 }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ background: card, border: '1px solid ' + border, borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
              <p style={{ color: muted, fontSize: 10, fontWeight: 700, margin: '0 0 6px', letterSpacing: 0.5 }}>CONTRACT ADDRESS</p>
              <p style={{ color: white, fontSize: 12, fontFamily: 'monospace', margin: '0 0 8px', wordBreak: 'break-all' as const }}>{CONTRACT}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => navigator.clipboard.writeText(CONTRACT).then(() => alert('Copied!'))}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid ' + border, background: 'transparent', color: teal, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  📋 Copy
                </button>
                <a href={'https://polygonscan.com/token/' + CONTRACT} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: poly, color: white, fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' as const, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  🔍 Polygonscan
                </a>
              </div>
            </div>

            <div style={{ background: 'rgba(0,229,204,0.04)', border: '1px solid rgba(0,229,204,0.15)', borderRadius: 14, padding: '14px 16px' }}>
              <p style={{ color: teal, fontWeight: 700, fontSize: 13, margin: '0 0 6px' }}>🔒 Backed 1:1</p>
              <p style={{ color: muted, fontSize: 12, margin: 0, lineHeight: 1.7 }}>
                Every INRT in circulation is backed by ₹1 held in reserve. INRT is not a speculative asset — it is a stable digital rupee for global payments.
              </p>
            </div>
          </div>
        )}

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { -webkit-tap-highlight-color: transparent; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>
    </div>
  );
}
