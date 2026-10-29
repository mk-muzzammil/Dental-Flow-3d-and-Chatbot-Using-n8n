import 'server-only';
import { readRanges, freeBusy, listEvents } from '../google/api';
import { settings } from '../google/settings';
import { clinicDefaults, checkSignal, AppError } from '../config';
import { calculateDay, availabilityVersion } from './availability';
import { currentWeek,localInstant } from '@/lib/availability';
import { appointments, identity, startAt } from './appointments';
import { addReservations } from './reservations';
import { buildClinicInfo, type ClinicInfo } from './clinicInfo';
import { DF } from './rules';
import fallback from '../chat/fallback.json';
import { storageProfile } from '../storage/profile';
import { cleanDoctorRows } from '../storage/worksheets';
export async function readClinic(signal?: AbortSignal) {
  const selected = await settings();
  const profile = await storageProfile(selected.sheetId);
  const config = profile?.configuration;
  const data = config && profile
    ? [config.services, config.hours, config.settings, config.holidays, await cleanDoctorRows(profile, signal)]
    : await readRanges(
    ['Services!A2:E', 'Hours!A2:G', 'Settings!A2:B', 'Holidays!A2:B', 'Doctors!A2:F'],
    signal,
  );
  const cfg = DF.settings(data[2]);
  // Invalid setup must not turn a slot loop into an unbounded function.
  if (
    Number(cfg.slot_granularity ?? 30) <= 0 ||
    DF.services(data[0]).some((s) => !Number.isFinite(s.min) || s.min <= 0)
  )
    throw new AppError('invalid_clinic_duration');
  return data;
}
export async function availabilityContext(service:string, doctor='any', signal?:AbortSignal, ignore?:string, excludeEvent?:{calendarId:string;eventId:string}) {
  const [data,selected]=await Promise.all([readClinic(signal),settings()]);
  const docs=DF.eligible(DF.doctors(data[4],selected.calendarId,clinicDefaults().CLINIC_NAME),service,doctor);
  const timezone=String(DF.settings(data[2]).timezone||'Asia/Karachi'),week=currentWeek(Date.now(),timezone);
  const calendars=[...new Set(docs.map(d=>d.calendarId))];
  const busy=await freeBusy({timeMin:new Date(Date.parse(week[0]+'T00:00:00Z')-86400000).toISOString(),timeMax:new Date(Date.parse(week[6]+'T00:00:00Z')+2*86400000).toISOString(),items:calendars.map(id=>({id}))},signal);
  if(calendars.includes('primary')&&!busy.calendars?.primary){const spare=Object.keys(busy.calendars||{}).filter(k=>!calendars.includes(k));if(spare.length===1)busy.calendars!.primary=busy.calendars![spare[0]];}
  if(excludeEvent){
    const events=await listEvents(excludeEvent.calendarId,new URLSearchParams({timeMin:new Date(Date.parse(week[0]+'T00:00:00Z')-86400000).toISOString(),timeMax:new Date(Date.parse(week[6]+'T00:00:00Z')+2*86400000).toISOString(),singleEvents:'true',maxResults:'2500'}),signal);
    busy.calendars??={};busy.calendars[excludeEvent.calendarId]={busy:events.filter(e=>e.id!==excludeEvent.eventId&&e.status!=='cancelled'&&e.transparency!=='transparent').map(e=>({start:e.start?.dateTime||new Date(localInstant(e.start?.date||'','00:00',timezone)).toISOString(),end:e.end?.dateTime||new Date(localInstant(e.end?.date||'','00:00',timezone)).toISOString()}))};
  }
  const bookings=await appointments(signal);
  // A Sheet record without a corresponding Calendar event must still block its interval.
  for(const {booking:b} of bookings){if(!['PENDING','CONFIRMED'].includes(b.status)||identity(b)===ignore)continue;const cal=busy.calendars?.[b.calendarId];if(cal){cal.busy??=[];cal.busy.push({start:new Date(startAt(b)).toISOString(),end:b.endsAt||new Date(startAt(b)+b.minutes*60000).toISOString()});}}
  await addReservations(busy,calendars,ignore);
  return {data,docs,busy,week,timezone};
}
export async function slots(input:{service:string;doctor?:string;date?:string;mode:string;lang?:string},signal?:AbortSignal){
  checkSignal(signal);
  if(input.mode==='doctors') {const [data,selected]=await Promise.all([readClinic(signal),settings()]);return {doctors:DF.eligible(DF.doctors(data[4],selected.calendarId,clinicDefaults().CLINIC_NAME),input.service,'any').map(d=>({id:d.id,name:d.name}))};}
  const {data,docs,busy,week,timezone}=await availabilityContext(input.service,input.doctor,signal);
  if(input.mode==='day')return calculateDay(data,docs,busy,input.service,input.date||'');
  const days=week.map(date=>calculateDay(data,docs,busy,input.service,date));
  return {timezone,version:availabilityVersion(data),durationMin:days[0].durationMin,serviceName:days[0].serviceName,days:days.map(d=>({date:d.date,available:d.options.length>0,reason:d.reason,count:d.options.length})),options:days.flatMap(d=>d.options),reason:days.some(d=>d.options.length)?undefined:'nothing-free-this-week'};
}
export async function clinicInfo(view = 'prompt', lang = 'en', signal?: AbortSignal): Promise<ClinicInfo> {
  const selected = await settings();
  const profile = await storageProfile(selected.sheetId);
  if (profile) {
    const c = profile.configuration;
    const doctors = await cleanDoctorRows(profile, signal);
    return buildClinicInfo(
      { ...clinicDefaults(), view, lang },
      { statusCode: 200, body: { valueRanges: [c.services, c.hours, c.settings, doctors].map(values => ({ values })) } },
      { statusCode: 200, body: { values: c.faq } },
      { statusCode: 200, body: { valueRanges: [c.specializations, doctors.map(r => [r[6] || '']), c.services.map(r => [r[7] || ''])].map(values => ({ values })) } },
    );
  }
  const data = await readRanges(['Services!A2:G', 'Hours!A2:G', 'Settings!A2:B', 'Doctors!A2:F'], signal);
  const optional = await Promise.allSettled([
    readRanges(['FAQ!A2:F'], signal),
    readRanges(['Specializations!A2:E', 'Doctors!G2:G', 'Services!H2:H'], signal),
  ]);
  const faq =
    optional[0].status === 'fulfilled'
      ? { statusCode: 200, body: { values: optional[0].value[0] } }
      : { statusCode: 404 };
  const spec =
    optional[1].status === 'fulfilled'
      ? { statusCode: 200, body: { valueRanges: optional[1].value.map((values) => ({ values })) } }
      : { statusCode: 404 };
  return buildClinicInfo(
    { ...clinicDefaults(), view, lang },
    { statusCode: 200, body: { valueRanges: data.map((values) => ({ values })) } },
    faq,
    spec,
  );
}
export async function clinicPrompt(signal?: AbortSignal) {
  // Read current settings for every turn: a cache populated during an admin
  // update must never reintroduce the previous hours or service durations.
  try {
    const info = await clinicInfo('prompt', 'en', signal);
    if (info.promptBlock) return info.promptBlock;
  } catch {
    checkSignal(signal);
  }
  return fallback
    .replace('{{clinicName}}', clinicDefaults().CLINIC_NAME)
    .replace('{{clinicPhone}}', clinicDefaults().CLINIC_PHONE);
}
