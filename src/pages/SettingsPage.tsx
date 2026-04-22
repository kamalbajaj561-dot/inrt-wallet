import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BottomNav from '../components/BottomNav';
import '../styles/theme.css';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const SECTIONS = [
    { title:'Account', items:[
      {icon:'👤',label:'Edit Profile',   path:'/profile'},
      {icon:'🔐',label:'Security',       path:'/profile'},
      {icon:'🏦',label:'Linked Banks',   path:'/link-bank'},
      {icon:'🪪',label:'KYC Status',     path:'/kyc'},
    ]},
    { title:'App', items:[
      {icon:'🔔',label:'Notifications',  path:'/notifications'},
      {icon:'🌙',label:'Appearance',     path:null},
      {icon:'🌐',label:'Language',       path:null},
    ]},
    { title:'Support', items:[
      {icon:'💬',label:'Help & Support', path:null},
      {icon:'⭐',label:'Rate the App',   path:null},
      {icon:'📋',label:'Terms of Service',path:null},
      {icon:'🔒',label:'Privacy Policy', path:null},
    ]},
  ];

  return (
    <div className="page">
      <div style={{background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 16px',
                    display:'flex',alignItems:'center',gap:14,borderBottom:'1px solid var(--b1)'}}>
        <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
        <h1 className="page-title">Settings</h1>
      </div>
      <div style={{padding:'16px 16px 0'}}>
        {SECTIONS.map(sec=>(
          <div key={sec.title} style={{marginBottom:20}}>
            <p className="s-label">{sec.title}</p>
            <div className="card" style={{padding:0,overflow:'hidden'}}>
              {sec.items.map((item,i)=>(
                <button key={item.label}
                  onClick={()=>item.path?navigate(item.path):{}}
                  style={{width:'100%',display:'flex',alignItems:'center',gap:14,padding:'16px 20px',
                            background:'none',border:'none',cursor:item.path?'pointer':'default',
                            borderBottom:i<sec.items.length-1?'1px solid var(--b1)':'none',
                            textAlign:'left' as const}}>
                  <span style={{fontSize:20,flexShrink:0}}>{item.icon}</span>
                  <span style={{flex:1,color:'var(--t1)',fontWeight:500,fontSize:15}}>{item.label}</span>
                  {item.path && <span style={{color:'var(--t3)',fontSize:16}}>›</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button onClick={async()=>{await logout();navigate('/login');}}
          style={{width:'100%',padding:'15px',background:'rgba(255,77,106,0.08)',
                    border:'1px solid rgba(255,77,106,0.25)',borderRadius:'var(--r2)',
                    color:'var(--red)',fontWeight:700,fontSize:15,cursor:'pointer',
                    fontFamily:'var(--f-body)',marginBottom:20}}>
          🚪 Logout
        </button>
      </div>
      <BottomNav />
    </div>
  );
}