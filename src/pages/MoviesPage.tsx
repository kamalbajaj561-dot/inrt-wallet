import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/theme.css';

// PLACEHOLDER: Replace with your TMDB API key
const TMDB_KEY = import.meta.env.VITE_TMDB_KEY || 'YOUR_TMDB_API_KEY';

export default function MoviesPage() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (TMDB_KEY === 'YOUR_TMDB_API_KEY') {
      setMovies([
        {id:1,title:'Animal',vote_average:7.5,release_date:'2023-12-01'},
        {id:2,title:'Jawan',vote_average:8.1,release_date:'2023-09-07'},
        {id:3,title:'Pathaan',vote_average:7.8,release_date:'2023-01-25'},
      ]);
      setLoading(false);
      return;
    }
    fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_KEY}&region=IN`)
      .then(r=>r.json())
      .then(d=>{ setMovies(d.results?.slice(0,8)||[]); setLoading(false); })
      .catch(()=>setLoading(false));
  },[]);

  const CITIES = ['Mumbai','Delhi','Bangalore','Chennai','Hyderabad','Pune','Kolkata','Ahmedabad'];
  const [city, setCity] = useState('Mumbai');

  return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)' }}>
      <div style={{ background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:16 }}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Movie Tickets</h1>
        </div>
        <div style={{ display:'flex',gap:8,overflowX:'auto',paddingBottom:4 }}>
          {CITIES.map(c=>(
            <button key={c} onClick={()=>setCity(c)}
              style={{ padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',
                         flexShrink:0,background:city===c?'var(--teal-dim)':'var(--bg-elevated)',
                         border:`1px solid ${city===c?'var(--teal)':'var(--b1)'}`,
                         color:city===c?'var(--teal)':'var(--t2)' }}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding:'16px 16px 40px' }}>
        <p className="s-title">Now Showing</p>
        {loading ? [1,2,3].map(i=><div key={i} className="shimmer" style={{height:80,marginBottom:10}}/>) :
          movies.map(m=>(
            <div key={m.id} style={{ background:'var(--bg-card)',border:'1px solid var(--b1)',
                                      borderRadius:'var(--r2)',padding:'16px',marginBottom:10,
                                      display:'flex',gap:14,alignItems:'center' }}>
              <div style={{ width:56,height:72,borderRadius:'var(--r1)',background:'var(--bg-elevated)',
                             display:'flex',alignItems:'center',justifyContent:'center',
                             fontSize:24,flexShrink:0 }}>
                {m.poster_path
                  ? <img src={`https://image.tmdb.org/t/p/w92${m.poster_path}`} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'var(--r1)'}}/>
                  : '🎬'}
              </div>
              <div style={{flex:1}}>
                <p style={{color:'var(--t1)',fontWeight:700,fontSize:15}}>{m.title}</p>
                <p style={{color:'var(--t3)',fontSize:11,marginTop:3}}>{m.release_date?.slice(0,4)} · ⭐ {m.vote_average?.toFixed(1)}</p>
              </div>
              <button className="btn-primary" style={{width:'auto',padding:'8px 16px',fontSize:13}}>
                Book
              </button>
            </div>
          ))
        }
      </div>
    </div>
  );
}