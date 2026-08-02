/**
 * INRT WALLET — LinkBank.tsx
 *
 * National mode has NO wallet balance — payments go directly from the
 * user's own linked bank account(s), the way real UPI apps work.
 * This page is the full management hub:
 *   - List of linked accounts (last 4 digits visible)
 *   - Per-account "Check Balance" (PIN-gated)
 *   - Per-account last 10 transactions
 *   - Link additional accounts, including more than one from the same
 *     mobile number
 *
 * ⚠️ TEST MODE — discovery, balances, and transaction history are all
 * simulated. No real bank or NPCI system is contacted. The 4-digit PIN
 * entered here is never stored anywhere (by design — even in test mode,
 * an app should not get in the habit of persisting PINs); "checking
 * balance" simply reveals a balance generated once when the account
 * was linked, without validating the PIN against anything real.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { addLinkedBankAccount, type LinkedBankAccount } from '../lib/db';

const T = {
  navy:'#0A2540', accent:'#0070F3', bg:'#F5F7FA', card:'#FFFFFF',
  border:'#E8ECF0', muted:'#6B7C93', light:'#F0F4F8', green:'#00C853', red:'#FF3B30',
  headerGrad:'linear-gradient(135deg,#002E6E 0%,#00BAF2 100%)',
};

type View =
  | 'list' | 'mobile' | 'searching' | 'accounts' | 'pin' | 'confirmPin'
  | 'balancePin' | 'balanceResult' | 'transactions';

interface DiscoveredAccount {
  bankName: string;
  accountType: string;
  accountNumberMasked: string;
  ifsc: string;
}

const MOCK_BANKS = [
  { bankName:'HDFC Bank',           accountType:'Savings' },
  { bankName:'State Bank of India', accountType:'Savings' },
  { bankName:'ICICI Bank',          accountType:'Savings' },
];

const TX_LABELS_DEBIT  = ['Swiggy Order', 'Amazon Shopping', 'Electricity Bill', 'Mobile Recharge', 'Zomato Order', 'Netflix Subscription', 'Uber Ride'];
const TX_LABELS_CREDIT = ['Salary Credit', 'Refund Received', 'Transfer from Friend', 'Cashback Credit'];

function genMockTransactions(): LinkedBankAccount['mockTransactions'] {
  const out: LinkedBankAccount['mockTransactions'] = [];
  for (let i = 0; i < 10; i++) {
    const isCredit = Math.random() < 0.25;
    const label = isCredit
      ? TX_LABELS_CREDIT[Math.floor(Math.random()*TX_LABELS_CREDIT.length)]
      : TX_LABELS_DEBIT[Math.floor(Math.random()*TX_LABELS_DEBIT.length)];
    const amount = isCredit
      ? Math.floor(2000 + Math.random()*40000)
      : Math.floor(50 + Math.random()*3000);
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(i * 1.7 + Math.random()*2));
    out.push({
      id: `tx_${Date.now()}_${i}`,
      label, amount, type: isCredit ? 'credit' : 'debit',
      date: d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }),
    });
  }
  return out;
}

export default function LinkBank() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const linkedAccounts: LinkedBankAccount[] = userProfile?.linkedBankAccounts || [];

  const [view, setView] = useState<View>(linkedAccounts.length ? 'list' : 'mobile');
  const [mobile, setMobile] = useState(userProfile?.phone || '');
  const [discovered, setDiscovered] = useState<DiscoveredAccount[]>([]);
  const [pendingAccount, setPendingAccount] = useState<DiscoveredAccount | null>(null);
  const [activeAccount, setActiveAccount] = useState<LinkedBankAccount | null>(null);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const mobileValid = /^\d{10}$/.test(mobile.trim());

  const startAddAccount = () => { setMobile(userProfile?.phone || ''); setErr(''); setView('mobile'); };

  const searchAccounts = async () => {
    if (!mobileValid) return setErr('Enter a valid 10-digit mobile number');
    setErr(''); setView('searching');
    await new Promise(r => setTimeout(r, 1600));
    const shuffled = [...MOCK_BANKS].sort(() => Math.random() - 0.5).slice(0, 2);
    setDiscovered(shuffled.map(b => ({
      ...b,
      accountNumberMasked: `••••${1000 + Math.floor(Math.random()*9000)}`,
      ifsc: `${b.bankName.slice(0,4).toUpperCase().replace(/\s/g,'')}0${Math.floor(100000+Math.random()*900000)}`,
    })));
    setView('accounts');
  };

  const chooseAccount = (acc: DiscoveredAccount) => { setPendingAccount(acc); setPin(''); setPinConfirm(''); setErr(''); setView('pin'); };

  const submitPin = () => {
    if (!/^\d{4}$/.test(pin)) return setErr('Enter a 4-digit PIN');
    setErr(''); setView('confirmPin');
  };

  const confirmPin = async () => {
    if (pinConfirm !== pin) return setErr("PINs don't match — try again");
    if (!pendingAccount || !user?.uid) return;
    setErr(''); setLoading(true);
    try {
      const newAccount: LinkedBankAccount = {
        id: `acct_${Date.now()}`,
        bankName: pendingAccount.bankName,
        accountNumberMasked: pendingAccount.accountNumberMasked,
        accountType: pendingAccount.accountType,
        ifsc: pendingAccount.ifsc,
        mobileNumber: mobile,
        mockBalance: Math.floor(1500 + Math.random()*180000),
        mockTransactions: genMockTransactions(),
      };
      await addLinkedBankAccount(user.uid, newAccount);
      await refreshProfile();
      setPin(''); setPinConfirm(''); setPendingAccount(null);
      setView('list');
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong linking your account');
      setView('pin');
    }
    setLoading(false);
  };

  const openCheckBalance = (acc: LinkedBankAccount) => { setActiveAccount(acc); setPin(''); setErr(''); setView('balancePin'); };
  const revealBalance = () => {
    if (!/^\d{4}$/.test(pin)) return setErr('Enter your 4-digit UPI PIN');
    setErr(''); setView('balanceResult');
  };
  const openTransactions = (acc: LinkedBankAccount) => { setActiveAccount(acc); setView('transactions'); };

  return (
    <div style={{ width:'100%', minHeight:'100vh', background:T.bg, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ background:T.headerGrad, padding:'20px 20px 26px', display:'flex', alignItems:'center', gap:14 }}>
        <button onClick={() => {
          if (view === 'list') navigate(-1);
          else if (['balancePin','balanceResult','transactions'].includes(view)) setView('list');
          else if (view === 'mobile') linkedAccounts.length ? setView('list') : navigate(-1);
          else setView('mobile');
        }}
          style={{ width:38, height:38, borderRadius:10, background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', fontSize:16, cursor:'pointer' }}>←</button>
        <div>
          <h1 style={{ color:'#fff', fontSize:20, fontWeight:800, margin:0 }}>
            {view === 'list' ? 'Linked Bank Accounts' :
             view === 'balancePin' || view === 'balanceResult' ? 'Check Balance' :
             view === 'transactions' ? 'Recent Transactions' : 'Link Bank Account'}
          </h1>
          <p style={{ color:'rgba(255,255,255,0.7)', fontSize:11, margin:'2px 0 0' }}>Payments go straight from your bank — no wallet needed</p>
        </div>
      </div>

      <div style={{ padding:'20px 18px', maxWidth:460, margin:'0 auto' }}>

        {/* ── LIST VIEW ─────────────────────────────────── */}
        {view === 'list' && (
          <>
            {linkedAccounts.length === 0 ? (
              <div style={{ background:T.card, borderRadius:20, border:`1px solid ${T.border}`, padding:'40px 20px', textAlign:'center' }}>
                <p style={{ fontSize:36, marginBottom:12 }}>🏦</p>
                <p style={{ fontWeight:700, fontSize:15, color:T.navy, margin:'0 0 6px' }}>No accounts linked yet</p>
                <p style={{ fontSize:13, color:T.muted, margin:'0 0 20px' }}>Link a bank account to start sending payments.</p>
                <button onClick={startAddAccount}
                  style={{ background:T.headerGrad, color:'#fff', border:'none', borderRadius:12, padding:'13px 24px', fontWeight:700, fontSize:14, cursor:'pointer' }}>
                  Link Your First Account
                </button>
              </div>
            ) : (
              <>
                {linkedAccounts.map((acc) => (
                  <div key={acc.id} style={{ background:T.card, borderRadius:18, border:`1px solid ${T.border}`, padding:16, marginBottom:12, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                      <div style={{ width:44, height:44, borderRadius:12, background:T.headerGrad, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:14, flexShrink:0 }}>
                        {acc.bankName.split(' ').map(w=>w[0]).slice(0,2).join('')}
                      </div>
                      <div style={{ flex:1 }}>
                        <p style={{ fontWeight:700, fontSize:14, color:T.navy, margin:0 }}>{acc.bankName}</p>
                        <p style={{ fontSize:12, color:T.muted, margin:'2px 0 0' }}>{acc.accountType} · A/C {acc.accountNumberMasked}</p>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => openCheckBalance(acc)}
                        style={{ flex:1, background:T.light, border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 0', fontSize:12, fontWeight:700, color:T.navy, cursor:'pointer' }}>
                        💰 Check Balance
                      </button>
                      <button onClick={() => openTransactions(acc)}
                        style={{ flex:1, background:T.light, border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 0', fontSize:12, fontWeight:700, color:T.navy, cursor:'pointer' }}>
                        📋 Transactions
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={startAddAccount}
                  style={{ width:'100%', background:'transparent', border:`1.5px dashed ${T.accent}`, borderRadius:14, padding:14, color:T.accent, fontWeight:700, fontSize:13, cursor:'pointer', marginTop:6 }}>
                  + Add Another Bank Account
                </button>
              </>
            )}
          </>
        )}

        {/* ── BALANCE: PIN ENTRY ────────────────────────── */}
        {view === 'balancePin' && activeAccount && (
          <div style={{ background:T.card, borderRadius:20, border:`1px solid ${T.border}`, padding:24 }}>
            <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 4px' }}>ENTER UPI PIN</p>
            <p style={{ color:T.muted, fontSize:12, margin:'0 0 20px' }}>{activeAccount.bankName} · A/C {activeAccount.accountNumberMasked}</p>
            <input type="password" inputMode="numeric" maxLength={4} value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g,''))} placeholder="••••"
              style={{ width:'100%', textAlign:'center', letterSpacing:12, fontSize:24, fontWeight:800, border:`1.5px solid ${T.border}`, borderRadius:12, padding:'16px 14px', marginBottom:16, boxSizing:'border-box', fontFamily:'inherit', color:T.navy }} />
            {err && <p style={{ color:T.red, fontSize:12, marginBottom:12, textAlign:'center' }}>{err}</p>}
            <button disabled={pin.length!==4} onClick={revealBalance}
              style={{ width:'100%', background: pin.length===4 ? T.headerGrad : T.light, color: pin.length===4 ? '#fff':T.muted, border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor: pin.length===4 ? 'pointer':'not-allowed' }}>
              Check Balance
            </button>
          </div>
        )}

        {/* ── BALANCE: RESULT ───────────────────────────── */}
        {view === 'balanceResult' && activeAccount && (
          <div style={{ background:T.card, borderRadius:20, border:`1px solid ${T.border}`, padding:24, textAlign:'center' }}>
            <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 4px' }}>{activeAccount.bankName}</p>
            <p style={{ color:T.muted, fontSize:12, margin:'0 0 20px' }}>A/C {activeAccount.accountNumberMasked}</p>
            <p style={{ color:T.navy, fontSize:36, fontWeight:900, margin:'0 0 24px' }}>₹{activeAccount.mockBalance.toLocaleString('en-IN')}</p>
            <button onClick={() => setView('list')}
              style={{ width:'100%', background:T.headerGrad, color:'#fff', border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor:'pointer' }}>
              Done
            </button>
          </div>
        )}

        {/* ── TRANSACTIONS ──────────────────────────────── */}
        {view === 'transactions' && activeAccount && (
          <div style={{ background:T.card, borderRadius:20, border:`1px solid ${T.border}`, padding:0, overflow:'hidden' }}>
            <div style={{ padding:'16px 18px 10px' }}>
              <p style={{ fontWeight:700, fontSize:14, color:T.navy, margin:0 }}>{activeAccount.bankName}</p>
              <p style={{ fontSize:12, color:T.muted, margin:'2px 0 0' }}>A/C {activeAccount.accountNumberMasked}</p>
            </div>
            {activeAccount.mockTransactions.map((tx, i) => (
              <div key={tx.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 18px', borderTop:`1px solid ${T.border}` }}>
                <div>
                  <p style={{ fontWeight:600, fontSize:13, color:T.navy, margin:0 }}>{tx.label}</p>
                  <p style={{ fontSize:11, color:T.muted, margin:'2px 0 0' }}>{tx.date}</p>
                </div>
                <p style={{ fontWeight:800, fontSize:14, margin:0, color: tx.type==='credit' ? T.green : T.navy }}>
                  {tx.type==='credit' ? '+' : '−'}₹{tx.amount.toLocaleString('en-IN')}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── LINK WIZARD: mobile / searching / accounts / pin / confirmPin ── */}
        {['mobile','searching','accounts','pin','confirmPin'].includes(view) && (
          <div style={{ background:T.card, borderRadius:20, border:`1px solid ${T.border}`, padding:24, boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>

            {view === 'mobile' && (
              <>
                <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 4px' }}>MOBILE NUMBER</p>
                <p style={{ color:T.muted, fontSize:12, margin:'0 0 16px', lineHeight:1.6 }}>
                  Use the mobile number registered with your bank — we'll look up accounts linked to it. You can link more than one account, even from the same number.
                </p>
                <div style={{ display:'flex', alignItems:'center', gap:8, border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', marginBottom:16 }}>
                  <span style={{ color:T.navy, fontWeight:700, fontSize:14 }}>+91</span>
                  <input value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g,'').slice(0,10))}
                    placeholder="10-digit mobile number"
                    style={{ border:'none', outline:'none', fontSize:14, flex:1, fontFamily:'inherit' }} />
                </div>
                {err && <p style={{ color:T.red, fontSize:12, marginBottom:12 }}>{err}</p>}
                <button disabled={!mobileValid} onClick={searchAccounts}
                  style={{ width:'100%', background: mobileValid ? T.headerGrad : T.light, color: mobileValid ? '#fff' : T.muted, border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor: mobileValid ? 'pointer':'not-allowed' }}>
                  Find My Bank Accounts
                </button>
              </>
            )}

            {view === 'searching' && (
              <div style={{ textAlign:'center', padding:'30px 0' }}>
                <div style={{ width:52, height:52, border:`4px solid ${T.light}`, borderTopColor:T.accent, borderRadius:'50%', animation:'linkSpin 0.8s linear infinite', margin:'0 auto 18px' }} />
                <style>{`@keyframes linkSpin{to{transform:rotate(360deg)}}`}</style>
                <p style={{ color:T.navy, fontWeight:700, fontSize:14 }}>Looking up accounts linked to +91 {mobile}…</p>
                <p style={{ color:T.muted, fontSize:11, marginTop:8 }}>🧪 Test mode — no real bank is being contacted</p>
              </div>
            )}

            {view === 'accounts' && (
              <>
                <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 14px' }}>
                  {discovered.length} ACCOUNT{discovered.length!==1?'S':''} FOUND
                </p>
                {discovered.map((acc, i) => (
                  <button key={i} onClick={() => chooseAccount(acc)}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:14, background:T.light, border:`1.5px solid ${T.border}`, borderRadius:14, padding:14, marginBottom:10, cursor:'pointer', textAlign:'left' }}>
                    <div style={{ width:44, height:44, borderRadius:12, background:T.headerGrad, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:15, flexShrink:0 }}>
                      {acc.bankName.split(' ').map(w=>w[0]).slice(0,2).join('')}
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ fontWeight:700, fontSize:14, color:T.navy, margin:0 }}>{acc.bankName}</p>
                      <p style={{ fontSize:12, color:T.muted, margin:'2px 0 0' }}>{acc.accountType} · {acc.accountNumberMasked}</p>
                    </div>
                    <span style={{ color:T.accent, fontSize:16 }}>→</span>
                  </button>
                ))}
              </>
            )}

            {view === 'pin' && pendingAccount && (
              <>
                <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 4px' }}>SET YOUR UPI PIN</p>
                <p style={{ color:T.muted, fontSize:12, margin:'0 0 20px', lineHeight:1.6 }}>
                  This 4-digit PIN authorizes payments from {pendingAccount.bankName} {pendingAccount.accountNumberMasked}.
                </p>
                <input type="password" inputMode="numeric" maxLength={4} value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g,''))} placeholder="••••"
                  style={{ width:'100%', textAlign:'center', letterSpacing:12, fontSize:24, fontWeight:800, border:`1.5px solid ${T.border}`, borderRadius:12, padding:'16px 14px', marginBottom:16, boxSizing:'border-box', fontFamily:'inherit', color:T.navy }} />
                {err && <p style={{ color:T.red, fontSize:12, marginBottom:12, textAlign:'center' }}>{err}</p>}
                <button disabled={pin.length!==4} onClick={submitPin}
                  style={{ width:'100%', background: pin.length===4 ? T.headerGrad : T.light, color: pin.length===4 ? '#fff':T.muted, border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor: pin.length===4 ? 'pointer':'not-allowed' }}>
                  Continue
                </button>
              </>
            )}

            {view === 'confirmPin' && (
              <>
                <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 16px' }}>CONFIRM YOUR PIN</p>
                <input type="password" inputMode="numeric" maxLength={4} value={pinConfirm}
                  onChange={e => setPinConfirm(e.target.value.replace(/\D/g,''))} placeholder="••••"
                  style={{ width:'100%', textAlign:'center', letterSpacing:12, fontSize:24, fontWeight:800, border:`1.5px solid ${T.border}`, borderRadius:12, padding:'16px 14px', marginBottom:16, boxSizing:'border-box', fontFamily:'inherit', color:T.navy }} />
                {err && <p style={{ color:T.red, fontSize:12, marginBottom:12, textAlign:'center' }}>{err}</p>}
                <button disabled={pinConfirm.length!==4 || loading} onClick={confirmPin}
                  style={{ width:'100%', background: pinConfirm.length===4 ? T.headerGrad : T.light, color: pinConfirm.length===4 ? '#fff':T.muted, border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor: pinConfirm.length===4 ? 'pointer':'not-allowed' }}>
                  {loading ? 'Linking…' : 'Confirm & Link Account'}
                </button>
              </>
            )}
          </div>
        )}

        {view === 'mobile' && (
          <div style={{ background:'rgba(255,214,10,0.12)', border:'1px solid rgba(255,214,10,0.3)', borderRadius:12, padding:'10px 14px', marginTop:16 }}>
            <p style={{ color:'#B8860B', fontSize:11, fontWeight:700, margin:0, lineHeight:1.5 }}>
              🧪 Test mode — this simulates bank account discovery, balance, and transaction history. No real bank or NPCI system is contacted.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
