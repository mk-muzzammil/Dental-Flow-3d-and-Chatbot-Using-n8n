import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClinicInfo } from '../lib/server/dental/clinicInfo';
import { openingForWeekday } from '../lib/server/dental/availability';
import fallback from '../lib/server/chat/fallback.json';
function info(minutes:number, open:string,close:string){
 return buildClinicInfo({view:'prompt',lang:'en'}, {statusCode:200,body:{valueRanges:[
 {values:[['checkup','Checkup',minutes,100,'TRUE']]},
 {values:[['Monday',open,close,'','','FALSE',''],['Monday','08:00','22:00','','','FALSE','doctor']]},
 {values:[]},{values:[['doctor','Dr Test','test-calendar','all','','TRUE']]},
 ]}}, {statusCode:200,body:{values:[['parking','Parking?','Parking available','','','TRUE','پارکنگ؟']]}},{statusCode:404});
}
test('changed admin hours and durations replace previous values in chat context',()=>{
 const first=info(30,'10:00','20:00').promptBlock!;
 const second=info(60,'11:00','17:00').promptBlock!;
 assert.match(first,/30 min/);assert.match(first,/Monday 10:00-20:00/);
 assert.match(second,/60 min/);assert.match(second,/Monday 11:00-17:00/);
 assert.match(second,/monday 11:00-17:00/); // doctor hours intersect clinic hours
 assert.doesNotMatch(second,/30 min|10:00-20:00/);
 assert.match(second,/Parking available/);
});
test('closed days remain closed for doctors and fallback never invents durations',()=>{
 assert.equal(openingForWeekday([['Monday','10:00','20:00','','','TRUE',''],['Monday','10:00','16:00','','','FALSE','doctor']], 'doctor','Monday'),null);
 assert.doesNotMatch(fallback,/\d+ min|\d{1,2}:\d{2}/);
});
