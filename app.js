import { h, brl, toast, STATUS_LABEL, formatDate, productDetail, productImage, db, CONFIG, configured, orderMessage, waLink } from './common.js';
import { loadTheme, applyTheme } from './theme.js';

const $ = (s) => document.querySelector(s);
const newFilters = () => ({ langs: new Set(), conds: new Set(), sets: new Set(), min: null, max: null, inStock: true });
const state = { products: [], filter: 'todos', search: '', sort: 'destaque', f: newFilters(), cart: loadCart() };
const FREE = ['jundiai', 'varzea paulista'];
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------- Carrinho (localStorage)
function loadCart() { try { return JSON.parse(localStorage.getItem('cart') || '{}') || {}; } catch { return {}; } }
function saveCart() { try { localStorage.setItem('cart', JSON.stringify(state.cart)); } catch { /* modo privado */ } renderCart(); }
const product = (id) => state.products.find((p) => p.id === Number(id));
function cartLines() {
  return Object.entries(state.cart).map(([id, qty]) => ({ p: product(id), qty })).filter((l) => l.p);
}
function addToCart(p, qty = 1) {
  const cur = state.cart[p.id] || 0;
  if (cur + qty > p.stock) return toast(`Só temos ${p.stock} em estoque.`, 'warn');
  state.cart[p.id] = cur + qty;
  saveCart();
  toast(`${p.name} adicionado ao carrinho`);
  bump();
}
function bump() {
  for (const b of [$('#cartCount'), $('#cartCountBottom')]) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  navigator.vibrate?.(12);
}

// ---------- Vitrine
const PRODUCTS_CACHE = 'products-cache-v2';
function skeletons(n = 8) {
  $('#grid').replaceChildren(...Array.from({ length: n }, () => h('div', { class: 'product skeleton', 'aria-hidden': 'true' },
    h('div', { class: 'product-media' }),
    h('div', { class: 'product-body' }, h('div', { class: 'sk-line w80' }), h('div', { class: 'sk-line w60' }), h('div', { class: 'sk-line w40' })))));
}
function setProducts(rows) {
  state.products = [...rows.filter((p) => p.stock > 0), ...rows.filter((p) => p.stock <= 0)];
}
/** Mostra na hora a última lista conhecida (cache) e atualiza em segundo plano. */
function loadCachedProducts() {
  try {
    const c = JSON.parse(localStorage.getItem(PRODUCTS_CACHE) || 'null');
    if (c && Date.now() - c.t < 24 * 3600_000 && Array.isArray(c.rows)) { setProducts(c.rows); renderGrid(); renderCart(); return true; }
  } catch { /* ignore */ }
  return false;
}
async function loadProducts() {
  try {
    if (!configured) throw new Error('Loja em configuração. Volte em breve!');
    const rows = await db.select('products', 'select=id,type,name,set_name,card_number,condition,language,rarity,description,price_cents,stock,image,featured,created_at&active=eq.true&order=featured.desc,created_at.desc');
    setProducts(rows);
    try { localStorage.setItem(PRODUCTS_CACHE, JSON.stringify({ t: Date.now(), rows })); } catch { /* ignore */ }
    // remove do carrinho o que saiu de estoque
    for (const [id, qty] of Object.entries(state.cart)) {
      const p = product(id);
      if (!p || p.stock <= 0) delete state.cart[id];
      else if (qty > p.stock) state.cart[id] = p.stock;
    }
    saveCart();
    renderGrid();
  } catch (e) {
    if (!state.products.length) $('#grid').replaceChildren(h('p', { class: 'empty' }, e.message));
    $('#resultCount').textContent = '';
  } finally { $('#grid').setAttribute('aria-busy', 'false'); }
}

function renderGrid() {
  const q = norm(state.search);
  const f = state.f;
  let list = state.products.filter((p) =>
    (state.filter === 'todos' || p.type === state.filter) &&
    (!f.inStock || p.stock > 0) &&
    (!f.langs.size || f.langs.has(p.language)) &&
    (!f.conds.size || f.conds.has(p.condition)) &&
    (!f.sets.size || f.sets.has(p.set_name)) &&
    (f.min == null || p.price_cents >= f.min * 100) &&
    (f.max == null || p.price_cents <= f.max * 100) &&
    (!q || norm([p.name, p.set_name, p.card_number, p.rarity, p.description].join(' ')).includes(q)));
  const sorters = {
    menor: (a, b) => a.price_cents - b.price_cents,
    maior: (a, b) => b.price_cents - a.price_cents,
    nome: (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
    recentes: (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
  };
  if (sorters[state.sort]) list = [...list].sort(sorters[state.sort]);
  const grid = $('#grid');
  const total = list.length;
  $('#resultCount').replaceChildren(...(state.products.length
    ? [h('b', {}, total), ` ${total === 1 ? 'item encontrado' : 'itens encontrados'}${q ? ` para “${state.search.trim()}”` : ''}`] : []));
  renderActiveFilters();
  if (!list.length) return grid.replaceChildren(h('p', { class: 'empty' }, state.products.length ? 'Nenhum produto encontrado com esses filtros.' : 'Em breve novos produtos por aqui!'));
  grid.replaceChildren(...list.map((p, i) => productCard(p, i)));
}

function productCard(p, i = 99) {
  const out = p.stock <= 0, lang = langBadge(p.language), cond = condCode(p.condition);
  return h('article', { class: `product ${out ? 'out' : ''}` },
    h('button', { class: 'product-media', onclick: () => openProduct(p), 'aria-label': `Ver ${p.name}` },
      productImage(p, 'thumb', { eager: i < 4 }),
      h('span', { class: `tag ${p.type}` }, p.type === 'lacrado' ? 'Lacrado' : 'Avulsa'),
      p.featured ? h('span', { class: 'tag star' }, '★') : null,
      lang ? h('span', { class: 'pill-badge lang', title: p.language }, h('small', {}, lang[0]), lang[1]) : null,
      cond ? h('span', { class: 'pill-badge cond', title: p.condition }, cond) : null),
    h('div', { class: 'product-body' },
      h('h3', {}, p.name, p.card_number ? h('span', { class: 'num' }, ` (${p.card_number})`) : null),
      h('p', { class: 'detail' }, [p.set_name, p.rarity].filter(Boolean).join(' · ') || ' '),
      h('div', { class: 'price-row' },
        h('span', { class: `units ${out ? 'low' : ''}` }, out ? 'Esgotado' : `${p.stock} un.`),
        h('strong', { class: 'price' }, brl(p.price_cents))),
      h('button', { class: 'btn primary buy', disabled: out, onclick: () => addToCart(p) }, out ? 'Esgotado' : 'Comprar')));
}

// ---------- Filtros (idioma, condição, coleção, preço)
const LANGS = {
  'Português': ['BR', 'PT-BR'], 'Inglês': ['US', 'ENG'], 'Japonês': ['JP', 'JP'], 'Espanhol': ['ES', 'ESP'],
  'Chinês': ['CN', 'CH'], 'Coreano': ['KR', 'KOR'], 'Francês': ['FR', 'FRA'], 'Alemão': ['DE', 'ALE'], 'Italiano': ['IT', 'ITA'],
};
function langBadge(l) { return l ? (LANGS[l] || [l.slice(0, 2).toUpperCase(), l]) : null; }
function condCode(c) { const m = /^([A-Z]{1,3})\b/.exec(c || ''); return m ? m[1] : (c ? c.slice(0, 3).toUpperCase() : ''); }
function condLabel(c) { const m = /^([A-Z]{1,3})\s*\((.+)\)\s*$/.exec(c || ''); return m ? `${m[1]} · ${m[2]}` : c; }
const TITLES = { todos: 'Todos os produtos', avulsa: 'Cartas Avulsas', lacrado: 'Lacrados' };

let draft = null;
const cloneF = (f) => ({ ...f, langs: new Set(f.langs), conds: new Set(f.conds), sets: new Set(f.sets) });
const activeCount = (f) => f.langs.size + f.conds.size + f.sets.size + (f.min != null || f.max != null ? 1 : 0) + (f.inStock ? 0 : 1);

function priceBounds(list) {
  if (!list.length) return null;
  const prices = list.map((p) => p.price_cents / 100);
  return { lo: Math.floor(Math.min(...prices)), hi: Math.ceil(Math.max(...prices)) };
}
function countBy(list, key) {
  const m = new Map();
  for (const p of list) if (p[key]) m.set(p[key], (m.get(p[key]) || 0) + 1);
  return [...m.entries()];
}

function openFilters() {
  draft = cloneF(state.f);
  renderFilterBody();
  $('#filterDialog').showModal();
}
function renderFilterBody() {
  const base = state.products.filter((p) => (state.filter === 'todos' || p.type === state.filter) && (!draft.inStock || p.stock > 0));
  const section = (title, entries, set, label = (v) => v, prefix) => entries.length ? h('fieldset', { class: 'f-group' },
    h('legend', {}, title),
    h('div', { class: 'f-chips' }, entries.map(([v, n]) => {
      const pre = prefix?.(v);
      return h('button', { type: 'button', class: `f-chip ${set.has(v) ? 'on' : ''}`, 'aria-pressed': String(set.has(v)),
        onclick: (e) => { set.has(v) ? set.delete(v) : set.add(v); e.currentTarget.classList.toggle('on'); e.currentTarget.setAttribute('aria-pressed', String(set.has(v))); } },
        pre ? h('small', { class: 'f-pre' }, pre) : null, label(v), h('span', { class: 'f-n' }, n));
    }))) : null;

  const order = (arr, pref) => arr.sort((a, b) => (pref.indexOf(a[0]) + 1 || 99) - (pref.indexOf(b[0]) + 1 || 99) || b[1] - a[1]);
  const langs = order(countBy(base, 'language'), Object.keys(LANGS));
  const conds = order(countBy(base, 'condition'), ['NM', 'SP', 'MP', 'HP', 'D'].map((c) => base.find((p) => condCode(p.condition) === c)?.condition).filter(Boolean));
  const sets = countBy(base, 'set_name').sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 24);

  const bounds = priceBounds(base);
  let priceSec = null;
  if (bounds && bounds.hi > bounds.lo) {
    const step = Math.max(1, Math.round((bounds.hi - bounds.lo) / 200));
    bounds.hi = bounds.lo + Math.ceil((bounds.hi - bounds.lo) / step) * step;   // o máximo cai exatamente num passo
    const lo = Math.max(bounds.lo, Math.min(draft.min ?? bounds.lo, bounds.hi)), hi = Math.min(bounds.hi, Math.max(draft.max ?? bounds.hi, bounds.lo));
    const rMin = h('input', { type: 'range', min: bounds.lo, max: bounds.hi, step, value: lo, 'aria-label': 'Preço mínimo' });
    const rMax = h('input', { type: 'range', min: bounds.lo, max: bounds.hi, step, value: hi, 'aria-label': 'Preço máximo' });
    const fill = h('i'), summary = h('p', { class: 'f-range-sum' }), minL = h('b'), maxL = h('b');
    const reais = (v) => `R$ ${Number(v).toLocaleString('pt-BR')}`;
    const sync = (which) => {
      let a = Number(rMin.value), b = Number(rMax.value);
      if (a > b) { if (which === 'min') rMin.value = a = b; else rMax.value = b = a; }
      const pct = (v) => ((v - bounds.lo) / (bounds.hi - bounds.lo)) * 100;
      fill.style.left = `${pct(a)}%`; fill.style.right = `${100 - pct(b)}%`;
      summary.textContent = `${reais(a)} – ${reais(b)}`; minL.textContent = reais(a); maxL.textContent = reais(b);
      draft.min = a > bounds.lo ? a : null; draft.max = b < bounds.hi ? b : null;
    };
    rMin.addEventListener('input', () => sync('min')); rMax.addEventListener('input', () => sync('max'));
    priceSec = h('fieldset', { class: 'f-group' }, h('legend', {}, 'Preço'), summary,
      h('div', { class: 'range2' }, h('div', { class: 'range2-track' }, fill), rMin, rMax),
      h('div', { class: 'f-range-labels' }, h('span', {}, 'Mín: ', minL), h('span', {}, 'Máx: ', maxL)));
    sync();
  }

  const stockToggle = h('label', { class: 'f-switch' },
    h('input', { type: 'checkbox', checked: draft.inStock, onchange: (e) => { draft.inStock = e.target.checked; renderFilterBody(); } }),
    h('span', { class: 'f-switch-ui', 'aria-hidden': 'true' }), 'Mostrar só itens em estoque');

  $('#filterBody').replaceChildren(
    section('Idioma', langs, draft.langs, (v) => langBadge(v)[1], (v) => langBadge(v)[0]),
    section('Condição', conds, draft.conds, condLabel),
    section('Coleção', sets, draft.sets),
    priceSec,
    h('fieldset', { class: 'f-group' }, h('legend', {}, 'Disponibilidade'), stockToggle));
}
function applyFilters(f) {
  state.f = f;
  const n = activeCount(f);
  $('#filterCount').textContent = n; $('#filterCount').hidden = !n;
  $('#openFilters').classList.toggle('on', n > 0);
  renderGrid();
}
function renderActiveFilters() {
  const f = state.f, pills = [];
  const pill = (text, remove) => pills.push(h('button', { type: 'button', class: 'a-pill', onclick: remove, 'aria-label': `Remover filtro ${text}` }, text, h('span', { 'aria-hidden': 'true' }, '✕')));
  for (const v of f.langs) pill(langBadge(v)[1], () => { f.langs.delete(v); applyFilters(f); });
  for (const v of f.conds) pill(condCode(v) || v, () => { f.conds.delete(v); applyFilters(f); });
  for (const v of f.sets) pill(v, () => { f.sets.delete(v); applyFilters(f); });
  const r = (v) => `R$ ${Number(v).toLocaleString('pt-BR')}`;
  if (f.min != null || f.max != null) pill(f.min != null && f.max != null ? `${r(f.min)} – ${r(f.max)}` : f.min != null ? `A partir de ${r(f.min)}` : `Até ${r(f.max)}`, () => { f.min = f.max = null; applyFilters(f); });
  if (!f.inStock) pill('Incluindo esgotados', () => { f.inStock = true; applyFilters(f); });
  const box = $('#activeFilters');
  if (pills.length > 1) pills.push(h('button', { type: 'button', class: 'link', onclick: () => applyFilters(newFilters()) }, 'Limpar tudo'));
  box.replaceChildren(...pills); box.hidden = !pills.length;
}

function openProduct(p) {
  const dlg = $('#productDialog');
  let qty = 1;
  const qtyEl = h('span', { class: 'qty-val' }, '1');
  const setQty = (n) => { qty = Math.max(1, Math.min(p.stock, n)); qtyEl.textContent = qty; };
  const rows = [['Coleção', p.set_name], ['Número', p.card_number], ['Raridade', p.rarity], ['Condição', p.condition], ['Idioma', p.language]].filter(([, v]) => v);
  dlg.replaceChildren(
    h('div', { class: 'dialog-head' }, h('span', { class: `tag inline ${p.type}` }, p.type === 'lacrado' ? 'Produto lacrado' : 'Carta avulsa'),
      h('button', { class: 'icon-btn', onclick: () => dlg.close(), 'aria-label': 'Fechar' }, '✕')),
    h('div', { class: 'pd' },
      magnifier(h('div', { class: 'pd-media' }, productImage(p, 'pd-img', { eager: true }))),
      h('div', { class: 'pd-info' },
        h('h2', {}, p.name),
        h('dl', { class: 'specs' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
        p.description ? h('p', { class: 'pd-desc' }, p.description) : null,
        h('p', { class: 'price big' }, brl(p.price_cents)),
        h('p', { class: 'muted small' }, p.stock > 0 ? `${p.stock} disponível(is)` : 'Esgotado'),
        p.stock > 0 ? h('div', { class: 'pd-buy' },
          h('div', { class: 'qty' }, h('button', { onclick: () => setQty(qty - 1), 'aria-label': 'Menos' }, '−'), qtyEl, h('button', { onclick: () => setQty(qty + 1), 'aria-label': 'Mais' }, '+')),
          h('button', { class: 'btn primary', onclick: () => { addToCart(p, qty); dlg.close(); } }, 'Adicionar ao carrinho')) : null)));
  dlg.showModal();
}

// ---------- Carrinho UI
function renderCart() {
  const lines = cartLines();
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.p.price_cents, 0);
  $('#cartCount').textContent = count;
  $('#cartCountBottom').textContent = count; $('#cartCountBottom').hidden = !count;
  $('#cartSubtotal').textContent = brl(subtotal);
  $('#checkoutBtn').disabled = !count;
  $('#cartItems').replaceChildren(...(lines.length ? lines.map(({ p, qty }) =>
    h('div', { class: 'cart-line' },
      productImage(p, 'cart-thumb'),
      h('div', { class: 'cart-info' },
        h('strong', {}, p.name),
        h('small', { class: 'muted' }, productDetail(p)),
        h('div', { class: 'qty sm' },
          h('button', { 'aria-label': 'Menos', onclick: () => { if (qty <= 1) delete state.cart[p.id]; else state.cart[p.id] = qty - 1; saveCart(); } }, '−'),
          h('span', { class: 'qty-val' }, qty),
          h('button', { 'aria-label': 'Mais', onclick: () => { if (qty < p.stock) { state.cart[p.id] = qty + 1; saveCart(); } else toast(`Só temos ${p.stock} em estoque.`, 'warn'); } }, '+'))),
      h('div', { class: 'cart-right' },
        h('strong', {}, brl(p.price_cents * qty)),
        h('button', { class: 'link danger', onclick: () => { delete state.cart[p.id]; saveCart(); } }, 'remover'))))
    : [h('p', { class: 'empty' }, 'Seu carrinho está vazio.')]));
}
function openCart(open) {
  $('#cart').classList.toggle('open', open);
  $('#cart').setAttribute('aria-hidden', String(!open));
  $('#cartBackdrop').hidden = !open;
}

// ---------- Checkout
function updateShippingInfo() {
  const f = $('#checkoutForm');
  const city = norm(f.city.value), uf = norm(f.state.value);
  const box = $('#shippingInfo');
  if (!city) { box.className = 'shipping-info'; box.textContent = ''; return; }
  if (FREE.includes(city) && uf === 'sp') { box.className = 'shipping-info free'; box.textContent = '🎉 Frete GRÁTIS para sua cidade!'; }
  else { box.className = 'shipping-info'; box.textContent = 'O valor do frete será informado pelo lojista na confirmação do pedido.'; }
}

async function lookupCep() {
  const f = $('#checkoutForm');
  const cep = f.cep.value.replace(/\D/g, '');
  if (cep.length !== 8) return;
  f.cep.value = `${cep.slice(0, 5)}-${cep.slice(5)}`;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d.erro) return toast('CEP não encontrado — preencha o endereço manualmente.', 'warn');
    if (d.logradouro) f.street.value = d.logradouro;
    if (d.bairro) f.district.value = d.bairro;
    f.city.value = d.localidade || f.city.value;
    f.state.value = d.uf || f.state.value;
    updateShippingInfo();
    (d.logradouro ? f.number : f.street).focus();
  } catch { /* sem internet para ViaCEP: preenchimento manual */ }
}

function openCheckout() {
  const lines = cartLines();
  if (!lines.length) return;
  $('#checkoutSubtotal').textContent = brl(lines.reduce((s, l) => s + l.qty * l.p.price_cents, 0));
  const f = $('#checkoutForm');
  try { const saved = JSON.parse(localStorage.getItem('customer') || '{}'); for (const [k, v] of Object.entries(saved)) if (f[k] && !f[k].value) f[k].value = v; } catch {}
  updateShippingInfo();
  openCart(false);
  $('#checkoutDialog').showModal();
}

async function placeOrder(ev) {
  ev.preventDefault();
  const f = ev.target;
  if (!f.reportValidity()) return;
  const btn = $('#placeOrder');
  btn.disabled = true; btn.textContent = 'Enviando…';
  const customer = Object.fromEntries(new FormData(f));
  try {
    const order = await db.rpc('place_order', {
      p_customer: customer,
      p_items: cartLines().map(({ p, qty }) => ({ id: p.id, qty })),
    });
    const whatsappUrl = CONFIG.storeWhatsapp ? waLink(CONFIG.storeWhatsapp, orderMessage(order, customer)) : null;
    try { const { notes, ...keep } = customer; localStorage.setItem('customer', JSON.stringify(keep)); } catch {}
    state.cart = {}; saveCart();
    $('#checkoutDialog').close();
    showDone(order, whatsappUrl);
    if (whatsappUrl) window.open(whatsappUrl, '_blank', 'noopener');
    loadProducts();
  } catch (e) {
    toast(e.message, 'err');
    if (/estoque|disponível/i.test(e.message)) loadProducts();
  } finally { btn.disabled = false; btn.textContent = 'Enviar pedido'; }
}

function showDone(order, whatsappUrl) {
  const dlg = $('#doneDialog');
  dlg.replaceChildren(
    h('div', { class: 'done' },
      h('div', { class: 'done-icon' }, '✓'),
      h('h2', {}, 'Pedido recebido!'),
      h('p', {}, 'Guarde o código do seu pedido:'),
      h('p', { class: 'code' }, order.code),
      h('p', { class: 'muted' }, order.free_shipping
        ? 'Seu frete é GRÁTIS. Vamos conferir o estoque e confirmar o pedido com você.'
        : 'Vamos conferir o estoque, calcular o frete e te responder com o valor total.'),
      whatsappUrl ? h('a', { class: 'btn whatsapp block', href: whatsappUrl, target: '_blank', rel: 'noopener' }, 'Enviar pedido pelo WhatsApp') : null,
      whatsappUrl ? h('p', { class: 'small muted' }, 'Se o WhatsApp não abriu sozinho, toque no botão acima para nos enviar o pedido.') : null,
      h('button', { class: 'btn ghost block', onclick: () => { dlg.close(); location.hash = 'pedido'; } }, 'Acompanhar pedido')));
  dlg.showModal();
}

// ---------- Sugestões
async function sendSuggestion(ev) {
  ev.preventDefault();
  const f = ev.target;
  const btn = f.querySelector('button');
  btn.disabled = true;
  try {
    const d = Object.fromEntries(new FormData(f));
    if (!d.website) await db.rpc('submit_suggestion', { p_name: d.name, p_contact: d.contact, p_product: d.product, p_details: d.details });
    f.reset();
    toast('Sugestão enviada. Obrigado!');
  } catch (e) { toast(e.message, 'err'); } finally { btn.disabled = false; }
}

// ---------- Consulta de pedido
async function lookupOrder(ev) {
  ev.preventDefault();
  const out = $('#lookupResult');
  try {
    const d = Object.fromEntries(new FormData(ev.target));
    const o = await db.rpc('lookup_order', { p_code: d.code, p_phone: d.phone });
    out.replaceChildren(h('div', { class: 'card order-view' },
      h('div', { class: 'order-top' }, h('strong', { class: 'code sm' }, o.code), h('span', { class: `status s-${o.status}` }, STATUS_LABEL[o.status] || o.status)),
      h('p', { class: 'muted small' }, `Feito em ${formatDate(o.created_at)} · Entrega em ${o.city}/${o.state}`),
      h('ul', { class: 'order-items' }, o.items.map((i) => h('li', {}, h('span', {}, `${i.qty}× ${i.name}`), h('span', {}, brl(i.qty * i.price_cents))))),
      h('div', { class: 'sum' }, h('span', {}, 'Subtotal'), h('span', {}, brl(o.subtotal_cents))),
      h('div', { class: 'sum' }, h('span', {}, 'Frete'), h('span', {}, o.free_shipping ? 'Grátis' : o.shipping_cents == null ? 'a calcular' : brl(o.shipping_cents))),
      h('div', { class: 'sum big' }, h('span', {}, 'Total'), h('strong', {}, o.total_cents == null ? '—' : brl(o.total_cents))),
      o.admin_note ? h('p', { class: 'notice' }, o.admin_note) : null));
  } catch (e) { out.replaceChildren(h('p', { class: 'empty' }, e.message)); }
}

// ---------- Navegação
function route() {
  const view = (location.hash || '#loja').slice(1);
  const valid = ['loja', 'sugestoes', 'pedido'].includes(view) ? view : 'loja';
  const current = document.querySelector('.view:not([hidden])')?.id;
  const apply = () => {
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${valid}`; });
    document.querySelectorAll('[data-nav]').forEach((a) => {
      a.classList.toggle('active', a.dataset.nav === valid);
      if (a.dataset.nav === valid) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  };
  if (current === `view-${valid}`) return apply();
  if (document.startViewTransition && current) document.startViewTransition(apply); else apply();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ---------- Init
async function init() {
  document.querySelectorAll('[data-store-name]').forEach((el) => { el.textContent = CONFIG.storeName; });
  document.title = `${CONFIG.storeName} — Pokémon TCG`;
  // Prévia ao vivo da aba "Aparência" (o painel abre a loja num quadro e envia o rascunho)
  const preview = new URLSearchParams(location.search).has('previa') && window.parent !== window;
  if (preview) {
    window.addEventListener('message', (e) => {
      if (e.origin === location.origin && e.data?.type === 'theme-preview') applyTheme(e.data.settings, { storeName: CONFIG.storeName });
    });
    window.parent.postMessage({ type: 'preview-ready' }, location.origin);
  } else loadTheme({ storeName: CONFIG.storeName });

  $('#openFilters').addEventListener('click', openFilters);
  $('#filterForm').addEventListener('submit', (e) => { e.preventDefault(); applyFilters(draft); $('#filterDialog').close(); });
  $('#clearFilters').addEventListener('click', () => { draft = newFilters(); renderFilterBody(); });
  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    $('#shopTitle').textContent = TITLES[b.dataset.filter] || TITLES.todos;
    document.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    state.filter = b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('active', x === b));
    renderGrid();
  }));
  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = e.target.value; renderGrid(); }, 120);
  });
  // atalho: "/" abre a busca
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]') && !document.querySelector('dialog[open]')) {
      e.preventDefault(); if (location.hash && location.hash !== '#loja') location.hash = 'loja'; $('#search').focus();
    }
  });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });

  $('#openCart').addEventListener('click', () => openCart(true));
  $('#openCartBottom').addEventListener('click', () => openCart(true));
  $('#closeCart').addEventListener('click', () => openCart(false));
  $('#cartBackdrop').addEventListener('click', () => openCart(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openCart(false); });
  $('#checkoutBtn').addEventListener('click', openCheckout);

  const f = $('#checkoutForm');
  f.addEventListener('submit', placeOrder);
  f.cep.addEventListener('blur', lookupCep);
  f.cep.addEventListener('input', () => { if (f.cep.value.replace(/\D/g, '').length === 8) lookupCep(); });
  f.city.addEventListener('input', updateShippingInfo);
  f.state.addEventListener('input', updateShippingInfo);
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  $('#suggestForm').addEventListener('submit', sendSuggestion);
  $('#lookupForm').addEventListener('submit', lookupOrder);

  window.addEventListener('hashchange', route);
  route();
  renderCart();
  setupScrollUX();
  if (!loadCachedProducts()) skeletons();
  await loadProducts();
}
init();

// ---------- Rolagem: cabeçalho que encolhe/esconde, filtros fixos, voltar ao topo
function setupScrollUX() {
  const root = document.documentElement, top = $('.topbar'), filters = $('#filters'), toTop = $('#toTop');
  const small = matchMedia('(max-width: 47.99rem)');
  new ResizeObserver(([e]) => root.style.setProperty('--header-h', `${Math.round(e.borderBoxSize?.[0]?.blockSize ?? top.offsetHeight)}px`)).observe(top);
  let lastY = scrollY, ticking = false;
  const update = () => {
    ticking = false;
    const y = scrollY, dy = y - lastY;
    top.classList.toggle('scrolled', y > 8);
    const busy = $('#cart').classList.contains('open') || document.querySelector('dialog[open]') || document.activeElement === $('#search');
    if (small.matches && !busy && Math.abs(dy) > 6) root.classList.toggle('nav-hidden', dy > 0 && y > 220);
    if (y < 80) root.classList.remove('nav-hidden');
    if (filters && !filters.closest('[hidden]')) {
      const headerH = root.classList.contains('nav-hidden') ? 0 : top.offsetHeight;
      filters.classList.toggle('stuck', filters.getBoundingClientRect().top <= headerH + 1 && y > 200);
    }
    toTop.classList.toggle('show', y > 900);
    lastY = y;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  toTop.addEventListener('click', () => { scrollTo({ top: 0, behavior: 'smooth' }); $('#conteudo').focus({ preventScroll: true }); });
  update();
}

// ---------- Lupa: amplia a imagem do produto ao passar o mouse (ou tocar e arrastar no celular)
function magnifier(media) {
  const img = media.querySelector('img');
  if (!img) return media;
  const touchOnly = matchMedia('(hover: none)').matches;
  const lens = h('div', { class: 'zoom-lens', 'aria-hidden': 'true' });
  const hint = h('span', { class: 'zoom-hint', 'aria-hidden': 'true' }, touchOnly ? '🔍 Toque e arraste para ampliar' : '🔍 Passe o mouse para ampliar · role para ajustar');
  media.classList.add('zoomable');
  media.append(lens, hint);
  let zoom = 2.6, last = null;

  // área real da imagem dentro do quadro (object-fit: contain + padding)
  const box = () => {
    const r = img.getBoundingClientRect(), cs = getComputedStyle(img);
    const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
    const cw = r.width - pl - pr, ch = r.height - pt - pb;
    const nw = img.naturalWidth || cw, nh = img.naturalHeight || ch;
    const k = Math.min(cw / nw, ch / nh), w = nw * k, hh = nh * k;
    return { x: r.left + pl + (cw - w) / 2, y: r.top + pt + (ch - hh) / 2, w, h: hh };
  };
  const hide = () => { lens.classList.remove('on'); media.classList.remove('zooming'); last = null; };
  const show = (cx, cy, touch) => {
    if (!img.complete || !img.naturalWidth) return;
    const b = box();
    if (cx < b.x || cx > b.x + b.w || cy < b.y || cy > b.y + b.h) return hide();
    last = { cx, cy, touch };
    const size = lens.clientWidth;
    const lift = touch ? lens.offsetHeight * 0.75 : 0;       // no toque, a lupa fica acima do dedo
    lens.style.left = `${cx}px`;                             // posição na tela: a lupa pode passar da borda da janela
    lens.style.top = `${cy - lift}px`;
    lens.style.backgroundImage = `url(${JSON.stringify(img.currentSrc || img.src)})`;
    lens.style.backgroundSize = `${b.w * zoom}px ${b.h * zoom}px`;
    lens.style.backgroundPosition = `${-((cx - b.x) * zoom - size / 2)}px ${-((cy - b.y) * zoom - size / 2)}px`;
    lens.classList.add('on'); media.classList.add('zooming');
  };

  media.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen' || e.buttons) show(e.clientX, e.clientY, e.pointerType === 'touch');
  });
  media.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') { media.setPointerCapture(e.pointerId); show(e.clientX, e.clientY, true); }
  });
  media.addEventListener('pointerleave', hide);
  media.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') hide(); });
  media.addEventListener('pointercancel', hide);
  // roda do mouse ajusta o nível de zoom (1,5× a 5×)
  media.addEventListener('wheel', (e) => {
    if (!last) return;
    e.preventDefault();
    zoom = Math.min(5, Math.max(1.5, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    show(last.cx, last.cy, last.touch);
  }, { passive: false });
  return media;
}
