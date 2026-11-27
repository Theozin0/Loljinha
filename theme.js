// Aparência do site: cores, fontes, logo e textos editáveis pelo painel (aba "Aparência").
// Tudo é validado antes de aplicar: cores só em #RRGGBB, imagens só https, textos via textContent.
import { db, configured } from './common.js?v=20261126-2358';

export const DEFAULTS = {
  storeName: '',
  colors: { primary: '#16215c', secondary: '#22318a', accent: '#ffcb05', button: '#e3350d', bg: '#f6f4ee', card: '#ffffff', text: '#1b1d29' },
  font: 'sistema',
  radius: 14,
  logo: '',
  showName: true,
  heroImage: '',
  texts: {
    ribbon: '⚡ Frete grátis para Jundiaí e Várzea Paulista',
    eyebrow: 'Pokémon Trading Card Game',
    title: 'Cartas avulsas e lacrados',
    highlight: 'pra completar sua coleção.',
    lead: 'Monte o carrinho, envie o pedido e a gente confirma o frete com você. Sem pagamento pelo site.',
    footer: 'Jundiaí/SP · Frete grátis para Jundiaí e Várzea Paulista',
  },
};

export const PRESETS = {
  'Clássico':  { primary: '#16215c', secondary: '#22318a', accent: '#ffcb05', button: '#e3350d', bg: '#f6f4ee', card: '#ffffff', text: '#1b1d29' },
  'Fogo':      { primary: '#7a1408', secondary: '#c2410c', accent: '#fbbf24', button: '#dc2626', bg: '#fff7ed', card: '#ffffff', text: '#2a1205' },
  'Água':      { primary: '#0c4a6e', secondary: '#0369a1', accent: '#67e8f9', button: '#0284c7', bg: '#f0f9ff', card: '#ffffff', text: '#0b2535' },
  'Planta':    { primary: '#14532d', secondary: '#15803d', accent: '#bef264', button: '#16a34a', bg: '#f4f9f1', card: '#ffffff', text: '#11261a' },
  'Psíquico':  { primary: '#4c1d95', secondary: '#7c3aed', accent: '#f0abfc', button: '#db2777', bg: '#faf5ff', card: '#ffffff', text: '#2e1065' },
  'Elétrico':  { primary: '#1f2937', secondary: '#374151', accent: '#facc15', button: '#eab308', bg: '#fefce8', card: '#ffffff', text: '#1f2937' },
  'Noturno':   { primary: '#0b0f1a', secondary: '#1e293b', accent: '#a78bfa', button: '#8b5cf6', bg: '#111827', card: '#1f2937', text: '#e5e7eb' },
  'Rosa':      { primary: '#831843', secondary: '#be185d', accent: '#fde68a', button: '#ec4899', bg: '#fdf2f8', card: '#ffffff', text: '#3b0a24' },
};

export const FONTS = {
  sistema:     { label: 'Padrão (moderna)', stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  arredondada: { label: 'Arredondada', stack: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Varela Round", system-ui, sans-serif' },
  classica:    { label: 'Clássica (serifada)', stack: 'Georgia, "Times New Roman", "Iowan Old Style", "Palatino Linotype", serif' },
  forte:       { label: 'Forte (títulos marcantes)', stack: '"Trebuchet MS", "Segoe UI", "Avenir Next", Verdana, sans-serif' },
  mono:        { label: 'Retrô (monoespaçada)', stack: 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace' },
};

const HEX = /^#[0-9a-f]{6}$/i;
const URL_OK = (u) => typeof u === 'string' && /^https:\/\/[^\s"'<>()\\]+$/.test(u) && u.length <= 400;
const clampText = (v, d, max = 200) => (typeof v === 'string' ? v.slice(0, max) : d);

/** Mescla as configurações salvas com os padrões, descartando valores inválidos. */
export function normalize(s = {}) {
  const c = s.colors || {}, t = s.texts || {};
  const colors = {}; for (const k of Object.keys(DEFAULTS.colors)) colors[k] = HEX.test(c[k]) ? c[k].toLowerCase() : DEFAULTS.colors[k];
  const texts = {}; for (const k of Object.keys(DEFAULTS.texts)) texts[k] = clampText(t[k], DEFAULTS.texts[k], k === 'lead' ? 300 : 120);
  return {
    storeName: clampText(s.storeName, '', 60).trim(),
    colors, texts,
    font: FONTS[s.font] ? s.font : DEFAULTS.font,
    radius: Number.isInteger(s.radius) && s.radius >= 0 && s.radius <= 28 ? s.radius : DEFAULTS.radius,
    logo: URL_OK(s.logo) ? s.logo : '',
    showName: s.showName !== false,
    heroImage: URL_OK(s.heroImage) ? s.heroImage : '',
  };
}

// --- contraste automático: texto claro ou escuro conforme a cor de fundo
function lum(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const onColor = (hex) => (lum(hex) > 0.45 ? '#141414' : '#ffffff');
function mix(hex, other, w) {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)), b = [1, 3, 5].map((i) => parseInt(other.slice(i, i + 2), 16));
  return '#' + a.map((x, i) => Math.round(x * (1 - w) + b[i] * w).toString(16).padStart(2, '0')).join('');
}

/** Aplica o tema na página atual. */
export function applyTheme(raw, { storeName } = {}) {
  const s = normalize(raw);
  const r = document.documentElement.style, c = s.colors;
  const dark = lum(c.bg) < 0.2;
  r.setProperty('--navy', c.primary); r.setProperty('--navy-2', c.secondary);
  r.setProperty('--yellow', c.accent); r.setProperty('--red', c.button);
  r.setProperty('--bg', c.bg); r.setProperty('--card', c.card); r.setProperty('--ink', c.text);
  r.setProperty('--on-navy', onColor(c.primary)); r.setProperty('--on-yellow', onColor(c.accent)); r.setProperty('--on-red', onColor(c.button));
  r.setProperty('--muted', mix(c.text, c.bg, 0.45));
  r.setProperty('--line', mix(c.bg, c.text, dark ? 0.2 : 0.09));
  r.setProperty('--soft', mix(c.bg, c.text, dark ? 0.12 : 0.04));
  r.setProperty('--field', dark ? mix(c.card, c.bg, 0.3) : '#ffffff');
  const darkCard = lum(c.card) < 0.2;
  r.setProperty('--price', darkCard ? c.accent : c.primary);
  r.setProperty('--link', darkCard ? c.accent : c.secondary);
  r.setProperty('--radius', `${s.radius}px`);
  r.setProperty('--font', FONTS[s.font].stack);
  document.documentElement.classList.toggle('theme-dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.primary);

  // logo
  document.querySelectorAll('[data-logo]').forEach((img) => {
    img.src = s.logo || 'icon.svg';
    img.classList.toggle('custom-logo', !!s.logo);
  });
  const name = s.storeName || storeName;
  if (name && document.body.dataset.page === 'loja') document.title = `${name} — Pokémon TCG`;
  document.querySelectorAll('[data-store-name]').forEach((el) => {
    if (name) el.textContent = name;
    if (el.closest('.brand')) el.hidden = !!s.logo && !s.showName;
  });
  const fav = document.querySelector('link[rel="icon"]');
  if (fav) fav.href = s.logo || 'icon.svg';

  // textos
  for (const [k, v] of Object.entries(s.texts)) {
    document.querySelectorAll(`[data-text="${k}"]`).forEach((el) => { el.textContent = v; el.hidden = !v; });
  }
  // imagem de destaque
  const heroImg = document.querySelector('[data-hero-image]');
  const heroCards = document.querySelector('.hero-cards');
  if (heroImg) { heroImg.hidden = !s.heroImage; if (s.heroImage) heroImg.src = s.heroImage; }
  if (heroCards) heroCards.hidden = !!s.heroImage;
  return s;
}

const CACHE = 'site-theme';
/** Aplica o tema salvo no navegador (instantâneo) e depois busca a versão atual no banco. */
export async function loadTheme(opts) {
  try { const cached = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (cached) applyTheme(cached, opts); } catch { /* ignore */ }
  if (!configured) return normalize({});
  try {
    const rows = await db.select('site_settings', 'select=data&id=eq.1');
    const data = rows?.[0]?.data || {};
    try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch { /* ignore */ }
    return applyTheme(data, opts);
  } catch { return normalize({}); }
}
export async function saveTheme(data) {
  const clean = normalize(data);
  const row = await db.update('site_settings', 'id=eq.1', { data: clean });
  if (!row) throw new Error('Não foi possível salvar. Rode o arquivo atualizacao-aparencia.sql no Supabase.');
  try { localStorage.setItem(CACHE, JSON.stringify(clean)); } catch { /* ignore */ }
  return clean;
}
