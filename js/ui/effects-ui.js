/* AliveProject — universal special-condition UI. */
(function (window) {
  'use strict';

  const UI = {
    overlay: null,

    init() {
      this.overlay = document.getElementById('aliveEffectModal');
      if (!this.overlay) return;
      this.overlay.addEventListener('click', e => {
        if (e.target === this.overlay) this.close(false);
      });
    },

    escape(v) {
      return String(v ?? '').replace(/[&<>"']/g, s => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[s]));
    },

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
        this.overlay.innerHTML = `
          <div class="alive-effect-box">
            <div class="alive-effect-kicker">СПЕЦУСЛОВИЕ</div>
            <button class="alive-effect-close" type="button" data-close>×</button>
            <h2>Использовать карту?</h2>
            <p class="alive-effect-text">${this.escape(card.text)}</p>
            ${targets.length ? `<div class="alive-effect-targets"><span>Цель:</span><strong>${targets.map(t => this.escape(t.name || t.text || t.id)).join(', ')}</strong></div>` : ''}
            <div class="alive-effect-warning">Карта будет потрачена только после успешного выполнения механики.</div>
            <div class="alive-effect-actions">
              <button class="btn btn-ghost" type="button" data-close>Отмена</button>
              <button class="btn btn-danger" type="button" data-confirm>Использовать</button>
            </div>
          </div>`;
        this.overlay.classList.add('alive-effect-open');
        this.overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.close(false));
        this.overlay.querySelector('[data-confirm]').onclick = () => this.close(true);
      });
    },

    pick(card, candidates, count) {
      return new Promise(resolve => {
        this.overlay._resolve = resolve;
        const selected = new Set();
        this.overlay.innerHTML = `
          <div class="alive-effect-box">
            <div class="alive-effect-kicker">ВЫБОР ЦЕЛИ</div>
            <button class="alive-effect-close" type="button" data-close>×</button>
            <h2>${count === 2 ? 'Выберите двух игроков' : 'Выберите цель'}</h2>
            <div class="alive-effect-counter">Выбрано: <strong data-count>0</strong> / ${count}</div>
            <div class="alive-effect-list">
              ${candidates.map(c => `<button type="button" class="alive-effect-target" data-id="${this.escape(c.id)}"><span>${this.escape(c.name || c.text || c.id)}</span><b>✓</b></button>`).join('')}
            </div>
            <div class="alive-effect-actions">
              <button class="btn btn-ghost" type="button" data-close>Отмена</button>
              <button class="btn btn-primary" type="button" data-confirm disabled>Продолжить</button>
            </div>
          </div>`;
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

    propertyPick(card, properties) { return this.pick(card, properties, 1); }
  };

  window.AliveEffectsUI = UI;
})(window);
