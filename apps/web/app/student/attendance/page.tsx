'use client';
import { useEffect,useState } from 'react';
import { api,loadSession } from '../../../lib/api';
import { PageHeader } from '../../../components/console-ui';
type C={id:string;code:string;name:string};
type A={id:string;date:string;status:string;classId?:string};
export default function StudentAttendancePage(){
 const [items,setItems]=useState<Array<{className:string;records:A[]}>>([]),[error,setError]=useState('');
 useEffect(()=>{const s=loadSession();if(!s)return;void api<{items:C[]}>('/v1/classes',{session:s}).then(async c=>{const results=await Promise.all(c.items.map(async cls=>{const r=await api<{items:A[]}>('/v1/classes/'+cls.id+'/attendance',{session:s});return {className:cls.code+' — '+cls.name,records:r.items};}));setItems(results);}).catch(e=>setError(e.message));},[]);
 return <section className="role-dashboard"><PageHeader title="My attendance"/><p className="muted">Attendance recorded by your teachers for your enrolled classes.</p>{error?<p className="error" role="alert">{error}</p>:null}{items.map(group=><div className="card" key={group.className}><h2 className="card-title">{group.className}</h2>{group.records.map(r=><article className="academic-list-item" key={r.id}><strong>{new Date(r.date).toLocaleDateString()}</strong><span className={'attendance-status '+r.status}>{r.status}</span></article>)}{!group.records.length?<p className="muted">No attendance records have been published yet.</p>:null}</div>)}{!items.length&&!error?<div className="card"><p className="muted">No enrolled classes found.</p></div>:null}</section>;
}
