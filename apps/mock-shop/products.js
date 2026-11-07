// Inline SVG images so the fallback shop works with Wi-Fi off.
const img = (emoji, label, bg) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="100%" height="100%" fill="${bg}"/>` +
      `<text x="50%" y="46%" font-size="160" text-anchor="middle" dominant-baseline="middle">${emoji}</text>` +
      `<text x="50%" y="80%" font-size="34" font-family="Arial" text-anchor="middle" fill="#333">${label}</text></svg>`,
  );

// Demo products. Real prices: Nike UK full price for Air Max 90 is £134.99.
export const PRODUCTS = {
  nike: {
    title: "Nike Air Max 90 Men's Trainers (CN8490-002)",
    price: 134.99,
    brand: 'Nike',
    img: img('👟', 'Air Max 90', '#f4f4f4'),
    bullets: ['Model: Air Max 90', 'Style code: CN8490-002', 'Colour: Black/White', 'UK sizes 6–12'],
  },
  notebook: {
    title: 'A5 Lined Notebook, 80 Sheets, Hardback',
    price: 4.0,
    brand: 'Pukka Pad',
    img: img('📓', 'A5 Notebook', '#fdf6e3'),
    bullets: ['A5, 80 sheets', 'Lined, 8mm ruling', 'Hardback cover'],
  },
  wine: {
    title: 'Casillero del Diablo Merlot Red Wine 75cl',
    price: 8.0,
    brand: 'Casillero del Diablo',
    img: img('🍷', 'Merlot 75cl', '#f3e5e9'),
    bullets: ['Red wine, Chile', '75cl bottle', '13.5% ABV'],
  },
};
