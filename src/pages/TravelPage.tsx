import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/theme.css';

export default function TravelPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'flights'|'hotels'|'trains'|'buses'>('flights');

  return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)' }}>
      <div style={{ background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:16 }}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Travel Bookings</h1>
        </div>
        <div style={{display:'flex',gap:8}}>
          {(['flights','hotels','trains','buses'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{flex:1,padding:'8px 0',borderRadius:10,fontSize:11,fontWeight:700,cursor:'pointer',
                       background:tab===t?'var(--teal-dim)':'var(--bg-elevated)',
                       border:`1px solid ${tab===t?'var(--teal)':'var(--b1)'}`,
                       color:tab===t?'var(--teal)':'var(--t3)'}}>
              {t==='flights'?'✈️ Flights':t==='hotels'?'🏨 Hotels':t==='trains'?'🚂 Trains':'🚌 Buses'}
            </button>
          ))}
        </div>
      </div>
      <div style={{padding:'20px 16px 40px'}}>
        <div className="card">
          {tab==='flights' && <>
            <p className="s-label">FROM</p>
            <input className="inp" placeholder="Delhi (DEL)" style={{marginBottom:12}}/>
            <p className="s-label">TO</p>
            <input className="inp" placeholder="Mumbai (BOM)" style={{marginBottom:12}}/>
            <p className="s-label">DATE</p>
            <input className="inp" type="date" style={{marginBottom:16}}/>
          </>}
          {tab==='hotels' && <>
            <p className="s-label">CITY / DESTINATION</p>
            <input className="inp" placeholder="Mumbai, India" style={{marginBottom:12}}/>
            <div style={{display:'flex',gap:10}}>
              <div style={{flex:1}}><p className="s-label">CHECK-IN</p><input className="inp" type="date"/></div>
              <div style={{flex:1}}><p className="s-label">CHECK-OUT</p><input className="inp" type="date"/></div>
            </div>
          </>}
          {tab==='trains' && <>
            <p className="s-label">FROM STATION</p>
            <input className="inp" placeholder="New Delhi (NDLS)" style={{marginBottom:12}}/>
            <p className="s-label">TO STATION</p>
            <input className="inp" placeholder="Mumbai CST (CSTM)" style={{marginBottom:12}}/>
            <p className="s-label">DATE OF JOURNEY</p>
            <input className="inp" type="date" style={{marginBottom:16}}/>
          </>}
          {tab==='buses' && <>
            <p className="s-label">FROM</p>
            <input className="inp" placeholder="Mumbai" style={{marginBottom:12}}/>
            <p className="s-label">TO</p>
            <input className="inp" placeholder="Pune" style={{marginBottom:12}}/>
            <p className="s-label">DATE</p>
            <input className="inp" type="date" style={{marginBottom:16}}/>
          </>}
          <button className="btn-primary">Search {tab.charAt(0).toUpperCase()+tab.slice(1)}</button>
        </div>
      </div>
    </div>
  );
}