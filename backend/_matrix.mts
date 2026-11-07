import './src/env.js';
import { liveSearch } from './src/routes/search.js';
const prods = [
  { title: 'Nike Pegasus 41 Mens Road Running Shoes', brand: 'Nike', price: 119.99 },
  { title: 'Nike Revolution 8 Mens Road Running Shoes', brand: 'Nike', price: 45 },
  { title: 'Brooks Glycerin 22 Mens Road Running Shoes', brand: 'Brooks', price: 184 },
  { title: 'Adidas Ultraboost 5 Mens Running Shoes', brand: 'Adidas', price: 160 },
  { title: 'ASICS Gel-Nimbus 27 Mens Running Shoes', brand: 'ASICS', price: 169.99 },
  { title: 'NORTIV 8 Mens Running Shoes', brand: 'NORTIV 8', price: 33 },
];
for (const p of prods) {
  const t = Date.now();
  const r: any = await liveSearch({ ...p, currency: 'GBP', url: '', site: 'amazon.co.uk' } as any, Date.now() + 8000).catch((e) => ({ err: String(e) }));
  const a = r?.result?.alternative;
  console.log('FINAL', p.title, '|', a ? `${a.retailer} £${a.price} sameModel=${a.sameModel} ${a.url}` : 'none', '|', r?.note ?? r?.err, '|', Date.now() - t, 'ms');
  if (r?.result) console.log('  LINE', r.result.spokenLine);
}
