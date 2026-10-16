// Made-up sample items (with a few months of history, so the consumption patterns show) for trying the app.
import { uid, ymd, addDays } from './logic.js';

export function sampleData(by = 'Sample') {
  const t = ymd();
  const now = Date.now();
  const ago = d => new Date(now - d * 86400000).toISOString();
  const items = [], events = [];
  const add = (f, batches, history = []) => {
    const it = { id: uid(), brand: '', size: '', lowAt: 0, barcode: '', openDays: null, createdAt: ago(200), sample: true, ...f, batches: batches.map(b => ({ id: uid(), openedAt: null, addedAt: t, ...b })) };
    items.push(it);
    for (const [type, d, qty = 1] of history) events.push({ id: uid(), itemId: it.id, name: it.name, type, qty, at: ago(d), by });
  };
  add({ name: 'Light soy sauce', brand: 'Kikkoman', size: '500 ml', category: 'Sauces & condiments', location: 'Kitchen cabinet', openDays: 90, lowAt: 1 },
    [{ qty: 1, expiry: addDays(t, 300), openedAt: addDays(t, -80) }, { qty: 1, expiry: addDays(t, 420) }],
    [['add', 170, 3], ['use', 160], ['use', 110], ['use', 80]]);
  add({ name: 'Premium oyster sauce', brand: 'Lee Kum Kee', size: '510 g', category: 'Sauces & condiments', location: 'Fridge', openDays: 90 },
    [{ qty: 1, expiry: addDays(t, 200), openedAt: addDays(t, -40) }], [['add', 60], ['open', 40]]);
  add({ name: 'Fresh milk', brand: 'Meiji', size: '2 L', category: 'Dairy & eggs', location: 'Fridge', openDays: 5, lowAt: 1 },
    [{ qty: 1, expiry: addDays(t, 3) }], [['add', 30, 4], ['use', 26], ['use', 21], ['use', 16], ['use', 12], ['add', 10, 3], ['use', 7], ['use', 3]]);
  add({ name: 'Wholemeal bread', brand: 'Gardenia', size: '400 g', category: 'Bread & bakery', location: 'Kitchen cabinet' },
    [{ qty: 1, expiry: addDays(t, -1) }], [['add', 6], ['discard', 0]]);
  add({ name: 'Kaya', brand: 'Glory', size: '250 g', category: 'Breakfast & spreads', location: 'Fridge', openDays: 14 },
    [{ qty: 1, expiry: addDays(t, 40), openedAt: addDays(t, -10) }], [['add', 12], ['open', 10]]);
  add({ name: 'Thai hom mali rice', brand: 'Royal Umbrella', size: '5 kg', category: 'Rice, noodles & grains', location: 'Kitchen cabinet', lowAt: 0 },
    [{ qty: 1, expiry: addDays(t, 250) }], [['add', 150, 2], ['use', 120], ['use', 75]]);
  add({ name: 'Sardines in tomato sauce', brand: 'Ayam Brand', size: '155 g', category: 'Canned & jarred', location: 'Kitchen cabinet', openDays: 2 },
    [{ qty: 4, expiry: addDays(t, 700) }], [['add', 90, 4]]);
  add({ name: 'Milo powder', brand: 'Nestlé', size: '1.5 kg', category: 'Drinks', location: 'Kitchen cabinet', openDays: 90 },
    [{ qty: 1, expiry: addDays(t, 9), openedAt: addDays(t, -50) }], [['add', 100, 2], ['use', 95], ['use', 50]]);
  add({ name: 'Laundry liquid', brand: 'Dynamo', size: '2.7 kg', category: 'Laundry & cleaning', location: 'Laundry', lowAt: 1 },
    [{ qty: 1, expiry: null }], [['add', 120, 3], ['use', 100], ['use', 55]]);
  add({ name: 'Bathroom tissue (10 rolls)', brand: 'Kleenex', size: '10 rolls', category: 'Kitchen & paper', location: 'Basement store' },
    [], [['add', 60, 2], ['use', 45], ['use', 15]]);
  add({ name: 'Paracetamol tablets', brand: 'Panadol', size: '20 tablets', category: 'Medicine & first aid', location: 'Medicine box' },
    [{ qty: 2, expiry: addDays(t, 25) }], [['add', 300, 2]]);
  add({ name: 'Eggs (10)', brand: 'Pasar', size: '10 eggs', category: 'Dairy & eggs', location: 'Fridge' },
    [{ qty: 1, expiry: addDays(t, 12) }], [['add', 20, 2], ['use', 14], ['add', 3]]);
  add({ name: 'Frozen dumplings', brand: 'CJ Bibigo', size: '1 kg', category: 'Frozen', location: 'Level 1 freezer' },
    [{ qty: 2, expiry: addDays(t, 120) }], [['add', 40, 3], ['use', 20]]);
  return { items, events };
}
