'use client';
import { useEffect,useState } from 'react';
import { api,loadSession } from '../../../lib/api';
import { PageHeader } from '../../../components/console-ui';
type Student={id:string;studentNo:string;name:string;email:string;department:string;campus:string;status:string};
export default function TeacherStudentsPage(){
 const [items,setItems]=useState<Student[]>([]),[error,setError]=useState('');
 useEffect(()=>{const s=loadSession();if(!s)return;void api<{items:Student[]}>('/v1/students?limit=100',{session:s}).then(r=>setItems(r.items)).catch(e=>setError(e.message));},[]);
 return <section className="role-dashboard"><PageHeader title="Student directory"/><p className="muted">Institution students visible to your faculty membership.</p>{error?<p className="error" role="alert">{error}</p>:null}<div className="card">{items.map(s=><article className="academic-list-item" key={s.id}><strong>{s.studentNo} · {s.name}</strong><span>{s.email} · {s.department} · {s.campus}</span><small>{s.status}</small></article>)}{!items.length&&!error?<p className="muted">No student records are available.</p>:null}</div></section>;
}
