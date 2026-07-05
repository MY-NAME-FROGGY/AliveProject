// ==========================================
// НАСТРОЙКИ SUPABASE
// ==========================================
const SUPABASE_URL = 'https://dhuqvintfsmbigmvdvak.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRodXF2aW50ZnNtYmlnbXZkdmFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwODAxODQsImV4cCI6MjA5ODY1NjE4NH0.badg8idLoAL-Y4sxR7zj9NTHdyKrBdh_Cv90fimAD-4';

function generateSafeId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        try { return crypto.randomUUID(); } catch (e) {}
    }
    return 'usr_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

let supabaseClient = null;
let dbConnected = false;
try {
    if (window.supabase && SUPABASE_URL.includes('supabase.co') && !SUPABASE_KEY.includes('ВСТАВЬТЕ')) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        dbConnected = true;
    }
} catch (e) {
    console.error('Ошибка инициализации Supabase:', e);
}

// ==========================================
// СОСТОЯНИЕ
// ==========================================
const CATEGORY_LABELS = {
    bio: 'БИО', profession: 'Профессия', hobby: 'Хобби', fact: 'Факт',
    health: 'Здоровье', phobia: 'Фобия', luggage_big: 'Большой багаж',
    luggage_small: 'Малый багаж', trait: 'Черта характера', special_condition: 'Спец.условие'
};
const CATEGORY_LIST = Object.keys(CATEGORY_LABELS);

const PHASE_SEQUENCE = ['reveal', 'discussion', 'nomination', 'defense', 'voting', 'vote_result', 'bunker_reveal'];
const PHASE_META = {
    reveal:        { label: 'Открытие раунда',     icon: '🃏', color: '#5b6b48', durationKey: null },
    discussion:    { label: 'Обсуждение',           icon: '💬', color: '#5b8a4a', durationKey: 'discussion' },
    nomination:    { label: 'Выставление',          icon: '👉', color: '#d3a026', durationKey: 'discussion' },
    defense:       { label: 'Оправдательная речь',  icon: '🗣️', color: '#a63d2f', durationKey: 'defense' },
    voting:        { label: 'Голосование',          icon: '🗳️', color: '#7a5c1e', durationKey: 'voting' },
    vote_result:   { label: 'Итог голосования',     icon: '📋', color: '#a63d2f', durationKey: null },
    bunker_reveal: { label: 'Открытие бункера',     icon: '🔓', color: '#4a4e28', durationKey: null },
    awaiting_verdict: { label: 'Раунды завершены',  icon: '⏳', color: '#8a6b1d', durationKey: null }
};

function phaseDuration(phaseKey) {
    const key = PHASE_META[phaseKey]?.durationKey;
    if (!key) return 0;
    return (state.room?.settings?.phase_seconds?.[key]) || 60;
}

const state = {
    playerId: localStorage.getItem('playerId') || generateSafeId(),
    playerName: localStorage.getItem('playerName') || '',
    currentRoomCode: localStorage.getItem('currentRoomCode') || null,
    room: null,
    players: [],
    chat: [],
    view: 'home',
    lastRenderedView: null,
    catalog: [],
    viewingScenario: null,
    pollInterval: null,
    countdownTick: null,
    lastSeenSettings: null,
    lastSeenScenarioId: undefined,
    lastGameRenderKey: null,
    gamePhaseTick: null,
    gameScenario: null
};

localStorage.setItem('playerId', state.playerId);

function saveRoomCode(code) {
    state.currentRoomCode = code;
    if (code) localStorage.setItem('currentRoomCode', code);
    else localStorage.removeItem('currentRoomCode');
}

// ==========================================
// БАЗА ДАННЫХ
// ==========================================
function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
}

function defaultSettings() {
    return {
        min_players: 2, max_players: 12, target_survivors: 3, rounds: 6,
        round_char_type: Array(6).fill('any'),
        phase_seconds: { discussion: 180, defense: 30, voting: 60 },
        private_chat_enabled: false
    };
}

async function dbCreateRoom(hostName) {
    let code = genCode();
    for (let attempt = 0; attempt < 5; attempt++) {
        const { data: existing } = await supabaseClient.from('rooms').select('code').eq('code', code).maybeSingle();
        if (!existing) break;
        code = genCode();
    }
    const { error: roomErr } = await supabaseClient.from('rooms').insert({
        code, host_id: state.playerId, phase: 'lobby', settings: defaultSettings()
    });
    if (roomErr) throw roomErr;
    
    const { error: playerErr } = await supabaseClient.from('players').insert({
        id: state.playerId, room_code: code, name: hostName, is_ready: false
    });
    if (playerErr) throw playerErr;
    return code;
}

async function dbJoinRoom(code, name) {
    const { data: room, error: roomErr } = await supabaseClient.from('rooms').select('').eq('code', code).maybeSingle();
    if (roomErr || !room) throw new Error('Комната не найдена. Проверьте код.');
    if (room.phase !== 'lobby') throw new Error('Игра уже началась, присоединиться нельзя.');
    
    const { data: players, error: playersErr } = await supabaseClient.from('players').select('').eq('room_code', code);
    if (playersErr) throw playersErr;
    
    const already = players.find(p => p.id === state.playerId);
    if (!already) {
        const max = room.settings?.max_players;
        if (max && players.length >= max) throw new Error('Комната заполнена.');
        const { error: insErr } = await supabaseClient.from('players').insert({
            id: state.playerId, room_code: code, name, is_ready: false
        });
        if (insErr) throw insErr;
    }
    return room;
}

async function dbFetchRoom(code) {
    const { data, error } = await supabaseClient.from('rooms').select('*').eq('code', code).maybeSingle();
    if (error) { console.error(error); return null; }
    return data;
}

async function dbFetchPlayers(code) {
    const { data, error } = await supabaseClient.from('players').select('*').eq('room_code', code).order('created_at');
    if (error) { console.error(error); return []; }
    return data || [];
}

async function dbFetchChat(code) {
    const { data, error } = await supabaseClient.from('chat_messages')
        .select('*').eq('room_code', code).is('recipient_id', null)
        .order('created_at', { ascending: true }).limit(100);
    if (error) { console.error(error); return []; }
    return data || [];
}

async function dbSendChat(code, text) {
    await supabaseClient.from('chat_messages').insert({ room_code: code, sender_id: state.playerId, text });
}

async function dbUpdateRoom(code, patch) {
    const { error } = await supabaseClient.from('rooms').update(patch).eq('code', code);
    if (error) console.error(error);
}

async function dbSetReady(code, ready) {
    await supabaseClient.from('players').update({ is_ready: ready }).eq('id', state.playerId).eq('room_code', code);
}

async function dbKickPlayer(code, targetId, actorId) {
    await supabaseClient.from('moderation_log').insert({ room_code: code, actor_id: actorId, target_id: targetId, action: 'kick' });
    await supabaseClient.from('players').delete().eq('id', targetId).eq('room_code', code);
}

async function dbSetMute(code, targetId, actorId, muted) {
    await supabaseClient.from('players').update({ is_muted: muted }).eq('id', targetId).eq('room_code', code);
    await supabaseClient.from('moderation_log').insert({ room_code: code, actor_id: actorId, target_id: targetId, action: 'mute', reason: muted ? 'mute on' : 'mute off' });
}

async function dbTimeoutPlayer(code, targetId, actorId, seconds) {
    const until = new Date(Date.now() + seconds * 1000).toISOString();
    await supabaseClient.from('players').update({ timeout_until: until }).eq('id', targetId).eq('room_code', code);
    await supabaseClient.from('moderation_log').insert({ room_code: code, actor_id: actorId, target_id: targetId, action: 'timeout', reason: seconds + 's' });
}

async function dbFetchScenarios() {
    const { data, error } = await supabaseClient.from('scenarios').select('id,title').order('title');
    if (error) { console.error(error); return []; }
    return data || [];
}

async function dbFetchScenarioDetail(id) {
    const { data: scenario } = await supabaseClient.from('scenarios').select('').eq('id', id).maybeSingle();
    const { data: props } = await supabaseClient.from('bunker_properties').select('').eq('scenario_id', id);
    return {
        scenario,
        base: (props || []).filter(p => p.type === 'base'),
        bonus: (props || []).filter(p => p.type === 'bonus')
    };
}

// ==========================================
// ГЕНЕРАЦИЯ КАРТОЧЕК ПЕРСОНАЖЕЙ
// ==========================================
function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function generateBalancedCard(pool) {
    const categories = shuffleArray(CATEGORY_LIST);
    const half = Math.ceil(categories.length / 2);
    const positiveCats = new Set(categories.slice(0, half));
    const card = [];
    for (const cat of CATEGORY_LIST) {
        const items = pool.filter(p => p.category === cat);
        if (items.length === 0) continue;
        const wantPositive = positiveCats.has(cat);
        let candidates = items.filter(p => wantPositive ? p.value >= 0 : p.value <= 0);
        if (candidates.length === 0) candidates = items;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        card.push({ category: cat, pool_id: pick.id, text: pick.text, value: pick.value });
    }
    return card;
}

async function dbFetchCharacterPool() {
    const { data, error } = await supabaseClient.from('character_pool').select('id,category,text,value');
    if (error) { console.error('Ошибка загрузки character_pool:', error); return []; }
    return data || [];
}

async function dbCardsExist(roomCode) {
    const { data, error } = await supabaseClient.from('player_cards').select('id').eq('room_code', roomCode).limit(1);
    if (error) { console.error(error); return false; }
    return !!(data && data.length > 0);
}

async function dbInsertPlayerCard(roomCode, playerId, card) {
    const rows = card.map(c => ({
        room_code: roomCode, player_id: playerId, category: c.category,
        pool_id: c.pool_id, text: c.text, value: c.value, revealed: false
    }));
    const { error } = await supabaseClient.from('player_cards').insert(rows);
    if (error) console.error('Ошибка записи карточки для игрока ' + playerId + ':', error);
}

async function dbFetchMyCard(roomCode, playerId) {
    const { data, error } = await supabaseClient.from('player_cards')
        .select('*').eq('room_code', roomCode).eq('player_id', playerId);
    if (error) { console.error(error); return []; }
    return data || [];
}

async function dbClearCards(roomCode) {
    const { error } = await supabaseClient.from('player_cards').delete().eq('room_code', roomCode);
    if (error) console.error('Ошибка очистки player_cards:', error);
}

// [ИСПРАВЛЕНО 1] Добавлен параметр hostId, чтобы пропускать ведущего
async function generateCardsForRoom(roomCode, players, hostId) {
    const already = await dbCardsExist(roomCode);
    if (already) return;
    const pool = await dbFetchCharacterPool();
    if (pool.length === 0) {
        console.error('character_pool пуст — карточки не сгенерированы.');
        return;
    }
    for (const p of players) {
        if (p.id === hostId) continue; // Пропускаем ведущего
        const card = generateBalancedCard(pool);
        await dbInsertPlayerCard(roomCode, p.id, card);
    }
}

async function selectActiveBonusIds(scenarioId, playerCount) {
    if (!scenarioId) return [];
    const { bonus } = await dbFetchScenarioDetail(scenarioId);
    if (!bonus || bonus.length === 0) return [];
    let count = 2;
    if (playerCount >= 9) count = 4;
    else if (playerCount >= 6) count = 3;
    count = Math.min(count, bonus.length);
    return shuffleArray(bonus).slice(0, count).map(b => b.id);
}

// ==========================================
// ПОЛЛИНГ
// ==========================================
function startPolling() {
    stopPolling();
    state.pollInterval = setInterval(pollTick, 2000);
    pollTick();
}

function stopPolling() {
    if (state.pollInterval) clearInterval(state.pollInterval);
    state.pollInterval = null;
}

async function pollTick() {
    if (!state.currentRoomCode) return;
    const room = await dbFetchRoom(state.currentRoomCode);
    if (!room) {
        saveRoomCode(null); state.room = null; stopPolling();
        alert('Комната была закрыта.');
        renderHome();
        return;
    }
    const players = await dbFetchPlayers(state.currentRoomCode);
    const me = players.find(p => p.id === state.playerId);
    if (!me) {
        saveRoomCode(null); state.room = null; stopPolling();
        alert('Вас исключили из комнаты.');
        renderHome();
        return;
    }
    state.room = room;
    state.players = players;
    const isHost = room.host_id === state.playerId;

    if (isHost && room.phase === 'starting') {
        const notReady = players.find(p => !p.is_ready);
        if (notReady) {
            await dbUpdateRoom(state.currentRoomCode, { phase: 'lobby', countdown_ends_at: null });
            alert('Старт отменён: ' + notReady.name + ' не готов(а).');
            room.phase = 'lobby';
        } else if (room.countdown_ends_at && new Date(room.countdown_ends_at) <= new Date()) {
            // [ИСПРАВЛЕНО 1] Передаем host_id в генератор карт
            await generateCardsForRoom(state.currentRoomCode, players, room.host_id);
            const activeBonusIds = await selectActiveBonusIds(room.scenario_id, players.length);
            await dbUpdateRoom(state.currentRoomCode, {
                phase: 'game', current_round: 1, current_phase: 'reveal',
                phase_ends_at: null, phase_running: false, phase_paused_remaining: null,
                nominees: [], defense_index: 0, active_bonus_ids: activeBonusIds, revealed_bonus_ids: []
            });
            room.phase = 'game';
        }
    }

    state.view = room.phase === 'game' ? 'game' : 'lobby';
    if (state.view === 'lobby') {
        state.chat = await dbFetchChat(state.currentRoomCode);
        if (state.lastRenderedView !== 'lobby') { renderLobby(); state.lastRenderedView = 'lobby'; }
        else updateLobbyDynamic();
    } else if (state.view === 'game') {
        const key = room.current_phase + '|' + room.current_round + '|' + (room.defense_index || 0);
        if (state.lastRenderedView !== 'game' || state.lastGameRenderKey !== key) {
            state.lastGameRenderKey = key;
            renderGameTable();
        } else {
            updateGameDynamic();
        }
        state.lastRenderedView = 'game';
    }
}

// ==========================================
// ВСПОМОГАТЕЛЬНОЕ
// ==========================================
function showWarning(msg) {
    const w = document.getElementById('db-warning');
    if (w) { w.innerText = '⚠️ ' + msg; w.style.display = 'block'; }
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

// ==========================================
// РЕНДЕР: ГЛАВНАЯ
// ==========================================
function renderHome() {
    stopPolling();
    state.view = 'home'; state.lastRenderedView = 'home';
    document.getElementById('app').innerHTML = `
        <h1>ОСТАТЬСЯ <span>В ЖИВЫХ</span></h1>
        <div class="hazard-strip"></div>
        <div id="db-warning" class="warning"></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
            <div class="panel">
                <h2>Создать комнату</h2>
                <input id="hostName" placeholder="Ваше имя (Ведущий)" maxlength="20">
                <button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="actionCreateRoom()">Создать</button>
            </div>
            <div class="panel">
                <h2>Присоединиться</h2>
                <input id="joinCode" placeholder="Код комнаты (4 буквы/цифры)" maxlength="4" style="text-transform:uppercase;">
                <input id="joinName" placeholder="Ваше имя" maxlength="20">
                <button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="actionJoinRoom()">Войти</button>
            </div>
        </div>
    `;
    if (!dbConnected) setTimeout(() => showWarning('База данных не подключена. Проверьте ключи в app.js.'), 100);
}

// ==========================================
// РЕНДЕР: ЛОББИ
// ==========================================
function renderLobby() {
    const room = state.room;
    const isHost = room.host_id === state.playerId;
    const settings = room.settings || {};
    document.getElementById('app').innerHTML = `
        <h1>ОСТАТЬСЯ <span>В ЖИВЫХ</span></h1>
        <div class="hazard-strip"></div>
        <div id="phaseBanner"></div>
        <div class="panel" style="text-align:center;">
            <h3>Код комнаты для друзей:</h3>
            <div class="code-box">${room.code}</div>
        </div>
        <div class="panel">
            <div class="section-title"><h2>Сценарий</h2>
                ${isHost ? `<button class="btn btn-ghost btn-sm" onclick="openCatalog()">${room.scenario_id ? 'Сменить' : 'Выбрать'}</button>` : ''}
            </div>
            <p id="scenarioSummary">${room.scenario_id ? 'Загрузка...' : 'Сценарий ещё не выбран.'}</p>
            <div id="scenarioDetailBtn">${room.scenario_id ? `<button class="btn btn-ghost btn-sm" onclick="openScenarioDetail('${room.scenario_id}')">Подробнее</button>` : ''}</div>
        </div>
        <div class="panel" id="settingsPanel">
            <h2>Настройки игры</h2>
            <div id="settingsContent">${isHost ? renderSettingsEditable(settings) : renderSettingsReadonly(settings)}</div>
        </div>
        <div class="panel">
            <div class="section-title"><h2>Участники</h2><span id="playerCount" class="muted-note"></span></div>
            <ul class="player-list" id="playersList"></ul>
        </div>
        <div class="panel">
            <h2>Чат</h2>
            <div class="chat-box">
                <div class="chat-messages" id="chatMessages"></div>
                <div class="chat-input-row">
                    <input id="chatInput" placeholder="Сообщение..." onkeydown="handleChatKey(event)">
                    <button class="btn btn-primary btn-sm" onclick="actionSendChat()">➤</button>
                </div>
            </div>
        </div>
        <div style="display:flex; gap:10px; margin-top:20px; flex-wrap:wrap;">
            <button class="btn btn-primary" id="readyToggleBtn" onclick="actionToggleReady()"></button>
            ${isHost ? `<button class="btn btn-danger" onclick="actionStartGame()">Начать игру</button>` : ''}
            <button class="btn btn-ghost" onclick="actionLeaveRoom()">← Выйти в меню</button>
        </div>
    `;
    if (room.scenario_id) loadScenarioSummary(room.scenario_id);
    if (isHost) regenerateRoundTypeInputs();
    state.lastSeenSettings = JSON.stringify(settings);
    state.lastSeenScenarioId = room.scenario_id;
    updateLobbyDynamic();
}

function renderSettingsEditable(s) {
    return `
        <div class="settings-grid">
            <div class="settings-field"><label>Мин. игроков</label><input type="number" id="setMin" value="${s.min_players ?? 4}"></div>
            <div class="settings-field"><label>Макс. игроков</label><input type="number" id="setMax" value="${s.max_players ?? 12}"></div>
            <div class="settings-field"><label>Нужно выживших</label><input type="number" id="setSurvivors" value="${s.target_survivors ?? 3}"></div>
            <div class="settings-field"><label>Кол-во раундов</label><input type="number" id="setRounds" value="${s.rounds ?? 6}" onchange="regenerateRoundTypeInputs()"></div>
            <div class="settings-field"><label>Обсуждение, сек</label><input type="number" id="setDiscussion" value="${s.phase_seconds?.discussion ?? 180}"></div>
            <div class="settings-field"><label>Оправдание, сек</label><input type="number" id="setDefense" value="${s.phase_seconds?.defense ?? 30}"></div>
            <div class="settings-field"><label>Голосование, сек</label><input type="number" id="setVoting" value="${s.phase_seconds?.voting ?? 60}"></div>
            <div class="settings-field wide">
                <label><input type="checkbox" id="setPrivateChat" style="width:auto;display:inline-block;margin-right:6px;vertical-align:middle;" ${s.private_chat_enabled ? 'checked' : ''}>Разрешить личные чаты между игроками</label>
            </div>
        </div>
        <h3 style="margin-top:14px;">Тип характеристики по раундам</h3>
        <div id="roundTypesContainer"></div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="actionSaveSettings()">Сохранить настройки</button>
    `;
}

function renderSettingsReadonly(s) {
    const roundTypes = (s.round_char_type || []).map((t, i) => `Раунд ${i + 1}: ${t === 'any' ? 'любая' : (CATEGORY_LABELS[t] || t)}`).join(' · ');
    return `
        <div class="readonly-settings">
            Игроков: ${s.min_players ?? '?'}–${s.max_players ?? '?'} · Нужно выживших: ${s.target_survivors ?? '?'}<br>
            Раундов: ${s.rounds ?? '?'}<br>
            ${roundTypes ? '<div class="muted-note">' + roundTypes + '</div>' : ''}
            Фазы: обсуждение ${s.phase_seconds?.discussion ?? '?'}с · оправдание ${s.phase_seconds?.defense ?? '?'}с · голосование ${s.phase_seconds?.voting ?? '?'}с<br>
            Личные чаты: ${s.private_chat_enabled ? 'включены' : 'выключены'}
        </div>
    `;
}

function regenerateRoundTypeInputs() {
    const roundsInput = document.getElementById('setRounds');
    if (!roundsInput) return;
    const rounds = parseInt(roundsInput.value) || 1;
    const container = document.getElementById('roundTypesContainer');
    const current = state.room?.settings?.round_char_type || [];
    let html = '';
    for (let i = 0; i < rounds; i++) {
        const val = current[i] || 'any';
        html += `<div class="round-type-row"><span>Раунд ${i + 1}</span><select id="roundType_${i}">`;
        html += `<option value="any" ${val === 'any' ? 'selected' : ''}>Любая</option>`;
        html += CATEGORY_LIST.map(c => `<option value="${c}" ${val === c ? 'selected' : ''}>${CATEGORY_LABELS[c]}</option>`).join('');
        html += `</select></div>`;
    }
    container.innerHTML = html;
}

function updateLobbyDynamic() {
    if (!state.room) return;
    const room = state.room;
    const isHost = room.host_id === state.playerId;
    const me = state.players.find(p => p.id === state.playerId);
    const listEl = document.getElementById('playersList');
    if (listEl) listEl.innerHTML = state.players.map(p => renderPlayerRow(p, room, isHost)).join('');
    
    const countEl = document.getElementById('playerCount');
    if (countEl) countEl.innerText = state.players.length + (room.settings?.max_players ? ' / ' + room.settings.max_players : '');
    
    const readyBtn = document.getElementById('readyToggleBtn');
    if (readyBtn && me) {
        readyBtn.textContent = me.is_ready ? 'Я готов ✔ (нажми, чтобы отменить)' : 'Не готов (нажми, когда будешь готов)';
        readyBtn.className = 'btn ' + (me.is_ready ? 'btn-ghost' : 'btn-primary');
    }

    if (!isHost) {
        const settingsJson = JSON.stringify(room.settings || {});
        if (state.lastSeenSettings !== settingsJson) {
            state.lastSeenSettings = settingsJson;
            const settingsContent = document.getElementById('settingsContent');
            if (settingsContent) settingsContent.innerHTML = renderSettingsReadonly(room.settings || {});
        }
        if (state.lastSeenScenarioId !== room.scenario_id) {
            state.lastSeenScenarioId = room.scenario_id;
            const summaryEl = document.getElementById('scenarioSummary');
            const btnWrap = document.getElementById('scenarioDetailBtn');
            if (room.scenario_id) {
                if (summaryEl) summaryEl.textContent = 'Загрузка...';
                loadScenarioSummary(room.scenario_id);
                if (btnWrap) btnWrap.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="openScenarioDetail('${room.scenario_id}')">Подробнее</button>`;
            } else {
                if (summaryEl) summaryEl.textContent = 'Сценарий ещё не выбран.';
                if (btnWrap) btnWrap.innerHTML = '';
            }
        }
    }
    renderChatMessages();
    renderPhaseBanner();
}

function renderPlayerRow(p, room, isHost) {
    const isMe = p.id === state.playerId;
    const isHostRow = p.id === room.host_id;
    const timedOut = p.timeout_until && new Date(p.timeout_until) > new Date();
    return `
        <li>
            <span>
                <span class="player-name">${escapeHtml(p.name)}${isMe ? ' (Вы)' : ''}</span>
                ${isHostRow ? '<span class="host-badge">Ведущий</span>' : ''}
                <span class="badge ${p.is_ready ? 'badge-ready' : 'badge-notready'}">${p.is_ready ? 'Готов' : 'Не готов'}</span>
                ${p.is_muted ? '<span class="badge badge-muted">Мут</span>' : ''}
                ${timedOut ? '<span class="badge badge-timeout">Таймаут</span>' : ''}
            </span>
            ${isHost && !isMe ? `
                <span class="player-actions">
                    <button class="btn btn-ghost btn-sm" onclick="actionToggleMute('${p.id}', ${p.is_muted})">${p.is_muted ? 'Размутить' : 'Мут'}</button>
                    <button class="btn btn-ghost btn-sm" onclick="actionTimeout('${p.id}', '${escapeHtml(p.name)}')">Таймаут</button>
                    <button class="btn btn-danger btn-sm" onclick="actionKick('${p.id}', '${escapeHtml(p.name)}')">Кик</button>
                </span>
            ` : ''}
        </li>
    `;
}

function renderChatMessages() {
    const el = document.getElementById('chatMessages');
    if (!el) return;
    const nameOf = id => { const p = state.players.find(pl => pl.id === id); return p ? p.name : 'Бывший игрок'; };
    el.innerHTML = state.chat.map(m => `<div class="chat-message"><span class="sender">${escapeHtml(nameOf(m.sender_id))}:</span> ${escapeHtml(m.text)}</div>`).join('');
    el.scrollTop = el.scrollHeight;
}

function renderPhaseBanner() {
    const el = document.getElementById('phaseBanner');
    if (!el) return;
    const room = state.room;
    if (room.phase === 'starting' && room.countdown_ends_at) {
        el.innerHTML = `<div class="countdown-banner">Игра начинается через <span id="countdownNumber">--</span> сек.</div>`;
        startCountdownTick();
    } else {
        el.innerHTML = '';
        stopCountdownTick();
    }
}

function startCountdownTick() {
    stopCountdownTick();
    state.countdownTick = setInterval(() => {
        const numEl = document.getElementById('countdownNumber');
        if (!numEl || !state.room?.countdown_ends_at) return stopCountdownTick();
        const left = Math.max(0, Math.round((new Date(state.room.countdown_ends_at) - Date.now()) / 1000));
        numEl.textContent = left;
    }, 250);
}

function stopCountdownTick() {
    if (state.countdownTick) clearInterval(state.countdownTick);
    state.countdownTick = null;
}

function startGamePhaseTick() {
    stopGamePhaseTick();
    state.gamePhaseTick = setInterval(() => {
        const el = document.getElementById('gamePhaseCountdown');
        const room = state.room;
        if (!el || !room || !room.phase_running || !room.phase_ends_at) return stopGamePhaseTick();
        const left = Math.max(0, Math.round((new Date(room.phase_ends_at) - Date.now()) / 1000));
        el.textContent = left + ' сек.';
    }, 250);
}

function stopGamePhaseTick() {
    if (state.gamePhaseTick) clearInterval(state.gamePhaseTick);
    state.gamePhaseTick = null;
}

function syncGamePhaseTimerTicker() {
    const room = state.room;
    stopGamePhaseTick();
    const el = document.getElementById('gamePhaseCountdown');
    if (!el) return;
    if (room.phase_running && room.phase_ends_at) {
        startGamePhaseTick();
    } else {
        el.textContent = room.phase_paused_remaining ? 'На паузе: ' + room.phase_paused_remaining + ' сек.' : '';
    }
}

async function loadScenarioSummary(id) {
    const { scenario } = await dbFetchScenarioDetail(id);
    const el = document.getElementById('scenarioSummary');
    if (el && scenario) el.textContent = scenario.title;
}

// ==========================================
// РЕНДЕР: КАТАЛОГ СЦЕНАРИЕВ
// ==========================================
async function openCatalog() {
    stopPolling();
    state.view = 'catalog';
    state.catalog = await dbFetchScenarios();
    renderCatalog();
}

function renderCatalog() {
    document.getElementById('app').innerHTML = `
        <h1>ОСТАТЬСЯ <span>В ЖИВЫХ</span></h1>
        <div class="hazard-strip"></div>
        <button class="btn btn-ghost" onclick="backToLobby()">← Назад в лобби</button>
        <h2 style="margin-top:16px;">Каталог сценариев</h2>
        ${state.catalog.length === 0 ? '<p class="muted-note">Сценариев пока нет в базе.</p>' : ''}
        ${state.catalog.map(s => `<div class="scenario-card" onclick="openScenarioDetail('${s.id}')"><h3 style="margin:0;">${escapeHtml(s.title)}</h3></div>`).join('')}
    `;
}

async function openScenarioDetail(id) {
    stopPolling();
    state.view = 'scenarioDetail';
    state.viewingScenario = await dbFetchScenarioDetail(id);
    renderScenarioDetail();
}

function renderScenarioDetail() {
    const { scenario, base, bonus } = state.viewingScenario;
    const isHost = state.room && state.room.host_id === state.playerId;
    document.getElementById('app').innerHTML = `
        <h1>ОСТАТЬСЯ <span>В ЖИВЫХ</span></h1>
        <div class="hazard-strip"></div>
        <button class="btn btn-ghost" onclick="backToLobby()">← Назад в лобби</button>
        <div class="panel" style="margin-top:16px;">
            <h2>${escapeHtml(scenario.title)}</h2>
            <p>${escapeHtml(scenario.catastrophe_description)}</p>
        </div>
        <div class="panel">
            <h3>Стартовые свойства бункера</h3>
            <ul class="prop-list">${base.map(p => `<li><span class="prop-tag">База</span>${escapeHtml(p.text)}</li>`).join('')}</ul>
            <h3>Дополнительные свойства (в игре выпадет 2–4 из ${bonus.length})</h3>
            <ul class="prop-list">${bonus.map(p => `<li class="bonus"><span class="prop-tag">Бонус</span>${escapeHtml(p.text)}</li>`).join('')}</ul>
        </div>
        ${isHost ? `<button class="btn btn-primary" onclick="confirmScenario('${scenario.id}')">Выбрать этот сценарий</button>` : ''}
    `;
}

async function confirmScenario(id) {
    await dbUpdateRoom(state.currentRoomCode, { scenario_id: id });
    backToLobby();
}

function backToLobby() {
    state.view = 'lobby';
    state.lastRenderedView = null;
    startPolling();
}

// ==========================================
// [ИСПРАВЛЕНО 4] ЗАГРУЗКА ОТКРЫТЫХ ХАРАКТЕРИСТИК
// ==========================================
async function fetchRevealedTraits() {
    const { data, error } = await supabaseClient.from('player_cards')
        .select('player_id, category, text')
        .eq('room_code', state.currentRoomCode)
        .eq('revealed', true);
    if (error) return {};
    
    const traitsByPlayer = {};
    data.forEach(c => {
        if (!traitsByPlayer[c.player_id]) traitsByPlayer[c.player_id] = [];
        traitsByPlayer[c.player_id].push({ cat: CATEGORY_LABELS[c.category], text: c.text });
    });
    return traitsByPlayer;
}

// ==========================================
// РЕНДЕР: ИГРОВОЙ СТОЛ И ДВИЖОК ФАЗ
// ==========================================
function renderGameTable() {
    stopCountdownTick();
    const room = state.room;
    const isHost = room.host_id === state.playerId;
    const meta = PHASE_META[room.current_phase] || { label: room.current_phase, icon: '❔', color: '#555', durationKey: null };
    const hasTimer = !!meta.durationKey;
    const nominees = room.nominees || [];
    const defenseIdx = room.defense_index || 0;
    const nominations = room.nominations || {};
    const myNomination = nominations[state.playerId];

    let phaseBody = '';
    if (room.current_phase === 'reveal') {
        phaseBody = `<p class="muted-note">Откройте характеристики, которые можно раскрыть в этом раунде, нажав кнопку "Открыть" на своей карточке.</p>`;
    } else if (room.current_phase === 'nomination') {
        const names = nominees.map(id => escapeHtml((state.players.find(p => p.id === id) || {}).name || '?')).join(', ');
        const myTargetName = myNomination ? escapeHtml((state.players.find(p => p.id === myNomination) || {}).name || '?') : null;
        phaseBody = `<p>Выставлено: <strong>${names || 'пока никто'}</strong></p>` +
            (myTargetName
                ? `<p class="muted-note">Вы выставили: ${myTargetName} (изменить нельзя)</p>`
                : `<p class="muted-note">Каждый выставляет ровно одного другого игрока (кроме ведущего), кнопкой на его карточке ниже.</p>`);
    } else if (room.current_phase === 'defense') {
        const speaker = state.players.find(p => p.id === nominees[defenseIdx]);
        phaseBody = `<p>Сейчас выступает: <strong>${escapeHtml(speaker ? speaker.name : '—')}</strong> (${nominees.length ? defenseIdx + 1 : 0} из ${nominees.length})</p>`;
    } else if (room.current_phase === 'voting') {
        const names = nominees.map(id => escapeHtml((state.players.find(p => p.id === id) || {}).name || '?')).join(', ');
        phaseBody = `<p>Кандидаты: <strong>${names || 'нет выставленных'}</strong></p><p class="muted-note">Само голосование и подсчёт появятся на Шаге 7.</p>`;
    } else if (room.current_phase === 'vote_result') {
        phaseBody = `<p class="muted-note">Итоги голосования появятся на Шаге 7.</p>`;
    } else if (room.current_phase === 'awaiting_verdict') {
        phaseBody = `<p>Раунды закончены. Финальный вердикт ведущего появится на Шаге 7.</p>`;
    }

    document.getElementById('app').innerHTML = `
        <h1>ОСТАТЬСЯ <span>В ЖИВЫХ</span></h1>
        <div class="hazard-strip"></div>
        <div class="panel" style="border-left:6px solid ${meta.color}; text-align:center;">
            <div style="font-size:14px; letter-spacing:0.08em; text-transform:uppercase; color:${meta.color};">${meta.icon} ${escapeHtml(meta.label)} · Раунд ${room.current_round || 1}</div>
            ${hasTimer ? `<div style="font-size:28px; font-weight:bold; margin-top:6px;" id="gamePhaseCountdown"></div>` : ''}
            ${phaseBody}
            ${isHost ? renderHostPhaseControls(room, hasTimer) : ''}
        </div>
        <div class="game-layout">
            <div class="game-sidebar">
                <div class="panel">
                    <div class="section-title"><h2>Сценарий</h2>
                        ${isHost ? `<button class="btn btn-ghost btn-sm" onclick="actionToggleScenarioVisible()">${room.scenario_visible ? 'Скрыть у всех' : 'Показать всем'}</button>` : ''}
                    </div>
                    <div id="scenarioPanelGame" style="display:${room.scenario_visible ? 'block' : 'none'};"><p class="muted-note">Загрузка...</p></div>
                    ${!isHost && !room.scenario_visible ? '<p class="muted-note">Ведущий пока не открыл сценарий.</p>' : ''}
                </div>
                <div class="panel">
                    <div class="section-title"><h2>Бункер</h2>
                        ${isHost ? `<button class="btn btn-ghost btn-sm" onclick="actionRevealBonus()">Открыть доп. свойство</button>` : ''}
                    </div>
                    <ul class="prop-list" id="bunkerRevealedList"></ul>
                </div>
            </div>
            <div class="game-main">
                <div class="panel">
                    <h2>Стол</h2>
                    <div id="hostStrip"></div>
                    <div class="ptable-grid" id="gamePlayersList"></div>
                </div>
                <div class="panel" id="myCardPanel">
                    <h2>Моя карточка</h2>
                    <p class="muted-note">Загрузка...</p>
                </div>
            </div>
        </div>
        ${isHost ? `<button class="btn btn-ghost" style="margin-top:16px;" onclick="actionResetToLobby()">Сбросить в лобби (для теста)</button>` : ''}
    `;
    loadMyCard();
    loadScenarioPanelGame();
    updateGameDynamic();
}

function renderHostPhaseControls(room, hasTimer) {
    let timerButtons = '';
    if (hasTimer) {
        if (room.phase_running) {
            timerButtons = `<button class="btn btn-ghost btn-sm" onclick="hostPauseTimer()">Пауза</button> <button class="btn btn-ghost btn-sm" onclick="hostStopTimer()">Стоп</button>`;
        } else if (room.phase_paused_remaining) {
            timerButtons = `<button class="btn btn-primary btn-sm" onclick="hostResumeTimer()">Возобновить</button> <button class="btn btn-ghost btn-sm" onclick="hostStopTimer()">Стоп</button>`;
        } else {
            timerButtons = `<button class="btn btn-primary btn-sm" onclick="hostStartTimer()">Старт таймера</button>`;
        }
    }
    return `<div style="margin-top:12px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;"> ${timerButtons} <button class="btn btn-danger btn-sm" onclick="hostAdvancePhase()">Далее →</button> </div>`;
}

// [ИСПРАВЛЕНО 4] Функция стала async, чтобы подтягивать открытые характеристики
async function updateGameDynamic() {
    const room = state.room;
    if (!room) return;
    const nominees = room.nominees || [];
    const defenseIdx = room.defense_index || 0;
    const nominations = room.nominations || {};
    const myNomination = nominations[state.playerId];

    // Подтягиваем открытые характеристики всех игроков
    const revealedTraits = await fetchRevealedTraits();

    const hostP = state.players.find(p => p.id === room.host_id);
    const hostEl = document.getElementById('hostStrip');
    if (hostEl) {
        hostEl.innerHTML = hostP ? `<div class="host-strip">
            <div class="ptable-avatar"></div>
            <div style="flex:1;"><span class="player-name">${escapeHtml(hostP.name)}${hostP.id === state.playerId ? ' (Вы)' : ''}</span></div>
            <span class="host-badge">Ведущий</span>
        </div>` : '';
    }

    const listEl = document.getElementById('gamePlayersList');
    if (listEl) {
        listEl.innerHTML = state.players.filter(p => p.id !== room.host_id).map(p => {
            const isMe = p.id === state.playerId;
            const isNominated = nominees.includes(p.id);
            const isSpeaking = room.current_phase === 'defense' && nominees[defenseIdx] === p.id;
            
            // [ИСПРАВЛЕНО 5] Ведущий не может выставлять, но на всякий случай проверяем и здесь
            const canNominate = room.current_phase === 'nomination' && !isMe && !myNomination && state.playerId !== room.host_id;

            // Рендерим открытые характеристики
            const traitsHtml = (revealedTraits[p.id] || []).map(t => 
                `<div style="font-size:11px; color:#b7b190; margin-top:2px;"><b>${t.cat}:</b> ${escapeHtml(t.text)}</div>`
            ).join('');

            return `<div class="ptable-card${isSpeaking ? ' speaking' : ''}${isNominated ? ' nominated' : ''}">
                <div class="ptable-card-head">
                    <div class="ptable-avatar"></div>
                    <div class="ptable-name">${escapeHtml(p.name)}${isMe ? ' (Вы)' : ''}</div>
                </div>
                <div class="ptable-card-body">
                    ${traitsHtml}
                    ${isNominated ? '<span class="badge badge-timeout">Выставлен(а)</span>' : ''}
                    ${myNomination === p.id ? '<span class="muted-note">Ваш выбор</span>' : ''}
                    ${canNominate ? `<button class="btn btn-ghost btn-sm" onclick="actionNominate('${p.id}')">Выставить</button>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    const scenPanel = document.getElementById('scenarioPanelGame');
    if (scenPanel) scenPanel.style.display = room.scenario_visible ? 'block' : 'none';
    refreshBunkerList();
    syncGamePhaseTimerTicker();
}

async function actionToggleScenarioVisible() {
    await dbUpdateRoom(state.currentRoomCode, { scenario_visible: !state.room.scenario_visible });
}

// [ИСПРАВЛЕНО 3] Полностью переписана логика отображения карточки и добавлено открытие
async function loadMyCard() {
    const card = await dbFetchMyCard(state.currentRoomCode, state.playerId);
    const el = document.getElementById('myCardPanel');
    if (!el) return;
    
    if (card.length === 0) {
        el.innerHTML = `<h2>Моя карточка</h2><p class="muted-note">Карточка не найдена (генерация ещё не завершилась или пуст character_pool).</p>`;
        return;
    }
    
    const sum = card.reduce((s, c) => s + (c.value || 0), 0);
    el.innerHTML = `<h2>Моя карточка</h2>
        <ul class="prop-list">${card.map(c => {
            const isRevealed = c.revealed;
            const text = isRevealed ? escapeHtml(c.text) : '<i class="muted-note">Скрыто</i>';
            const btn = !isRevealed ? `<button class="btn btn-sm btn-primary" style="margin-top:5px;" onclick="actionRevealTrait('${c.id}')">Открыть</button>` : '';
            return `<li>
                <span class="prop-tag">${escapeHtml(CATEGORY_LABELS[c.category] || c.category)}</span>
                ${text} <span class="muted-note">(${c.value > 0 ? '+' : ''}${c.value})</span>
                ${btn}
            </li>`;
        }).join('')}</ul>
        <p class="muted-note">Сумма баланса карточки: ${sum > 0 ? '+' : ''}${sum} (ориентир — ближе к 0, не строго)</p>
    `;
}

// [ИСПРАВЛЕНО 3] Функция открытия характеристики
async function actionRevealTrait(cardId) {
    // В будущем здесь можно добавить проверку лимита открытий за раунд
    await supabaseClient.from('player_cards').update({ revealed: true }).eq('id', cardId);
    loadMyCard(); // Обновляем свою карточку
    updateGameDynamic(); // Обновляем стол, чтобы все увидели открытую черту
}

async function loadScenarioPanelGame() {
    const room = state.room;
    if (!room.scenario_id) return;
    if (!state.gameScenario || state.gameScenario.scenario?.id !== room.scenario_id) {
        state.gameScenario = await dbFetchScenarioDetail(room.scenario_id);
    }
    renderScenarioPanelGameContent();
    refreshBunkerList();
}

function renderScenarioPanelGameContent() {
    const el = document.getElementById('scenarioPanelGame');
    if (!el || !state.gameScenario || !state.gameScenario.scenario) return;
    const { scenario, base, bonus } = state.gameScenario;
    const revealedIds = state.room.revealed_bonus_ids || [];
    const revealedBonus = (bonus || []).filter(b => revealedIds.includes(b.id));
    el.innerHTML = `
        <h3>${escapeHtml(scenario.title)}</h3>
        <p>${escapeHtml(scenario.catastrophe_description)}</p>
        <h4 style="margin-top:10px;">Стартовые свойства</h4>
        <ul class="prop-list">${base.map(p => `<li><span class="prop-tag">База</span>${escapeHtml(p.text)}</li>`).join('')}</ul>
        ${revealedBonus.length ? `
            <h4 style="margin-top:10px;">Открытые доп. свойства</h4>
            <ul class="prop-list">${revealedBonus.map(p => `<li class="bonus"><span class="prop-tag">Бонус</span>${escapeHtml(p.text)}</li>`).join('')}</ul>
        ` : ''}
    `;
}

function refreshBunkerList() {
    const bunkerEl = document.getElementById('bunkerRevealedList');
    if (!bunkerEl) return;
    const revealedIds = state.room.revealed_bonus_ids || [];
    const bonus = state.gameScenario?.bonus || [];
    const revealedItems = bonus.filter(b => revealedIds.includes(b.id));
    bunkerEl.innerHTML = revealedItems.length
        ? revealedItems.map(b => `<li class="bonus"><span class="prop-tag">Бонус</span>${escapeHtml(b.text)}</li>`).join('')
        : '<li class="muted-note" style="list-style:none;">Пока ничего не открыто.</li>';
}

// ---------- Управление таймером фазы ----------
async function hostStartTimer() {
    const seconds = phaseDuration(state.room.current_phase);
    if (seconds <= 0) return;
    const ends = new Date(Date.now() + seconds * 1000).toISOString();
    await dbUpdateRoom(state.currentRoomCode, { phase_ends_at: ends, phase_running: true, phase_paused_remaining: null });
}

async function hostPauseTimer() {
    const room = state.room;
    if (!room.phase_running || !room.phase_ends_at) return;
    const remaining = Math.max(0, Math.round((new Date(room.phase_ends_at) - Date.now()) / 1000));
    await dbUpdateRoom(state.currentRoomCode, { phase_running: false, phase_ends_at: null, phase_paused_remaining: remaining });
}

async function hostResumeTimer() {
    const remaining = state.room.phase_paused_remaining;
    if (!remaining) return;
    const ends = new Date(Date.now() + remaining * 1000).toISOString();
    await dbUpdateRoom(state.currentRoomCode, { phase_running: true, phase_ends_at: ends, phase_paused_remaining: null });
}

async function hostStopTimer() {
    await dbUpdateRoom(state.currentRoomCode, { phase_running: false, phase_ends_at: null, phase_paused_remaining: null });
}

// ---------- Переход между фазами ----------
async function hostAdvancePhase() {
    const room = state.room;
    const phase = room.current_phase;
    const round = room.current_round || 1;
    const nominees = room.nominees || [];
    const defenseIdx = room.defense_index || 0;

    if (phase === 'defense' && defenseIdx < nominees.length - 1) {
        const seconds = phaseDuration('defense');
        const ends = seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
        await dbUpdateRoom(state.currentRoomCode, {
            defense_index: defenseIdx + 1, phase_ends_at: ends, phase_running: seconds > 0, phase_paused_remaining: null
        });
        return;
    }

    const idx = PHASE_SEQUENCE.indexOf(phase);
    let nextPhase, nextRound = round, nextNominees = nominees, nextNominations = room.nominations || {};
    if (idx === -1 || idx === PHASE_SEQUENCE.length - 1) {
        const totalRounds = room.settings?.rounds || 1;
        if (round >= totalRounds) {
            await dbUpdateRoom(state.currentRoomCode, {
                current_phase: 'awaiting_verdict', phase_ends_at: null, phase_running: false, phase_paused_remaining: null
            });
            return;
        }
        nextPhase = PHASE_SEQUENCE[0];
        nextRound = round + 1;
        nextNominees = [];
        nextNominations = {};
    } else {
        nextPhase = PHASE_SEQUENCE[idx + 1];
    }

    const seconds = phaseDuration(nextPhase);
    const ends = seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
    await dbUpdateRoom(state.currentRoomCode, {
        current_phase: nextPhase, current_round: nextRound, nominees: nextNominees, nominations: nextNominations,
        defense_index: 0, phase_ends_at: ends, phase_running: seconds > 0, phase_paused_remaining: null
    });
}

// ---------- Выставление кандидатов ----------
// [ИСПРАВЛЕНО 5] Добавлена жесткая проверка на ведущего
async function actionNominate(targetId) {
    const room = state.room;
    
    // ЖЕСТКАЯ ЗАЩИТА: Ведущий не игрок
    if (state.playerId === room.host_id) {
        return alert('Ведущий не может участвовать в голосованиях и выставлениях.');
    }

    if (room.current_phase !== 'nomination') return;
    if (targetId === state.playerId) return alert('Нельзя выставить самого себя.');
    if (targetId === room.host_id) return alert('Нельзя выставить ведущего.');
    
    const nominations = { ...(room.nominations || {}) };
    if (nominations[state.playerId]) return alert('Вы уже выставили игрока в этом раунде — изменить нельзя.');
    
    nominations[state.playerId] = targetId;
    const nominees = [...new Set(Object.values(nominations))];
    await dbUpdateRoom(state.currentRoomCode, { nominations, nominees });
}

// ---------- Открытие случайного доп. свойства бункера ----------
async function actionRevealBonus() {
    const room = state.room;
    const active = room.active_bonus_ids || [];
    const revealed = room.revealed_bonus_ids || [];
    const remaining = active.filter(id => !revealed.includes(id));
    if (remaining.length === 0) return alert('Все дополнительные свойства этой партии уже открыты.');
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    await dbUpdateRoom(state.currentRoomCode, { revealed_bonus_ids: [...revealed, pick] });
}

async function actionResetToLobby() {
    stopGamePhaseTick();
    await dbClearCards(state.currentRoomCode);
    await dbUpdateRoom(state.currentRoomCode, {
        phase: 'lobby', countdown_ends_at: null, current_round: 1, current_phase: 'reveal',
        phase_ends_at: null, phase_running: false, phase_paused_remaining: null,
        nominees: [], nominations: {}, defense_index: 0,
        active_bonus_ids: [], revealed_bonus_ids: [], scenario_visible: false
    });
    state.lastRenderedView = null;
    state.lastGameRenderKey = null;
    state.gameScenario = null;
}

// ==========================================
// ДЕЙСТВИЯ ПОЛЬЗОВАТЕЛЯ
// ==========================================
async function actionCreateRoom() {
    const name = document.getElementById('hostName').value.trim();
    if (!name) return alert('Введите ваше имя!');
    if (!dbConnected) return alert('База данных не подключена!');
    try {
        const code = await dbCreateRoom(name);
        state.playerName = name; localStorage.setItem('playerName', name);
        saveRoomCode(code);
        state.view = 'lobby'; state.lastRenderedView = null;
        startPolling();
    } catch (e) {
        alert('Ошибка создания комнаты: ' + (e.message || e));
    }
}

async function actionJoinRoom() {
    const code = document.getElementById('joinCode').value.trim().toUpperCase();
    const name = document.getElementById('joinName').value.trim();
    if (!code || !name) return alert('Заполните оба поля!');
    if (!dbConnected) return alert('База данных не подключена!');
    try {
        await dbJoinRoom(code, name);
        state.playerName = name; localStorage.setItem('playerName', name);
        saveRoomCode(code);
        state.view = 'lobby'; state.lastRenderedView = null;
        startPolling();
    } catch (e) {
        alert(e.message || 'Не удалось войти в комнату.');
    }
}

async function actionLeaveRoom() {
    if (!confirm('Выйти в главное меню?')) return;
    stopPolling();
    const code = state.currentRoomCode;
    const isHost = state.room && state.room.host_id === state.playerId;
    try {
        if (isHost) await supabaseClient.from('rooms').delete().eq('code', code);
        else await supabaseClient.from('players').delete().eq('id', state.playerId).eq('room_code', code);
    } catch (e) { console.error(e); }
    saveRoomCode(null);
    state.room = null; state.players = []; state.lastRenderedView = null;
    renderHome();
}

async function actionToggleReady() {
    const me = state.players.find(p => p.id === state.playerId);
    if (!me) return;
    if (me.timeout_until && new Date(me.timeout_until) > new Date()) return alert('Вы в таймауте, подождите.');
    await dbSetReady(state.currentRoomCode, !me.is_ready);
}

async function actionStartGame() {
    const min = state.room.settings?.min_players || 1;
    if (state.players.length < min) return alert('Недостаточно игроков для старта (минимум ' + min + ').');
    const notReady = state.players.find(p => !p.is_ready);
    if (notReady) return alert(notReady.name + ' ещё не готов(а).');
    const ends = new Date(Date.now() + 10000).toISOString();
    await dbUpdateRoom(state.currentRoomCode, { phase: 'starting', countdown_ends_at: ends });
}

async function actionSaveSettings() {
    const rounds = parseInt(document.getElementById('setRounds').value) || 1;
    const roundTypes = [];
    for (let i = 0; i < rounds; i++) {
        const sel = document.getElementById('roundType_' + i);
        roundTypes.push(sel ? sel.value : 'any');
    }
    const settings = {
        min_players: parseInt(document.getElementById('setMin').value) || 1,
        max_players: parseInt(document.getElementById('setMax').value) || 20,
        target_survivors: parseInt(document.getElementById('setSurvivors').value) || 1,
        rounds,
        round_char_type: roundTypes,
        phase_seconds: {
            discussion: parseInt(document.getElementById('setDiscussion').value) || 180,
            defense: parseInt(document.getElementById('setDefense').value) || 30,
            voting: parseInt(document.getElementById('setVoting').value) || 60
        },
        private_chat_enabled: document.getElementById('setPrivateChat').checked
    };
    await dbUpdateRoom(state.currentRoomCode, { settings });
    alert('Настройки сохранены');
}

async function actionKick(targetId, targetName) {
    if (!confirm('Исключить ' + targetName + '?')) return;
    await dbKickPlayer(state.currentRoomCode, targetId, state.playerId);
}

async function actionToggleMute(targetId, currentlyMuted) {
    await dbSetMute(state.currentRoomCode, targetId, state.playerId, !currentlyMuted);
}

async function actionTimeout(targetId, targetName) {
    const mins = prompt('Таймаут для ' + targetName + ' — на сколько минут?', '2');
    if (!mins) return;
    const seconds = Math.max(10, (parseInt(mins) || 2) * 60);
    await dbTimeoutPlayer(state.currentRoomCode, targetId, state.playerId, seconds);
}

async function actionSendChat() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    const me = state.players.find(p => p.id === state.playerId);
    if (me && me.is_muted) return alert('Вы в муте, писать нельзя.');
    if (me && me.timeout_until && new Date(me.timeout_until) > new Date()) return alert('Вы в таймауте.');
    input.value = '';
    await dbSendChat(state.currentRoomCode, text);
    state.chat = await dbFetchChat(state.currentRoomCode);
    renderChatMessages();
}

function handleChatKey(e) { if (e.key === 'Enter') actionSendChat(); }

// ==========================================
// ЗАПУСК ПРИЛОЖЕНИЯ
// ==========================================
async function init() {
    if (state.currentRoomCode && dbConnected) {
        const room = await dbFetchRoom(state.currentRoomCode);
        if (room) {
            const players = await dbFetchPlayers(state.currentRoomCode);
            const me = players.find(p => p.id === state.playerId);
            if (me) {
                state.room = room; state.players = players;
                state.lastRenderedView = null;
                startPolling();
                return;
            }
        }
        saveRoomCode(null);
    }
    renderHome();
}

init();
