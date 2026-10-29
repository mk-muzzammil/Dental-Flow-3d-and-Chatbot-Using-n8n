import { services, dentists } from "@/content/clinic";
import { availableTimes, currentWeek, weekday } from "@/lib/availability";
export function demoSlots(service: string, date?: string, doctor = "any") {
  const timezone = "Asia/Karachi", now = Date.now(), week = currentWeek(now, timezone);
  const svc = services.find(s => s.id === service), duration = svc?.minutes || 30;
  const pool = dentists.filter(d => doctor === 'any' || d.id === doctor);
  const days = week.map(day => {
    const byDoctor = pool.flatMap(d => {
      const opening = d.weeklyHours?.find(h => h.day === weekday(day));
      if (!opening || !svc) return [];
      const times = availableTimes({date:day,timezone,duration,interval:30,opening,busy:[],now});
      return [{doctor:d.id,doctorName:d.name,open:opening.open,close:opening.close,breaks:opening.breaks || [],calendarReadable:true,slots:times.map(t=>t.time),times}];
    });
    const all = byDoctor.flatMap(d => d.times.map(t => ({...t,date:day,doctor:d.doctor,doctorName:d.doctorName,doctorOpen:d.open,doctorClose:d.close})));
    const options = [...new Map(all.map(t=>[t.time,t] as const).reverse()).values()].sort((a,b)=>a.time.localeCompare(b.time));
    return {date:day,options,byDoctor:byDoctor.map(({times,...d})=>d),available:!!options.length,count:options.length,reason:options.length?undefined:!byDoctor.length?'closed':'past'};
  });
  return {
    timezone, version:'demo', durationMin:duration, serviceName:svc?.name.en || '',
    days:days.map(({options,byDoctor,...day})=>day),
    byDoctor:date?days.find(d=>d.date===date)?.byDoctor || []:[],
    options:date?days.find(d=>d.date===date)?.options || []:days.flatMap(d=>d.options),
    reason:date?days.find(d=>d.date===date)?.reason:days.some(d=>d.available)?undefined:'nothing-free-this-week',
  };
}
