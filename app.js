import { h, brl, toast, STATUS_LABEL, formatDate, productDetail, productImage, db, CONFIG, configured, orderMessage, waLink } from './common.js';

const $ = (s) => document.querySelector(s);
const state = { products: [], filter: 'todos', search: '', sort: 'destaque', inStock: true, cart: loadCart() };
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
function bump() { const b = $('#cartCount'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }

// ---------- Vitrine
async function loadProducts() {
  try {
    if (!configured) throw new Error('Loja em configuração. Volte em breve!');
    const rows = await db.select('products', 'select=id,type,name,set_name,card_number,condition,language,rarity,description,price_cents,stock,image,featured&active=eq.true&order=featured.desc,created_at.desc');
    state.products = [...rows.filter((p) => p.stock > 0), ...rows.filter((p) => p.stock <= 0)];
    // remove do carrinho o que saiu de estoque
    for (const [id, qty] of Object.entries(state.cart)) {
      const p = product(id);
      if (!p || p.stock <= 0) delete state.cart[id];
      else if (qty > p.stock) state.cart[id] = p.stock;
    }
    saveCart();
    renderGrid();
  } catch (e) {
    $('#grid').replaceChildren(h('p', { class: 'empty' }, e.message));
  }
}

function renderGrid() {
  const q = norm(state.search);
  let list = state.products.filter((p) =>
    (state.filter === 'todos' || p.type === state.filter) &&
    (!state.inStock || p.stock > 0) &&
    (!q || norm([p.name, p.set_name, p.card_number, p.rarity, p.description].join(' ')).includes(q)));
  const sorters = {
    menor: (a, b) => a.price_cents - b.price_cents,
    maior: (a, b) => b.price_cents - a.price_cents,
    nome: (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
  };
  if (sorters[state.sort]) list = [...list].sort(sorters[state.sort]);
  const grid = $('#grid');
  if (!list.length) return grid.replaceChildren(h('p', { class: 'empty' }, state.products.length ? 'Nenhum produto encontrado com esses filtros.' : 'Em breve novos produtos por aqui!'));
  grid.replaceChildren(...list.map(productCard));
}

function productCard(p) {
  const out = p.stock <= 0;
  return h('article', { class: `product ${out ? 'out' : ''}` },
    h('button', { class: 'product-media', onclick: () => openProduct(p), 'aria-label': `Ver ${p.name}` },
      productImage(p),
      h('span', { class: `tag ${p.type}` }, p.type === 'lacrado' ? 'Lacrado' : 'Avulsa'),
      p.featured ? h('span', { class: 'tag star' }, '★ Destaque') : null),
    h('div', { class: 'product-body' },
      h('h3', {}, p.name),
      h('p', { class: 'detail' }, productDetail(p) || ' '),
      h('div', { class: 'product-foot' },
        h('div', {},
          h('strong', { class: 'price' }, brl(p.price_cents)),
          h('small', { class: `stock ${p.stock <= 2 && !out ? 'low' : ''}` }, out ? 'Esgotado' : p.stock <= 2 ? `Últimas ${p.stock}!` : `${p.stock} em estoque`)),
        h('button', { class: 'btn primary sm', disabled: out, onclick: () => addToCart(p) }, out ? 'Esgotado' : 'Adicionar'))));
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
      h('div', { class: 'pd-media' }, productImage(p, 'pd-img')),
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
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${valid}`; });
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === valid));
  window.scrollTo({ top: 0 });
}

// ---------- Init
async function init() {
  document.querySelectorAll('[data-store-name]').forEach((el) => { el.textContent = CONFIG.storeName; });
  document.title = `${CONFIG.storeName} — Pokémon TCG`;

  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('active', x === b));
    renderGrid();
  }));
  $('#search').addEventListener('input', (e) => { state.search = e.target.value; renderGrid(); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });
  $('#inStock').addEventListener('change', (e) => { state.inStock = e.target.checked; renderGrid(); });

  $('#openCart').addEventListener('click', () => openCart(true));
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
  await loadProducts();
}
init();
