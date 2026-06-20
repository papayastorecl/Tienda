
/* ─────────────────────────────────────────
   Papaya Store Premium — app.js
───────────────────────────────────────── */

let productos    = [];
let carrito      = [];
let moneda       = 'usd';
let nombreCliente = '';
const WA_NUM     = '56947326885';

// Badges asignados por posición
// Badges por defecto (se sobreescriben con promociones.json)
const BADGES_DEFAULT = [
  { cls: 'badge-bestseller', label: 'BEST SELLER' },
  { cls: 'badge-nuevo',      label: 'NUEVO'       },
  { cls: 'badge-bestseller', label: 'ORIGINAL'    },
  { cls: 'badge-nuevo',      label: 'EXCLUSIVO'   },
  { cls: 'badge-bestseller', label: 'TOP VENTAS'  },
  { cls: 'badge-nuevo',      label: 'PREMIUM'     },
  { cls: 'badge-bestseller', label: 'FAVORITO'    },
  { cls: 'badge-nuevo',      label: 'TENDENCIA'   },
];
function getBadgeList() { return BADGES_CONFIG || BADGES_DEFAULT; }

/* ── CARGA INICIAL ── */
async function iniciarTienda() {

  await cargarConfiguracion();

  await cargarPromociones();

  const response =
    await fetch('productos_tienda_es.json');

  const data =
    await response.json();

  data.forEach(p => {

    p.precio_usd = getPrecioUSD(p);

    p.precio_clp =
      Math.round(
        p.precio_usd *
        CONFIG.usd_clp
      );

    p.precio_ars =
      Math.round(
        p.precio_usd *
        CONFIG.usd_ars
      );

  });

  productos = data;

  render(productos);

  renderBrands(productos);

}

iniciarTienda();

/* ── RENDER PRODUCTOS ── */
function render(lista) {
  const grid = document.getElementById('productos');
  if (!grid) return;

  if (lista.length === 0) {
    grid.innerHTML = '<p style="padding:40px;color:#888;grid-column:1/-1;text-align:center">No se encontraron productos.</p>';
    return;
  }

  grid.innerHTML = lista.map((p, i) => {
    const lista   = getBadgeList();
    const badge   = lista[i % lista.length];
    const precio  = formatPrecio(p);
    const idxReal = productos.indexOf(p);
    return `
    <div class="product-card">
      <div class="card-img-wrap">
        <img src="${p.imagen}" alt="${p.nombre}" loading="lazy">
        <span class="card-badge ${badge.cls}">${badge.label}</span>
        <button class="card-wishlist" onclick="toggleWish(this)" title="Guardar">♡</button>
      </div>
      <div class="card-body">
        <div class="card-name">${p.nombre}</div>
        <div class="card-price">
          <span class="price-main">${precio}</span>
        </div>
        <div class="card-actions">
          <button class="btn-add-cart" onclick="agregarCarrito(${idxReal})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61H19a2 2 0 001.97-1.69l1.54-8.31H6"/></svg>
            Agregar
          </button>
          <button class="btn-detail" onclick="verDetalle(${idxReal})" title="Ver detalle">👁</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ── RENDER MARCAS ── */
function renderBrands(lista) {
  // Extrae la primera palabra del nombre como "marca"
  const marcasSet = new Set();
  lista.forEach(p => {
    const primera = p.nombre.split(' ')[0];
    if (primera && primera.length > 1) marcasSet.add(primera);
  });
  const marcas = [...marcasSet].slice(0, 12);

  document.getElementById('brandsGrid').innerHTML = marcas
    .map(m => `<div class="brand-item" onclick="filtrarMarca('${m}')">${m}</div>`)
    .join('');
}

function filtrarMarca(marca) {
  render(productos.filter(p => p.nombre.toLowerCase().includes(marca.toLowerCase())));
  document.getElementById('productos').scrollIntoView({ behavior: 'smooth' });
}
let MARKUP_PCT = 35;
let BADGES_CONFIG = null;

let CONFIG = {
  sunscreen_pct: 25,
  serum_pct: 18,
  toner_pct: 18,
  cream_pct: 20,
  premium_pct: 25,
  usd_clp: 950,
  usd_ars: 1350
};

async function cargarConfiguracion() {

  const { data, error } =
  await supabaseClient
    .from('configuracion')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  CONFIG = data;

  console.log("CONFIG SUPABASE", CONFIG);
}

function getPrecioUSD(p) {

  const base =
    p.precio_usd_base ||
    p.precio_usd ||
    0;

  let margen =
    CONFIG.premium_pct;

  switch ((p.categoria || '').toLowerCase()) {

    case 'sunscreen':
      margen = CONFIG.sunscreen_pct;
      break;

    case 'serum':
      margen = CONFIG.serum_pct;
      break;

    case 'toner':
      margen = CONFIG.toner_pct;
      break;

    case 'cream':
      margen = CONFIG.cream_pct;
      break;
  }

  return Number(
    (base * (1 + margen / 100))
      .toFixed(2)
  );
}

/* ── CARGA PROMOCIONES ── */
function cargarPromociones() {
  return fetch('promociones.json')
    .then(r => r.json())
    .then(promo => {

      // 1. Markup de precio
      if (typeof promo.precio_markup_pct === 'number') {
        MARKUP_PCT = promo.precio_markup_pct;
      }

      // 2. Barra de anuncios
      if (promo.barra_anuncios && promo.barra_anuncios.length) {
        const bar = document.querySelector('.announce-items');
        if (bar) bar.innerHTML = promo.barra_anuncios
          .map(txt => `<span>${txt}</span>`).join('');
      }

      // 3. Badges de productos
      if (promo.badges_productos && promo.badges_productos.length) {
        BADGES_CONFIG = promo.badges_productos.map(b => ({
          cls: b.tipo === 'descuento' ? 'badge-discount'
             : b.tipo === 'bestseller' ? 'badge-bestseller'
             : 'badge-nuevo',
          label: b.texto
        }));
      }

      // 4. Promo del carrito
      const p = promo.promo_carrito;
      const box = document.querySelector('.promo-box');
      if (box && p) {
        if (p.activa && p.codigo) {
          box.innerHTML = `
            <div class="promo-tag">${p.titulo}</div>
            <p><strong>${p.porcentaje}% OFF</strong><br>${p.descripcion}</p>
            <div class="promo-code">${p.codigo}</div>`;
        } else {
          box.innerHTML = `
            <div class="promo-tag">${p.titulo}</div>
            <p><strong>${p.descripcion}</strong><br>${p.subtitulo}</p>`;
        }
      }
    })
    .catch(() => console.log('promociones.json no disponible, usando valores por defecto'));
}

/* ── FORMATO PRECIO ── */
function formatPrecio(p) {
  if (moneda === 'usd') return `USD $${(p.precio_usd || 0).toFixed(2)}`;
  if (moneda === 'ars') return `ARS $${(p.precio_ars || 0).toLocaleString('es-AR')}`;
  return `$${(p.precio_clp || 0).toLocaleString('es-CL')} CLP`;
}

function valorMoneda(p) {
  if (moneda === 'usd') return p.precio_usd || 0;
  if (moneda === 'ars') return p.precio_ars || 0;
  return p.precio_clp || 0;
}

/* ── WISHLIST (solo visual) ── */
function toggleWish(btn) {
  btn.classList.toggle('liked');
  btn.textContent = btn.classList.contains('liked') ? '♥' : '♡';
}

/* ── CARRITO ── */
function agregarCarrito(idx) {
  const p = productos[idx];
  const exist = carrito.find(x => x.idx === idx);
  if (exist) {
    exist.qty++;
  } else {
    carrito.push({ idx, qty: 1, nombre: p.nombre, imagen: p.imagen,
      precio_clp: p.precio_clp, precio_usd: p.precio_usd, precio_ars: p.precio_ars });
  }
  updateCartUI();
  // Abrir carrito si estaba cerrado
  if (!document.getElementById('cartSidebar').classList.contains('open')) {
    toggleCart();
  }
}

function cambiarQty(ci, delta) {
  carrito[ci].qty = Math.max(1, carrito[ci].qty + delta);
  updateCartUI();
}

function eliminarItem(ci) {
  carrito.splice(ci, 1);
  updateCartUI();
}

function updateCartUI() {
  const total = carrito.reduce((s, x) => s + valorMoneda(x) * x.qty, 0);
  const count = carrito.reduce((s, x) => s + x.qty, 0);

  // Header badge
  document.getElementById('cartBadge').textContent = count;

  // Header total
  const totalStr = moneda === 'usd'
    ? `$${total.toFixed(2)}`
    : `$${total.toLocaleString('es-CL')}`;
  document.getElementById('cartHeaderTotal').textContent = totalStr;

  // Sidebar counts
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartCountFooter').textContent = count;

  // Sidebar total
  const totalFullStr = moneda === 'usd'
    ? `USD $${total.toFixed(2)}`
    : moneda === 'ars'
      ? `ARS $${total.toLocaleString('es-AR')}`
      : `$${total.toLocaleString('es-CL')} CLP`;
  document.getElementById('cartTotalFooter').textContent = totalFullStr;

  // Items
  const itemsEl = document.getElementById('cartItems');
  if (carrito.length === 0) {
    itemsEl.innerHTML = `<div class="cart-empty"><div class="empty-icon">🛒</div><p>Tu carrito está vacío</p></div>`;
    return;
  }

  itemsEl.innerHTML = carrito.map((item, ci) => {
    const itemPrecio = moneda === 'usd'
      ? `USD $${(item.precio_usd || 0).toFixed(2)}`
      : moneda === 'ars'
        ? `ARS $${(item.precio_ars || 0).toLocaleString('es-AR')}`
        : `$${(item.precio_clp || 0).toLocaleString('es-CL')} CLP`;
    return `
    <div class="cart-item">
      <img src="${item.imagen}" alt="${item.nombre}">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.nombre}</div>
        <div class="cart-item-price">${itemPrecio}</div>
        <div class="cart-item-controls">
          <button onclick="cambiarQty(${ci},-1)">−</button>
          <span>${item.qty}</span>
          <button onclick="cambiarQty(${ci},1)">+</button>
        </div>
      </div>
      <button class="cart-item-remove" onclick="eliminarItem(${ci})" title="Eliminar">✕</button>
    </div>`;
  }).join('');
}

/* ── TOGGLE CARRITO ── */
function toggleCart() {
  document.getElementById('cartSidebar').classList.toggle('open');
  document.getElementById('cartOverlay').classList.toggle('open');
}

/* ── CAMBIAR MONEDA ── */
function cambiarMoneda(val) {
  moneda = val;
  render(productos);
  updateCartUI();
}

/* ── FILTRAR ── */
function filtrar(cat) {
  if (cat === 'Todos') render(productos);
  else render(productos.filter(x => x.categoria === cat));
  document.getElementById('productos').scrollIntoView({ behavior: 'smooth' });
}

function navClick(el, cat) {
  event.preventDefault();
  document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));
  el.classList.add('active');
  filtrar(cat);
}

function navTo(cat) {
  filtrar(cat);
}

/* ── DETALLE MODAL ── */
function verDetalle(idx) {
  const p = productos[idx];
  document.getElementById('detalle').innerHTML = `
    <h2>${p.nombre}</h2>
    <img src="${p.imagen}" alt="${p.nombre}">
    ${p.beneficios_es ? `<h3>✨ Beneficios</h3><p>${p.beneficios_es.replace(/\n/g, '<br>')}</p>` : ''}
    ${p.modo_uso_es   ? `<h3>📋 Modo de uso</h3><p>${p.modo_uso_es.replace(/\n/g, '<br>')}</p>` : ''}
    ${p.ingredientes  ? `<h3>🧪 Ingredientes</h3><p style="font-size:12px;line-height:1.6">${p.ingredientes.replace('{#item}','')}</p>` : ''}
    <div style="margin-top:22px">
      <button onclick="agregarCarrito(${idx});cerrarModal()"
        style="width:100%;background:var(--coral);color:#fff;border:none;padding:13px;
               border-radius:12px;font-family:Poppins,sans-serif;font-size:14px;
               font-weight:600;cursor:pointer;letter-spacing:.3px">
        🛒 Agregar al carrito
      </button>
    </div>
  `;
  document.getElementById('modal').style.display = 'block';
}

function cerrarModal() {
  document.getElementById('modal').style.display = 'none';
}

/* ── FINALIZAR POR WHATSAPP ── */
function finalizarWhatsapp() {
  if (carrito.length === 0) {
    alert('Tu carrito está vacío 🛒');
    return;
  }
  const nombre = nombreCliente || 'Cliente';
  let msg = `🌸 *Pedido — Papaya Store*\n👤 *Cliente: ${nombre}*\n\n`;
  carrito.forEach(item => {
    const subtotal = (item.precio_clp || 0) * item.qty;
    msg += `• ${item.nombre}\n  Cantidad: ${item.qty}  →  $${subtotal.toLocaleString('es-CL')} CLP\n\n`;
  });
  const total = carrito.reduce((s, x) => s + (x.precio_clp || 0) * x.qty, 0);
  msg += `📦 *Total: $${total.toLocaleString('es-CL')} CLP*\n\n¡Hola! Soy ${nombre} y quisiera hacer este pedido 😊`;
  window.open(`https://wa.me/${WA_NUM}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ── POPUP NOMBRE ── */
function guardarNombre() {
  const val = document.getElementById('nameInput').value.trim();
  if (!val) {
    document.getElementById('nameInput').focus();
    document.getElementById('nameInput').style.borderColor = 'var(--coral)';
    return;
  }
  nombreCliente = val;
  document.getElementById('nameOverlay').classList.add('hidden');
}

/* ── EVENTOS DOM ── */
document.addEventListener('DOMContentLoaded', () => {
  // Mostrar popup al cargar
  setTimeout(() => {
    document.getElementById('nameInput').focus();
  }, 300);

  // Enter en el input confirma
  document.getElementById('nameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') guardarNombre();
  });
  // Búsqueda en tiempo real
  document.getElementById('searchInput').addEventListener('input', e => {
    const t = e.target.value.toLowerCase().trim();
    if (t) {
      render(productos.filter(p =>
        p.nombre.toLowerCase().includes(t) ||
        p.categoria.toLowerCase().includes(t)
      ));
    } else {
      render(productos);
    }
  });

  // Cerrar modal al click fuera
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) cerrarModal();
  });

  // Tecla Escape cierra modal y carrito
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      cerrarModal();
      if (document.getElementById('cartSidebar').classList.contains('open')) toggleCart();
    }
  });

  updateCartUI();
});
