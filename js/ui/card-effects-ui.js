/* AliveProject — UI для card_effect */
(function () {
  'use strict';

  function getState() {
    return window.state || (typeof state !== 'undefined' ? state : null);
  }

  function esc(v) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(String(v ?? ''))
      : String(v ?? '').replace(/[&<>"']/g, c => ({
          '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
        }[c]));
  }

  function targetPicker(card) {
    const s = getState();
    if (!s) return '';

    const type = card.target_type || 'self';
    if (type === 'self') {
      return `<button class="btn btn-sm btn-primary ae-use" data-card-id="${esc(card.id)}">Использовать</button>`;
    }

    const others = (s.players || []).filter(p =>
      p.id !== s.playerId && p.id !== s.room.host_id && p.is_alive !== false
    );

    if (type === 'all') {
      return `<button class="btn btn-sm btn-primary ae-use" data-card-id="${esc(card.id)}">Использовать на всех</button>`;
    }

    const inputType = type === 'two' ? 'checkbox' : 'radio';
    const name = `ae_target_${card.id}`;

    return `
      <div class="ae-target-box">
        <div class="ae-target-title">${type === 'two' ? 'ВЫБЕРИТЕ 2 ЦЕЛИ' : 'ВЫБЕРИТЕ ЦЕЛЬ'}</div>
        <div class="ae-target-list">
          ${others.map(p => `
            <label class="ae-target">
              <input type="${inputType}" name="${name}" value="${esc(p.id)}">
              <span>${esc(p.avatar || '👤')}</span>
              <b>${esc(p.name)}</b>
            </label>
          `).join('')}
        </div>
        <button class="btn btn-sm btn-primary ae-use" data-card-id="${esc(card.id)}">Подтвердить</button>
      </div>
    `;
  }

  async function run(cardId) {
    const s = getState();
    if (!s || !window.AliveCardEffects) return;

    const btn = document.querySelector(`.ae-use[data-card-id="${CSS.escape(String(cardId))}"]`);
    if (btn) btn.disabled = true;

    try {
      const result = await window.AliveCardEffects.execute(cardId);
      if (result === false) return;

      if (typeof window.loadMyCard === 'function') await window.loadMyCard();
      if (typeof window.updateGameDynamic === 'function') await window.updateGameDynamic();
      if (typeof window.refreshEventsFeed === 'function') await window.refreshEventsFeed();
    } catch (e) {
      console.error('Card effect error:', e);
      alert(`Спецусловие не применено.\n\n${e.message || e}\n\nКарта НЕ потрачена.`);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function decorateSpecialCard(card) {
    if (!card || card.category !== 'special_condition' || card.used) return '';
    if (!card.effect_key) {
      return `<div class="ae-unmapped">Механика ещё не подключена</div>`;
    }
    return targetPicker(card);
  }

  window.AliveCardEffectsUI = { run, decorateSpecialCard };

  document.addEventListener('click', e => {
    const btn = e.target.closest('.ae-use');
    if (!btn) return;
    run(btn.dataset.cardId);
  });
})();
