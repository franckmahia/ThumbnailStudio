import test from 'node:test';
import assert from 'node:assert/strict';
import { fitText, imagePrompt, suggestHeadlines } from '../web/engine.mjs';

test('headline suggestions retain supplied content without adding claims', () => {
  const suggestions = suggestHeadlines('Une IA utile : du prototype au terrain');
  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0], 'Une IA utile');
  assert.equal(suggestions[1], 'du prototype au terrain');
  assert.ok(suggestions.every(x => !/[0-9]/.test(x)));
});

test('long headline and unbroken words stay within export bounds', () => {
  const ctx = { font: '', measureText(text) { return { width: text.length * parseInt(this.font.split(' ')[1]) * 0.6 }; } };
  const layout = fitText(ctx, `Une longue miniature avec ${'W'.repeat(90)} et plusieurs lignes explicites`, 625, 410);
  assert.ok(layout.lines.length * layout.lineHeight <= 410);
  assert.ok(layout.lines.every(x => ctx.measureText(x).width <= 625));
});

test('ChatGPT prompt includes the context and reserves space for editable text', () => {
  const prompt = imagePrompt({ title: 'Mon sujet', description: 'Mon contexte', style: 'cinema' });
  assert.ok(prompt.includes('Mon sujet'));
  assert.ok(prompt.includes('Mon contexte'));
  assert.ok(prompt.includes('sans texte'));
  assert.ok(prompt.includes('moitié gauche'));
});

test('a complete native thumbnail is exported without a second caption or dark overlay', async () => {
  const { renderThumbnail } = await import('../web/engine.mjs');
  let draws = 0, fills = 0;
  const ctx = { createLinearGradient: () => ({ addColorStop() {} }), fillRect() { fills++; }, drawImage() { draws++; }, fillText() { assert.fail('Complete image must retain its own typography'); } };
  const canvas = { getContext: () => ctx };
  renderThumbnail(canvas, { renderMode: 'complete', style: 'impact', variants: [{ headline: 'DO NOT ADD', palette: 'mint' }] }, 0, { width: 1536, height: 864 });
  assert.equal(draws, 1);
  assert.equal(fills, 1); // Only the opaque canvas background before the full image.
  assert.equal(canvas.width, 1280);
  assert.equal(canvas.height, 720);
});
