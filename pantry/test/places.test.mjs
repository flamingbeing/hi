// Unit tests for js/places.js (the household's list of places): node pantry/test/places.test.mjs
import assert from 'node:assert/strict';
import * as P from '../js/places.js';
import { LOCATIONS, CATALOGUE } from '../js/catalogue.js';
import { parseQuick } from '../js/quick.js';

// the defaults: the catalogue's places, with the owner's three next to their kind
assert.deepEqual(P.DEFAULT_PLACES, ['Kitchen cabinet', 'Fridge', 'Level 1 fridge', 'Freezer', 'Level 1 freezer', 'Store room', 'Basement store', 'Bathroom', 'Laundry', 'Medicine box', 'Other']);
for (const l of LOCATIONS) assert.ok(P.DEFAULT_PLACES.includes(l), l);
assert.deepEqual(P.placeList(null), P.DEFAULT_PLACES);
assert.deepEqual(P.placeList({ id: 'places', list: [] }), P.DEFAULT_PLACES, 'an empty list falls back to the defaults');
assert.deepEqual(P.placeList({ id: 'places', list: ['Fridge', 3, '  ', 'Shed'] }), ['Fridge', 'Shed']);
P.DEFAULT_PLACES.push('x'); P.DEFAULT_PLACES.pop();
assert.notEqual(P.placeList(null), P.DEFAULT_PLACES, 'a copy, never the shared defaults');

// tidy names, and why a name can't be used
assert.equal(P.cleanPlace('  Level   2  fridge '), 'Level 2 fridge');
assert.equal(P.cleanPlace('x'.repeat(50)).length, 40);
const list = ['Fridge', 'Freezer', 'Store room'];
assert.equal(P.placeProblem(list, '  '), 'Type a name for the place.');
assert.equal(P.placeProblem(list, 'fridge'), 'Fridge is already in your list.', 'no duplicates, ignoring case');
assert.equal(P.placeProblem(list, ' FREEZER '), 'Freezer is already in your list.');
assert.equal(P.placeProblem(list, 'x'.repeat(41)), 'Keep it to 40 characters.');
assert.equal(P.placeProblem(list, 'x'.repeat(40)), '');
assert.equal(P.placeProblem(list, 'Level 2 fridge'), '');
assert.equal(P.placeProblem(list, 'FRIDGE', 'Fridge'), '', 'renaming may change only the case');
assert.equal(P.placeProblem(list, 'Freezer', 'Fridge'), 'Freezer is already in your list.');
assert.equal(P.placeProblem(Array.from({ length: 40 }, (_, i) => 'P' + i), 'One more'), 'You can have up to 40 places.');

// add, rename, remove, move
assert.deepEqual(P.addPlace(list, ' Shed '), ['Fridge', 'Freezer', 'Store room', 'Shed']);
assert.deepEqual(P.renameInList(list, 'Freezer', 'Big freezer'), ['Fridge', 'Big freezer', 'Store room']);
assert.deepEqual(P.removeFromList(list, 'Freezer'), ['Fridge', 'Store room']);
assert.deepEqual(P.movePlace(list, 'Freezer', -1), ['Freezer', 'Fridge', 'Store room']);
assert.deepEqual(P.movePlace(list, 'Freezer', 1), ['Fridge', 'Store room', 'Freezer']);
assert.deepEqual(P.movePlace(list, 'Fridge', -1), list, 'the top stays the top');
assert.deepEqual(P.movePlace(list, 'Store room', 1), list);
assert.deepEqual(P.movePlace(list, 'Nowhere', 1), list);
assert.deepEqual(list, ['Fridge', 'Freezer', 'Store room'], 'never changes the list it is given');

// renaming or removing moves every item kept there (and only those), never changing the originals
const items = [{ id: 'a', location: 'Fridge' }, { id: 'b', location: 'Freezer' }, { id: 'c', location: 'Fridge' }, { id: 'd', location: 'Shed' }];
assert.deepEqual(P.moveItems(items, 'Fridge', 'Level 1 fridge'), [{ id: 'a', location: 'Level 1 fridge' }, { id: 'c', location: 'Level 1 fridge' }]);
assert.equal(items[0].location, 'Fridge');
assert.deepEqual([...P.placeCounts(items)], [['Fridge', 2], ['Freezer', 1], ['Shed', 1]]);

// places items use that aren't in the list are still offered, after the list ("not in your list")
assert.deepEqual(P.allPlaces(list, items), { listed: list, unlisted: ['Shed'] });
assert.deepEqual(P.allPlaces(list, [...items, { location: 'shed' }, { location: '' }], 'Bathroom'), { listed: list, unlisted: ['Shed', 'Bathroom'] });
assert.deepEqual(P.allPlaces(list, [], 'fridge').unlisted, [], 'the same place in another case is not a new one');

// backups and copying the phone's pantry up: the first list in its order, then what only the second has
assert.deepEqual(P.mergePlaces(['Fridge', 'Shed'], ['shed', 'Garage', 'Fridge']), ['Fridge', 'Shed', 'Garage']);
const doc = P.placesDoc(['Fridge'], 'T');
assert.deepEqual(doc, { id: 'places', list: ['Fridge'], updatedAt: 'T' });
assert.ok(P.isPlacesDoc(doc));
for (const bad of [null, { id: 'x', list: ['a'] }, { id: 'places', list: [] }, { id: 'places', list: ['a', 1] }, { id: 'places', list: 'a' }]) assert.ok(!P.isPlacesDoc(bad), JSON.stringify(bad));

// Say or type matches the household's own places, multi-word ones included
const o = { today: '2026-10-16', catalogue: CATALOGUE };
const at = (s, places) => parseQuick(s, { ...o, places })[0].location;
assert.equal(at('2 Meiji milk in the level 1 fridge expires 25 Oct'), 'Level 1 fridge');
assert.equal(at('ice cream in the level one freezer'), 'Level 1 freezer', 'a number said as a word');
assert.equal(at('tissue in the basement'), 'Basement store', '"basement" is enough for Basement store');
assert.equal(at('tissue basement store'), 'Basement store');
assert.equal(at('milk in the fridge'), 'Fridge', 'plain fridge stays Fridge');
assert.equal(at('milk in the fridge', ['Level 1 fridge', 'Cupboard']), 'Level 1 fridge', 'no plain Fridge: the household’s fridge');
assert.equal(at('kaya in the cupboard', ['Cupboard', 'Fridge']), 'Cupboard', 'its own name wins over the everyday word');
assert.equal(at('rice in mum’s room', [...P.DEFAULT_PLACES, "Mum's room"]), "Mum's room", 'a curly apostrophe too');
assert.equal(at("rice in mum's room", [...P.DEFAULT_PLACES, "Mum's room"]), "Mum's room");
assert.equal(at('rice in the garage', [...P.DEFAULT_PLACES, 'Garage shelf']), 'Garage shelf', 'a custom place without its kind word');
const q = parseQuick('3 tins of sardines in the basement', o)[0];
assert.deepEqual([q.qty, q.name, q.location], [3, 'Sardines in tomato sauce', 'Basement store'], 'the place words are not part of the name');
console.log('pantry places: ok');
