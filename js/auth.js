/* Public Turnstile site key. The secret key belongs only in Supabase Auth settings. */
(function (w) {
  'use strict';
  const sitekey = '0x4AAAAAAEsfHj_JzzvbV9dI';
  let loading, pending;

  function loadTurnstile() {
    if (w.turnstile) return Promise.resolve(w.turnstile);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => fail(), 20000);
      function fail() {
        clearTimeout(timeout);
        script.remove();
        reject(new Error('Не удалось загрузить проверку безопасности. Проверьте соединение и разрешите challenges.cloudflare.com в блокировщике.'));
      }
      w.aliveTurnstileLoaded = () => {
        clearTimeout(timeout);
        resolve(w.turnstile);
      };
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=aliveTurnstileLoaded';
      script.async = true;
      script.onerror = fail;
      document.head.append(script);
    }).catch(error => { loading = null; throw error; });
    return loading;
  }

  async function signIn(client) {
    const app = document.getElementById('app');
    app.innerHTML = '<h1>ОСТАТЬСЯ <span>В ЖИВЫХ</span></h1>' +
      '<div class="panel" style="max-width:460px;margin:24px auto;padding:16px">' +
      '<h2>Вход в игру</h2><p id="authStatus" role="status" aria-live="polite">Пройдите короткую проверку безопасности.</p>' +
      '<div id="authCaptcha"></div><button id="authRetry" class="btn btn-primary" type="button" hidden style="margin-top:12px">Повторить проверку</button></div>';
    const api = await loadTurnstile();
    return new Promise((resolve, reject) => {
      let widget, sending = false, finished = false;
      const spent = new Set();
      const status = document.getElementById('authStatus');
      const retry = document.getElementById('authRetry');
      function problem(message) {
        if (finished || sending) return;
        status.textContent = message;
        retry.hidden = false;
      }
      retry.onclick = () => {
        if (sending || finished) return;
        retry.hidden = true;
        status.textContent = 'Пройдите проверку ещё раз.';
        api.reset(widget);
      };
      try {
        widget = api.render('#authCaptcha', {
          sitekey, theme: 'dark', size: 'flexible', language: 'ru', retry: 'never',
          'refresh-expired': 'manual',
          callback: async token => {
            if (!token || sending || finished || spent.has(token)) return;
            spent.add(token);
            sending = true;
            retry.hidden = true;
            status.textContent = 'Проверка пройдена. Входим в игру…';
            try {
              // Supabase validates this single-use token with Cloudflare server-side.
              const result = await client.auth.signInAnonymously({ options: { captchaToken: token } });
              if (result.error) throw result.error;
              if (!result.data?.session) throw new Error('Сессия не получена. Повторите вход.');
              finished = true;
              api.remove(widget);
              resolve(result);
            } catch (error) {
              sending = false;
              const message = /captcha/i.test(error.message || '')
                ? 'Проверка отклонена. Повторите её. Если ошибка остаётся, нужно проверить настройки Turnstile в Supabase.'
                : (error.message || 'Не удалось войти. Повторите проверку.');
              problem(message);
            }
          },
          'error-callback': () => {
            problem('Проверка недоступна. Повторите попытку; если ошибка остаётся, проверьте разрешённый домен в Turnstile.');
            return true;
          },
          'expired-callback': () => problem('Срок проверки истёк. Пройдите её ещё раз.'),
          'timeout-callback': () => problem('Время проверки истекло. Повторите попытку.')
        });
      } catch (error) { reject(error); }
    });
  }

  w.AliveAuth = {
    signInAnonymously(client) {
      if (!pending) pending = signIn(client).finally(() => { pending = null; });
      return pending;
    }
  };
})(window);
