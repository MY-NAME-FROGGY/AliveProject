/* AliveProject — compatibility layer for the existing app.js */
(function () {
  'use strict';

  if (!window.AliveCardEffects) {
    console.error('AliveCardEffects не загружен.');
    return;
  }

  const original = window.actionUseSpecialCondition;

  window.actionUseSpecialCondition = async function (cardId) {
    const s = window.state || (typeof state !== 'undefined' ? state : null);
    const card = (s?.myCardCache || []).find(c => String(c.id) === String(cardId));

    if (card?.effect_key) {
      return window.AliveCardEffectsUI.run(cardId);
    }

    if (typeof original === 'function') {
      return original(cardId);
    }

    alert('Обработчик спецусловия не найден.');
  };

  /*
   * В существующем loadMyCard кнопки старого target picker остаются.
   * Этот observer заменяет только блоки спецусловий, у которых есть effect_key.
   * Остальной интерфейс приложения не затрагивается.
   */
  const originalLoad = window.loadMyCard;
  if (typeof originalLoad === 'function') {
    window.loadMyCard = async function () {
      await originalLoad();
      const s = window.state || (typeof state !== 'undefined' ? state : null);
      if (!s?.myCardCache) return;

      s.myCardCache
        .filter(c => c.category === 'special_condition' && !c.used && c.effect_key)
        .forEach(card => {
          const buttons = document.querySelectorAll(`[onclick*="actionUseSpecialCondition('${card.id}')"]`);
          buttons.forEach(btn => {
            const parent = btn.closest('li') || btn.parentElement;
            if (!parent) return;
            const oldPicker = parent.querySelector(`#targetPicker_${card.id}`);
            if (!oldPicker) return;
            oldPicker.outerHTML = window.AliveCardEffectsUI.decorateSpecialCard(card);
            btn.remove();
          });
        });
    };
  }
})();
