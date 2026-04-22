import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/theme.css';

export default function SplitBill() {
  const navigate = useNavigate();
  const [title,   setTitle]   = useState('');
  const [total,   setTotal]   = useState('');
  const [members, setMembers] = useState([{name:'',paid:false}]);
  const [split,   setSplit]   = useState<number[]>([]);

  const addMember = () => setMembers(m=>[...m,{name:'',paid:false}]);
  const calculate = () => {
    const t = parseFloat(total);
    if (!t || members.length === 0) return;
    const each = t / members.length;
    setSplit(members.map(() => each));
  };

  return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)'}}>
      <div style={{background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Split Bill</h1>
        </div>
      </div>
      <div style={{padding:'20px 16px 40px'}}>
        <div className="card" style={{marginBottom:16}}>
          <p className="s-label">BILL TITLE</p>
          <input className="inp" placeholder="Dinner at Taj" value={title} onChange={e=>setTitle(e.target.value)} style={{marginBottom:14}}/>
          <p className="s-label">TOTAL AMOUNT (₹)</p>
          <div className="amount-box">
            <span style={{color:'var(--teal)',fontSize:24,fontWeight:700}}>₹</span>
            <input className="amount-input" type="number" placeholder="0" value={total} onChange={e=>setTotal(e.target.value)}/>
          </div>
        </div>
        <div className="card" style={{marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <p className="s-title" style={{marginBottom:0}}>Members</p>
            <button onClick={addMember} className="btn-ghost">+ Add</button>
          </div>
          {members.map((m,i)=>(
            <div key={i} style={{display:'flex',gap:10,marginBottom:10,alignItems:'center'}}>
              <input className="inp" style={{flex:1}} placeholder={`Person ${i+1}`}
                value={m.name} onChange={e=>{const x=[...members];x[i]={...x[i],name:e.target.value};setMembers(x)}}/>
              {split[i] && <span style={{color:'var(--teal)',fontWeight:700,fontSize:14,flexShrink:0}}>₹{split[i].toFixed(0)}</span>}
            </div>
          ))}
        </div>
        <button className="btn-primary" onClick={calculate}>Calculate Split</button>
        {split.length>0 && (
          <div style={{marginTop:16}}>
            <button className="btn-outline" style={{marginTop:10}}>📤 Share with everyone</button>
          </div>
        )}
      </div>
    </div>
  );
}