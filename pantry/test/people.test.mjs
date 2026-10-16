// Names for the family (js/people.js): plain node.
import assert from 'node:assert/strict';
import * as PP from '../js/people.js';

assert.equal(PP.cleanName('  Ah   Mei\n '), 'Ah Mei');
assert.equal(PP.cleanName('x'.repeat(50)).length, PP.NAME_MAX);
assert.deepEqual(PP.namesOf(null), {});
assert.deepEqual(PP.namesOf({ names: ['x'] }), {});
assert.deepEqual(PP.namesOf({ names: { 'Mum@Example.com': ' Mum ', 'x@y.z': 3, 'e@f.g': '  ' } }), { 'mum@example.com': 'Mum' });
assert.deepEqual(PP.setName({ 'a@b.c': 'A' }, 'D@E.F', ' Dad '), { 'a@b.c': 'A', 'd@e.f': 'Dad' });
assert.deepEqual(PP.setName({ 'a@b.c': 'A' }, 'a@b.c', ''), {}, 'an empty name removes it');
assert.deepEqual(PP.keepMembers({ 'a@b.c': 'A', 'gone@b.c': 'G' }, ['a@b.c']), { 'a@b.c': 'A' });
const doc = PP.peopleDoc({ 'a@b.c': 'A' }, 'now');
assert.deepEqual(doc, { id: 'people', names: { 'a@b.c': 'A' }, updatedAt: 'now' });
assert.ok(PP.isPeopleDoc(doc) && !PP.isPeopleDoc({ id: 'places', list: [] }) && !PP.isPeopleDoc({ id: 'people', names: [] }));
// how someone shows: the family's name for an email, else what was saved (older changes are signed with a name)
assert.equal(PP.label({ 'a@b.c': 'Mum' }, 'A@B.C'), 'Mum');
assert.equal(PP.label({ 'a@b.c': 'Mum' }, 'Dad'), 'Dad');
assert.equal(PP.label({}, ''), '');
console.log('people tests: ok');
