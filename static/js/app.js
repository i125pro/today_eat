const $ = (id) => document.getElementById(id);
const state = {
  dishes: [], idx: 0, spinning: false, pendingDish: null,
  uploadFile: null, mealOverride: null, leftovers: [], leftoverOpen: false,
  openDays: new Set(), dayCache: {},
};

const MEALS = {
  breakfast: { label: '早饭', icon: '🥣' },
  lunch: { label: '午饭', icon: '🍱' },
  dinner: { label: '晚饭', icon: '🍜' },
};
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner'];
const GRADS = ['g0', 'g1', 'g2', 'g3'];

const stage = $('stage');
const toastEl = $('toast');
let toastTimer = null;

function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mealNow() {
  const m = new Date().getHours() * 60 + new Date().getMinutes();
  if (m >= 300 && m < 630) return 'breakfast';
  if (m >= 630 && m < 990) return 'lunch';
  return 'dinner';
}

function currentMeal() {
  return state.mealOverride || mealNow();
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

/* ---------------- 视图切换 ---------------- */
const viewTitles = { pick: '今天吃什么', menu: '我的菜库', history: '吃饭记录' };
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    $('pageTitle').textContent = viewTitles[view];
    if (view === 'history') loadHistory();
  });
});

/* ---------------- 卡片槽位系统（持久 DOM 平移轮播） ---------------- */
const CHAIN_IDX = { l2: 0, l1: 1, c0: 2, r1: 3, r2: 4 };
const SLOT_T = {
  l2: 'translateX(-200px) translateY(-20px) rotate(0deg) scale(0.78)',
  l1: 'translateX(-110px) translateY(-10px) rotate(0deg) scale(0.88)',
  c0: 'translateX(0px) translateY(0px) rotate(0deg) scale(1)',
  r1: 'translateX(110px) translateY(-10px) rotate(0deg) scale(0.88)',
  r2: 'translateX(200px) translateY(-20px) rotate(0deg) scale(0.78)',
};
const SLOT_O = { l2: 0.4, l1: 0.8, c0: 1, r1: 0.8, r2: 0.4 };
const DEEP_T = {
  left: 'translateX(-290px) translateY(-26px) rotate(0deg) scale(0.7)',
  right: 'translateX(290px) translateY(-26px) rotate(0deg) scale(0.7)',
};
const DEEP_O = 0;

const cardEls = new Map();

function currentDish() {
  return state.dishes[state.idx];
}

function windowOf(idx, total) {
  const spread = total >= 5 ? 2 : total >= 3 ? 1 : (total === 2 ? 1 : 0);
  const defs = [['c0', 0]];
  for (let k = 1; k <= spread; k++) {
    defs.push([`r${k}`, k], [`l${k}`, -k]);
  }
  const used = new Set();
  const out = [];
  defs.forEach(([slot, off]) => {
    const p = (((idx + off) % total) + total) % total;
    if (used.has(p)) return;
    used.add(p);
    out.push({ pos: p, slot });
  });
  return out;
}

function buildCard(dish, pos) {
  const card = document.createElement('div');
  card.className = 'card';
  if (dish.image) {
    const img = document.createElement('img');
    img.className = 'card-img';
    img.src = dish.image;
    img.alt = dish.name;
    card.appendChild(img);
  } else {
    const emo = document.createElement('div');
    emo.className = `card-emoji ${GRADS[pos % GRADS.length]}`;
    emo.textContent = dish.emoji;
    card.appendChild(emo);
  }
  const label = document.createElement('div');
  label.className = 'card-label';
  label.textContent = dish.name;
  card.appendChild(label);
  card.addEventListener('pointerdown', onCardDown);
  return card;
}

function rebuildStage() {
  stage.innerHTML = '';
  cardEls.clear();
  syncStage(null);
}

function syncStage(dir) {
  const total = state.dishes.length;
  if (!total) {
    stage.innerHTML = '<div class="card"><div class="card-emoji g1">🍽️</div><div class="card-label">菜库是空的，去「菜库」添加吧</div></div>';
    $('dishName').textContent = '暂无菜品';
    $('dishCount').textContent = '';
    $('eatBtn').disabled = true;
    $('spinBtn').disabled = true;
    return;
  }
  $('eatBtn').disabled = state.spinning;
  $('spinBtn').disabled = state.spinning;
  const win = windowOf(state.idx, total);
  const target = new Map(win.map((w) => [w.pos, w.slot]));

  cardEls.forEach((el, pos) => {
    if (target.has(pos)) return;
    cardEls.delete(pos);
    el.style.zIndex = 5;
    el.style.transform = DEEP_T[dir === 'next' ? 'left' : 'right'];
    el.style.opacity = DEEP_O;
    el.style.pointerEvents = 'none';
    setTimeout(() => el.remove(), 450);
  });

  win.forEach(({ pos, slot }) => {
    let el = cardEls.get(pos);
    if (!el) {
      el = buildCard(state.dishes[pos], pos);
      el.classList.add('no-trans');
      el.style.transform = dir ? DEEP_T[dir === 'next' ? 'right' : 'left'] : SLOT_T[slot];
      el.style.opacity = dir ? DEEP_O : SLOT_O[slot];
      stage.appendChild(el);
      cardEls.set(pos, el);
      void el.offsetWidth;
      el.classList.remove('no-trans');
    }
    el.style.pointerEvents = '';
    el.dataset.slot = slot;
    el.style.zIndex = 10 - Math.abs(CHAIN_IDX[slot] - 2);
  });

  requestAnimationFrame(() => requestAnimationFrame(() => {
    target.forEach((slot, pos) => {
      const el = cardEls.get(pos);
      if (!el) return;
      el.style.transform = SLOT_T[slot];
      el.style.opacity = SLOT_O[slot];
    });
  }));

  const dish = currentDish();
  $('dishName').textContent = dish.name;
  $('dishCount').textContent = `${state.idx + 1} / ${total} 道`;
}

function goNext() {
  if (state.spinning || state.dishes.length < 2) return;
  state.idx = (state.idx + 1) % state.dishes.length;
  syncStage('next');
}

function goPrev() {
  if (state.spinning || state.dishes.length < 2) return;
  state.idx = (state.idx - 1 + state.dishes.length) % state.dishes.length;
  syncStage('prev');
}

let drag = null;

function onCardDown(e) {
  if (state.spinning || drag) return;
  if (e.currentTarget.dataset.slot !== 'c0') return;
  drag = { el: e.currentTarget, startX: e.clientX ?? 0, dx: 0 };
  drag.el.classList.add('dragging');
}

window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.dx = (e.clientX ?? 0) - drag.startX;
  drag.el.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx / 24}deg)`;
  drag.el.classList.toggle('show-left', drag.dx < -30);
  drag.el.classList.toggle('show-right', drag.dx > 30);
});

window.addEventListener('pointerup', () => {
  if (!drag) return;
  const { el, dx } = drag;
  drag = null;
  el.classList.remove('dragging', 'show-left', 'show-right');
  const total = state.dishes.length;
  const th = Math.min(110, window.innerWidth * 0.26);
  if (total >= 2 && dx < -th) {
    state.idx = (state.idx + 1) % total;
    syncStage('next');
  } else if (total >= 2 && dx > th) {
    state.idx = (state.idx - 1 + total) % total;
    syncStage('prev');
  } else {
    el.style.transform = SLOT_T.c0;
    el.style.opacity = SLOT_O.c0;
  }
});

window.addEventListener('pointercancel', () => {
  if (!drag) return;
  const { el } = drag;
  drag = null;
  el.classList.remove('dragging', 'show-left', 'show-right');
  el.style.transform = SLOT_T.c0;
  el.style.opacity = SLOT_O.c0;
});

$('prevBtn').addEventListener('click', goPrev);
$('nextBtn').addEventListener('click', goNext);

/* ---------------- 一键选菜（老虎机） ---------------- */
$('spinBtn').addEventListener('click', () => {
  if (state.spinning || !state.dishes.length) return;
  state.spinning = true;
  $('eatBtn').disabled = true;
  $('spinBtn').disabled = true;
  const total = state.dishes.length;
  const steps = 16 + Math.floor(Math.random() * 6);
  const spin = (remaining, delay) => {
    if (remaining <= 0) {
      state.spinning = false;
      syncStage(null);
      openResult(currentDish());
      return;
    }
    setTimeout(() => {
      state.idx = (state.idx + 1) % total;
      spinStep();
      spin(remaining - 1, delay + 24);
    }, delay);
  };
  spin(steps, 60);
});

function spinStep() {
  const total = state.dishes.length;
  const win = windowOf(state.idx, total);
  const target = new Map(win.map((w) => [w.pos, w.slot]));
  cardEls.forEach((el, pos) => {
    if (!target.has(pos)) {
      cardEls.delete(pos);
      el.remove();
      return;
    }
    el.classList.add('no-trans');
    el.dataset.slot = target.get(pos);
    el.style.zIndex = 10 - Math.abs(CHAIN_IDX[target.get(pos)] - 2);
    el.style.transform = SLOT_T[target.get(pos)];
    el.style.opacity = SLOT_O[target.get(pos)];
  });
  win.forEach(({ pos, slot }) => {
    if (cardEls.has(pos)) return;
    const el = buildCard(state.dishes[pos], pos);
    el.classList.add('no-trans');
    el.dataset.slot = slot;
    el.style.zIndex = 10 - Math.abs(CHAIN_IDX[slot] - 2);
    el.style.transform = SLOT_T[slot];
    el.style.opacity = SLOT_O[slot];
    stage.appendChild(el);
    cardEls.set(pos, el);
  });
  requestAnimationFrame(() => {
    cardEls.forEach((el) => el.classList.remove('no-trans'));
  });
  const dish = currentDish();
  $('dishName').textContent = dish.name;
  $('dishCount').textContent = `${state.idx + 1} / ${total} 道`;
}

/* ---------------- 餐段胶囊 ---------------- */
function renderMealPill() {
  const meal = currentMeal();
  const suffix = state.mealOverride ? '' : ' · 现在';
  $('mealPill').textContent = `${MEALS[meal].icon} 记入${MEALS[meal].label}${suffix}`;
}

$('mealPill').addEventListener('click', () => {
  const cur = MEAL_ORDER.indexOf(currentMeal());
  state.mealOverride = MEAL_ORDER[(cur + 1) % 3];
  renderMealPill();
});

/* ---------------- 结果弹窗（左滑渐隐关闭） ---------------- */
function openResult(dish) {
  state.pendingDish = dish;
  $('resultEmoji').textContent = dish.emoji;
  $('resultName').textContent = dish.name;
  $('resultMeal').textContent = `将记入${MEALS[currentMeal()].label}`;
  $('resultModal').classList.remove('closing');
  $('resultModal').classList.add('show');
}

function closeModal(cb) {
  const mask = $('resultModal');
  if (!mask.classList.contains('show')) return;
  mask.classList.add('closing');
  setTimeout(() => {
    mask.classList.remove('show', 'closing');
    if (cb) cb();
  }, 320);
}

$('modalClose').addEventListener('click', () => closeModal());
$('resultModal').addEventListener('click', (e) => {
  if (e.target === $('resultModal')) closeModal();
});

$('reSpinBtn').addEventListener('click', () => {
  closeModal(() => setTimeout(() => $('spinBtn').click(), 200));
});

$('confirmEatBtn').addEventListener('click', async () => {
  if (!state.pendingDish) return;
  try {
    await recordDish(state.pendingDish);
    state.pendingDish = null;
    closeModal();
  } catch (e) {
    toast(e.message);
  }
});

/* ---------------- 记录一道菜 ---------------- */
async function recordDish(dish) {
  await api('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dish_id: dish.id, meal: currentMeal() }),
  });
  const meal = MEALS[currentMeal()];
  toast(`${meal.icon} 已记入${meal.label}：${dish.name}`);
  loadLeftovers();
}

$('eatBtn').addEventListener('click', async () => {
  const dish = currentDish();
  if (!dish) return;
  try {
    await recordDish(dish);
  } catch (e) {
    toast(e.message);
  }
});

/* ---------------- 图片灯箱（同餐左右滑动） ---------------- */
const lb = { list: [], idx: 0 };

function renderLightbox(anim) {
  const r = lb.list[lb.idx];
  if (!r) return;
  if (r.image) {
    $('lightboxImg').src = r.image;
    $('lightboxImg').style.display = '';
    $('lightboxEmoji').style.display = 'none';
  } else {
    $('lightboxEmoji').textContent = r.emoji || '🍽️';
    $('lightboxEmoji').style.display = '';
    $('lightboxImg').style.display = 'none';
  }
  const mealInfo = MEALS[r.meal] || MEALS.dinner;
  $('lightboxName').textContent = r.name;
  $('lightboxMeta').textContent = `${mealInfo.icon} ${mealInfo.label} · 第 ${lb.idx + 1} / ${lb.list.length} 道`;
  const stageEl = $('lbStage');
  stageEl.classList.remove('anim-next', 'anim-prev');
  if (anim) {
    void stageEl.offsetWidth;
    stageEl.classList.add(anim);
  }
}

function openLightbox(list, idx) {
  lb.list = list;
  lb.idx = idx;
  renderLightbox();
  $('lightbox').classList.add('show');
}

function lbNav(step) {
  const n = lb.idx + step;
  if (n < 0) {
    toast('↩️ 到头啦，这是第一道');
    return;
  }
  if (n >= lb.list.length) {
    toast('🍽️ 到底啦，没有更多了');
    return;
  }
  lb.idx = n;
  renderLightbox(step > 0 ? 'anim-next' : 'anim-prev');
}

$('lbPrev').addEventListener('click', () => lbNav(-1));
$('lbNext').addEventListener('click', () => lbNav(1));

(() => {
  const el = $('lightbox');
  let sx = 0, dx = 0, on = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.lb-nav')) return;
    on = true;
    sx = e.clientX ?? 0;
    dx = 0;
  });
  el.addEventListener('pointermove', (e) => {
    if (!on) return;
    dx = (e.clientX ?? 0) - sx;
  });
  el.addEventListener('pointerup', (e) => {
    if (!on) return;
    on = false;
    if (Math.abs(dx) > 45) {
      lbNav(dx < 0 ? 1 : -1);
    } else if (Math.abs(dx) < 8 && e.target === el) {
      el.classList.remove('show');
    }
  });
  el.addEventListener('pointercancel', () => { on = false; });
})();

window.addEventListener('keydown', (e) => {
  if (!$('lightbox').classList.contains('show')) return;
  if (e.key === 'ArrowLeft') lbNav(-1);
  if (e.key === 'ArrowRight') lbNav(1);
  if (e.key === 'Escape') $('lightbox').classList.remove('show');
});

/* ---------------- 剩菜 ---------------- */
function dayLabel(d) {
  if (d === localDate()) return '今天';
  if (d === localDate(new Date(Date.now() - 864e5))) return '昨天';
  return `${parseInt(d.slice(5, 7), 10)}月${parseInt(d.slice(8, 10), 10)}日`;
}

async function loadLeftovers() {
  try {
    state.leftovers = await api('/api/leftovers');
  } catch (e) {
    return;
  }
  renderLeftoverBanner();
}

function renderLeftoverBanner() {
  const wrap = $('leftoverBanner');
  if (!state.leftovers.length) {
    wrap.style.display = 'none';
    wrap.classList.remove('open');
    state.leftoverOpen = false;
    return;
  }
  wrap.style.display = '';
  $('leftoverCount').textContent = state.leftovers.length;
  wrap.classList.toggle('open', state.leftoverOpen);
  const list = $('leftoverList');
  list.innerHTML = '';
  state.leftovers.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML = `
      <div class="lb-thumb">${r.image ? `<img src="${r.image}" alt="">` : r.emoji}</div>
      <div class="lb-info">
        <div class="lb-name">${r.name}</div>
        <div class="lb-src">${dayLabel(r.meal_date)}${MEALS[r.meal] ? MEALS[r.meal].label : ''}剩的</div>
      </div>`;
    const eat = document.createElement('button');
    eat.className = 'lb-eat';
    eat.textContent = '吃掉它';
    eat.addEventListener('click', async () => {
      try {
        await api('/api/leftovers/eat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record_id: r.id, meal: currentMeal() }),
        });
        toast(`🥡 ${r.name} 已记入${MEALS[currentMeal()].label}`);
        await loadLeftovers();
      } catch (e) {
        toast(e.message);
      }
    });
    row.appendChild(eat);
    list.appendChild(row);
  });
}

$('leftoverHead').addEventListener('click', () => {
  state.leftoverOpen = !state.leftoverOpen;
  renderLeftoverBanner();
});

/* ---------------- 菜库 ---------------- */
$('uploadPreview').addEventListener('click', () => $('dishImage').click());
$('dishImage').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.uploadFile = file;
  const url = URL.createObjectURL(file);
  $('uploadPreview').innerHTML = `<img src="${url}" alt="预览">`;
});

let addingDish = false;
$('addDishBtn').addEventListener('click', async () => {
  if (addingDish) return;
  const name = $('dishNameInput').value.trim();
  if (!name) return toast('请先填写菜名');
  const fd = new FormData();
  fd.append('name', name);
  if (state.uploadFile) fd.append('image', state.uploadFile);
  addingDish = true;
  const btn = $('addDishBtn');
  btn.disabled = true;
  btn.textContent = '上传中…';
  try {
    await api('/api/dishes', { method: 'POST', body: fd });
    $('dishNameInput').value = '';
    state.uploadFile = null;
    $('dishImage').value = '';
    $('uploadPreview').innerHTML = '<span>＋</span>';
    toast('已加入菜库 ✅');
    await loadDishes();
  } catch (e) {
    toast(e.message);
  } finally {
    addingDish = false;
    btn.disabled = false;
    btn.textContent = '添加到菜库';
  }
});

async function deleteDish(id, name) {
  if (!confirm(`删除「${name}」？相关记录也会移除`)) return;
  try {
    await api(`/api/dishes/${id}`, { method: 'DELETE' });
    toast('已删除');
    await loadDishes();
    loadLeftovers();
  } catch (e) {
    toast(e.message);
  }
}

function renderGrid() {
  const grid = $('dishGrid');
  if (!state.dishes.length) {
    grid.innerHTML = '<div class="empty-tip">菜库空空如也，先添加几道菜吧</div>';
    return;
  }
  grid.innerHTML = '';
  state.dishes.forEach((dish) => {
    const cell = document.createElement('div');
    cell.className = 'dish-cell';
    cell.innerHTML = dish.image
      ? `<img src="${dish.image}" alt="${dish.name}">`
      : `<div class="cell-emoji">${dish.emoji}</div>`;
    const nameEl = document.createElement('div');
    nameEl.className = 'cell-name';
    nameEl.textContent = dish.name;
    const del = document.createElement('button');
    del.className = 'cell-del';
    del.textContent = '×';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteDish(dish.id, dish.name); });
    cell.appendChild(nameEl);
    cell.appendChild(del);
    cell.addEventListener('click', () => {
      state.idx = state.dishes.findIndex((d) => d.id === dish.id);
      if (state.idx < 0) state.idx = 0;
      rebuildStage();
      document.querySelector('.tab[data-view="pick"]').click();
    });
    grid.appendChild(cell);
  });
}

/* ---------------- 记录条目（竖版列表 + 左滑删除动画） ---------------- */
async function patchRecord(id, body) {
  await api(`/api/records/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function pruneEmptyGroups(container) {
  if (!container) return;
  let title = null;
  let hasItem = false;
  const toRemove = [];
  Array.from(container.children).forEach((c) => {
    if (c.classList.contains('meal-group-title')) {
      if (title && !hasItem) toRemove.push(title);
      title = c;
      hasItem = false;
    } else if (c.classList.contains('record-item')) {
      hasItem = true;
    }
  });
  if (title && !hasItem) toRemove.push(title);
  toRemove.forEach((t) => t.remove());
}

async function removeWithAnim(el, action) {
  try {
    await action();
  } catch (e) {
    toast(e.message);
    return;
  }
  const h = el.offsetHeight;
  el.style.height = `${h}px`;
  el.style.overflow = 'hidden';
  void el.offsetWidth;
  el.style.transition =
    'transform 0.28s ease-in, opacity 0.28s ease-in, height 0.26s ease 0.08s, margin-top 0.26s ease 0.08s, padding 0.26s ease 0.08s';
  el.style.transform = 'translateX(-130%)';
  el.style.opacity = '0';
  el.style.height = '0';
  el.style.marginTop = '-10px';
  el.style.paddingTop = '0';
  el.style.paddingBottom = '0';
  el.style.borderWidth = '0';
  const container = el.parentElement;
  const dayItem = el.closest('.day-item');
  const countEl = dayItem ? dayItem.querySelector('.day-count') : null;
  setTimeout(() => {
    el.remove();
    pruneEmptyGroups(container);
    if (countEl) {
      const m = countEl.textContent.match(/\d+/);
      if (m) {
        countEl.textContent = countEl.textContent.replace(/\d+/, String(Math.max(0, parseInt(m[0], 10) - 1)));
      }
    }
    if (container && container.id === 'todayList' && !container.querySelector('.record-item')) {
      container.innerHTML = '<div class="empty-tip">今天还没决定吃什么哦</div>';
    }
    loadLeftovers();
  }, 380);
}

function recordItem(r, mealList, idx) {
  const item = document.createElement('div');
  item.className = 'record-item';
  const mealInfo = MEALS[r.meal] || MEALS.dinner;
  item.innerHTML = `
    <div class="record-thumb">${r.image ? `<img src="${r.image}" alt="">` : r.emoji}</div>
    <div class="record-info">
      <div class="record-name">${r.name}</div>
      <div class="record-meta">
        <button class="meal-tag">${mealInfo.icon} ${mealInfo.label}</button>
        <span class="record-time">${(r.created_at || '').slice(11)}</span>
      </div>
    </div>`;
  item.querySelector('.record-thumb').addEventListener('click', () => openLightbox(mealList, idx));
  const lo = document.createElement('button');
  lo.className = 'record-leftover-btn' + (r.leftover ? ' on' : '');
  lo.title = r.leftover ? '取消剩菜标记' : '标记为剩菜';
  lo.textContent = '🥡';
  lo.addEventListener('click', async () => {
    try {
      await patchRecord(r.id, { leftover: !r.leftover });
      toast(r.leftover ? '已取消剩菜标记' : '已标记为剩菜 🥡');
      loadHistory();
      loadLeftovers();
    } catch (e) {
      toast(e.message);
    }
  });
  const del = document.createElement('button');
  del.className = 'record-del';
  del.textContent = '×';
  del.addEventListener('click', () => removeWithAnim(item, () =>
    api(`/api/records/${r.id}`, { method: 'DELETE' })));
  item.appendChild(lo);
  item.appendChild(del);
  item.querySelector('.meal-tag').addEventListener('click', async (e) => {
    e.stopPropagation();
    const cur = MEAL_ORDER.indexOf(r.meal || 'dinner');
    try {
      await patchRecord(r.id, { meal: MEAL_ORDER[(cur + 1) % 3] });
      loadHistory();
    } catch (err) {
      toast(err.message);
    }
  });
  return item;
}

function renderGrouped(list, container, emptyText) {
  container.innerHTML = '';
  if (!list.length) {
    container.innerHTML = `<div class="empty-tip">${emptyText}</div>`;
    return;
  }
  MEAL_ORDER.forEach((meal) => {
    const items = list.filter((r) => (r.meal || 'dinner') === meal);
    if (!items.length) return;
    const h = document.createElement('div');
    h.className = 'meal-group-title';
    h.textContent = `${MEALS[meal].icon} ${MEALS[meal].label} · ${items.length} 道菜`;
    container.appendChild(h);
    items.forEach((r, i) => container.appendChild(recordItem(r, items, i)));
  });
}

/* ---------------- 往日记录（日期折叠 + 状态保持） ---------------- */
function formatDay(d) {
  const dt = new Date(`${d}T12:00:00`);
  const week = ['日', '一', '二', '三', '四', '五', '六'];
  const yest = localDate(new Date(Date.now() - 864e5));
  const before = localDate(new Date(Date.now() - 2 * 864e5));
  let badge = '';
  if (d === yest) badge = '昨天';
  else if (d === before) badge = '前天';
  return { text: `${dt.getMonth() + 1}月${dt.getDate()}日 · 周${week[dt.getDay()]}`, badge };
}

function renderDayBody(body, list) {
  body.innerHTML = '';
  MEAL_ORDER.forEach((meal) => {
    const items = list.filter((r) => (r.meal || 'dinner') === meal);
    if (!items.length) return;
    const h = document.createElement('div');
    h.className = 'meal-group-title';
    h.textContent = `${MEALS[meal].icon} ${MEALS[meal].label} · ${items.length} 道菜`;
    body.appendChild(h);
    items.forEach((r, i) => body.appendChild(recordItem(r, items, i)));
  });
}

function renderAccordion(days) {
  const wrap = $('dayAccordion');
  wrap.innerHTML = '';
  if (!days.length) {
    wrap.innerHTML = '<div class="empty-tip">还没有往日记录</div>';
    return;
  }
  days.forEach((d) => {
    const item = document.createElement('div');
    item.className = 'day-item glass';
    const head = document.createElement('button');
    head.className = 'day-head';
    const f = formatDay(d.date);
    const thumbs = d.thumbs.map((t) =>
      t.image ? `<img src="${t.image}" alt="">` : `<span class="day-thumb-emoji">${t.emoji}</span>`
    ).join('');
    head.innerHTML = `
      <div class="day-info">
        <div class="day-date">${f.text}${f.badge ? `<span class="day-badge">${f.badge}</span>` : ''}</div>
        <div class="day-count">共 ${d.count} 道菜</div>
      </div>
      <div class="day-thumbs">${thumbs}</div>
      <span class="day-arrow">⌄</span>`;
    const body = document.createElement('div');
    body.className = 'day-body';
    const isOpen = state.openDays.has(d.date);
    if (isOpen) {
      item.classList.add('open');
      renderDayBody(body, state.dayCache[d.date] || []);
      body.dataset.loaded = '1';
    }
    head.addEventListener('click', async () => {
      const willOpen = !item.classList.contains('open');
      item.classList.toggle('open', willOpen);
      if (willOpen) state.openDays.add(d.date);
      else state.openDays.delete(d.date);
      if (willOpen && !body.dataset.loaded) {
        try {
          const list = await api(`/api/records?date=${d.date}`);
          state.dayCache[d.date] = list;
          renderDayBody(body, list);
          body.dataset.loaded = '1';
        } catch (e) {
          toast(e.message);
        }
      }
    });
    item.appendChild(head);
    item.appendChild(body);
    wrap.appendChild(item);
  });
}

async function loadHistory() {
  const today = localDate();
  try {
    const todayList = await api(`/api/records?date=${today}`);
    renderGrouped(todayList, $('todayList'), '今天还没决定吃什么哦');
    const days = await api('/api/records/days');
    for (const d of Array.from(state.openDays)) {
      try {
        state.dayCache[d] = await api(`/api/records?date=${d}`);
      } catch (e) { /* 忽略单日刷新失败 */ }
    }
    renderAccordion(days);
  } catch (e) {
    toast(e.message);
  }
}

/* ---------------- 初始化 ---------------- */
async function loadDishes() {
  try {
    state.dishes = await api('/api/dishes');
    if (state.idx >= state.dishes.length) state.idx = 0;
    rebuildStage();
    renderGrid();
  } catch (e) {
    toast(e.message);
  }
}

function initDate() {
  const now = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'];
  const meal = MEALS[mealNow()];
  $('todayDate').textContent =
    `${now.getMonth() + 1}月${now.getDate()}日 · 星期${week[now.getDay()]} · ${meal.icon} ${meal.label}时间`;
}

async function init() {
  initDate();
  renderMealPill();
  await loadDishes();
  await loadLeftovers();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/sw.js').catch(() => {});
  }
}
init();
