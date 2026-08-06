/* AliveProject — unified effect UI / Stage 3 */
(function (window) {
  'use strict';
  const UI = {
    overlay: null,
    init() {
      this.overlay = document.getElementById('aliveEffectModal');
      if (!this.overlay) return;
      this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(false); });
    },
    escape(v) { return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s])); },
    close(value = false) {
      if (!this.overlay) return;
      this.overlay.classList.remove('alive-effect-open');
      const resolve = this.overlay._resolve;
      this.overlay._resolve = null;
      if (resolve) resolve(value);
    },
    confirm(card, targets) {
      return new Promise(resolve => {
        this.overlay._resolve = resolve;
        this.overlay.innerHTML = `<div class="alive-effect-box"><div class="alive-effect-kicker">СПЕЦУСЛОВИЕ</div><button class="alive-effect-close" type="button" data-close>×</button><h2>Использовать карту?</h2><p class="alive-effect-text">${this.escape(card.text)}</p>${targets.length ? `<div class="alive-effect-targets"><span>Цель:</span><strong>${targets.map(t => this.escape(t.name || t.text || t.id)).join(', ')}</strong></div>` : ''}<div class="alive-effect-warning">Карта будет потрачена только после успешного выполнения механики.</div><div class="alive-effect-actions"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-danger" type="button" data-confirm>Использовать</button></div></div>`;
        this.overlay.classList.add('alive-effect-open');
        this.overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.close(false));
        this.overlay.querySelector('[data-confirm]').onclick = () => this.close(true);
      });
    },
    pick(card, candidates, count) {
      return new Promise(resolve => {
        this.overlay._resolve = resolve;
        const selected = new Set();
        this.overlay.innerHTML = `<div class="alive-effect-box"><div class="alive-effect-kicker">ВЫБОР ЦЕЛИ</div><button class="alive-effect-close" type="button" data-close>×</button><h2>${count === 2 ? 'Выберите двух игроков' : 'Выберите цель'}</h2><div class="alive-effect-counter">Выбрано: <strong data-count>0</strong> / ${count}</div><div class="alive-effect-list">${candidates.map(c => `<button type="button" class="alive-effect-target" data-id="${this.escape(c.id)}"><span>${this.escape(c.avatar || '👤')}</span><b>${this.escape(c.name || c.text || c.id)}</b></button>`).join('')}</div><div class="alive-effect-actions"><button class="btn btn-ghost" type="button" data-close>Отмена</button><button class="btn btn-primary" type="button" data-confirm disabled>Продолжить</button></div></div>`;
        this.overlay.classList.add('alive-effect-open');
        const countEl = this.overlay.querySelector('[data-count]');
        const confirm = this.overlay.querySelector('[data-confirm]');
        this.overlay.querySelectorAll('.alive-effect-target').forEach(btn => btn.onclick = () => {
          const id = btn.dataset.id;
          if (selected.has(id)) { selected.delete(id); btn.classList.remove('selected'); }
          else if (selected.size < count) { selected.add(id); btn.classList.add('selected'); }
          countEl.textContent = selected.size;
          confirm.disabled = selected.size !== count;
        });
        this.overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.close(false));
        confirm.onclick = () => this.close(candidates.filter(c => selected.has(String(c.id))));
      });
    },
    pickTrait(cards, title) {
      return new Promise(resolve => {
        this.overlay._resolve = resolve;
        this.overlay.innerHTML = `<div class="alive-effect-box"><div class="alive-effect-kicker">ВЫБОР ХАРАКТЕРИСТИКИ</div><button class="alive-effect-close" type="button" data-close>×</button><h2>${this.escape(title)}</h2><div class="alive-effect-list">${cards.map(c => `<button type="button" class="alive-effect-target ae-trait-option" data-id="${this.escape(c.id)}"><b>${this.escape(c.category)}</b><span>${this.escape(c.text)}</span></button>`).join('')}</div><div class="alive-effect-actions"><button class="btn btn-ghost" type="button" data-close>Отмена</button></div></div>`;
        this.overlay.classList.add('alive-effect-open');
        this.overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.close(false));
        this.overlay.querySelectorAll('.ae-trait-option').forEach(b => b.onclick = () => this.close(cards.find(c => String(c.id) === b.dataset.id) || false));
      });
    },
    // Выбор категории ВСЛЕПУЮ — показываем только название категории, без текста карты.
    // Используется для эффектов кражи/обмена «на веру» (блеф), где содержимое неизвестно заранее.
    pickCategory(categories, title) {
      return new Promise(resolve => {
        this.overlay._resolve = resolve;
        this.overlay.innerHTML = `<div class="alive-effect-box"><div class="alive-effect-kicker">ВСЛЕПУЮ</div><button class="alive-effect-close" type="button" data-close>×</button><h2>${this.escape(title)}</h2><p class="alive-effect-text">Содержимое карты вы узнаете только после применения эффекта.</p><div class="alive-effect-list">${categories.map(cat => `<button type="button" class="alive-effect-target ae-cat-option" data-cat="${this.escape(cat)}"><b>${this.escape(cat)}</b></button>`).join('')}</div><div class="alive-effect-actions"><button class="btn btn-ghost" type="button" data-close>Отмена</button></div></div>`;
        this.overlay.classList.add('alive-effect-open');
        this.overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.close(false));
        this.overlay.querySelectorAll('.ae-cat-option').forEach(b => b.onclick = () => this.close(b.dataset.cat));
      });
    }
  };
  window.AliveEffectsUI = UI;
})(window);
