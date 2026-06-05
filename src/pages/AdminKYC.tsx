/**
 * INRT WALLET — AdminKYC.tsx
 * Admin dashboard to review and approve KYC submissions
 *
 * Access at: /admin/kyc?key=YOUR_ADMIN_KEY
 * Add route in App.tsx: <Route path="/admin/kyc" element={<AdminKYC />} />
 *
 * Features:
 *   - See all pending KYC submissions
 *   - View PAN photo + selfie
 *   - Approve or reject with one click
 *   - Add rejection reason
 *   - Filter by status
 *   - Stats overview
 */

import { useState, useEffect } from 'react';
import { useLocation }         from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

type KYCStatus = 'pending' | 'verified' | 'rejected' | 'all';

interface KYCRecord {
  id:              string;
  fullName:        string;
  panMasked:       string;
  dob:             string;
  status:          string;
  kycType:         string;
  panPhoto:        string | null;
  selfie:          string | null;
  submittedAt:     string | null;
  reviewedAt:      string | null;
  rejectionReason: string | null;
}

interface Stats {
  totalUsers:    number;
  kycVerified:   number;
  kycPending:    number;
  kycRejected:   number;
  totalBalance:  number;
  last30Days:    { txVolume: number; txCount: number };
  earnings:      { total: number; transferEarnings: number; rechargeEarnings: number; billsEarnings: number };
}

export default function AdminKYC() {
  const location = useLocation();
  const params   = new URLSearchParams(location.search);
  const keyParam = params.get('key') || '';

  const [adminKey,    setAdminKey]    = useState(keyParam);
  const [authed,      setAuthed]      = useState(!!keyParam);
  const [keyInput,    setKeyInput]    = useState('');

  const [filter,      setFilter]      = useState<KYCStatus>('pending');
  const [records,     setRecords]     = useState<KYCRecord[]>([]);
  const [stats,       setStats]       = useState<Stats | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [selected,    setSelected]    = useState<KYCRecord | null>(null);
  const [rejectNote,  setRejectNote]  = useState('');
  const [actionLoad,  setActionLoad]  = useState(false);
  const [msg,         setMsg]         = useState('');
  const [tab,         setTab]         = useState<'kyc'|'stats'|'users'>('kyc');
  const [users,       setUsers]       = useState<any[]>([]);

  // ── Load data ──────────────────────────────────────────────
  const loadKYC = async () => {
    if (!adminKey) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/kyc/admin/list?adminKey=${adminKey}&status=${filter}`);
      const d = await r.json();
      if (r.status === 403) { setAuthed(false); return; }
      setRecords(d.submissions || []);
    } catch (e: any) {
      setMsg('Failed to load: ' + e.message);
    }
    setLoading(false);
  };

  const loadStats = async () => {
    if (!adminKey) return;
    try {
      const r = await fetch(`${API}/admin/stats?adminKey=${adminKey}`);
      const d = await r.json();
      if (d.stats) setStats(d.stats);
    } catch {}
  };

  const loadUsers = async () => {
    if (!adminKey) return;
    try {
      const r = await fetch(`${API}/admin/users?adminKey=${adminKey}`);
      const d = await r.json();
      setUsers(d.users || []);
    } catch {}
  };

  useEffect(() => {
    if (authed) {
      loadKYC();
      loadStats();
    }
  }, [authed, filter]);

  useEffect(() => {
    if (authed && tab === 'users') loadUsers();
  }, [tab, authed]);

  // ── Approve / Reject ───────────────────────────────────────
  const handleAction = async (userId: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && !rejectNote.trim())
      return setMsg('Please enter a rejection reason');

    setActionLoad(true); setMsg('');
    try {
      const r = await fetch(`${API}/kyc/admin/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          action,
          reason:   action === 'reject' ? rejectNote : null,
          adminKey,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Action failed');
      setMsg(d.message || `KYC ${action}d successfully`);
      setSelected(null);
      setRejectNote('');
      loadKYC();
      loadStats();
    } catch (e: any) {
      setMsg('Error: ' + e.message);
    }
    setActionLoad(false);
  };

  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  };

  // ── Login screen ───────────────────────────────────────────
  if (!authed) return (
    <div style={{ maxWidth:400, margin:'80px auto', padding:24, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ background:'#fff', borderRadius:18, padding:32, boxShadow:'0 4px 24px rgba(0,0,0,0.12)' }}>
        <h2 style={{ fontWeight:800, fontSize:22, color:'#0A2540', margin:'0 0 8px' }}>🔐 Admin Access</h2>
        <p style={{ color:'#6B7C93', fontSize:14, margin:'0 0 24px' }}>Enter your admin key to continue</p>
        <input
          type="password"
          value={keyInput}
          onChange={e=>setKeyInput(e.target.value)}
          placeholder="Admin key"
          onKeyDown={e=>e.key==='Enter'&&(setAdminKey(keyInput),setAuthed(true))}
          style={{ width:'100%', padding:'13px 14px', borderRadius:12, border:'2px solid #E8ECF0', fontSize:15, outline:'none', boxSizing:'border-box' as const, marginBottom:14, fontFamily:"'Plus Jakarta Sans',sans-serif" }}
        />
        <button
          onClick={()=>{ setAdminKey(keyInput); setAuthed(true); }}
          style={{ width:'100%', padding:'14px', borderRadius:12, background:'#0A2540', color:'#fff', border:'none', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
          Access Dashboard →
        </button>
      </div>
    </div>
  );

  // ── Main dashboard ─────────────────────────────────────────
  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'20px 16px', fontFamily:"'Plus Jakarta Sans',sans-serif", minHeight:'100vh', background:'#F6F8FA' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ fontWeight:800, fontSize:24, color:'#0A2540', margin:0 }}>INRT Admin</h1>
          <p style={{ color:'#6B7C93', fontSize:13, margin:0 }}>inrtwallet.in · admin@inrtwallet.in</p>
        </div>
        <button onClick={()=>setAuthed(false)} style={{ background:'none', border:'1px solid #E8ECF0', borderRadius:10, padding:'8px 16px', color:'#6B7C93', cursor:'pointer', fontSize:13 }}>Logout</button>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
          {[
            { label:'Total Users',   val: stats.totalUsers,                    color:'#0070F3' },
            { label:'KYC Pending',   val: stats.kycPending,                    color:'#FF9500' },
            { label:'KYC Verified',  val: stats.kycVerified,                   color:'#00C853' },
            { label:'Wallet Balance',val: `₹${stats.totalBalance.toLocaleString('en-IN')}`, color:'#7B2FBE' },
          ].map(s=>(
            <div key={s.label} style={{ background:'#fff', borderRadius:14, padding:'14px 16px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:'1px solid #E8ECF0' }}>
              <p style={{ color:'#6B7C93', fontSize:11, fontWeight:600, margin:'0 0 4px', letterSpacing:0.5 }}>{s.label.toUpperCase()}</p>
              <p style={{ fontWeight:800, fontSize:22, color:s.color, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Earnings row */}
      {stats?.earnings && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
          {[
            { label:'Total Earned',    val:`₹${stats.earnings.total.toLocaleString()}` },
            { label:'Transfer Comm.',  val:`₹${stats.earnings.transferEarnings.toLocaleString()}` },
            { label:'Recharge Comm.', val:`₹${stats.earnings.rechargeEarnings.toLocaleString()}` },
            { label:'Bills Comm.',     val:`₹${stats.earnings.billsEarnings.toLocaleString()}` },
          ].map(s=>(
            <div key={s.label} style={{ background:'#fff', borderRadius:14, padding:'12px 14px', boxShadow:'0 1px 6px rgba(0,0,0,0.05)', border:'1px solid #E8ECF0' }}>
              <p style={{ color:'#6B7C93', fontSize:10, fontWeight:600, margin:'0 0 4px' }}>{s.label.toUpperCase()}</p>
              <p style={{ fontWeight:700, fontSize:16, color:'#0A2540', margin:0 }}>{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {([['kyc','📋 KYC Review'],['stats','📊 Stats'],['users','👥 Users']] as [typeof tab, string][]).map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ padding:'10px 20px', borderRadius:10, border:`1.5px solid ${tab===t?'#0A2540':'#E8ECF0'}`, background:tab===t?'#0A2540':'#fff', color:tab===t?'#fff':'#6B7C93', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── KYC TAB ── */}
      {tab==='kyc'&&(
        <>
          {/* Filter + Refresh */}
          <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center' }}>
            {(['pending','verified','rejected','all'] as KYCStatus[]).map(f=>(
              <button key={f} onClick={()=>setFilter(f)}
                style={{ padding:'8px 16px', borderRadius:20, border:`1.5px solid ${filter===f?'#0A2540':'#E8ECF0'}`, background:filter===f?'#0A2540':'#fff', color:filter===f?'#fff':'#6B7C93', fontWeight:700, fontSize:12, cursor:'pointer', textTransform:'capitalize' as const }}>
                {f}
              </button>
            ))}
            <button onClick={loadKYC} style={{ marginLeft:'auto', padding:'8px 16px', borderRadius:10, border:'1px solid #E8ECF0', background:'#fff', color:'#0070F3', fontWeight:700, fontSize:12, cursor:'pointer' }}>
              🔄 Refresh
            </button>
          </div>

          {msg && (
            <div style={{ background: msg.includes('Error') ? '#FFF0F0' : '#F0FFF4', border:`1px solid ${msg.includes('Error')?'#FFCCCC':'#CCFFCC'}`, borderRadius:10, padding:'10px 14px', marginBottom:14, color:msg.includes('Error')?'#CC0000':'#006600', fontSize:13, fontWeight:600 }}>
              {msg}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign:'center', padding:40, color:'#6B7C93' }}>Loading…</div>
          ) : records.length === 0 ? (
            <div style={{ textAlign:'center', padding:60, background:'#fff', borderRadius:16, border:'1px solid #E8ECF0' }}>
              <p style={{ fontSize:36, margin:'0 0 12px' }}>📋</p>
              <p style={{ fontWeight:700, color:'#0A2540', margin:'0 0 4px' }}>No {filter} submissions</p>
              <p style={{ color:'#6B7C93', fontSize:13 }}>Check back later</p>
            </div>
          ) : (
            <div>
              {records.map(rec=>(
                <div key={rec.id} style={{ background:'#fff', borderRadius:14, border:`1px solid ${rec.status==='pending'?'#FF9500':rec.status==='verified'?'#00C853':'#FF3B30'}22`, padding:16, marginBottom:10, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                        <p style={{ fontWeight:800, fontSize:16, color:'#0A2540', margin:0 }}>{rec.fullName}</p>
                        <span style={{ background:rec.status==='pending'?'#FFF3E0':rec.status==='verified'?'#E8FAF0':'#FFEBEE', color:rec.status==='pending'?'#FF9500':rec.status==='verified'?'#00C853':'#FF3B30', fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20 }}>
                          {rec.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ display:'flex', gap:16, flexWrap:'wrap' as const }}>
                        <span style={{ color:'#6B7C93', fontSize:12 }}>PAN: <strong style={{ color:'#0A2540', fontFamily:'monospace' }}>{rec.panMasked}</strong></span>
                        <span style={{ color:'#6B7C93', fontSize:12 }}>DOB: <strong style={{ color:'#0A2540' }}>{rec.dob}</strong></span>
                        <span style={{ color:'#6B7C93', fontSize:12 }}>Submitted: <strong style={{ color:'#0A2540' }}>{fmtDate(rec.submittedAt)}</strong></span>
                        <span style={{ color:'#6B7C93', fontSize:12 }}>UID: <strong style={{ color:'#0A2540', fontFamily:'monospace', fontSize:11 }}>{rec.id.slice(0,16)}…</strong></span>
                      </div>
                      {rec.rejectionReason && (
                        <p style={{ color:'#FF3B30', fontSize:12, marginTop:4, fontWeight:600 }}>Rejection: {rec.rejectionReason}</p>
                      )}
                    </div>

                    {rec.status === 'pending' && (
                      <button onClick={()=>{ setSelected(rec); setRejectNote(''); setMsg(''); }}
                        style={{ background:'#0070F3', color:'#fff', border:'none', borderRadius:10, padding:'8px 16px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif", flexShrink:0, marginLeft:12 }}>
                        Review →
                      </button>
                    )}
                  </div>

                  {/* Document previews */}
                  {(rec.panPhoto || rec.selfie) && (
                    <div style={{ display:'flex', gap:10, marginTop:12 }}>
                      {rec.panPhoto && (
                        <div>
                          <p style={{ color:'#6B7C93', fontSize:10, fontWeight:600, margin:'0 0 4px' }}>PAN CARD</p>
                          <a href={rec.panPhoto} target="_blank" rel="noopener noreferrer">
                            <img src={rec.panPhoto} alt="PAN" style={{ width:140, height:88, objectFit:'cover' as const, borderRadius:8, border:'1px solid #E8ECF0', cursor:'pointer' }}/>
                          </a>
                        </div>
                      )}
                      {rec.selfie && (
                        <div>
                          <p style={{ color:'#6B7C93', fontSize:10, fontWeight:600, margin:'0 0 4px' }}>SELFIE</p>
                          <a href={rec.selfie} target="_blank" rel="noopener noreferrer">
                            <img src={rec.selfie} alt="Selfie" style={{ width:88, height:88, objectFit:'cover' as const, borderRadius:'50%', border:'2px solid #E8ECF0', cursor:'pointer' }}/>
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* No photos uploaded */}
                  {!rec.panPhoto && !rec.selfie && rec.status === 'pending' && (
                    <p style={{ color:'#FF9500', fontSize:12, marginTop:8, fontWeight:600 }}>
                      ⚠️ No photos uploaded — verify PAN number manually
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── STATS TAB ── */}
      {tab==='stats'&&stats&&(
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', padding:20, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontWeight:800, color:'#0A2540', margin:'0 0 16px' }}>Last 30 Days</h3>
          {[
            ['Transaction Volume',`₹${stats.last30Days.txVolume.toLocaleString('en-IN')}`],
            ['Transaction Count', stats.last30Days.txCount.toString()],
            ['KYC Pending',       stats.kycPending.toString()],
            ['KYC Verified',      stats.kycVerified.toString()],
            ['KYC Rejected',      stats.kycRejected.toString()],
            ['Total Users',       stats.totalUsers.toString()],
            ['Total Wallet Funds',`₹${stats.totalBalance.toLocaleString('en-IN')}`],
          ].map(([k,v])=>(
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #F0F4F8' }}>
              <span style={{ color:'#6B7C93', fontSize:14 }}>{k}</span>
              <span style={{ fontWeight:700, fontSize:14, color:'#0A2540' }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── USERS TAB ── */}
      {tab==='users'&&(
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E8ECF0', padding:0, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #F0F4F8', display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontWeight:700, fontSize:15, color:'#0A2540' }}>All Users ({users.length})</span>
            <button onClick={loadUsers} style={{ color:'#0070F3', background:'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:700 }}>🔄 Refresh</button>
          </div>
          {users.map((u,i)=>(
            <div key={u.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:i<users.length-1?'1px solid #F0F4F8':'none' }}>
              <div>
                <p style={{ fontWeight:700, fontSize:14, color:'#0A2540', margin:0 }}>{u.name || 'No name'}</p>
                <p style={{ fontSize:12, color:'#6B7C93', margin:'2px 0 0', fontFamily:'monospace' }}>{u.phone || u.id.slice(0,20)}</p>
              </div>
              <div style={{ textAlign:'right' as const }}>
                <p style={{ fontWeight:700, fontSize:14, color:'#0A2540', margin:0 }}>₹{(u.balance||0).toLocaleString('en-IN')}</p>
                <span style={{ background:u.kycStatus==='verified'?'#E8FAF0':u.kycStatus==='pending'?'#FFF3E0':'#F0F4F8', color:u.kycStatus==='verified'?'#00C853':u.kycStatus==='pending'?'#FF9500':'#6B7C93', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20 }}>
                  {(u.kycStatus||'not_started').toUpperCase().replace('_',' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── REVIEW MODAL ── */}
      {selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div style={{ background:'#fff', borderRadius:20, padding:24, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto' as const, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ fontWeight:800, fontSize:18, color:'#0A2540', margin:0 }}>Review KYC</h3>
              <button onClick={()=>{ setSelected(null); setMsg(''); }} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#6B7C93' }}>✕</button>
            </div>

            {/* User details */}
            <div style={{ background:'#F6F8FA', borderRadius:12, padding:14, marginBottom:16 }}>
              {[
                ['Full Name', selected.fullName],
                ['PAN',       selected.panMasked],
                ['DOB',       selected.dob],
                ['Submitted', fmtDate(selected.submittedAt)],
                ['User ID',   selected.id],
              ].map(([k,v])=>(
                <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #E8ECF0' }}>
                  <span style={{ color:'#6B7C93', fontSize:13 }}>{k}</span>
                  <span style={{ fontWeight:600, fontSize:13, color:'#0A2540', fontFamily:k==='PAN'||k==='User ID'?'monospace':'inherit' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Photos */}
            <div style={{ display:'flex', gap:12, marginBottom:16 }}>
              {selected.panPhoto && (
                <div style={{ flex:1 }}>
                  <p style={{ color:'#6B7C93', fontSize:11, fontWeight:600, margin:'0 0 6px' }}>PAN CARD</p>
                  <a href={selected.panPhoto} target="_blank" rel="noopener noreferrer">
                    <img src={selected.panPhoto} alt="PAN" style={{ width:'100%', borderRadius:10, border:'1px solid #E8ECF0', cursor:'pointer' }}/>
                  </a>
                  <p style={{ color:'#0070F3', fontSize:11, margin:'4px 0 0', cursor:'pointer' }}>🔍 Click to enlarge</p>
                </div>
              )}
              {selected.selfie && (
                <div style={{ flex:0.6 }}>
                  <p style={{ color:'#6B7C93', fontSize:11, fontWeight:600, margin:'0 0 6px' }}>SELFIE</p>
                  <a href={selected.selfie} target="_blank" rel="noopener noreferrer">
                    <img src={selected.selfie} alt="Selfie" style={{ width:'100%', borderRadius:10, border:'1px solid #E8ECF0', cursor:'pointer' }}/>
                  </a>
                </div>
              )}
              {!selected.panPhoto && !selected.selfie && (
                <div style={{ flex:1, background:'#FFF3E0', borderRadius:12, padding:16, textAlign:'center' as const }}>
                  <p style={{ color:'#FF9500', fontWeight:700, margin:'0 0 4px' }}>⚠️ No photos uploaded</p>
                  <p style={{ color:'#6B7C93', fontSize:12, margin:0 }}>Verify PAN number manually before approving</p>
                </div>
              )}
            </div>

            {/* Checklist */}
            <div style={{ background:'#F6F8FA', borderRadius:12, padding:14, marginBottom:16 }}>
              <p style={{ fontWeight:700, color:'#0A2540', fontSize:13, margin:'0 0 10px' }}>✅ Verification Checklist</p>
              {[
                'PAN card is clearly visible and readable',
                'Name on PAN matches submitted name',
                'PAN number format is valid (10 chars)',
                'Selfie shows a real person, not a photo',
                'Person in selfie matches PAN card photo',
              ].map((item, i)=>(
                <label key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, cursor:'pointer' }}>
                  <input type="checkbox" style={{ width:15, height:15 }}/>
                  <span style={{ color:'#6B7C93', fontSize:12 }}>{item}</span>
                </label>
              ))}
            </div>

            {/* Rejection reason */}
            <div style={{ marginBottom:16 }}>
              <p style={{ color:'#6B7C93', fontSize:12, fontWeight:600, margin:'0 0 8px' }}>REJECTION REASON (required if rejecting)</p>
              <select value={rejectNote} onChange={e=>setRejectNote(e.target.value)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1.5px solid #E8ECF0', fontSize:13, outline:'none', marginBottom:8, background:'#fff', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                <option value="">Select reason…</option>
                <option value="PAN card photo is blurry or unreadable">PAN card photo is blurry or unreadable</option>
                <option value="Name does not match PAN card">Name does not match PAN card</option>
                <option value="PAN card appears to be edited or fake">PAN card appears to be edited or fake</option>
                <option value="Selfie does not match PAN card photo">Selfie does not match PAN card photo</option>
                <option value="Documents are expired">Documents are expired</option>
                <option value="Please upload clearer photos">Please upload clearer photos</option>
              </select>
              <input value={rejectNote} onChange={e=>setRejectNote(e.target.value)}
                placeholder="Or type custom reason…"
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1.5px solid #E8ECF0', fontSize:13, outline:'none', fontFamily:"'Plus Jakarta Sans',sans-serif", boxSizing:'border-box' as const }}/>
            </div>

            {msg && (
              <p style={{ color:msg.includes('Error')?'#CC0000':'#00C853', fontSize:13, fontWeight:600, marginBottom:12 }}>{msg}</p>
            )}

            {/* Action buttons */}
            <div style={{ display:'flex', gap:10 }}>
              <button
                onClick={()=>handleAction(selected.id, 'reject')}
                disabled={actionLoad}
                style={{ flex:1, padding:'14px', borderRadius:12, background:'#FFF0F0', border:'1.5px solid #FFCCCC', color:'#CC0000', fontWeight:700, cursor:'pointer', fontSize:14, fontFamily:"'Plus Jakarta Sans',sans-serif", opacity:actionLoad?0.6:1 }}>
                {actionLoad ? '…' : '❌ Reject'}
              </button>
              <button
                onClick={()=>handleAction(selected.id, 'approve')}
                disabled={actionLoad}
                style={{ flex:2, padding:'14px', borderRadius:12, background:'#0A2540', border:'none', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:14, fontFamily:"'Plus Jakarta Sans',sans-serif", opacity:actionLoad?0.6:1 }}>
                {actionLoad ? 'Processing…' : '✅ Approve KYC'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
