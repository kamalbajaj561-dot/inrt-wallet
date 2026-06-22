/**
 * INRT WALLET — ConnectWallet.tsx
 * Connects user's MetaMask wallet to their INRT account
 * Shows on-chain INRT balance from Polygon
 *
 * Route: /connect-wallet
 * Add to App.tsx: <Route path="/connect-wallet" element={<ConnectWallet/>}/>
 */

import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useAuth }             from '../context/AuthContext';
import { doc, onSnapshot }     from 'firebase/firestore';
import { db as firestoreDb }   from '../lib/firebase';

const API = import.meta.env.VITE_API_URL || '';

const T = {
  bg:'#050914', card:'rgba(255,255,255,0.04)', border:'rgba(255,255,255,0.08)',
  text:'#fff', muted:'rgba(255,255,255,0.45)', dim:'rgba(255,255,255,0.2)',
  inrt:'#7B2FBE', inrtL:'#E0B0FF', teal:'#00e5cc',
  green:'#00C853', orange:'#FF9500', red:'#FF3B30',
  poly:'#8247E5', // Polygon purple
};

// Polygon Mainnet config
const POLYGON_CHAIN_ID     = '0x89'; // 137 in hex
const POLYGON_CHAIN_ID_DEC = 137;

const POLYGON_NETWORK = {
  chainId:           POLYGON_CHAIN_ID,
  chainName:         'Polygon Mainnet',
  nativeCurrency:    { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  rpcUrls:           ['https://polygon-rpc.com'],
  blockExplorerUrls: ['https://polygonscan.com'],
};

const CONTRACT_ADDRESS = import.meta.env.VITE_INRT_CONTRACT_ADDRESS || '';

// Minimal ERC-20 ABI for balance check
const INRT_ABI = [
  { constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' },
  { constant: true, inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], type: 'function' },
  { constant: true, inputs: [], name: 'totalSupply', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
];

type Step = 'intro' | 'connecting' | 'switching' | 'connected' | 'error';

export default function ConnectWallet() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile,         setProfile]         = useState<any>(null);
  const [step,            setStep]            = useState<Step>('intro');
  const [errMsg,          setErrMsg]          = useState('');
  const [walletAddress,   setWalletAddress]   = useState('');
  const [onChainBalance,  setOnChainBalance]  = useState<number | null>(null);
  const [totalSupply,     setTotalSupply]      = useState<number | null>(null);
  const [maticBalance,    setMaticBalance]     = useState<number | null>(null);
  const [saving,          setSaving]          = useState(false);
  const [saved,           setSaved]           = useState(false);

  // Subscribe to user profile
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(firestoreDb, 'users', user.uid), snap => {
      if (snap.exists()) setProfile(snap.data());
    });
    return () => unsub();
  }, [user?.uid]);

  const inrtBal      = Number(profile?.inrtBalance ?? 0);
  const polygonWallet = profile?.polygonWallet || null;

  // ── Check if MetaMask is installed ───────────────────────────
  const hasMetaMask = typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';

  // ── Helper: format address ────────────────────────────────────
  const shortAddr = (addr: string) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

  // ── Helper: parse wei to token ────────────────────────────────
  const fromWei = (wei: string) => parseFloat((BigInt(wei) / BigInt('1000000000000000000')).toString()) + parseFloat('0.' + (BigInt(wei) % BigInt('1000000000000000000')).toString().padStart(18, '0'));

  // ── Read on-chain balance using raw eth_call ──────────────────
  const readOnChainBalance = async (address: string) => {
    if (!CONTRACT_ADDRESS || !hasMetaMask) return;
    try {
      const eth = (window as any).ethereum;

      // balanceOf(address)
      const balData = '0x70a08231' + address.slice(2).padStart(64, '0');
      const balResult = await eth.request({ method: 'eth_call', params: [{ to: CONTRACT_ADDRESS, data: balData }, 'latest'] });
      if (balResult && balResult !== '0x') {
        const balWei = BigInt(balResult).toString();
        const bal    = fromWei(balWei);
        setOnChainBalance(bal);
      }

      // totalSupply()
      const supplyResult = await eth.request({ method: 'eth_call', params: [{ to: CONTRACT_ADDRESS, data: '0x18160ddd' }, 'latest'] });
      if (supplyResult && supplyResult !== '0x') {
        const supplyWei = BigInt(supplyResult).toString();
        setTotalSupply(fromWei(supplyWei));
      }

      // MATIC balance
      const maticWei = await eth.request({ method: 'eth_getBalance', params: [address, 'latest'] });
      if (maticWei) {
        const matic = fromWei(BigInt(maticWei).toString());
        setMaticBalance(Math.round(matic * 10000) / 10000);
      }
    } catch (e) { console.warn('Balance read error:', e); }
  };

  // ── Switch or add Polygon network ────────────────────────────
  const switchToPolygon = async () => {
    const eth = (window as any).ethereum;
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: POLYGON_CHAIN_ID }] });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        // Network not added — add it
        await eth.request({ method: 'wallet_addEthereumChain', params: [POLYGON_NETWORK] });
      } else {
        throw switchError;
      }
    }
  };

  // ── Main connect flow ─────────────────────────────────────────
  const handleConnect = async () => {
    setErrMsg(''); setStep('connecting');

    if (!hasMetaMask) {
      setErrMsg('MetaMask not found. Please install MetaMask from metamask.io then try again.');
      setStep('error');
      return;
    }

    try {
      const eth = (window as any).ethereum;

      // Request accounts
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) throw new Error('No accounts found. Please unlock MetaMask.');
      const address = accounts[0].toLowerCase();
      setWalletAddress(address);

      // Check current network
      const chainId = await eth.request({ method: 'eth_chainId' });

      if (chainId !== POLYGON_CHAIN_ID) {
        setStep('switching');
        await switchToPolygon();
        // Verify switch
        const newChainId = await eth.request({ method: 'eth_chainId' });
        if (newChainId !== POLYGON_CHAIN_ID) throw new Error('Please switch to Polygon Mainnet in MetaMask.');
      }

      // Read balances
      await readOnChainBalance(address);

      setStep('connected');
    } catch (e: any) {
      if (e.code === 4001) {
        setErrMsg('You rejected the connection. Please try again and click "Connect" in MetaMask.');
      } else {
        setErrMsg(e.message || 'Connection failed. Please try again.');
      }
      setStep('error');
    }
  };

  // ── Save wallet to backend ────────────────────────────────────
  const handleSave = async () => {
    if (!walletAddress || !user?.uid) return;
    setSaving(true); setErrMsg('');
    try {
      const r = await fetch(`${API}/polygon/connect-wallet`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, walletAddress }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to save wallet');
      setSaved(true);
      console.log('✅ Wallet connected:', walletAddress);
    } catch (e: any) {
      setErrMsg(e.message || 'Failed to save. Try again.');
    }
    setSaving(false);
  };

  // ── Disconnect ────────────────────────────────────────────────
  const handleDisconnect = async () => {
    try {
      await fetch(`${API}/polygon/connect-wallet`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user!.uid, walletAddress: '' }),
      });
    } catch {}
    setStep('intro'); setWalletAddress(''); setOnChainBalance(null); setSaved(false);
  };

  return (
    <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:T.bg, fontFamily:"'Plus Jakarta Sans',sans-serif", paddingBottom:40 }}>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div style={{ background:`linear-gradient(160deg,${T.poly} 0%,${T.inrt} 60%,${T.bg} 100%)`, padding:'52px 20px 28px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-40, right:-40, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
          <button onClick={()=>navigate('/dashboard')} style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:10, width:38, height:38, color:'#fff', cursor:'pointer', fontSize:18 }}>←</button>
          <div>
            <p style={{ color:'rgba(255,255,255,0.5)', fontSize:12, margin:0 }}>Polygon Blockchain</p>
            <h1 style={{ color:'#fff', fontSize:20, fontWeight:800, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Connect Wallet</h1>
          </div>
        </div>

        {/* Status badge */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.1)', borderRadius:20, padding:'6px 14px' }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background: polygonWallet || saved ? T.green : T.orange, animation: polygonWallet || saved ? 'none' : 'pulse 2s infinite' }}/>
          <span style={{ color:'#fff', fontSize:12, fontWeight:700 }}>
            {polygonWallet || saved ? `Connected: ${shortAddr(walletAddress || polygonWallet || '')}` : 'Not Connected'}
          </span>
        </div>
      </div>

      <div style={{ padding:'16px' }}>

        {/* ── ALREADY CONNECTED ─────────────────────────────── */}
        {(polygonWallet && !walletAddress) && (
          <div style={{ background:T.card, border:`1px solid ${T.green}30`, borderRadius:18, padding:'20px 16px', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(0,200,83,0.1)', border:`2px solid ${T.green}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🦊</div>
              <div>
                <p style={{ color:'#fff', fontWeight:800, fontSize:15, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>MetaMask Connected</p>
                <p style={{ color:T.green, fontSize:12, margin:'2px 0 0', fontFamily:'monospace' }}>{polygonWallet}</p>
              </div>
            </div>
            <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:12, padding:'14px', marginBottom:14 }}>
              <p style={{ color:T.muted, fontSize:11, fontWeight:700, margin:'0 0 8px', letterSpacing:0.5 }}>INRT WALLET BALANCE</p>
              <p style={{ color:'#fff', fontSize:28, fontWeight:800, margin:'0 0 4px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{inrtBal.toLocaleString()} INRT</p>
              <p style={{ color:T.muted, fontSize:12, margin:0 }}>Internal balance · ≈ ₹{inrtBal.toLocaleString()}</p>
            </div>
            <a href={`https://polygonscan.com/address/${polygonWallet}`} target="_blank" rel="noopener noreferrer"
              style={{ display:'block', textAlign:'center' as const, color:T.poly, fontSize:13, fontWeight:700, marginBottom:12, textDecoration:'none' }}>
              🔍 View on Polygonscan →
            </a>
            <button onClick={()=>{ setStep('intro'); }} style={{ width:'100%', padding:'12px', borderRadius:12, border:`1px solid rgba(255,59,48,0.3)`, background:'transparent', color:T.red, fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              Disconnect Wallet
            </button>
          </div>
        )}

        {/* ── INTRO ─────────────────────────────────────────── */}
        {(step === 'intro' && !polygonWallet) && (
          <div>
            {/* What you get */}
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'20px 16px', marginBottom:14 }}>
              <p style={{ color:'#fff', fontWeight:800, fontSize:15, margin:'0 0 14px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>🌍 Why connect a wallet?</p>
              {[
                { icon:'⛓️', t:'Real Blockchain INRT', d:'Your INRT gets minted on Polygon — visible on Polygonscan forever' },
                { icon:'🌐', t:'Send to Any Wallet', d:'Send INRT to MetaMask, Trust Wallet, Coinbase Wallet worldwide' },
                { icon:'📊', t:'On-Chain Proof', d:'Every transaction is recorded on blockchain — fully transparent' },
                { icon:'🔒', t:'Self-Custody', d:'Your crypto, your keys — no one can freeze your wallet' },
                { icon:'💱', t:'Future DEX Trading', d:'List INRT on Uniswap — trade with anyone in the world' },
              ].map(b => (
                <div key={b.t} style={{ display:'flex', gap:12, padding:'10px 0', borderBottom:`1px solid rgba(255,255,255,0.05)` }}>
                  <span style={{ fontSize:22, flexShrink:0 }}>{b.icon}</span>
                  <div>
                    <p style={{ color:'#fff', fontWeight:700, fontSize:13, margin:0 }}>{b.t}</p>
                    <p style={{ color:T.muted, fontSize:12, margin:'2px 0 0', lineHeight:1.5 }}>{b.d}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Need MetaMask? */}
            {!hasMetaMask && (
              <div style={{ background:'rgba(255,149,0,0.08)', border:'1px solid rgba(255,149,0,0.25)', borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
                <p style={{ color:T.orange, fontWeight:700, fontSize:13, margin:'0 0 6px' }}>⚠️ MetaMask not detected</p>
                <p style={{ color:T.muted, fontSize:12, margin:'0 0 10px', lineHeight:1.6 }}>
                  You need MetaMask browser extension to connect. Install it first, then come back here.
                </p>
                <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer"
                  style={{ display:'block', padding:'12px', borderRadius:10, background:'rgba(255,149,0,0.15)', border:'1px solid rgba(255,149,0,0.3)', color:T.orange, fontWeight:700, fontSize:13, textAlign:'center' as const, textDecoration:'none' }}>
                  🦊 Download MetaMask →
                </a>
              </div>
            )}

            {/* Current INRT balance */}
            <div style={{ background:'rgba(130,71,229,0.1)', border:`1px solid ${T.poly}30`, borderRadius:14, padding:'14px 16px', marginBottom:16 }}>
              <p style={{ color:T.muted, fontSize:11, margin:'0 0 4px', letterSpacing:0.5 }}>YOUR INRT BALANCE (Internal)</p>
              <p style={{ color:'#fff', fontSize:24, fontWeight:800, margin:'0 0 4px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{inrtBal.toLocaleString()} INRT</p>
              <p style={{ color:T.muted, fontSize:12, margin:0 }}>After connecting, future purchases get minted on Polygon too</p>
            </div>

            <button onClick={handleConnect} disabled={!hasMetaMask}
              style={{ width:'100%', padding:'18px', borderRadius:14, border:'none', background: hasMetaMask ? `linear-gradient(135deg,${T.poly},${T.inrt})` : 'rgba(255,255,255,0.08)', color: hasMetaMask ? '#fff' : T.dim, fontWeight:700, fontSize:16, cursor: hasMetaMask ? 'pointer' : 'not-allowed', fontFamily:"'Plus Jakarta Sans',sans-serif", boxShadow: hasMetaMask ? '0 8px 24px rgba(130,71,229,0.4)' : 'none' }}>
              🦊 Connect MetaMask
            </button>

            <p style={{ textAlign:'center' as const, color:T.dim, fontSize:12, marginTop:12, lineHeight:1.6 }}>
              Connecting is free · No gas fees · Your INRT account remains unchanged
            </p>
          </div>
        )}

        {/* ── CONNECTING ────────────────────────────────────── */}
        {step === 'connecting' && (
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'40px 20px', textAlign:'center' as const }}>
            <div style={{ width:64, height:64, border:`4px solid rgba(130,71,229,0.15)`, borderTopColor:T.poly, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 20px' }}/>
            <p style={{ color:'#fff', fontWeight:800, fontSize:17, margin:'0 0 6px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Connecting to MetaMask…</p>
            <p style={{ color:T.muted, fontSize:13, margin:0 }}>Check your MetaMask popup and click "Connect"</p>
          </div>
        )}

        {/* ── SWITCHING NETWORK ─────────────────────────────── */}
        {step === 'switching' && (
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'40px 20px', textAlign:'center' as const }}>
            <div style={{ fontSize:48, marginBottom:16 }}>⛓️</div>
            <p style={{ color:'#fff', fontWeight:800, fontSize:17, margin:'0 0 6px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Switching to Polygon…</p>
            <p style={{ color:T.muted, fontSize:13, margin:'0 0 16px' }}>Approve the network switch in MetaMask</p>
            <div style={{ background:'rgba(130,71,229,0.1)', border:`1px solid ${T.poly}30`, borderRadius:12, padding:'12px 16px' }}>
              <p style={{ color:T.muted, fontSize:12, margin:0, lineHeight:1.6 }}>
                If MetaMask asks to add Polygon Mainnet — click <strong style={{ color:'#fff' }}>Approve</strong>
              </p>
            </div>
          </div>
        )}

        {/* ── CONNECTED ─────────────────────────────────────── */}
        {step === 'connected' && walletAddress && (
          <div>
            {/* Success header */}
            <div style={{ background:'rgba(0,200,83,0.08)', border:`1px solid ${T.green}30`, borderRadius:18, padding:'20px 16px', marginBottom:14, textAlign:'center' as const }}>
              <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(0,200,83,0.1)', border:`2px solid ${T.green}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 12px' }}>🦊</div>
              <p style={{ color:T.green, fontWeight:800, fontSize:16, margin:'0 0 4px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>MetaMask Connected!</p>
              <p style={{ color:T.muted, fontSize:11, margin:'0 0 10px', fontFamily:'monospace', wordBreak:'break-all' as const }}>{walletAddress}</p>
              <a href={`https://polygonscan.com/address/${walletAddress}`} target="_blank" rel="noopener noreferrer"
                style={{ color:T.poly, fontSize:12, fontWeight:700, textDecoration:'none' }}>
                🔍 View on Polygonscan →
              </a>
            </div>

            {/* Balances */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:'14px' }}>
                <p style={{ color:T.muted, fontSize:10, margin:'0 0 4px', letterSpacing:0.5, fontWeight:700 }}>ON-CHAIN INRT</p>
                <p style={{ color:T.inrtL, fontSize:20, fontWeight:800, margin:'0 0 2px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                  {onChainBalance !== null ? onChainBalance.toLocaleString() : '—'}
                </p>
                <p style={{ color:T.dim, fontSize:10, margin:0 }}>On Polygon blockchain</p>
              </div>
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:'14px' }}>
                <p style={{ color:T.muted, fontSize:10, margin:'0 0 4px', letterSpacing:0.5, fontWeight:700 }}>MATIC (GAS)</p>
                <p style={{ color:'#fff', fontSize:20, fontWeight:800, margin:'0 0 2px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                  {maticBalance !== null ? maticBalance : '—'}
                </p>
                <p style={{ color:T.dim, fontSize:10, margin:0 }}>For gas fees on Polygon</p>
              </div>
            </div>

            {/* Internal INRT */}
            <div style={{ background:'rgba(123,47,190,0.08)', border:`1px solid ${T.inrt}25`, borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
              <p style={{ color:T.muted, fontSize:10, margin:'0 0 4px', letterSpacing:0.5, fontWeight:700 }}>INRT WALLET (Internal)</p>
              <p style={{ color:'#fff', fontSize:20, fontWeight:800, margin:'0 0 2px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{inrtBal.toLocaleString()} INRT</p>
              <p style={{ color:T.muted, fontSize:11, margin:0, lineHeight:1.5 }}>
                After saving, future INRT purchases will also mint on Polygon automatically
              </p>
            </div>

            {/* Total supply */}
            {totalSupply !== null && (
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:'12px 16px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ color:T.muted, fontSize:10, margin:'0 0 2px', letterSpacing:0.5, fontWeight:700 }}>TOTAL INRT SUPPLY ON POLYGON</p>
                  <p style={{ color:'#fff', fontWeight:700, fontSize:14, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{totalSupply.toLocaleString()} INRT</p>
                </div>
                <a href={`https://polygonscan.com/token/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer"
                  style={{ color:T.poly, fontSize:12, fontWeight:700, textDecoration:'none' }}>View →</a>
              </div>
            )}

            {/* Low MATIC warning */}
            {maticBalance !== null && maticBalance < 0.01 && (
              <div style={{ background:'rgba(255,149,0,0.08)', border:'1px solid rgba(255,149,0,0.25)', borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
                <p style={{ color:T.orange, fontWeight:700, fontSize:12, margin:'0 0 4px' }}>⚠️ Low MATIC balance</p>
                <p style={{ color:T.muted, fontSize:11, margin:0, lineHeight:1.5 }}>
                  You need MATIC for gas fees to send INRT on Polygon. Buy ₹100 worth of MATIC on WazirX or CoinDCX and send to this address.
                </p>
              </div>
            )}

            {saved ? (
              <div style={{ background:'rgba(0,200,83,0.08)', border:`1px solid ${T.green}30`, borderRadius:14, padding:'16px', textAlign:'center' as const, marginBottom:14 }}>
                <p style={{ color:T.green, fontWeight:800, fontSize:15, margin:'0 0 4px' }}>✅ Wallet Saved!</p>
                <p style={{ color:T.muted, fontSize:13, margin:0 }}>Future INRT purchases will be minted on Polygon to your wallet</p>
              </div>
            ) : (
              <button onClick={handleSave} disabled={saving}
                style={{ width:'100%', padding:'18px', borderRadius:14, border:'none', background:`linear-gradient(135deg,${T.poly},${T.inrt})`, color:'#fff', fontWeight:700, fontSize:16, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", opacity:saving?0.7:1, marginBottom:10, boxShadow:'0 8px 24px rgba(130,71,229,0.4)' }}>
                {saving ? '⏳ Saving…' : '💾 Save Wallet to Account'}
              </button>
            )}

            {errMsg && <p style={{ color:T.red, fontSize:13, textAlign:'center' as const, marginBottom:10 }}>{errMsg}</p>}

            {saved && (
              <button onClick={()=>navigate('/checkout')}
                style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:`linear-gradient(135deg,${T.inrt},#5B17A3)`, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", marginBottom:10 }}>
                🪙 Buy INRT — Mint on Polygon →
              </button>
            )}

            <button onClick={()=>navigate('/dashboard')}
              style={{ width:'100%', padding:'14px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              Back to Home
            </button>
          </div>
        )}

        {/* ── ERROR ─────────────────────────────────────────── */}
        {step === 'error' && (
          <div>
            <div style={{ background:'rgba(255,59,48,0.08)', border:`1px solid ${T.red}30`, borderRadius:18, padding:'30px 20px', textAlign:'center' as const, marginBottom:16 }}>
              <p style={{ fontSize:40, marginBottom:12 }}>❌</p>
              <p style={{ color:'#fff', fontWeight:800, fontSize:16, margin:'0 0 10px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Connection Failed</p>
              <p style={{ color:T.muted, fontSize:13, margin:0, lineHeight:1.7 }}>{errMsg}</p>
            </div>

            {!hasMetaMask && (
              <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer"
                style={{ display:'block', padding:'16px', borderRadius:14, background:`linear-gradient(135deg,${T.orange},#E65C00)`, color:'#fff', fontWeight:700, fontSize:15, textAlign:'center' as const, textDecoration:'none', marginBottom:10, boxShadow:'0 6px 20px rgba(255,149,0,0.3)' }}>
                🦊 Install MetaMask →
              </a>
            )}

            <button onClick={handleConnect}
              style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', background:`linear-gradient(135deg,${T.poly},${T.inrt})`, color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", marginBottom:10 }}>
              🔄 Try Again
            </button>
            <button onClick={()=>navigate('/dashboard')}
              style={{ width:'100%', padding:'14px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              Back to Home
            </button>
          </div>
        )}

        {/* ── HOW IT WORKS ──────────────────────────────────── */}
        {step === 'intro' && !polygonWallet && (
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'18px 16px', marginTop:14 }}>
            <p style={{ color:'#fff', fontWeight:800, fontSize:14, margin:'0 0 12px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>⚡ How it works after connecting</p>
            {[
              ['1', 'You connect MetaMask with Polygon network'],
              ['2', 'Your wallet address is saved to your INRT account'],
              ['3', 'When you buy INRT — it mints on Polygon blockchain'],
              ['4', 'You can send INRT to ANY MetaMask/Trust Wallet worldwide'],
              ['5', 'Every transfer is recorded on Polygonscan forever'],
            ].map(([n, t]) => (
              <div key={n} style={{ display:'flex', gap:12, padding:'7px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ width:22, height:22, borderRadius:'50%', background:`rgba(130,71,229,0.2)`, border:`1px solid ${T.poly}`, display:'flex', alignItems:'center', justifyContent:'center', color:T.inrtL, fontSize:11, fontWeight:800, flexShrink:0 }}>{n}</div>
                <p style={{ color:T.muted, fontSize:12, margin:0, lineHeight:1.6 }}>{t}</p>
              </div>
            ))}
          </div>
        )}

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}
