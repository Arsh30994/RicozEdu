'use client';
import { useEffect,useState } from 'react';
import { api,loadSession } from '../../../../lib/api';
import { PageHeader } from '../../../../components/console-ui';
type C={id:string;code:string;name:string;courseId?:{code:string;name:string}};
type T={id:string;dayOfWeek:number;startTime:string;endTime:string;room:string};
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export default function StudentTimetablePage(){
 const [rows,setRows]=useState<Array<{className:string;course:string;slot:T}>>([]),[error,setError]=useState('');
 useEffect(()=>{const s=loadSession();if(!s)return;void api<{items:C[]}>('/v1/classes',{session:s}).then(async c=>{const all=await Promise.all(c.items.map(async x=>{const t=await api<{items:T[]}>('/v1/classes/'+x.id+'/timetable',{session:s});return t.items.map(slot=>({className:x.name,course:x.courseId?.code??x.code,slot}));}));setRows(all.flat().sort((a,b)=>a.slot.dayOfWeek-b.slot.dayOfWeek||a.slot.startTime.localeCompare(b.slot.startTime));}).catch(e=>setError(e.message));},[]);
 return <section className="role-dashboard"><PageHeader title="My timetable"/><p className="muted">Your published weekly class schedule.</p>{error?<p className="error" role="alert">{error}</p>:null}{days.map((day,i)=>{const matches=rows.filter(x=>x.slot.dayOfWeek===i);return matches.length?<div className="card" key={day}><h2 className="card-title">{day}</h2>{matches.map(x=><article className="academic-list-item" key={x.slot.id}><strong>{x.slot.startTime}–{x.slot.endTime} · {x.className}</strong><span>{x.course} · {x.slot.room||'Room not specified'}</span></article>)}</div>:null;})}{!rows.length&&!error?<div className="card"><p className="muted">No timetable sessions have been published for your classes.</p></div>:null}</section>;
}
