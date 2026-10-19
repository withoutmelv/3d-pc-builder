import { productIdentity } from '../../../shared/product-identity.js';

// Simplified redraws of the photographed editions; source links are recorded in
// docs/packaging-references/README.md. No remote photographs are loaded at runtime.
export const packageDesigns = {
  cpu: { size: [170, 215, 60], paper: '#242426', ink: '#eeeeee' },
  motherboard: { size: [240, 195, 42], paper: '#343d43', ink: '#ffffff' },
  memory: { size: [175, 190, 28], paper: '#eee21c', ink: '#161819' },
  storage: { size: [155, 205, 28], paper: '#166cd9', ink: '#ffffff' },
  cooler: { size: [190, 215, 90], paper: '#b69568', ink: '#282422' },
  gpu: { size: [265, 170, 65], paper: '#efefeb', ink: '#17191b' },
  psu: { size: [230, 175, 80], paper: '#ece220', ink: '#181b1c' },
  case: { size: [205, 250, 100], paper: '#b79b75', ink: '#272624' },
};
export function createPackagingArtwork(part, side = false) {
  const design = packageDesigns[part.category],
    identity = productIdentity[part.id] || part;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 768;
  const c = canvas.getContext('2d');
  c.scale(768 / 800, 768 / 600);
  const rect = (x, y, w, h, color) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const text = (value, x, y, size = 30, color = design.ink, weight = 600) => {
    c.fillStyle = color;
    c.font = `${weight} ${size}px Arial, sans-serif`;
    c.fillText(value, x, y);
  };
  const line = (points, color = design.ink, width = 3) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
  };
  const polygon = (points, color) => {
    c.fillStyle = color;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
  };
  const circle = (x, y, r, color, fill = false) => {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 3;
    if (fill) c.fill();
    else c.stroke();
  };
  function fan(x, y, r, ink = design.ink) {
    circle(x, y, r, ink);
    circle(x, y, r * 0.22, ink);
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9;
      line(
        [
          [x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25],
          [x + Math.cos(a + 0.3) * r * 0.9, y + Math.sin(a + 0.3) * r * 0.9],
        ],
        ink,
        5,
      );
    }
  }
  function board(x, y, w, h) {
    rect(x, y, w, h, '#171d23');
    rect(x + 12, y + 12, w * 0.24, h * 0.42, '#46515a');
    rect(x + w * 0.37, y + h * 0.18, w * 0.28, h * 0.25, '#b7bdc0');
    rect(x + w * 0.4, y + h * 0.21, w * 0.22, h * 0.19, '#393d40');
    for (let i = 0; i < 4; i++) rect(x + w * 0.73 + i * 12, y + 15, 7, h * 0.55, '#6c7174');
    for (let i = 0; i < 3; i++) rect(x + 20, y + h * 0.65 + i * 23, w * 0.8, 12, '#4c555e');
    line(
      [
        [x + 18, y + 28],
        [x + 65, y + 65],
        [x + 18, y + 85],
      ],
      '#89cbe6',
      4,
    );
  }
  rect(0, 0, 800, 600, design.paper);
  if (side) {
    rect(
      0,
      0,
      800,
      24,
      part.category === 'gpu'
        ? '#78b500'
        : part.category === 'motherboard'
          ? '#e21e47'
          : design.ink,
    );
    text(identity.brand, 35, 98, 40);
    const words = identity.name.split(' ');
    let y = 210,
      row = '';
    for (const word of words) {
      if ((row + ' ' + word).length > 23) {
        text(row, 35, y, 32);
        y += 52;
        row = word;
      } else row = row ? row + ' ' + word : word;
    }
    text(row, 35, y, 32);
    text(part.category.toUpperCase(), 35, 555, 21);
    return canvas;
  }
  switch (part.category) {
    case 'cpu':
      polygon(
        [
          [0, 0],
          [230, 155],
          [570, 155],
          [570, 420],
          [800, 600],
          [350, 600],
          [535, 430],
          [225, 430],
          [225, 175],
          [0, 325],
        ],
        '#ec6d1d',
      );
      polygon(
        [
          [0, 15],
          [228, 165],
          [558, 165],
          [558, 425],
          [780, 600],
          [375, 600],
          [548, 420],
          [237, 420],
          [237, 173],
          [0, 310],
        ],
        '#c7c8c9',
      );
      polygon(
        [
          [0, 42],
          [195, 166],
          [0, 280],
        ],
        '#eb791e',
      );
      text('AMD', 22, 149, 30);
      text('3D V-CACHE', 22, 176, 17);
      text('TECHNOLOGY', 22, 197, 16);
      rect(322, 225, 160, 146, '#17191b');
      rect(332, 235, 140, 126, '#b3b1a9');
      text('AMD', 346, 266, 24, '#53504b');
      text('RYZEN', 346, 292, 20, '#53504b');
      text('9800X3D', 346, 327, 14, '#53504b');
      text('AMD', 35, 491, 43);
      text('RYZEN', 35, 540, 45);
      text('9000 SERIES PROCESSOR', 35, 569, 15, '#e9823a');
      text('7', 579, 568, 130, '#e76c24');
      break;
    case 'gpu':
      text('GIGABYTE', 36, 65, 40, '#17191b', 800);
      text('A E', 25, 285, 128, '#101214', 700);
      text('R O', 25, 427, 128, '#101214', 700);
      text('AERO OC 24G', 338, 300, 29);
      rect(0, 560, 800, 40, '#79b500');
      rect(465, 441, 335, 159, '#101317');
      rect(743, 441, 57, 159, '#79b500');
      text('GEFORCE RTX', 488, 482, 32, '#ffffff');
      text('4090', 486, 574, 86, '#80bc00', 500);
      text('DLSS 3 / RAY TRACING / REFLEX / STUDIO', 20, 587, 14);
      break;
    case 'motherboard':
      polygon(
        [
          [430, 0],
          [800, 0],
          [800, 510],
        ],
        '#981536',
      );
      for (let i = 0; i < 15; i++)
        line(
          [
            [300 + i * 30, 0],
            [800, 330 - i * 12],
          ],
          '#924475',
          1,
        );
      text('ROG', 30, 72, 44, '#f62e58', 800);
      text('REPUBLIC OF GAMERS', 32, 95, 12, '#f62e58');
      board(400, 68, 310, 330);
      text('ROG STRIX', 32, 431, 38, '#eac6f3');
      text('B850-F GAMING WIFI7 NEO', 32, 472, 36, '#d2e4f8');
      rect(0, 520, 800, 16, '#e62848');
      text('ASUS   WiFi 7   DDR5', 30, 575, 23);
      text('B850', 604, 583, 51, '#f4a431');
      break;
    case 'memory':
      text('CORSAIR', 30, 63, 36);
      rect(612, 22, 158, 47, '#181b1b');
      text('DDR5', 630, 58, 30, '#fff');
      text('32GB', 617, 112, 38);
      text('6000MHz', 613, 147, 23);
      polygon(
        [
          [48, 263],
          [627, 233],
          [754, 279],
          [740, 390],
          [46, 374],
        ],
        '#24272c',
      );
      polygon(
        [
          [48, 263],
          [627, 233],
          [754, 279],
          [747, 289],
          [617, 247],
          [48, 276],
        ],
        '#c5d0e4',
      );
      for (let i = 0; i < 6; i++)
        rect(
          82 + i * 106,
          263 - i * 3,
          88,
          8,
          ['#91d9ef', '#bbd8e9', '#dab4e4', '#edb8cc', '#eacaab', '#c5dba5'][i],
        );
      text('VENGEANCE', 255, 325, 25, '#acb0b4');
      for (let i = 0; i < 65; i++) rect(54 + i * 10.4, 376, 5, 11, '#c1b486');
      text('VENGEANCE RGB DDR5', 28, 485, 42);
      text('Performance DDR5 DRAM', 30, 519, 23);
      text('iCUE', 650, 565, 27);
      break;
    case 'storage':
      text('SAMSUNG', 34, 65, 39, '#fff');

      rect(53, 225, 696, 151, '#131a20');
      rect(183, 245, 450, 110, '#080b11');
      text('SAMSUNG', 202, 279, 22, '#ddd');
      text('990 EVO', 202, 325, 38, '#ddd');
      for (let i = 0; i < 14; i++) rect(735, 239 + i * 9, 20, 5, '#c8ab59');
      text('PCIe 4.0 x4 / 5.0 x2 NVMe', 34, 463, 23, '#fff');
      text('990', 34, 552, 86, '#fff');
      text('EVO', 205, 552, 58, '#6ba9ed');
      text('5,000 MB/s', 555, 507, 24, '#fff');
      text('1TB', 650, 559, 50, '#fff');
      break;
    case 'cooler':
      text('THERMALRIGHT', 25, 58, 37);
      text('Low Temperature · High Performance', 26, 86, 17);
      for (let i = 0; i < 16; i++) {
        line([
          [178, 143 + i * 11],
          [338, 124 + i * 11],
          [407, 174 + i * 11],
        ]);
        line([
          [422, 143 + i * 11],
          [570, 127 + i * 11],
          [637, 166 + i * 11],
        ]);
      }
      line([
        [178, 143],
        [178, 331],
        [250, 382],
        [407, 350],
        [407, 174],
        [338, 124],
        [178, 143],
      ]);
      line([
        [422, 143],
        [422, 337],
        [505, 390],
        [637, 348],
        [637, 166],
        [570, 127],
        [422, 143],
      ]);
      fan(303, 277, 70);
      fan(529, 287, 66);
      for (let i = 0; i < 7; i++)
        line([
          [270 + i * 17, 370],
          [270 + i * 17, 419],
          [386 + i * 9, 433],
        ]);
      text('PHANTOM SPIRIT', 30, 510, 48);
      text('120 SE', 32, 567, 56);
      break;
    case 'psu':
      text('CORSAIR', 30, 62, 37);
      text('ATX 3.1 / PCIe 5.1', 528, 57, 23);
      polygon(
        [
          [195, 170],
          [475, 101],
          [684, 191],
          [389, 278],
        ],
        '#3a4048',
      );
      polygon(
        [
          [195, 170],
          [389, 278],
          [389, 422],
          [195, 309],
        ],
        '#1d2329',
      );
      polygon(
        [
          [389, 278],
          [684, 191],
          [684, 335],
          [389, 422],
        ],
        '#252b30',
      );
      for (let i = 0; i < 11; i++)
        for (let j = 0; j < 7; j++)
          line(
            [
              [222 + i * 24 + j * 20, 173 - i * 6 + j * 10],
              [229 + i * 24 + j * 20, 178 - i * 6 + j * 10],
              [239 + i * 24 + j * 20, 175 - i * 6 + j * 10],
            ],
            '#171d24',
            5,
          );
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 3; j++) rect(212 + i * 32, 221 + j * 27 + i * 17, 21, 17, '#080d12');
      text('RM1000x', 481, 335, 26, '#e1e4e5');
      text('RMx SERIES', 30, 474, 25);
      text('RM1000x', 30, 538, 58);
      text('Fully Modular ATX Power Supply', 30, 575, 24);
      break;
    case 'case':
      text('LIAN LI', 560, 57, 39);
      text('Feel the difference', 562, 81, 15);
      line([
        [90, 86],
        [306, 81],
        [353, 229],
        [324, 558],
        [80, 549],
        [52, 226],
        [90, 86],
      ]);
      line([
        [52, 226],
        [353, 229],
      ]);
      line([
        [71, 241],
        [334, 244],
        [312, 542],
        [90, 535],
        [71, 241],
      ]);
      for (let x = 102; x < 298; x += 9)
        line(
          [
            [x, 102],
            [x + 23, 211],
          ],
          '#514534',
          1,
        );
      for (let x = 92; x < 315; x += 9)
        line(
          [
            [x, 258],
            [x, 528],
          ],
          '#514534',
          1,
        );
      for (let y = 264; y < 533; y += 9)
        line(
          [
            [91, y],
            [314, y],
          ],
          '#514534',
          1,
        );
      for (let x = 127; x < 270; x += 31) rect(x, 231, 17, 5, design.ink);
      text('LANCOOL 216', 381, 316, 38);
      text('A I R F L O W   F O C U S', 392, 348, 16);
      break;
  }
  return canvas;
}
