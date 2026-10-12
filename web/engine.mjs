export const PALETTES = {
  violet: { accent: '#c6adff', dark: '#211539', light: '#eee4ff', name: 'Améthyste' },
  mint: { accent: '#c9fa75', dark: '#123e36', light: '#e1f4d8', name: 'Matcha' },
  peach: { accent: '#ffd07d', dark: '#542b36', light: '#ffe9da', name: 'Abricot' },
  blue: { accent: '#8de7ff', dark: '#142d50', light: '#e0efff', name: 'Azur' },
};

export function suggestHeadlines(title) {
  const clean = title.replace(/\s+/g, ' ').trim();
  const parts = clean.split(/\s*[:：]\s*/).filter(Boolean);
  const words = clean.split(' ');
  // Deliberately extractive: never invent results, statistics or a promise.
  return [
    (parts[0] || clean).slice(0, 90),
    (parts.length > 1 ? parts.slice(1).join(' : ') : words.slice(0, 6).join(' ')).slice(0, 90),
    (words.length > 6 ? words.slice(-6).join(' ') : clean).slice(0, 90),
  ];
}

export function fitText(ctx, text, maxWidth, maxHeight, initialSize = 112) {
  const paragraphs = text.trim().toLocaleUpperCase('fr').split('\n');
  let size = initialSize;
  let lines = [];
  for (; size >= 14; size -= 2) {
    ctx.font = `900 ${size}px Arial, sans-serif`;
    // Prefer smaller intact words over breaking an ordinary word mid-syllable.
    if (size > 14 && paragraphs.some(p => p.split(/\s+/).some(word => ctx.measureText(word).width > maxWidth))) continue;
    lines = [];
    for (const paragraph of paragraphs) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        // Split a very long token instead of letting it escape the export.
        let tokens = [word];
        if (ctx.measureText(word).width > maxWidth) {
          tokens = [];
          let token = '';
          for (const char of word) {
            if (ctx.measureText(token + char).width > maxWidth && token) {
              tokens.push(token);
              token = '';
            }
            token += char;
          }
          if (token) tokens.push(token);
        }
        for (const token of tokens) {
          const next = line ? `${line} ${token}` : token;
          if (ctx.measureText(next).width > maxWidth && line) {
            lines.push(line);
            line = token;
          } else line = next;
        }
      }
      if (line) lines.push(line);
    }
    if (lines.length * size * 1.04 <= maxHeight) break;
  }
  return { lines, size, lineHeight: size * 1.04 };
}

export function imagePrompt({ title, description, style }) {
  const art = {
    editorial: 'photographie éditoriale, lumière naturelle, composition soignée',
    impact: 'contraste fort, couleurs franches, éclairage de studio spectaculaire',
    cinema: 'photographie cinématographique, lumière dramatique, profondeur',
    minimal: 'nature morte minimaliste, un seul sujet visuel fort, fond épuré',
  }[style] || 'photographie éditoriale';
  return `Crée un fond de miniature YouTube original au format paysage 16:9, sans texte, sans lettre, sans logo et sans filigrane.\nSujet de la vidéo : ${title}\nContexte : ${description || 'Illustrer le sujet sans inventer de résultats.'}\nDirection artistique : ${art}.\nPlace le sujet principal sur la moitié droite et laisse la moitié gauche calme et libre pour ajouter un titre ensuite. Garde le sujet dans la zone centrale pour permettre le recadrage. Utilise une métaphore visuelle pertinente, sans statistiques inventées. Produis seulement l’image.`;
}

function rounded(ctx, x, y, width, height, radius, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function artwork(ctx, p, variant) {
  // Original procedural artwork: useful offline, never labelled as AI imagery.
  const x = variant === 2 ? 830 : 930;
  ctx.save();
  const glow = ctx.createRadialGradient(x, 330, 15, x, 330, 470);
  glow.addColorStop(0, `${p.accent}55`);
  glow.addColorStop(1, `${p.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(490, 0, 790, 720);
  ctx.translate(x, 335);
  ctx.rotate(-0.14 + variant * 0.08);
  ctx.shadowColor = '#0007';
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 40;
  rounded(ctx, -190, -190, 350, 370, 58, '#ffffff15');
  ctx.shadowBlur = 0;
  const face = ctx.createLinearGradient(-150, -170, 170, 190);
  face.addColorStop(0, '#faf7ef');
  face.addColorStop(1, p.accent);
  rounded(ctx, -172, -202, 350, 355, 52, face);
  rounded(ctx, -144, -174, 294, 244, 30, p.dark);
  // A luminous branching motif on a floating screen.
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  [[-85, -113, 4, -48], [85, -113, 4, -48], [-80, 8, 4, -48], [85, 8, 4, -48]].forEach(([a, b, c, d]) => {
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
  });
  [[-85, -113, 20], [85, -113, 20], [-80, 8, 20], [85, 8, 20], [4, -48, 32]].forEach(([a, b, r]) => {
    ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.dark; ctx.beginPath(); ctx.arc(a, b, r * 0.35, 0, Math.PI * 2); ctx.fill();
  });
  rounded(ctx, -110, 100, 130, 9, 5, `${p.dark}66`);
  rounded(ctx, 34, 100, 65, 9, 5, `${p.dark}33`);
  ctx.restore();
  ctx.save();
  ctx.translate(x - 210, 535); ctx.rotate(-0.18);
  rounded(ctx, -50, -50, 100, 100, 23, p.accent);
  ctx.fillStyle = p.dark;
  ctx.beginPath(); ctx.moveTo(-13, -25); ctx.lineTo(25, 0); ctx.lineTo(-13, 25); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff8';
  [[x + 230, 160, 9], [x - 160, 120, 5], [x + 230, 530, 5]].forEach(([a, b, r]) => {
    ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.fill();
  });
}

export function renderThumbnail(canvas, project, index, image = null) {
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const v = project.variants[index];
  const p = PALETTES[v.palette] || PALETTES.violet;
  const minimal = project.style === 'minimal';
  const background = ctx.createLinearGradient(0, 0, 1280, 720);
  background.addColorStop(0, minimal ? p.light : p.dark);
  background.addColorStop(1, minimal ? '#ffffff' : '#10161c');
  ctx.fillStyle = background; ctx.fillRect(0, 0, 1280, 720);
  if (image) {
    const scale = Math.max(1280 / image.width, 720 / image.height);
    const width = image.width * scale, height = image.height * scale;
    ctx.drawImage(image, (1280 - width) / 2, (720 - height) / 2, width, height);
    if (project.renderMode === 'complete') return canvas;
    const shade = ctx.createLinearGradient(0, 0, 1280, 0);
    shade.addColorStop(0, '#071017f5'); shade.addColorStop(0.44, '#071017d8'); shade.addColorStop(0.8, '#07101722');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, 1280, 720);
  } else artwork(ctx, p, index);
  if (project.style === 'impact') {
    ctx.fillStyle = p.accent; ctx.fillRect(0, 0, 15, 720);
  }
  const foreground = minimal && !image ? p.dark : '#fffdf7';
  ctx.fillStyle = foreground;
  ctx.font = '600 20px Arial, sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText((project.eyebrow || 'UNE AUTRE PERSPECTIVE').toLocaleUpperCase('fr').slice(0, 35), 76, 96);
  ctx.letterSpacing = '0px';
  const layout = fitText(ctx, v.headline || project.title, 625, 410, project.style === 'cinema' ? 100 : 120);
  const totalHeight = layout.lines.length * layout.lineHeight;
  const start = 170 + Math.max(0, (365 - totalHeight) / 2);
  ctx.textBaseline = 'top';
  ctx.font = `900 ${layout.size}px Arial, sans-serif`;
  layout.lines.forEach((line, i) => {
    ctx.fillStyle = i === layout.lines.length - 1 && !(minimal && !image) ? p.accent : foreground;
    ctx.fillText(line, 72, start + i * layout.lineHeight);
  });
  ctx.textBaseline = 'alphabetic';
  rounded(ctx, 76, 614, 46, 3, 1, minimal && !image ? p.dark : p.accent);
  ctx.fillStyle = foreground; ctx.font = '600 18px Arial, sans-serif';
  ctx.fillText((project.signature || 'LE STUDIO').toLocaleUpperCase('fr').slice(0, 35), 141, 622);
  if (project.style === 'cinema') {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1280, 26); ctx.fillRect(0, 694, 1280, 26);
  }
  return canvas;
}
