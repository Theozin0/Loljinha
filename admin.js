import { h, brl, toast, parseBRL, centsToInput, STATUS_LABEL, formatDate, productDetail, productImage, db, auth, configured, orderMessage, waLink, waPhone, uploadImage, deleteImage } from './common.js?v=20261126-2350';
import { DEFAULTS, PRESETS, FONTS, normalize, applyTheme, loadTheme, saveTheme } from './theme.js?v=20261126-2350';

const $ = (s) => document.querySelector(s);
const state = { orderStatus: 'pendente', products: [], productType: '', productSearch: '', editing: null };

// ---------- Sessão
async function boot() {
  if (!configured) { showLogin(); return toast('Edite o arquivo js/config.js com os dados do Supabase.', 'warn'); }
  if (!auth.loggedIn) return showLogin();
  try { await db.rpc('admin_stats'); start(); }
  catch { await auth.logout(); showLogin(); }
}
function showLogin() { $('#panel').hidden = true; $('#login').hidden = false; $('#loginForm').email.focus(); }
function start() {
  $('#whoami').textContent = auth.email || '';
  $('#login').hidden = true; $('#panel').hidden = false;
  loadOrders(); loadStats();
}
async function handle(fn) {
  try { return await fn(); }
  catch (e) { if (e.status === 401) { toast('Sessão expirada. Entre novamente.', 'warn'); showLogin(); } else toast(e.message, 'err'); }
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button'); btn.disabled = true;
  try {
    const d = Object.fromEntries(new FormData(e.target));
    await auth.login(d.email.trim(), d.password);
    try { await db.rpc('admin_stats'); }
    catch { await auth.logout(); throw new Error('Este usuário não é administrador da loja.'); }
    e.target.reset();
    start();
  } catch (err) { toast(err.message, 'err'); } finally { btn.disabled = false; }
});
$('#logout').addEventListener('click', () => handle(async () => { await auth.logout(); showLogin(); }));

// ---------- Abas
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('main > .view').forEach((v) => { v.hidden = v.id !== `tab-${b.dataset.tab}`; });
  ({ pedidos: loadOrders, produtos: loadProducts, sugestoes: loadSuggestions, aparencia: loadAppearance })[b.dataset.tab]();
  loadStats();
}));

async function loadStats() {
  await handle(async () => {
    const s = await db.rpc('admin_stats');
    const set = (id, n) => { const b = $(id); b.hidden = !n; b.textContent = n; };
    set('#badgePending', s.pending); set('#badgeSugg', s.newSuggestions); set('#badgeStock', s.lowStock);
    document.title = s.pending ? `(${s.pending}) Painel do administrador` : 'Painel do administrador';
  });
}
setInterval(() => { if (!$('#panel').hidden) { loadStats(); if (!$('#tab-pedidos').hidden && state.orderStatus === 'pendente' && !document.activeElement?.closest('.order')) loadOrders(); } }, 60_000);

// ---------- Pedidos
document.querySelectorAll('#orderFilter [data-status]').forEach((b) => b.addEventListener('click', () => {
  state.orderStatus = b.dataset.status;
  document.querySelectorAll('#orderFilter .chip').forEach((x) => x.classList.toggle('active', x === b));
  loadOrders();
}));
$('#refreshOrders').addEventListener('click', () => { loadOrders(); loadStats(); });

async function loadOrders() {
  await handle(async () => {
    const list = (await db.select('orders', `select=*&order=created_at.desc&limit=500${state.orderStatus ? `&status=eq.${state.orderStatus}` : ''}`)).map(withTotals);
    $('#orders').replaceChildren(...(list.length ? list.map(orderCard) : [h('p', { class: 'empty' }, 'Nenhum pedido aqui.')]));
  });
}

function withTotals(o) {
  const shipping = o.free_shipping ? 0 : o.shipping_cents;
  return { ...o, shipping_cents: shipping, total_cents: shipping == null ? null : o.subtotal_cents + shipping };
}
function customerMessage(o) {
  const ship = o.free_shipping ? 'GRÁTIS' : brl(o.shipping_cents);
  const head = {
    confirmado: `Olá, ${o.customer_name.split(' ')[0]}! Seu pedido *${o.code}* foi confirmado ✅`,
    recusado: `Olá, ${o.customer_name.split(' ')[0]}! Infelizmente não conseguimos atender o pedido *${o.code}*.`,
    enviado: `Olá, ${o.customer_name.split(' ')[0]}! Seu pedido *${o.code}* foi enviado 📦`,
  }[o.status] || `Olá, ${o.customer_name.split(' ')[0]}! Sobre o seu pedido *${o.code}*:`;
  const lines = [head, '', ...o.items.map((i) => `• ${i.qty}x ${i.name} — ${brl(i.qty * i.price_cents)}`), '',
    `Subtotal: ${brl(o.subtotal_cents)}`];
  if (o.shipping_cents != null || o.free_shipping) lines.push(`Frete: ${ship}`, `*Total: ${brl(o.total_cents)}*`);
  if (o.admin_note) lines.push('', o.admin_note);
  return lines.join('\n');
}

function orderCard(o) {
  const editable = ['pendente', 'confirmado'].includes(o.status);
  const shipInput = h('input', { class: 'money', inputmode: 'decimal', placeholder: '0,00', value: centsToInput(o.shipping_cents), disabled: !editable || o.free_shipping });
  const noteInput = h('textarea', { rows: 2, maxlength: 500, placeholder: 'Mensagem para o cliente (aparece na consulta do pedido)', disabled: !editable }, o.admin_note || '');
  const totalEl = h('strong', {}, '');
  const updateTotal = () => {
    const s = o.free_shipping ? 0 : parseBRL(shipInput.value);
    totalEl.textContent = s == null ? '—' : brl(o.subtotal_cents + s);
  };
  shipInput.addEventListener('input', updateTotal); updateTotal();

  const save = async () => {
    const raw = shipInput.value.trim();
    const shipping_cents = o.free_shipping ? 0 : raw === '' ? null : parseBRL(raw);
    if (raw && shipping_cents == null) throw new Error('Valor de frete inválido');
    await db.rpc('admin_update_order', { p_id: o.id, p_shipping_cents: shipping_cents, p_note: noteInput.value });
  };
  const setStatus = (status, confirmText) => handle(async () => {
    if (confirmText && !confirm(confirmText)) return;
    if (editable) await save();
    await db.rpc('admin_set_order_status', { p_id: o.id, p_status: status });
    const updated = withTotals((await db.select('orders', `select=*&id=eq.${o.id}`))[0]);
    toast(`Pedido ${o.code}: ${STATUS_LABEL[status]}`);
    if (['confirmado', 'recusado', 'enviado'].includes(status) && confirm('Abrir WhatsApp para avisar o cliente?')) {
      window.open(waLink(updated.phone, customerMessage(updated)), '_blank', 'noopener');
    }
    loadOrders(); loadStats();
  });

  const actions = {
    pendente: [
      h('button', { class: 'btn ghost sm', onclick: () => handle(async () => { await save(); toast('Frete/observação salvos'); }) }, 'Salvar'),
      h('button', { class: 'btn danger sm', onclick: () => setStatus('recusado', `Recusar o pedido ${o.code}? Os itens voltam para o estoque.`) }, 'Recusar'),
      h('button', { class: 'btn success sm', onclick: () => setStatus('confirmado') }, 'Confirmar pedido'),
    ],
    confirmado: [
      h('button', { class: 'btn ghost sm', onclick: () => handle(async () => { await save(); toast('Salvo'); }) }, 'Salvar'),
      h('button', { class: 'btn danger sm', onclick: () => setStatus('cancelado', `Cancelar o pedido ${o.code}? Os itens voltam para o estoque.`) }, 'Cancelar'),
      h('button', { class: 'btn primary sm', onclick: () => setStatus('enviado') }, 'Marcar como enviado'),
    ],
    enviado: [h('button', { class: 'btn success sm', onclick: () => setStatus('concluido') }, 'Marcar como concluído')],
  }[o.status] || [];

  return h('article', { class: `order card s-border-${o.status}` },
    h('div', { class: 'order-top' },
      h('div', {}, h('strong', { class: 'code sm' }, o.code), h('span', { class: 'muted small' }, ` · ${formatDate(o.created_at)}`)),
      h('span', { class: `status s-${o.status}` }, STATUS_LABEL[o.status])),
    h('div', { class: 'order-grid' },
      h('div', { class: 'order-customer' },
        h('h4', {}, o.customer_name),
        h('p', {}, h('a', { href: waLink(o.phone), target: '_blank', rel: 'noopener' }, `📱 ${o.phone}`), o.email ? ` · ${o.email}` : ''),
        h('p', {}, `${o.street}, ${o.number}${o.complement ? ` - ${o.complement}` : ''}`),
        h('p', {}, `${o.district} — ${o.city}/${o.state} — CEP ${o.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}`),
        o.notes ? h('p', { class: 'notice small' }, `Obs. do cliente: ${o.notes}`) : null),
      h('div', { class: 'order-items-box' },
        h('ul', { class: 'order-items' }, o.items.map((i) => h('li', {},
          h('span', {}, h('b', {}, `${i.qty}× `), i.name, i.detail ? h('small', { class: 'muted' }, ` — ${i.detail}`) : ''),
          h('span', {}, brl(i.qty * i.price_cents))))),
        h('div', { class: 'sum' }, h('span', {}, 'Subtotal'), h('span', {}, brl(o.subtotal_cents))),
        h('div', { class: 'sum ship-row' }, h('span', {}, 'Frete'),
          o.free_shipping ? h('span', { class: 'free-badge' }, 'GRÁTIS · Jundiaí/Várzea') : h('label', { class: 'inline-money' }, 'R$ ', shipInput)),
        h('div', { class: 'sum big' }, h('span', {}, 'Total'), totalEl))),
    editable ? noteInput : (o.admin_note ? h('p', { class: 'notice small' }, o.admin_note) : null),
    h('div', { class: 'order-actions' },
      h('button', { class: 'link', onclick: () => navigator.clipboard.writeText(orderMessage(o, o)).then(() => toast('Pedido copiado')) }, 'Copiar pedido'),
      h('a', { class: 'link', href: waLink(o.phone, customerMessage(o)), target: '_blank', rel: 'noopener' }, 'Falar com o cliente'),
      h('span', { class: 'spacer' }), ...actions));
}

// ---------- Produtos
document.querySelectorAll('#productFilter [data-type]').forEach((b) => b.addEventListener('click', () => {
  state.productType = b.dataset.type;
  document.querySelectorAll('#productFilter .chip').forEach((x) => x.classList.toggle('active', x === b));
  renderProducts();
}));
$('#productSearch').addEventListener('input', (e) => { state.productSearch = e.target.value.toLowerCase(); renderProducts(); });
$('#newProduct').addEventListener('click', () => openProductForm(null));

async function loadProducts() {
  await handle(async () => { state.products = await db.select('products', 'select=*&order=created_at.desc'); renderProducts(); });
}
function renderProducts() {
  const q = state.productSearch;
  const list = state.products.filter((p) =>
    (!state.productType || (state.productType === 'baixo' ? p.stock <= 1 : p.type === state.productType)) &&
    (!q || `${p.name} ${p.set_name} ${p.card_number}`.toLowerCase().includes(q)));
  $('#productRows').replaceChildren(...(list.length ? list.map(productRow)
    : [h('tr', {}, h('td', { colspan: 7, class: 'empty' }, state.products.length ? 'Nenhum produto com esse filtro.' : 'Nenhum produto ainda. Clique em “+ Novo produto”.'))]));
}
function productRow(p) {
  const stockEl = h('span', { class: `stock-val ${p.stock <= 1 ? 'low' : ''}` }, p.stock);
  const adjust = (delta) => handle(async () => {
    const stock = await db.rpc('admin_adjust_stock', { p_id: p.id, p_delta: delta });
    p.stock = stock; stockEl.textContent = stock; stockEl.classList.toggle('low', stock <= 1); loadStats();
  });
  const toggle = h('input', { type: 'checkbox', checked: !!p.active, 'aria-label': 'Visível na loja', onchange: (e) => handle(async () => {
    const u = await db.update('products', `id=eq.${p.id}`, { active: e.target.checked });
    Object.assign(p, u); toast(u.active ? 'Produto visível na loja' : 'Produto oculto da loja');
  }) });
  return h('tr', { class: p.active ? '' : 'inactive' },
    h('td', {}, productImage(p, 'table-thumb')),
    h('td', {}, h('strong', {}, p.name, p.featured ? ' ★' : ''), h('br'), h('small', { class: 'muted' }, productDetail(p))),
    h('td', {}, h('span', { class: `tag inline ${p.type}` }, p.type === 'lacrado' ? 'Lacrado' : 'Avulsa')),
    h('td', {}, brl(p.price_cents)),
    h('td', {}, h('div', { class: 'qty sm' }, h('button', { onclick: () => adjust(-1), 'aria-label': 'Diminuir estoque' }, '−'), stockEl, h('button', { onclick: () => adjust(1), 'aria-label': 'Aumentar estoque' }, '+'))),
    h('td', {}, h('label', { class: 'switch' }, toggle, h('span', {}))),
    h('td', {}, h('div', { class: 'row-actions' },
      h('button', { class: 'link', onclick: () => openProductForm(p) }, 'Editar'),
      h('button', { class: 'link danger', onclick: () => handle(async () => {
        if (!confirm(`Excluir "${p.name}" definitivamente? (Para só esconder, desmarque "Visível")`)) return;
        await db.remove('products', `id=eq.${p.id}`); await deleteImage(p.image); toast('Produto excluído'); loadProducts();
      }) }, 'Excluir'))));
}

const form = $('#productForm');
function syncTypeFields() {
  const lacrado = form.type.value === 'lacrado';
  form.querySelectorAll('[data-only="avulsa"]').forEach((el) => { el.hidden = lacrado; });
}
function preview(url) {
  $('#imagePreview').replaceChildren(url ? h('img', { src: url, alt: 'Pré-visualização' }) : h('span', { class: 'muted small' }, 'Sem imagem'));
}
function openProductForm(p) {
  state.editing = p;
  form.reset();
  $('#productFormTitle').textContent = p ? 'Editar produto' : 'Novo produto';
  if (p) {
    for (const k of ['type', 'name', 'set_name', 'card_number', 'rarity', 'condition', 'language', 'description', 'image', 'stock']) form[k].value = p[k] ?? '';
    form.price.value = centsToInput(p.price_cents);
    form.active.checked = !!p.active; form.featured.checked = !!p.featured;
  }
  syncTypeFields(); preview(form.image.value);
  $('#productDialog').showModal();
  form.name.focus();
}
form.type.addEventListener('change', syncTypeFields);
form.image.addEventListener('input', () => preview(form.image.value.startsWith('https://') ? form.image.value : ''));
$('#imageFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  handle(async () => {
    $('#saveProduct').disabled = true;
    try {
      const url = await uploadImage(file);
      form.image.value = url; preview(url); toast('Imagem enviada');
    } finally { $('#saveProduct').disabled = false; e.target.value = ''; }
  });
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const price_cents = parseBRL(form.price.value);
  if (price_cents == null) return toast('Preço inválido', 'err');
  const lacrado = form.type.value === 'lacrado';
  const body = {
    type: form.type.value, name: form.name.value, set_name: form.set_name.value,
    card_number: lacrado ? '' : form.card_number.value, rarity: lacrado ? '' : form.rarity.value,
    condition: lacrado ? '' : form.condition.value, language: form.language.value,
    description: form.description.value, image: form.image.value.trim(),
    price_cents, stock: Number(form.stock.value), active: form.active.checked, featured: form.featured.checked,
  };
  handle(async () => {
    const p = state.editing;
    if (p) {
      await db.update('products', `id=eq.${p.id}`, body);
      if (p.image && p.image !== body.image) await deleteImage(p.image);
    } else await db.insert('products', body);
    $('#productDialog').close();
    toast(p ? 'Produto atualizado' : 'Produto cadastrado');
    loadProducts(); loadStats();
  });
});
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

// ---------- Sugestões
const SUGG = { nova: 'Nova', vista: 'Vista', atendida: 'Atendida', arquivada: 'Arquivada' };
async function loadSuggestions() {
  await handle(async () => {
    const list = await db.select('suggestions', 'select=*&order=created_at.desc');
    $('#suggestions').replaceChildren(...(list.length ? list.map((s) => {
      const sel = h('select', { 'aria-label': 'Status', onchange: (e) => handle(async () => {
        await db.update('suggestions', `id=eq.${s.id}`, { status: e.target.value }); toast('Status atualizado'); loadStats();
        card.className = `card suggestion sg-${e.target.value}`;
      }) }, Object.entries(SUGG).map(([v, l]) => h('option', { value: v, selected: v === s.status }, l)));
      const card = h('article', { class: `card suggestion sg-${s.status}` },
        h('div', { class: 'order-top' }, h('strong', {}, s.product), sel),
        s.details ? h('p', {}, s.details) : null,
        h('p', { class: 'muted small' }, `${s.name}${s.contact ? ` · ${s.contact}` : ''} · ${formatDate(s.created_at)}`),
        h('div', { class: 'order-actions' },
          /\d{10,}/.test(s.contact.replace(/\D/g, '')) && !s.contact.includes('@') ? h('a', { class: 'link', href: waLink(s.contact), target: '_blank', rel: 'noopener' }, 'WhatsApp') : null,
          h('span', { class: 'spacer' }),
          h('button', { class: 'link danger', onclick: () => handle(async () => {
            if (!confirm('Excluir esta sugestão?')) return;
            await db.remove('suggestions', `id=eq.${s.id}`); card.remove(); loadStats();
          }) }, 'Excluir')));
      return card;
    }) : [h('p', { class: 'empty' }, 'Nenhuma sugestão recebida ainda.')]));
  });
}

// ---------- Aparência
const COLOR_LABELS = {
  primary: 'Principal (cabeçalho)', secondary: 'Secundária (degradê)', accent: 'Destaque (faixa, carrinho)',
  button: 'Botões', bg: 'Fundo da página', card: 'Cartões', text: 'Texto',
};
const theme = { saved: null, draft: null };
const tf = $('#themeForm');
const clone = (o) => JSON.parse(JSON.stringify(o));
const HEXRE = /^#[0-9a-f]{6}$/i;

// monta as partes fixas do formulário
$('#presets').replaceChildren(...Object.entries(PRESETS).map(([name, colors]) =>
  h('button', { type: 'button', class: 'preset', title: `Aplicar tema ${name}`, onclick: () => { theme.draft.colors = { ...colors }; fillTheme(); changed(); } },
    h('span', { class: 'swatches' }, ['primary', 'secondary', 'accent', 'button', 'bg'].map((k) => {
      const i = h('i'); i.style.background = colors[k]; return i;
    })),
    name)));
$('#colorFields').replaceChildren(...Object.entries(COLOR_LABELS).map(([k, label]) => {
  const picker = h('input', { type: 'color', 'aria-label': label });
  const hex = h('input', { type: 'text', maxlength: 7, spellcheck: false, 'aria-label': `${label} (código)` });
  picker.addEventListener('input', () => { hex.value = picker.value; theme.draft.colors[k] = picker.value; changed(); });
  hex.addEventListener('input', () => {
    const v = hex.value.trim().startsWith('#') ? hex.value.trim() : `#${hex.value.trim()}`;
    if (HEXRE.test(v)) { picker.value = v.toLowerCase(); theme.draft.colors[k] = v.toLowerCase(); changed(); }
  });
  picker.id = `color-${k}`; hex.id = `hex-${k}`;
  return h('label', { class: 'color-field' }, picker, h('span', {}, label), hex);
}));
$('#fontSelect').replaceChildren(...Object.entries(FONTS).map(([k, f]) => {
  const o = h('option', { value: k }, f.label); o.style.fontFamily = f.stack; return o;
}));

function imgPreview(box, url, empty) {
  box.replaceChildren(url ? h('img', { src: url, alt: '' }) : h('span', { class: 'small muted' }, empty));
}
function fillTheme() {
  const d = theme.draft;
  tf.storeName.value = d.storeName; tf.showName.checked = d.showName;
  for (const k of Object.keys(COLOR_LABELS)) { $(`#color-${k}`).value = d.colors[k]; $(`#hex-${k}`).value = d.colors[k]; }
  tf.font.value = d.font; tf.radius.value = d.radius; $('#radiusVal').textContent = `${d.radius}px`;
  for (const k of Object.keys(DEFAULTS.texts)) tf[`t_${k}`].value = d.texts[k];
  imgPreview($('#logoPreview'), d.logo, 'sem logo');
  imgPreview($('#heroPreview'), d.heroImage, 'cartas');
  $('#logoRemove').hidden = !d.logo; $('#heroRemove').hidden = !d.heroImage;
}
function readTheme() {
  const d = theme.draft;
  d.storeName = tf.storeName.value; d.showName = tf.showName.checked;
  d.font = tf.font.value; d.radius = Number(tf.radius.value); $('#radiusVal').textContent = `${d.radius}px`;
  for (const k of Object.keys(DEFAULTS.texts)) d.texts[k] = tf[`t_${k}`].value;
}
const isDirty = () => JSON.stringify(normalize(theme.draft)) !== JSON.stringify(theme.saved);
function changed() {
  sendPreview();
  const btn = $('#themeSave');
  btn.replaceChildren(...(isDirty() ? [h('span', { class: 'dirty-dot' }), 'Salvar aparência'] : ['Salvo ✓']));
  btn.disabled = !isDirty();
}
function sendPreview() {
  const f = $('#previewFrame');
  if (theme.draft && f.contentWindow) f.contentWindow.postMessage({ type: 'theme-preview', settings: theme.draft }, location.origin);
}
window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data?.type === 'preview-ready') sendPreview(); });
tf.addEventListener('input', (e) => { if (e.target.type === 'color' || e.target.closest('.color-field') || e.target.type === 'file') return; readTheme(); changed(); });

async function loadAppearance() {
  $('#appearanceError').replaceChildren();
  try {
    const rows = await db.select('site_settings', 'select=data&id=eq.1');
    if (!rows?.length) throw new Error('missing');
    theme.saved = normalize(rows[0].data);
  } catch (e) {
    if (e.status === 401) { showLogin(); return; }
    $('#appearance').hidden = true;
    $('#appearanceError').replaceChildren(h('div', { class: 'card notice' },
      h('strong', {}, 'Falta um passo no Supabase. '),
      'Abra Supabase → SQL Editor, escolha o papel "postgres", cole o conteúdo do arquivo atualizacao-aparencia.sql (está no seu repositório) e clique em Run. Depois volte nesta aba.'));
    return;
  }
  $('#appearance').hidden = false;
  if (!theme.draft || !isDirty()) theme.draft = clone(theme.saved);
  fillTheme(); changed();
  const f = $('#previewFrame');
  if (!f.src) f.src = 'index.html?previa=1';
}

async function uploadTo(field, input) {
  const file = input.files[0];
  if (!file) return;
  await handle(async () => {
    try { theme.draft[field] = await uploadImage(file, { maxSide: field === 'logo' ? 600 : 1600 }); fillTheme(); changed(); toast('Imagem enviada — clique em Salvar para publicar'); }
    finally { input.value = ''; }
  });
}
$('#logoFile').addEventListener('change', (e) => uploadTo('logo', e.target));
$('#heroFile').addEventListener('change', (e) => uploadTo('heroImage', e.target));
$('#logoRemove').addEventListener('click', () => { theme.draft.logo = ''; fillTheme(); changed(); });
$('#heroRemove').addEventListener('click', () => { theme.draft.heroImage = ''; fillTheme(); changed(); });
$('#themeDiscard').addEventListener('click', () => { theme.draft = clone(theme.saved); fillTheme(); changed(); });
$('#themeReset').addEventListener('click', () => {
  if (!confirm('Voltar cores, fontes, textos e imagens para o padrão? (só vale depois de salvar)')) return;
  theme.draft = normalize({}); fillTheme(); changed();
});
tf.addEventListener('submit', (e) => {
  e.preventDefault();
  handle(async () => {
    $('#themeSave').disabled = true;
    theme.saved = await saveTheme(theme.draft);
    theme.draft = clone(theme.saved);
    applyTheme(theme.saved);
    changed();
    toast('Aparência publicada na loja!');
  });
});
document.querySelectorAll('[data-device]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-device]').forEach((x) => x.classList.toggle('active', x === b));
  $('#previewFrame').classList.toggle('mobile', b.dataset.device === 'mobile');
}));

loadTheme();
boot();
