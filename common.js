// Utilidades compartilhadas + cliente mínimo do Supabase (sem bibliotecas externas).
// Todo texto entra na página via textContent — nunca innerHTML com dados.
import { CONFIG } from './config.js?v=20261126-2350';

export { CONFIG };
// aceita a URL com ou sem /rest/v1 no final
const BASE = String(CONFIG.supabaseUrl || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth|storage)\/v1$/, '');
const KEY = CONFIG.supabaseKey;
const BUCKET = 'produtos';
export const configured = /^https:\/\//.test(BASE) && !BASE.includes('SEU-PROJETO') && !KEY.includes('COLE_AQUI');

// ---------------------------------------------------------------- DOM
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const brl = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function parseBRL(text) {
  let s = String(text || '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Math.round(Number(s) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export const centsToInput = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

export function toast(msg, kind = 'ok') {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

export const STATUS_LABEL = {
  pendente: 'Aguardando confirmação', confirmado: 'Confirmado', enviado: 'Enviado',
  concluido: 'Concluído', recusado: 'Recusado', cancelado: 'Cancelado',
};
export function formatDate(d) {
  const date = new Date(d);
  return isNaN(date) ? String(d) : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
export function productDetail(p) {
  return [p.set_name, p.card_number && `#${p.card_number}`, p.rarity, p.condition, p.language].filter(Boolean).join(' · ');
}
export function productImage(p, cls = 'thumb', { eager = false } = {}) {
  if (p.image) {
    const img = h('img', { class: cls, alt: p.name, decoding: 'async', loading: eager ? 'eager' : 'lazy', referrerpolicy: 'no-referrer', 'data-loading': '' });
    if (eager) img.setAttribute('fetchpriority', 'high');
    const done = () => img.removeAttribute('data-loading');
    img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true });
    img.src = p.image;
    return img;
  }
  return h('div', { class: `${cls} thumb-empty ${p.type}`, 'aria-hidden': 'true' },
    h('span', {}, p.type === 'lacrado' ? 'LACRADO' : 'CARTA'));
}
export const waPhone = (phone) => { const d = String(phone).replace(/\D/g, ''); return d.length <= 11 ? `55${d}` : d; };
export const waLink = (phone, text) => `https://wa.me/${waPhone(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** Mensagem do pedido enviada ao lojista */
export function orderMessage(o, c) {
  const lines = [
    `*Novo pedido ${o.code}* — ${CONFIG.storeName}`, '',
    ...o.items.map((i) => `• ${i.qty}x ${i.name}${i.detail ? ` (${i.detail})` : ''} — ${brl(i.price_cents * i.qty)}`), '',
    `Subtotal: ${brl(o.subtotal_cents)}`,
    `Frete: ${o.free_shipping ? 'GRÁTIS (Jundiaí/Várzea Paulista)' : 'a calcular pelo lojista'}`, '',
    `*Cliente:* ${c.customer_name || c.name}`,
    `Telefone: ${c.phone}${c.email ? ` | E-mail: ${c.email}` : ''}`,
    `Endereço: ${c.street}, ${c.number}${c.complement ? ` - ${c.complement}` : ''} — ${c.district}, ${c.city}/${c.state} — CEP ${c.cep}`,
  ];
  if (c.notes) lines.push(`Obs.: ${c.notes}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- Sessão do admin
let session = null;
try { session = JSON.parse(sessionStorage.getItem('sb-session') || 'null'); } catch { /* ignore */ }
function setSession(s) {
  session = s ? { access_token: s.access_token, refresh_token: s.refresh_token,
    expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), email: s.user?.email || session?.email } : null;
  try { session ? sessionStorage.setItem('sb-session', JSON.stringify(session)) : sessionStorage.removeItem('sb-session'); } catch { /* ignore */ }
}

class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

async function authCall(path, body) {
  let res;
  try {
    res = await fetch(`${BASE}/auth/v1/${path}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new ApiError('Sem conexão com o servidor.', 0); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = data.error_description || data.msg || data.message || '';
    const msg = /invalid login|invalid_credentials|invalid_grant/i.test(raw + data.error_code + data.code + data.error) ? 'E-mail ou senha incorretos'
      : /rate|too many/i.test(raw) || res.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos.'
      : /not confirmed/i.test(raw) ? 'E-mail ainda não confirmado no Supabase.' : (raw || `Erro ${res.status}`);
    throw new ApiError(msg, res.status);
  }
  return data;
}

let refreshing = null;
async function accessToken() {
  if (!session) return null;
  if (session.expires_at * 1000 - Date.now() > 60_000) return session.access_token;
  refreshing ||= authCall('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
    .then(setSession).catch(() => setSession(null)).finally(() => { refreshing = null; });
  await refreshing;
  return session?.access_token || null;
}

export const auth = {
  get email() { return session?.email || null; },
  get loggedIn() { return !!session; },
  async login(email, password) { setSession(await authCall('token?grant_type=password', { email, password })); },
  async logout() {
    const t = await accessToken();
    if (t) fetch(`${BASE}/auth/v1/logout`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t}` } }).catch(() => {});
    setSession(null);
  },
};

// ---------------------------------------------------------------- REST / RPC / Storage
async function request(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  if (!configured) throw new ApiError('Loja ainda não configurada: edite o arquivo js/config.js.', 0);
  const token = await accessToken();
  const h2 = { apikey: KEY, ...headers };
  if (token) h2.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body !== undefined && !raw) { h2['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch(`${BASE}${path}`, { method, headers: h2, body: payload }); }
  catch { throw new ApiError('Sem conexão com o servidor. Tente novamente.', 0); }
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    let msg = (data && (data.message || data.error_description || data.msg || data.error)) || `Erro ${res.status}`;
    if (/JWT expired|invalid JWT|jwt/i.test(msg) || res.status === 401) { setSession(null); throw new ApiError('Sessão expirada. Entre novamente.', 401); }
    if (/permission denied|row-level security|Acesso negado/i.test(msg)) msg = 'Sem permissão. Entre novamente como administrador.';
    if (/PGRST|schema cache|does not exist/i.test(msg)) msg = 'Banco não configurado: rode o arquivo supabase/setup.sql no Supabase.';
    throw new ApiError(msg, res.status);
  }
  return data;
}

export const db = {
  select: (table, query = '') => request(`/rest/v1/${table}?${query}`),
  insert: (table, row) => request(`/rest/v1/${table}`, { method: 'POST', body: row, headers: { Prefer: 'return=representation' } }).then((r) => r?.[0]),
  update: (table, query, patch) => request(`/rest/v1/${table}?${query}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' } }).then((r) => r?.[0]),
  remove: (table, query) => request(`/rest/v1/${table}?${query}`, { method: 'DELETE' }),
  rpc: (fn, args = {}) => request(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args }),
};

const PUBLIC_PREFIX = `${BASE}/storage/v1/object/public/${BUCKET}/`;
/** Reduz e converte para WebP antes de enviar (fotos de celular de 4 MB viram ~150 KB). */
async function optimizeImage(file, maxSide) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), hgt = Math.round(bmp.height * scale);
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: hgt });
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, hgt);
    bmp.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.84));
    if (blob && blob.type === 'image/webp' && (blob.size < file.size || scale < 1)) return blob;
  } catch { /* navegador sem suporte: envia o original */ }
  return file;
}
export async function uploadImage(original, { maxSide = 1400 } = {}) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(original.type)) throw new ApiError('Envie uma imagem JPG, PNG ou WEBP', 400);
  if (original.size > 15_000_000) throw new ApiError('Imagem muito grande (máx. 15 MB)', 413);
  const file = await optimizeImage(original, maxSide);
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
  if (file.size > 5_000_000) throw new ApiError('Imagem muito grande mesmo após otimizar (máx. 5 MB)', 413);
  const name = `${crypto.randomUUID()}.${ext}`;
  await request(`/storage/v1/object/${BUCKET}/${name}`, { method: 'POST', body: file, raw: true, headers: { 'Content-Type': file.type, 'Cache-Control': 'max-age=31536000' } });
  return PUBLIC_PREFIX + name;
}
export async function deleteImage(url) {
  if (!url || !url.startsWith(PUBLIC_PREFIX)) return;
  await request(`/storage/v1/object/${BUCKET}/${url.slice(PUBLIC_PREFIX.length)}`, { method: 'DELETE' }).catch(() => {});
}
