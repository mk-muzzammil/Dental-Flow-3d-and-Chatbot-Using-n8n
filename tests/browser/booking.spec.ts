import {test,expect} from '@playwright/test';
for(const width of [320,360,380])test(`current-week picker and stale-slot recovery at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 await page.clock.setFixedTime(new Date('2026-10-29T04:00:00Z'));
 let confirms=0,dayReads=0;const keys:string[]=[];
 // All booking writes are intercepted: this browser suite never books a real patient.
 await page.route('**/api/bookings',async route=>{confirms++;keys.push(route.request().headers()['idempotency-key']);await route.fulfill({status:confirms===1?409:200,json:confirms===1?{error:'slot-taken'}:{ok:true,demo:true,reference:'DEMO-UI',service:'Root Canal',dentist:'Test Dentist',when:'Thu 29 Oct · 12:00 PM – 1:30 PM',emailCopy:false,whatsappSent:false}});});
 await page.route('**/api/slots?*',async route=>{
  const mode=new URL(route.request().url()).searchParams.get('mode');if(mode==='day')dayReads++;
  const time=dayReads>1?'12:00':'10:30',endTime=dayReads>1?'13:30':'12:00';
  await route.fulfill({json:{timezone:'Asia/Karachi',version:'fixture-version',byDoctor:[{doctor:'test-doctor',doctorName:'Test Dentist',open:'10:00',close:'16:00',breaks:[],calendarReadable:true,slots:['10:30']}],durationMin:90,serviceName:'Root Canal',days:['26','27','28','29','30','31'].map((d,i)=>({date:`2026-10-${d}`,available:d==='29',reason:i<2?'past':d==='31'?'closed':'fully-booked',count:d==='29'?1:0})).concat([{date:'2026-11-01',available:false,reason:'closed',count:0}]),options:mode==='day'?[{date:'2026-10-29',time,endTime,startsAt:`2026-10-29T${time}:00+05:00`,endsAt:`2026-10-29T${endTime}:00+05:00`,doctor:'test-doctor',doctorName:'Test Dentist'},{date:'2026-10-29',time:'14:00',endTime:'15:30',startsAt:'2026-10-29T14:00:00+05:00',endsAt:'2026-10-29T15:30:00+05:00',doctor:'test-doctor',doctorName:'Test Dentist'}]:[]}});
 });
 await page.goto('/en');
 await page.waitForFunction(()=>document.documentElement.hasAttribute('data-ready'));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('dentalflow:open-chat',{detail:{book:{}}})));
 const panel=page.getByRole('dialog',{name:'Book an appointment',exact:true});
 await panel.getByRole('button',{name:/root canal/i}).click();
 await expect(panel.getByText('Choose a day',{exact:true})).toBeVisible();
 await expect(panel.getByRole('button',{name:/Mon.*26 Oct/})).toBeDisabled();
 await expect(panel.getByRole('button',{name:/Sat.*31 Oct/})).toBeDisabled();
 await expect(panel.getByRole('button',{name:/Sun.*1 Nov/})).toBeDisabled();
 // Measure in one animation frame so panel entrance motion cannot skew row comparisons.
 const days=await panel.getByRole('button',{name:/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/}).evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,height:r.height};}));
 for(let i=1;i<days.length;i++){const previous=days[i-1],current=days[i];expect(current.x).toBe(previous.x);expect(current.y).toBeGreaterThanOrEqual(previous.y+previous.height);expect(current.height).toBeGreaterThanOrEqual(44);}
 expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await panel.getByRole('button',{name:/Thu.*29 Oct/}).click();
 await expect(panel.getByText('Doctor hours for this day')).toBeVisible();
 await expect(panel.getByText('10:00 AM – 4:00 PM',{exact:true})).toBeVisible();
 const time=panel.getByRole('button',{name:'10:30 AM · Test Dentist',exact:true});await expect(time).toBeVisible();expect((await time.boundingBox())!.height).toBeGreaterThanOrEqual(44);const [first,second]=await panel.locator('[aria-label="Choose a time"] button').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,height:r.height};}));expect(second.x).toBe(first.x);expect(second.y).toBeGreaterThanOrEqual(first.y+first.height);await time.click();
 await expect(panel.getByText('10:30 AM – 12:00 PM',{exact:true})).toBeVisible();
 const inputs=panel.locator('input');await inputs.nth(0).fill('Synthetic UI Patient');await inputs.nth(1).fill('03000000099');await inputs.nth(2).fill('patient@example.invalid');
 await panel.locator('button[type=submit]').click();await expect(panel.getByRole('button',{name:'12:00 PM · Test Dentist',exact:true})).toBeVisible();await panel.getByRole('button',{name:'12:00 PM · Test Dentist',exact:true}).click();
 await expect(panel.locator('input').nth(0)).toHaveValue('Synthetic UI Patient');await panel.locator('button[type=submit]').click();await expect(panel).toHaveCount(0);expect(confirms).toBe(2);expect(keys[0]).not.toBe(keys[1]);
});

test('an open confirmation refreshes at clinic Monday midnight and keeps patient details',async({page})=>{
 await page.setViewportSize({width:360,height:850});
 await page.clock.setFixedTime(new Date('2026-10-29T04:00:00Z'));
 let newWeek=false,bookingWrites=0;
 await page.route('**/api/bookings',async route=>{bookingWrites++;await route.abort();});
 await page.route('**/api/slots?*',async route=>{
  const mode=new URL(route.request().url()).searchParams.get('mode');
  const date=newWeek?'2026-11-02':'2026-10-29';
  const dates=newWeek?['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']:['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01'];
  await route.fulfill({json:{timezone:'Asia/Karachi',version:'fixture-version',byDoctor:[{doctor:'test-doctor',doctorName:'Test Dentist',open:'10:00',close:'16:00',breaks:[],calendarReadable:true,slots:['10:30']}],durationMin:90,serviceName:'Root Canal',days:dates.map(d=>({date:d,available:d===date,reason:'closed',count:d===date?1:0})),options:mode==='day'?[{date,time:'10:30',endTime:'12:00',startsAt:`${date}T10:30:00+05:00`,endsAt:`${date}T12:00:00+05:00`,doctor:'test-doctor',doctorName:'Test Dentist'}]:[]}});
 });
 await page.goto('/en');
 await page.waitForFunction(()=>document.documentElement.hasAttribute('data-ready'));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('dentalflow:open-chat',{detail:{book:{}}})));
 const panel=page.getByRole('dialog',{name:'Book an appointment',exact:true});
 await panel.getByRole('button',{name:/root canal/i}).click();
 await panel.getByRole('button',{name:/Thu.*29 Oct/}).click();
 await panel.getByRole('button',{name:'10:30 AM · Test Dentist',exact:true}).click();
 await panel.locator('input').nth(0).fill('Rollover Test Patient');
 await page.clock.install({time:new Date('2026-11-01T18:59:50Z')});
 // Re-entering the panel installs the interval under the controlled clock.
 await panel.getByRole('button',{name:'Back',exact:true}).click();
 await panel.getByRole('button',{name:'10:30 AM · Test Dentist',exact:true}).click();
 newWeek=true;
 await page.clock.fastForward(71_000);
 await expect(panel.getByText('A new week has started. Please choose from the updated days and times.')).toBeVisible();
 await expect(panel.getByRole('button',{name:/Mon.*2 Nov/})).toBeEnabled();
 await expect(panel.getByRole('button',{name:/Thu.*29 Oct/})).toHaveCount(0);
 await panel.getByRole('button',{name:/Mon.*2 Nov/}).click();
 await panel.getByRole('button',{name:'10:30 AM · Test Dentist',exact:true}).click();
 await expect(panel.locator('input').nth(0)).toHaveValue('Rollover Test Patient');
 expect(bookingWrites).toBe(0);
});

test('Urdu picker shows translated controls, doctor identity and working range', async ({page}) => {
 await page.setViewportSize({width:360,height:850});
 await page.clock.setFixedTime(new Date('2026-10-29T04:00:00Z'));
 await page.route('**/api/slots?*', route=>route.fulfill({json:{timezone:'Asia/Karachi',version:'fixture',durationMin:90,days:['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01'].map(date=>({date,available:date==='2026-10-29',count:date==='2026-10-29'?1:0,reason:'closed'})),byDoctor:[{doctor:'ayesha',doctorName:'Dr. Ayesha',open:'10:00',close:'16:00',breaks:[],calendarReadable:true,slots:['10:30']}],options:[{date:'2026-10-29',time:'10:30',endTime:'12:00',startsAt:'2026-10-29T10:30:00+05:00',endsAt:'2026-10-29T12:00:00+05:00',doctor:'ayesha',doctorName:'Dr. Ayesha'}]}}));
 await page.goto('/ur');
 await page.waitForFunction(()=>document.documentElement.hasAttribute('data-ready'));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('dentalflow:open-chat',{detail:{book:{}}})));
 const panel=page.getByRole('dialog',{name:'اپائنٹمنٹ بک کریں',exact:true});
 await panel.getByRole('button',{name:/روٹ کینال/}).click();
 await panel.getByRole('button',{name:/جمعرات/}).click();
 await expect(panel.getByText('اس دن ڈاکٹر کے اوقات',{exact:true})).toBeVisible();
 await expect(panel.getByText('10:00 AM – 4:00 PM',{exact:true})).toBeVisible();
 await expect(panel.getByRole('button',{name:'10:30 AM · Dr. Ayesha',exact:true})).toBeVisible();
 expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:'/tmp/dentalflow-urdu-doctor-hours.png'});
});
