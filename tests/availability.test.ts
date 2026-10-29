import {test} from 'node:test';import assert from 'node:assert/strict';
import {availableTimes,localInstant,currentWeek,validDuration,overlaps} from '../lib/availability';
import {bookingWeekStart} from '../lib/booking-flow';
const date='2026-10-28',timezone='Asia/Karachi',at=(time:string)=>localInstant(date,time,timezone);
const base={date,timezone,interval:30,opening:{open:'10:00',close:'19:00'},now:at('09:00'),busy:[{start:at('10:30'),end:at('12:00')}]};
test('Root Canal blocks all covered starts; a shorter preceding booking fits',()=>{const short=availableTimes({...base,duration:30}).map(s=>s.time);assert(short.includes('10:00'));for(const t of ['10:30','11:00','11:30'])assert(!short.includes(t));assert.equal(availableTimes({...base,duration:60})[0].time,'12:00');});
test('closing boundary and back-to-back intervals',()=>{const times=availableTimes({...base,duration:90}).map(t=>t.time);assert(times.includes('17:30'));assert(!times.includes('18:00'));assert(!overlaps({start:at('10:00'),end:at('10:30')},base.busy[0]));assert(times.includes('12:00'));});
test('mixed duration, off days, breaks, passed starts and grid',()=>{const input={...base,busy:[...base.busy,{start:at('13:00'),end:at('13:45')}]};assert(!availableTimes({...input,duration:60}).some(t=>t.time==='12:30'));assert.equal(availableTimes({...base,duration:30,off:true}).length,0);assert(availableTimes({...base,duration:30,now:at('12:00')}).every(t=>Date.parse(t.startsAt)>at('12:00')));assert(!availableTimes({...base,duration:30,opening:{open:'10:10',close:'19:00',breaks:[['14:00','15:00']]}}).some(t=>['10:10','14:00','14:30'].includes(t.time)));});
test('interval changes reject incompatible service durations',()=>{assert(!validDuration(45,30));assert(validDuration(60,30));assert(!validDuration(30,60));assert.throws(()=>availableTimes({...base,duration:45}));});
test('current week uses clinic timezone and crosses month/year boundaries',()=>{assert.deepEqual(currentWeek(at('09:00'),timezone),['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);assert.equal(currentWeek(Date.parse('2026-01-01T00:00Z'),timezone)[0],'2025-12-29');});
test('DST gaps and repeated times are rejected; date-specific offsets are used',()=>{assert.throws(()=>localInstant('2026-03-08','02:30','America/New_York'));assert.throws(()=>localInstant('2026-11-01','01:30','America/New_York'));assert.equal(new Date(localInstant('2026-07-01','10:00','America/New_York')).toISOString(),'2026-07-01T14:00:00.000Z');assert.equal(new Date(localInstant('2026-12-01','10:00','America/New_York')).toISOString(),'2026-12-01T15:00:00.000Z');});
test('browser and server roll over together at clinic Monday midnight, including DST and year changes',()=>{
 for(const [zone,before,after] of [
  ['Asia/Karachi','2026-11-01T18:59:59Z','2026-11-01T19:00:00Z'],
  ['America/New_York','2026-11-02T04:59:59Z','2026-11-02T05:00:00Z'],
  ['Asia/Karachi','2027-01-03T18:59:59Z','2027-01-03T19:00:00Z'],
 ]) {
  for(const instant of [before,after]) assert.equal(bookingWeekStart(Date.parse(instant),zone),currentWeek(Date.parse(instant),zone)[0]);
  assert.notEqual(bookingWeekStart(Date.parse(before),zone),bookingWeekStart(Date.parse(after),zone));
 }
});
