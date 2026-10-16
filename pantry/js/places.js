// Places: where things are kept ("Kept in"). Each household has its own ordered list, shared by the family, stored as
// settings/places = { id: 'places', list: [names], updatedAt } (store.js, cloud.js; rules in firestore.rules). With no
// list saved yet the household has DEFAULT_PLACES. An item keeps its place as plain text, so a place an item still uses
// always shows in the pickers and filters, even when it is not (or no longer) in the list ("not in your list").
// Pure functions only, so test/places.test.mjs runs them in Node.
import { LOCATIONS } from './catalogue.js';

export const PLACES_ID = 'places';
export const MAX_PLACES = 40;      // the rules allow at most 40 places
export const MAX_NAME = 40;        // and at most 40 characters a name

// The catalogue's generic places, with the owner's three (16 Oct 2026) next to their kind.
export const DEFAULT_PLACES = (() => {
  const out = [...LOCATIONS];
  const after = (anchor, name) => out.splice(out.indexOf(anchor) + 1, 0, name);
  after('Fridge', 'Level 1 fridge');
  after('Freezer', 'Level 1 freezer');
  after('Store room', 'Basement store');
  return out;
})();

// A name as it is saved: spaces tidied, at most MAX_NAME characters.
export const cleanPlace = s => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
const key = s => cleanPlace(s).toLowerCase();

// The household's list from its settings document (or the defaults when there is none, or it is unreadable).
export function placeList(doc) {
  const l = Array.isArray(doc?.list) ? doc.list.filter(x => typeof x === 'string' && cleanPlace(x)) : null;
  return l && l.length ? l : [...DEFAULT_PLACES];
}

// Every place to offer: the list in its order, then any place an item uses that is not in it (in first-seen order).
// Returns { listed: [names], unlisted: [names] }. `extra` adds one more name (the form's current value).
export function allPlaces(list, items = [], extra = '') {
  const have = new Set(list.map(key)), unlisted = [];
  for (const p of [...items.map(i => i?.location), extra]) {
    const k = key(p);
    if (k && !have.has(k)) { have.add(k); unlisted.push(cleanPlace(p)); }
  }
  return { listed: [...list], unlisted };
}

// How many items use each place (by the exact name the item holds).
export function placeCounts(items = []) {
  const m = new Map();
  for (const it of items) if (it?.location) m.set(it.location, (m.get(it.location) || 0) + 1);
  return m;
}

// Why a new name can't be used ('' when it can). `except` is the place being renamed (it may change only its case).
export function placeProblem(list, name, except = null) {
  const n = cleanPlace(name);
  if (!n) return 'Type a name for the place.';
  if (String(name ?? '').replace(/\s+/g, ' ').trim().length > MAX_NAME) return `Keep it to ${MAX_NAME} characters.`;
  const clash = list.find(p => key(p) === key(n) && p !== except);
  if (clash) return `${clash} is already in your list.`;
  if (except == null && list.length >= MAX_PLACES) return `You can have up to ${MAX_PLACES} places.`;
  return '';
}

export function addPlace(list, name) { return [...list, cleanPlace(name)]; }
export function renameInList(list, from, to) { return list.map(p => (p === from ? cleanPlace(to) : p)); }
export function removeFromList(list, name) { return list.filter(p => p !== name); }
// Moves a place one step up (-1) or down (+1); the list unchanged at either end.
export function movePlace(list, name, dir) {
  const i = list.indexOf(name), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
// The items that move from one place to another, as new item objects (the others are left out).
export function moveItems(items, from, to) {
  return items.filter(it => it.location === from).map(it => ({ ...it, location: cleanPlace(to) }));
}
// Two lists as one (restoring a backup, copying this phone's pantry into the family's): the first in its order, then
// what only the second has.
export function mergePlaces(a, b) {
  const out = [...a], have = new Set(a.map(key));
  for (const p of b || []) if (cleanPlace(p) && !have.has(key(p)) && out.length < MAX_PLACES) { have.add(key(p)); out.push(cleanPlace(p)); }
  return out;
}
export const placesDoc = (list, at = new Date().toISOString()) => ({ id: PLACES_ID, list: list.map(cleanPlace).slice(0, MAX_PLACES), updatedAt: at });
// Is this a well-formed places document (a backup's settings)?
export const isPlacesDoc = o => !!o && o.id === PLACES_ID && Array.isArray(o.list) && o.list.length > 0 && o.list.every(x => typeof x === 'string' && cleanPlace(x));
