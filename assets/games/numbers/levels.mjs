// range is the short caption on the level tile.
export const levels = [
  { name: 'Numbers 0–15', range: '0–15', values: [0, 2, 3, 6, 7, 11, 12, 13, 14, 15] },
  { name: 'Numbers 16–30', range: '16–30', values: [16, 17, 18, 19, 20, 21, 22, 26, 29, 30] },
  { name: 'Teens and tens', range: '13 vs 30', values: [12, 13, 14, 15, 20, 30, 40, 50, 80, 90] },
  { name: 'Two-digit numbers', range: '31–98', values: [31, 45, 56, 61, 67, 71, 76, 83, 94, 98] },
  { name: 'Hundreds', range: '100–900', values: [100, 101, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'Three-digit numbers', range: '115–947', values: [115, 136, 219, 327, 418, 532, 614, 751, 826, 947] },
  { name: 'Look-alike hundreds', range: '560 vs 650', values: [506, 560, 605, 607, 650, 670, 706, 760, 909, 990] },
  { name: 'Round thousands', range: '1000–70.000', values: [1000, 2000, 5000, 7000, 10000, 15000, 21000, 31000, 60000, 70000] },
  { name: 'Four-digit numbers', range: '1000–9999', values: [1253, 2017, 3468, 4072, 5184, 6591, 7013, 8296, 9365, 9742] },
  { name: 'Tens of thousands', range: '10.000+', values: [12040, 14600, 18350, 21400, 35720, 46090, 57280, 61500, 71350, 92600] },
];

const small = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const tens = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const hundreds = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function belowThousand(n) {
  if (n < 30) return small[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' y ' + small[n % 10] : '');
  if (n === 100) return 'cien';
  return hundreds[Math.floor(n / 100)] + (n % 100 ? ' ' + belowThousand(n % 100) : '');
}

// Spanish words for 0–999 999, e.g. 21400 → "veintiún mil cuatrocientos".
export function numberWords(n) {
  if (n < 1000) return belowThousand(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  // "Uno" shortens before "mil": veintiún mil, treinta y un mil; plain 1000 is just "mil".
  const multiplier = thousands === 1 ? '' : belowThousand(thousands).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un') + ' ';
  return multiplier + 'mil' + (rest ? ' ' + belowThousand(rest) : '');
}

export const formatNumber = n => n.toLocaleString('es-ES');
