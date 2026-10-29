import test from 'node:test';
import assert from 'node:assert/strict';
import { openingForWeekday } from '../lib/server/dental/availability';
const hours = [
 ['Thursday','10:00','20:00','','','FALSE',''],
 ['Thursday','10:00','16:00','','','FALSE','ayesha'],
 ['Thursday','15:00','20:00','','','FALSE','bilal'],
 ['Saturday','10:00','20:00','','','TRUE',''],
 ['Saturday','10:00','16:00','','','FALSE','ayesha'],
];
test('doctor ranges remain independent within clinic hours', () => {
 assert.deepEqual(openingForWeekday(hours,'ayesha','Thursday'), {open:'10:00',close:'16:00',breaks:[]});
 assert.deepEqual(openingForWeekday(hours,'bilal','Thursday'), {open:'15:00',close:'20:00',breaks:[]});
});
test('clinic holidays override a doctor working range', () => {
 assert.equal(openingForWeekday(hours,'ayesha','Saturday'), null);
});
