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

const AVATAR_OPTIONS = ['🧑‍🚀','🧑‍⚕️','🧑‍🌾','🧑‍🍳','🧑‍🔬','🧑‍🎨','🧑‍🏫','🧑‍💻','🧑‍🚒','🧑‍✈️','🥷','🧟','🧛','🧙','🦸','🐺','🦊','🐻','🐱','🐧'];
const COLOR_OPTIONS = ['#e9e3d0','#d3a026','#a63d2f','#5b6b48','#5b8a4a','#9b7fd4','#4a90a4','#c97b3d','#7a5c1e','#b04a6a'];

const PHASE_SEQUENCE = ['reveal', 'discussion', 'nomination', 'defense', 'voting', 'vote_result', 'bunker_reveal'];
const PHASE_META = {
    reveal:        { label: 'Открытие раунда',     icon: '🃏', color: '#5b6b48', durationKey: 'reveal' },
    discussion:    { label: 'Обсуждение',           icon: '💬', color: '#5b8a4a', durationKey: 'discussion' },
    nomination:    { label: 'Выставление',          icon: '👉', color: '#d3a026', durationKey: 'discussion' },
    defense:       { label: 'Оправдательная речь',  icon: '🗣️', color: '#a63d2f', durationKey: 'defense' },
    voting:        { label: 'Голосование',          icon: '🗳️', color: '#7a5c1e', durationKey: 'voting' },
    vote_result:   { label: 'Итог голосования',     icon: '📋', color: '#a63d2f', durationKey: null },
    bunker_reveal: { label: 'Открытие бункера',     icon: '🔓', color: '#4a4e28', durationKey: null },
    awaiting_verdict: { label: 'Раунды завершены',  icon: '⏳', color: '#8a6b1d', durationKey: null },
    finished:      { label: 'Вердикт вынесен',      icon: '🏁', color: '#5b8a4a', durationKey: null }
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
    gameScenario: null,
    gameChatRecipient: null,
    cardsGenerationInFlight: false
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
        round_reveals: Array(6).fill(['any']),
        phase_seconds: { reveal: 60, discussion: 180, defense: 30, voting: 60 },
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

async function dbFetchPrivateChat(roomCode, myId, otherId) {
    const { data, error } = await supabaseClient.from('chat_messages')
        .select('*').eq('room_code', roomCode)
        .or(`and(sender_id.eq.${myId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${myId})`)
        .order('created_at', { ascending: true }).limit(100);
    if (error) { console.error(error); return []; }
    return data || [];
}

async function dbSendPrivateChat(roomCode, senderId, recipientId, text) {
    const { error } = await supabaseClient.from('chat_messages').insert({ room_code: roomCode, sender_id: senderId, recipient_id: recipientId, text });
    if (error) console.error('Ошибка отправки личного сообщения:', error);
}

async function dbUpdateRoom(code, patch) {
    const { error } = await supabaseClient.from('rooms').update(patch).eq('code', code);
    if (error) console.error(error);
}

async function dbSetReady(code, ready) {
    await supabaseClient.from('players').update({ is_ready: ready }).eq('id', state.playerId).eq('room_code', code);
}

// ---------- Выбор места за столом (номер сохраняется у игрока и виден в лобби и в игре) ----------
async function dbSetSeat(roomCode, playerId, seatNumber) {
    const { error } = await supabaseClient.from('players').update({ seat_number: seatNumber }).eq('id', playerId).eq('room_code', roomCode);
    if (error) console.error('Ошибка выбора места:', error);
}

async function actionPickSeat(seatNumber) {
    const taken = state.players.find(p => p.seat_number === seatNumber && p.id !== state.playerId);
    if (taken) return alert('Это место уже занято.');
    await dbSetSeat(state.currentRoomCode, state.playerId, seatNumber);
}

function renderSeatPicker(room) {
    const maxSeats = room.settings?.max_players || 12;
    let html = '<div class="seat-grid">';
    for (let i = 1; i <= maxSeats; i++) {
        const occupant = state.players.find(p => p.seat_number === i);
        const isMe = occupant && occupant.id === state.playerId;
        const label = occupant ? escapeHtml(occupant.name) : ('Место ' + i);
        const cls = isMe ? 'btn-primary' : 'btn-ghost';
        const disabled = (occupant && !isMe) ? 'disabled' : '';
        html += `<button class="btn btn-sm ${cls}" ${disabled} onclick="actionPickSeat(${i})">${i}. ${label}</button>`;
    }
    html += '</div>';
    return html;
}

// ---------- Кастомизация (аватар + цвета) — задаётся в лобби, действует и в игре ----------
async function dbSetCustomization(roomCode, playerId, patch) {
    const { error } = await supabaseClient.from('players').update(patch).eq('id', playerId).eq('room_code', roomCode);
    if (error) console.error('Ошибка сохранения кастомизации:', error);
}
async function actionSetAvatar(a) { await dbSetCustomization(state.currentRoomCode, state.playerId, { avatar: a }); }
async function actionSetColor(c) { await dbSetCustomization(state.currentRoomCode, state.playerId, { color: c }); }
async function actionSetOutlineColor(c) { await dbSetCustomization(state.currentRoomCode, state.playerId, { outline_color: c }); }

function renderCustomizationPicker() {
    const me = state.players.find(p => p.id === state.playerId) || {};
    const avatarsHtml = AVATAR_OPTIONS.map(a =>
        `<button class="btn btn-sm ${me.avatar === a ? 'btn-primary' : 'btn-ghost'}" onclick="actionSetAvatar('${a}')" style="font-size:18px; padding:6px 10px;">${a}</button>`
    ).join('');
    const swatches = (current, setter) => COLOR_OPTIONS.map(c =>
        `<button onclick="${setter}('${c}')" title="${c}" style="width:28px; height:28px; border-radius:50%; background:${c}; border:2px solid ${current === c ? 'var(--paper)' : 'transparent'}; cursor:pointer; margin:3px; padding:0;"></button>`
    ).join('');
    return `
        <h3 style="margin-top:4px;">Аватар</h3>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">${avatarsHtml}</div>
        <h3 style="margin-top:12px;">Цвет ника</h3>
        <div style="display:flex; flex-wrap:wrap;">${swatches(me.color, 'actionSetColor')}</div>
        <h3 style="margin-top:12px;">Цвет обводки карточки</h3>
        <div style="display:flex; flex-wrap:wrap;">${swatches(me.outline_color, 'actionSetOutlineColor')}</div>
    `;
}

function avatarChip(p) {
    return `<div class="ptable-avatar" style="border-color:${p.outline_color || '#4a4e28'};">${p.avatar || ''}</div>`;
}
function nameColorStyle(p) {
    return p.color ? `color:${p.color};` : '';
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

// ---------- Готовые карточки персонажей (привязаны к сценарию) ----------
async function dbFetchPresetsForScenario(scenarioId) {
    const { data, error } = await supabaseClient.from('preset_characters').select('id,label').eq('scenario_id', scenarioId);
    if (error) { console.error('Ошибка загрузки готовых карточек:', error); return []; }
    return data || [];
}

async function dbFetchScenarioIdsWithPresets() {
    const { data, error } = await supabaseClient.from('preset_characters').select('scenario_id');
    if (error) { console.error(error); return new Set(); }
    return new Set((data || []).map(r => r.scenario_id));
}

async function dbFetchPresetTraits(presetId) {
    const { data, error } = await supabaseClient.from('preset_character_traits').select('*').eq('preset_id', presetId);
    if (error) { console.error(error); return []; }
    return data || [];
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

// ---------- Личные заметки игрока (приватные) ----------
async function dbFetchNote(roomCode, playerId) {
    const { data, error } = await supabaseClient.from('notes')
        .select('*').eq('room_code', roomCode).eq('player_id', playerId).maybeSingle();
    if (error) { console.error(error); return null; }
    return data;
}

async function dbSaveNote(roomCode, playerId, text) {
    const { error } = await supabaseClient.from('notes')
        .upsert({ room_code: roomCode, player_id: playerId, text, updated_at: new Date().toISOString() }, { onConflict: 'room_code,player_id' });
    if (error) console.error('Ошибка сохранения заметки:', error);
}

// ---------- Ивенты ведущего ----------
async function dbFetchEvents(roomCode) {
    const { data, error } = await supabaseClient.from('game_events')
        .select('*').eq('room_code', roomCode).order('created_at', { ascending: false }).limit(30);
    if (error) { console.error(error); return []; }
    return data || [];
}

async function dbInsertEvent(roomCode, round, type, text, targetId, isPrivate) {
    const { error } = await supabaseClient.from('game_events').insert({
        room_code: roomCode, round, type, text, target_id: targetId || null, private: !!isPrivate
    });
    if (error) console.error('Ошибка записи события:', error);
}

async function dbClearEvents(roomCode) {
    const { error } = await supabaseClient.from('game_events').delete().eq('room_code', roomCode);
    if (error) console.error('Ошибка очистки game_events:', error);
}

// ---------- Голосование ----------
async function dbClearVotes(roomCode) {
    const { error } = await supabaseClient.from('votes').delete().eq('room_code', roomCode);
    if (error) console.error('Ошибка очистки votes:', error);
}

async function dbFetchMyVote(roomCode, round, voterId) {
    const { data, error } = await supabaseClient.from('votes')
        .select('target_id').eq('room_code', roomCode).eq('round', round).eq('voter_id', voterId).maybeSingle();
    if (error) { console.error(error); return null; }
    return data ? data.target_id : null;
}

async function dbFetchVoteCount(roomCode, round) {
    const { count, error } = await supabaseClient.from('votes')
        .select('voter_id', { count: 'exact', head: true }).eq('room_code', roomCode).eq('round', round);
    if (error) { console.error(error); return 0; }
    return count || 0;
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

// Готовые карточки персонажей, привязанные к сценарию. Если пресетов не хватает на всех
// игроков — оставшимся генерируем случайно (по той же логике, что и обычный режим),
// чтобы нехватка контента не блокировала старт игры.
async function assignPresetCardsForRoom(roomCode, players, hostId, scenarioId) {
    const already = await dbCardsExist(roomCode);
    if (already) return;

    const eligible = players.filter(p => p.id !== hostId);
    const presets = await dbFetchPresetsForScenario(scenarioId);

    if (presets.length === 0) {
        console.error('У сценария нет готовых карточек — переключаюсь на случайную генерацию.');
        return generateCardsForRoom(roomCode, players, hostId);
    }

    const shuffledPresets = shuffleArray(presets);
    const shuffledPlayers = shuffleArray(eligible);
    let pool = null; // подтягиваем только если реально понадобится (не хватило пресетов)

    for (let i = 0; i < shuffledPlayers.length; i++) {
        const p = shuffledPlayers[i];
        if (i < shuffledPresets.length) {
            const traits = await dbFetchPresetTraits(shuffledPresets[i].id);
            const rows = traits.map(t => ({
                room_code: roomCode, player_id: p.id, category: t.category,
                pool_id: null, text: t.text, value: t.value, revealed: false
            }));
            const { error } = await supabaseClient.from('player_cards').insert(rows);
            if (error) console.error('Ошибка назначения готовой карточки игроку ' + p.id + ':', error);
        } else {
            if (pool === null) pool = await dbFetchCharacterPool();
            if (pool.length > 0) {
                const card = generateBalancedCard(pool);
                await dbInsertPlayerCard(roomCode, p.id, card);
            }
        }
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
        } else if (room.countdown_ends_at && new Date(room.countdown_ends_at) <= new Date() && !state.cardsGenerationInFlight) {
            // [ФИКС] pollTick идёт раз в 2 сек; если генерация карточек (несколько последовательных
            // insert-запросов) не успевает уложиться в 2 сек — что гораздо вероятнее на медленном/мобильном
            // соединении, чем на десктопном wifi — следующий тик мог повторно войти сюда, пока room.phase
            // в БД ещё не сменился на 'game'. Это давало параллельную генерацию и конфликт unique-constraint
            // на part игроков, у которых insert проигрывал гонку — карточка у них просто не появлялась.
            state.cardsGenerationInFlight = true;
            try {
                // [ИСПРАВЛЕНО 1] Передаем host_id в генератор карт
                if (room.card_mode === 'preset') {
                    await assignPresetCardsForRoom(state.currentRoomCode, players, room.host_id, room.scenario_id);
                } else {
                    await generateCardsForRoom(state.currentRoomCode, players, room.host_id);
                }
                const activeBonusIds = await selectActiveBonusIds(room.scenario_id, players.length);
                // [ФИКС] room 1-й фазы "reveal" никогда не получал таймер, даже если он задан в настройках —
                // отсюда впечатление, что настройки таймеров вообще не влияют на игру.
                const revealSeconds = phaseDuration('reveal');
                const revealEnds = revealSeconds > 0 ? new Date(Date.now() + revealSeconds * 1000).toISOString() : null;
                await dbUpdateRoom(state.currentRoomCode, {
                    phase: 'game', current_round: 1, current_phase: 'reveal',
                    phase_ends_at: revealEnds, phase_running: revealSeconds > 0, phase_paused_remaining: null,
                    nominees: [], nominations: {}, defense_index: 0, reveal_index: 0,
                    active_bonus_ids: activeBonusIds, revealed_bonus_ids: []
                });
                room.phase = 'game';
            } finally {
                state.cardsGenerationInFlight = false;
            }
        }
    }

    state.view = room.phase === 'game' ? 'game' : 'lobby';
    if (state.view === 'lobby') {
        state.chat = await dbFetchChat(state.currentRoomCode);
        if (state.lastRenderedView !== 'lobby') { renderLobby(); state.lastRenderedView = 'lobby'; }
        else updateLobbyDynamic();
    } else if (state.view === 'game') {
        const key = room.current_phase + '|' + room.current_round + '|' + (room.defense_index || 0) + '|' + (room.reveal_index || 0);
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
            <div id="scenarioDetailBtn">${(room.scenario_id && isHost) ? `<button class="btn btn-ghost btn-sm" onclick="openScenarioDetail('${room.scenario_id}')">Подробнее</button>` : ''}</div>
        </div>
        <div class="panel" id="settingsPanel">
            <h2>Настройки игры</h2>
            <div id="settingsContent">${isHost ? renderSettingsEditable(settings) : renderSettingsReadonly(settings)}</div>
        </div>
        <div class="panel">
            <h2>Кастомизация</h2>
            <p class="muted-note">Аватар и цвета будут видны и в лобби, и за столом в игре.</p>
            <div id="customizationPicker">${renderCustomizationPicker()}</div>
        </div>
        <div class="panel">
            <h2>Выбор места</h2>
            <p class="muted-note">Номер места будет виден рядом с вашим именем в лобби и в игре.</p>
            <div id="seatPicker">${renderSeatPicker(room)}</div>
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
    if (isHost) regenerateRoundBlocks();
    state.lastSeenSettings = JSON.stringify(settings);
    state.lastSeenScenarioId = room.scenario_id;
    updateLobbyDynamic();
}

function renderSettingsEditable(s) {
    return `
        <div class="settings-grid">
            <div class="settings-field"><label>Мин. игроков</label><input type="number" min="1" id="setMin" value="${s.min_players ?? 4}"></div>
            <div class="settings-field"><label>Макс. игроков</label><input type="number" min="1" id="setMax" value="${s.max_players ?? 12}"></div>
            <div class="settings-field"><label>Нужно выживших</label><input type="number" min="1" id="setSurvivors" value="${s.target_survivors ?? 3}"></div>
            <div class="settings-field"><label>Кол-во раундов</label><input type="number" min="1" id="setRounds" value="${s.rounds ?? 6}" onchange="regenerateRoundBlocks()"></div>
            <div class="settings-field"><label>Открытие, сек</label><input type="number" min="1" id="setReveal" value="${s.phase_seconds?.reveal ?? 60}"></div>
            <div class="settings-field"><label>Обсуждение, сек</label><input type="number" min="1" id="setDiscussion" value="${s.phase_seconds?.discussion ?? 180}"></div>
            <div class="settings-field"><label>Оправдание, сек</label><input type="number" min="1" id="setDefense" value="${s.phase_seconds?.defense ?? 30}"></div>
            <div class="settings-field"><label>Голосование, сек</label><input type="number" min="1" id="setVoting" value="${s.phase_seconds?.voting ?? 60}"></div>
            <div class="settings-field wide">
                <label><input type="checkbox" id="setPrivateChat" style="width:auto;display:inline-block;margin-right:6px;vertical-align:middle;" ${s.private_chat_enabled ? 'checked' : ''}>Разрешить личные чаты между игроками</label>
            </div>
        </div>
        <h3 style="margin-top:14px;">Характеристики по раундам</h3>
        <p class="muted-note">На каждый раунд — сколько характеристик можно открыть и какого типа каждая (любая или конкретная категория).</p>
        <div id="roundBlocksContainer"></div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="actionSaveSettings()">Сохранить настройки</button>
    `;
}

function renderSettingsReadonly(s) {
    const roundSummary = (s.round_reveals || []).map((slots, i) => {
        const labels = (slots || []).map(t => t === 'any' ? 'любая' : (CATEGORY_LABELS[t] || t));
        return `Раунд ${i + 1}: ${labels.length} (${labels.join(', ')})`;
    }).join(' · ');
    return `
        <div class="readonly-settings">
            Игроков: ${s.min_players ?? '?'}–${s.max_players ?? '?'} · Нужно выживших: ${s.target_survivors ?? '?'}<br>
            Раундов: ${s.rounds ?? '?'}<br>
            ${roundSummary ? '<div class="muted-note">' + roundSummary + '</div>' : ''}
            Фазы: открытие ${s.phase_seconds?.reveal ?? '?'}с · обсуждение ${s.phase_seconds?.discussion ?? '?'}с · оправдание ${s.phase_seconds?.defense ?? '?'}с · голосование ${s.phase_seconds?.voting ?? '?'}с<br>
            Личные чаты: ${s.private_chat_enabled ? 'включены' : 'выключены'}
        </div>
    `;
}

function regenerateRoundBlocks() {
    const roundsInput = document.getElementById('setRounds');
    if (!roundsInput) return;
    const rounds = Math.max(1, parseInt(roundsInput.value) || 1);
    const container = document.getElementById('roundBlocksContainer');
    const current = state.room?.settings?.round_reveals || [];
    let html = '';
    for (let i = 0; i < rounds; i++) {
        const count = (current[i] && current[i].length) || 1;
        html += `<div style="background:var(--void); border-radius:4px; padding:8px 10px; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:10px;">
                <strong style="width:80px; flex-shrink:0;">Раунд ${i + 1}</strong>
                <label class="muted-note">характеристик: <input type="number" min="1" max="10" id="roundCount_${i}" value="${count}" onchange="regenerateRoundSlots(${i})" style="width:60px; display:inline-block; margin:0 0 0 4px;"></label>
            </div>
            <div id="roundSlots_${i}" style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;"></div>
        </div>`;
    }
    container.innerHTML = html;
    for (let i = 0; i < rounds; i++) regenerateRoundSlots(i, current[i]);
}

function regenerateRoundSlots(i, presetSlots) {
    const countInput = document.getElementById('roundCount_' + i);
    if (!countInput) return;
    const count = Math.max(1, Math.min(10, parseInt(countInput.value) || 1));
    const container = document.getElementById('roundSlots_' + i);
    if (!container) return;
    const current = presetSlots || (state.room?.settings?.round_reveals?.[i]) || [];
    let html = '';
    for (let j = 0; j < count; j++) {
        const val = current[j] || 'any';
        html += `<select id="roundSlot_${i}_${j}" style="width:auto; margin:0;">` +
            `<option value="any" ${val === 'any' ? 'selected' : ''}>Любая</option>` +
            CATEGORY_LIST.map(c => `<option value="${c}" ${val === c ? 'selected' : ''}>${CATEGORY_LABELS[c]}</option>`).join('') +
            `</select>`;
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

    const seatEl = document.getElementById('seatPicker');
    if (seatEl) seatEl.innerHTML = renderSeatPicker(room);

    const customEl = document.getElementById('customizationPicker');
    if (customEl) customEl.innerHTML = renderCustomizationPicker();

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
            if (room.scenario_id) {
                if (summaryEl) summaryEl.textContent = 'Загрузка...';
                loadScenarioSummary(room.scenario_id);
            } else {
                if (summaryEl) summaryEl.textContent = 'Сценарий ещё не выбран.';
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
            <span style="display:flex; align-items:center; gap:8px;">
                ${p.avatar ? `<span style="font-size:18px;">${p.avatar}</span>` : ''}
                <span class="player-name" style="${nameColorStyle(p)}">${p.seat_number ? '№' + p.seat_number + ' ' : ''}${escapeHtml(p.name)}${isMe ? ' (Вы)' : ''}</span>
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
    const modeLabel = state.room?.card_mode === 'preset' ? ' (готовые карточки)' : ' (случайная генерация)';
    if (el && scenario) el.textContent = scenario.title + modeLabel;
}

// ==========================================
// РЕНДЕР: КАТАЛОГ СЦЕНАРИЕВ
// ==========================================
async function openCatalog() {
    stopPolling();
    state.view = 'catalog';
    state.catalog = await dbFetchScenarios();
    state.catalogPresetIds = await dbFetchScenarioIdsWithPresets();
    renderCatalog();
}

function renderCatalog() {
    const presetIds = state.catalogPresetIds || new Set();
    document.getElementById('app').innerHTML = `
        <h1>ОСТАТЬСЯ <span>В ЖИВЫХ</span></h1>
        <div class="hazard-strip"></div>
        <button class="btn btn-ghost" onclick="backToLobby()">← Назад в лобби</button>
        <h2 style="margin-top:16px;">Каталог сценариев</h2>
        ${state.catalog.length === 0 ? '<p class="muted-note">Сценариев пока нет в базе.</p>' : ''}
        ${state.catalog.map(s => `<div class="scenario-card" onclick="openScenarioDetail('${s.id}')">
            <h3 style="margin:0;">${escapeHtml(s.title)}</h3>
            ${presetIds.has(s.id) ? '<p class="muted-note" style="margin-top:4px;">🎭 есть готовые карточки персонажей</p>' : ''}
        </div>`).join('')}
    `;
}

async function openScenarioDetail(id) {
    if (!state.room || state.room.host_id !== state.playerId) return;
    stopPolling();
    state.view = 'scenarioDetail';
    state.viewingScenario = await dbFetchScenarioDetail(id);
    state.viewingPresets = await dbFetchPresetsForScenario(id);
    renderScenarioDetail();
}

function renderScenarioDetail() {
    const { scenario, base, bonus } = state.viewingScenario;
    const presets = state.viewingPresets || [];
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
        ${presets.length > 0 ? `<div class="panel">
            <h3>Готовые карточки персонажей (${presets.length} шт.)</h3>
            <p class="muted-note">У этого сценария есть заранее написанные карточки. Если игроков больше, чем готовых карточек — остальным сгенерируются случайные.</p>
            <ul class="prop-list">${presets.map(pr => `<li>${escapeHtml(pr.label)}</li>`).join('')}</ul>
        </div>` : ''}
        ${isHost ? `
            <button class="btn btn-primary" onclick="confirmScenario('${scenario.id}', 'random')">Выбрать этот сценарий (случайная генерация)</button>
            ${presets.length > 0 ? `<button class="btn btn-primary" onclick="confirmScenario('${scenario.id}', 'preset')" style="margin-left:8px;">Выбрать с готовыми карточками</button>` : ''}
        ` : ''}
    `;
}

async function confirmScenario(id, cardMode) {
    await dbUpdateRoom(state.currentRoomCode, { scenario_id: id, card_mode: cardMode || 'random' });
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
    if (room.current_phase === 'awaiting_verdict' || room.current_phase === 'finished') {
        renderFinalPhaseTable();
        return;
    }
    const isHost = room.host_id === state.playerId;
    const meta = PHASE_META[room.current_phase] || { label: room.current_phase, icon: '❔', color: '#555', durationKey: null };
    const hasTimer = !!meta.durationKey;
    const nominees = room.nominees || [];
    const defenseIdx = room.defense_index || 0;
    const nominations = room.nominations || {};
    const myNomination = nominations[state.playerId];

    let phaseBody = '';
    if (room.current_phase === 'reveal') {
        const revealOrder = state.players.filter(p => p.id !== room.host_id);
        const revealIdx = room.reveal_index || 0;
        const active = revealOrder[revealIdx];
        const isMyTurn = active && active.id === state.playerId;
        phaseBody = `<p>Сейчас открывает характеристики: <strong>${escapeHtml(active ? active.name : '—')}</strong> (${revealOrder.length ? revealIdx + 1 : 0} из ${revealOrder.length})</p>` +
            (isMyTurn
                ? '<p class="muted-note">Ваш ход — откройте характеристики на своей карточке ниже.</p>'
                : '<p class="muted-note">Дождитесь своей очереди, чтобы открыть характеристики.</p>');
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
        const iAmHost = state.playerId === room.host_id;
        phaseBody = `<p>Кандидаты: <strong>${names || 'нет выставленных'}</strong></p>
            <p class="muted-note">Голосование слепое — выбор нельзя изменить. <span id="voteProgress"></span></p>` +
            (iAmHost ? '' : (state.myVoteThisRound
                ? '<p class="muted-note">Вы проголосовали.</p>'
                : '<p class="muted-note">Выберите, за кого голосовать, кнопкой на карточке кандидата в столе ниже.</p>'));
    } else if (room.current_phase === 'vote_result') {
        if (room.last_eliminated_id) {
            const elim = state.players.find(p => p.id === room.last_eliminated_id);
            phaseBody = `<p><strong>${escapeHtml(elim ? elim.name : 'Игрок')}</strong> исключён(а) по итогам голосования.</p>`;
        } else {
            phaseBody = `<p class="muted-note">Голосование завершилось без исключения — никто не набрал голосов.</p>`;
        }
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
                <div class="panel">
                    <h2>Хроника событий</h2>
                    <ul class="prop-list events-feed" id="eventsFeed"><li class="muted-note">Пока ничего не произошло.</li></ul>
                </div>
            </div>
            <div class="game-main">
                <div class="panel">
                    <h2>Стол</h2>
                    <div id="hostStrip"></div>
                    <div class="ptable-grid" id="gamePlayersList"></div>
                </div>
                ${isHost ? renderHostToolsPanel(room) : `<div class="panel" id="myCardPanel">
                    <h2>Моя карточка</h2>
                    <p class="muted-note">Загрузка...</p>
                </div>`}
            </div>
        </div>
        ${renderGameChatPanel(room)}
        ${isHost ? `<button class="btn btn-ghost" style="margin-top:16px;" onclick="actionResetToLobby()">Сбросить в лобби (для теста)</button>` : ''}
    `;
    if (!isHost) loadMyCard();
    loadScenarioPanelGame();
    refreshEventsFeed();
    refreshGameChat();
    loadMyVoteStatus();
    updateGameDynamic();
}

// [Финальная фаза] Стол — единственное функциональное поле на экране:
// ведущий и оставшиеся (выбывшие тоже видны, но серые) до момента оглашения вердикта.
function renderFinalPhaseTable() {
    const room = state.room;
    const isHost = room.host_id === state.playerId;
    const meta = PHASE_META[room.current_phase] || { label: room.current_phase, icon: '❔', color: '#555' };

    let phaseBody = '';
    if (room.current_phase === 'awaiting_verdict') {
        const alive = state.players.filter(p => p.id !== room.host_id && p.is_alive !== false);
        phaseBody = `<p>Финальный раунд. Оставшиеся: <strong>${alive.map(p => escapeHtml(p.name)).join(', ') || 'никто'}</strong></p>` +
            (isHost
                ? '<p class="muted-note">Выслушайте вслух аргументы игроков об их шансах и вынесите вердикт.</p>'
                : (room.final_reveal_unlocked
                    ? '<p class="muted-note">Можно открыть последнюю характеристику — кнопка на своей карточке за столом ниже.</p>'
                    : '<p class="muted-note">Обсудите с ведущим вслух свои шансы на выживание.</p>'));
    } else {
        const survivors = state.players.filter(p => p.id !== room.host_id && p.is_alive !== false);
        const verdictLabel = room.verdict === 'victory' ? '🏆 ПОБЕДА' : (room.verdict === 'defeat' ? '💀 ПОРАЖЕНИЕ' : '');
        phaseBody = `<p style="font-size:22px; margin-bottom:6px;">${verdictLabel}</p><p>Выжившие: <strong>${survivors.map(p => escapeHtml(p.name)).join(', ') || 'никто'}</strong></p>`;
    }

    let hostControls = '';
    if (isHost && room.current_phase === 'awaiting_verdict') {
        hostControls = `
            <div class="settings-field wide" style="margin-top:10px;">
                <label><input type="checkbox" id="finalRevealToggle" onchange="actionToggleFinalReveal()" ${room.final_reveal_unlocked ? 'checked' : ''} style="width:auto;display:inline-block;margin-right:6px;vertical-align:middle;">Разрешить игрокам открыть последнюю характеристику</label>
            </div>
            <div style="margin-top:10px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                <button class="btn ${room.verdict === 'victory' ? 'btn-primary' : 'btn-ghost'}" onclick="actionSetVerdictChoice('victory')">Победа</button>
                <button class="btn ${room.verdict === 'defeat' ? 'btn-danger' : 'btn-ghost'}" onclick="actionSetVerdictChoice('defeat')">Поражение</button>
            </div>
            <div style="margin-top:8px;">
                <input type="number" id="verdictPercent" placeholder="Шанс выжить" min="0" max="100" value="${room.verdict_percent ?? ''}" style="width:140px; display:inline-block; margin:0;"> %
            </div>
            <p class="muted-note" style="margin-top:6px;">Кнопки и процент видны только вам, игроки их не видят.</p>
            <button class="btn btn-danger btn-sm" style="margin-top:10px;" onclick="actionAnnounceVerdict()">Огласить вердикт</button>
        `;
    }

    document.getElementById('app').innerHTML = `
        <h1>ОСТАТЬСЯ <span>В ЖИВЫХ</span></h1>
        <div class="hazard-strip"></div>
        <div class="panel" style="border-left:6px solid ${meta.color}; text-align:center;">
            <div style="font-size:14px; letter-spacing:0.08em; text-transform:uppercase; color:${meta.color};">${meta.icon} ${escapeHtml(meta.label)}</div>
            ${phaseBody}
            ${hostControls}
        </div>
        <div class="panel">
            <h2>Стол</h2>
            <div id="hostStrip"></div>
            <div class="ptable-grid" id="gamePlayersList"></div>
        </div>
        ${isHost ? `<button class="btn btn-ghost" style="margin-top:16px;" onclick="actionResetToLobby()">Сбросить в лобби (для теста)</button>` : ''}
    `;
    loadMyCard(); // держим кэш карточки свежим — нужен для кнопки открытия последней характеристики на столе
    updateGameDynamic();
}

function renderGameChatPanel(room) {
    const privateEnabled = !!room.settings?.private_chat_enabled;
    const others = state.players.filter(p => p.id !== state.playerId);
    return `<div class="panel">
        <div class="section-title"><h2>Чат</h2>
            ${privateEnabled ? `<select id="gameChatRecipient" onchange="switchGameChatRecipient()" style="width:auto; margin:0;">
                <option value="">Общий чат</option>
                ${others.map(p => `<option value="${p.id}" ${state.gameChatRecipient === p.id ? 'selected' : ''}>${escapeHtml(p.name)}${p.id === room.host_id ? ' (Ведущий)' : ''}</option>`).join('')}
            </select>` : ''}
        </div>
        <div class="chat-box">
            <div class="chat-messages" id="gameChatMessages"></div>
            <div class="chat-input-row">
                <input id="gameChatInput" placeholder="Сообщение..." onkeydown="handleGameChatKey(event)">
                <button class="btn btn-primary btn-sm" onclick="actionSendGameChat()">➤</button>
            </div>
        </div>
    </div>`;
}

function renderHostToolsPanel(room) {
    const targets = state.players.filter(p => p.id !== room.host_id);
    return `<div class="panel" id="hostToolsPanel">
        <h2>Панель ведущего</h2>
        <p class="muted-note">Личной карточки у ведущего нет — вместо неё инструменты, которые влияют на ход игры.</p>

        <h3 style="margin-top:14px;">Составить событие</h3>
        <div class="settings-grid">
            <div class="settings-field">
                <label>Кому</label>
                <select id="eventTarget">
                    <option value="">Всем игрокам</option>
                    ${targets.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
                </select>
            </div>
            <div class="settings-field">
                <label>Тон</label>
                <select id="eventType">
                    <option value="neutral">Нейтральное</option>
                    <option value="positive">Позитивное</option>
                    <option value="negative">Негативное</option>
                </select>
            </div>
        </div>
        <input id="eventText" placeholder="Текст события, который увидят игроки...">
        <button class="btn btn-primary btn-sm" onclick="actionSendEvent()">Отправить событие</button>

        <h3 style="margin-top:16px;">Быстрые ивенты</h3>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" onclick="actionQuickEvent('find')">⚡ Внеплановая находка</button>
            <button class="btn btn-ghost btn-sm" onclick="actionQuickEvent('incident')">💥 ЧП в бункере</button>
        </div>
        <p class="muted-note" style="margin-top:8px;">«Находка» досрочно открывает ещё одно бонусное свойство бункера. «ЧП» на 60 секунд отнимает возможность говорить в чате у случайного игрока.</p>
    </div>`;
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
    const advanceButton = `<button class="btn btn-danger btn-sm" onclick="hostAdvancePhase()">Далее →</button>`;
    return `<div style="margin-top:12px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;"> ${timerButtons} ${advanceButton} </div>`;
}

// [ИСПРАВЛЕНО 4] Функция стала async, чтобы подтягивать открытые характеристики
async function updateGameDynamic() {
    const room = state.room;
    if (!room) return;
    const nominees = room.nominees || [];
    const defenseIdx = room.defense_index || 0;
    const revealIdx = room.reveal_index || 0;
    const revealOrder = state.players.filter(p => p.id !== room.host_id);
    const revealActiveId = (revealOrder[revealIdx] || {}).id;
    const nominations = room.nominations || {};
    const myNomination = nominations[state.playerId];

    // Подтягиваем открытые характеристики всех игроков
    const revealedTraits = await fetchRevealedTraits();

    const hostP = state.players.find(p => p.id === room.host_id);
    const hostEl = document.getElementById('hostStrip');
    if (hostEl) {
        hostEl.innerHTML = hostP ? `<div class="host-strip">
            ${avatarChip(hostP)}
            <div style="flex:1;"><span class="player-name" style="${nameColorStyle(hostP)}">${hostP.seat_number ? '№' + hostP.seat_number + ' ' : ''}${escapeHtml(hostP.name)}${hostP.id === state.playerId ? ' (Вы)' : ''}</span></div>
            <span class="host-badge">Ведущий</span>
        </div>` : '';
    }

    const listEl = document.getElementById('gamePlayersList');
    if (listEl) {
        listEl.innerHTML = state.players.filter(p => p.id !== room.host_id).map(p => {
            const isMe = p.id === state.playerId;
            const isEliminated = p.is_alive === false;
            const isNominated = nominees.includes(p.id);
            const isSpeaking = (room.current_phase === 'defense' && nominees[defenseIdx] === p.id) ||
                                (room.current_phase === 'reveal' && revealActiveId === p.id);

            const canNominate = room.current_phase === 'nomination' && !isMe && !myNomination && state.playerId !== room.host_id && !isEliminated;
            const canVote = room.current_phase === 'voting' && !isMe && isNominated && state.playerId !== room.host_id && !state.myVoteThisRound;

            // Рендерим открытые характеристики
            const traitsHtml = (revealedTraits[p.id] || []).map(t => 
                `<div style="font-size:11px; color:#b7b190; margin-top:2px;"><b>${t.cat}:</b> ${escapeHtml(t.text)}</div>`
            ).join('');

            // [Финальная фаза] Открытие последней скрытой характеристики — прямо в своей карточке на столе
            let finalRevealHtml = '';
            if (room.current_phase === 'awaiting_verdict' && isMe && !isEliminated) {
                const hidden = (state.myCardCache || []).filter(c => !c.revealed);
                if (hidden.length > 0) {
                    finalRevealHtml = room.final_reveal_unlocked
                        ? hidden.map(c => `<button class="btn btn-sm btn-primary" style="margin-top:4px;" onclick="actionRevealTrait('${c.id}')">Открыть: ${escapeHtml(CATEGORY_LABELS[c.category] || c.category)}</button>`).join('')
                        : '<div class="muted-note" style="font-size:11px; margin-top:4px;">Ждите разрешения ведущего</div>';
                }
            }

            return `<div class="ptable-card${isSpeaking ? ' speaking' : ''}${isNominated ? ' nominated' : ''}${isEliminated ? ' eliminated' : ''}">
                <div class="ptable-card-head">
                    ${avatarChip(p)}
                    <div class="ptable-name" style="${nameColorStyle(p)}">${p.seat_number ? '№' + p.seat_number + ' ' : ''}${escapeHtml(p.name)}${isMe ? ' (Вы)' : ''}</div>
                </div>
                <div class="ptable-card-body">
                    ${traitsHtml}
                    ${isEliminated ? '<span class="badge badge-muted">Выбыл(а)</span>' : ''}
                    ${isNominated && !isEliminated ? '<span class="badge badge-timeout">Выставлен(а)</span>' : ''}
                    ${myNomination === p.id ? '<span class="muted-note">Ваш выбор</span>' : ''}
                    ${canNominate ? `<button class="btn btn-ghost btn-sm" onclick="actionNominate('${p.id}')">Выставить</button>` : ''}
                    ${state.myVoteThisRound === p.id ? '<span class="muted-note">Ваш голос</span>' : ''}
                    ${canVote ? `<button class="btn btn-ghost btn-sm" onclick="actionCastVote('${p.id}')">Голосовать</button>` : ''}
                    ${finalRevealHtml}
                </div>
            </div>`;
        }).join('');
    }

    loadVoteProgress();

    const scenPanel = document.getElementById('scenarioPanelGame');
    if (scenPanel) scenPanel.style.display = room.scenario_visible ? 'block' : 'none';
    refreshBunkerList();
    refreshEventsFeed();
    refreshGameChat();
    syncGamePhaseTimerTicker();
}

// ---------- Чат в игре: общий + личные каналы ----------
function switchGameChatRecipient() {
    const sel = document.getElementById('gameChatRecipient');
    state.gameChatRecipient = sel ? (sel.value || null) : null;
    refreshGameChat();
}

async function refreshGameChat() {
    const el = document.getElementById('gameChatMessages');
    if (!el) return;
    const recipientId = state.gameChatRecipient;
    const msgs = recipientId
        ? await dbFetchPrivateChat(state.currentRoomCode, state.playerId, recipientId)
        : await dbFetchChat(state.currentRoomCode);
    const nameOf = id => (state.players.find(p => p.id === id) || {}).name || 'Бывший игрок';
    el.innerHTML = msgs.map(m => `<div class="chat-message"><span class="sender">${escapeHtml(nameOf(m.sender_id))}:</span> ${escapeHtml(m.text)}</div>`).join('');
    el.scrollTop = el.scrollHeight;
}

async function actionSendGameChat() {
    const input = document.getElementById('gameChatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const me = state.players.find(p => p.id === state.playerId);
    if (me && me.is_muted) return alert('Вы в муте, писать нельзя.');
    if (me && me.timeout_until && new Date(me.timeout_until) > new Date()) return alert('Вы в таймауте.');
    input.value = '';
    if (state.gameChatRecipient) {
        await dbSendPrivateChat(state.currentRoomCode, state.playerId, state.gameChatRecipient, text);
    } else {
        await dbSendChat(state.currentRoomCode, text);
    }
    refreshGameChat();
}
function handleGameChatKey(e) { if (e.key === 'Enter') actionSendGameChat(); }

function eventIcon(type) {
    return type === 'positive' ? '🟢' : type === 'negative' ? '🔴' : '⚪';
}

async function refreshEventsFeed() {
    const el = document.getElementById('eventsFeed');
    if (!el) return;
    const room = state.room;
    const isHost = room && room.host_id === state.playerId;
    const events = await dbFetchEvents(state.currentRoomCode);
    // [Шаг 6, п.2.1] Личное сообщение ведущего конкретному игроку видят только он сам и ведущий.
    const visible = events.filter(e => !e.private || isHost || e.target_id === state.playerId);
    if (visible.length === 0) { el.innerHTML = '<li class="muted-note">Пока ничего не произошло.</li>'; return; }
    el.innerHTML = visible.map(e => {
        const targetName = e.target_id ? (state.players.find(p => p.id === e.target_id) || {}).name : null;
        return `<li>${eventIcon(e.type)} ${escapeHtml(e.text)}${targetName ? ` <span class="muted-note">(${escapeHtml(targetName)})</span>` : ''}${e.private ? ' <span class="muted-note">🔒 лично</span>' : ''}</li>`;
    }).join('');
}

// ---------- Действия ведущего: события ----------
async function actionSendEvent() {
    const textEl = document.getElementById('eventText');
    const text = textEl.value.trim();
    if (!text) return alert('Введите текст события.');
    const type = document.getElementById('eventType').value;
    const targetId = document.getElementById('eventTarget').value || null;
    // Сообщение конкретному игроку считается личным и не видно остальным.
    await dbInsertEvent(state.currentRoomCode, state.room.current_round, type, text, targetId, !!targetId);
    textEl.value = '';
    refreshEventsFeed();
}

async function actionQuickEvent(kind) {
    const room = state.room;
    const alivePlayers = state.players.filter(p => p.id !== room.host_id);
    if (kind === 'find') {
        const revealed = room.revealed_bonus_ids || [];
        const active = room.active_bonus_ids || [];
        const remaining = active.filter(id => !revealed.includes(id));
        if (remaining.length === 0) return alert('Все доступные бонусные свойства бункера уже открыты.');
        const pick = remaining[Math.floor(Math.random() * remaining.length)];
        await dbUpdateRoom(state.currentRoomCode, { revealed_bonus_ids: [...revealed, pick] });
        await dbInsertEvent(state.currentRoomCode, room.current_round, 'positive',
            'Пока шло обсуждение, один из выживших обнаружил в дальнем углу бункера ещё один тайник — досрочно открыто дополнительное свойство бункера.', null, false);
        state.room.revealed_bonus_ids = [...revealed, pick];
        refreshBunkerList();
    } else if (kind === 'incident') {
        if (alivePlayers.length === 0) return;
        const victim = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        await dbTimeoutPlayer(state.currentRoomCode, victim.id, state.playerId, 60);
        // Публичное событие (все должны понимать, почему этот игрок временно не пишет в чат).
        await dbInsertEvent(state.currentRoomCode, room.current_round, 'negative',
            victim.name + ' получил(а) лёгкую травму при ЧП в бункере и не может писать в чат следующую минуту.', victim.id, false);
    }
    refreshEventsFeed();
}

async function actionToggleScenarioVisible() {
    await dbUpdateRoom(state.currentRoomCode, { scenario_visible: !state.room.scenario_visible });
}

// [Шаг 6] Сколько характеристик и какого типа можно открыть в текущем раунде
function canRevealCategory(card, room, category) {
    const roundIdx = (room.current_round || 1) - 1;
    const slots = (room.settings?.round_reveals || [])[roundIdx] || ['any'];
    const limit = slots.length;
    const usedThisRound = card.filter(c => c.round_revealed === room.current_round).length;
    if (usedThisRound >= limit) return { ok: false, reason: 'Лимит открытий на этот раунд исчерпан (' + limit + ').' };

    const alreadyRevealedCats = new Set(card.filter(c => c.revealed).map(c => c.category));
    const specificSlotCats = slots.filter(s => s !== 'any');
    const pendingRequired = specificSlotCats.filter(s => !alreadyRevealedCats.has(s));
    if (pendingRequired.includes(category)) return { ok: true };

    const thisRoundCards = card.filter(c => c.round_revealed === room.current_round);
    const usedAnyThisRound = thisRoundCards.filter(c => !specificSlotCats.includes(c.category)).length;
    const anySlotsTotal = slots.filter(s => s === 'any').length;
    if (usedAnyThisRound < anySlotsTotal) return { ok: true };
    return { ok: false, reason: 'В этом раунде такой тип характеристики недоступен.' };
}

async function loadMyCard() {
    const card = await dbFetchMyCard(state.currentRoomCode, state.playerId);
    state.myCardCache = card;
    const el = document.getElementById('myCardPanel');
    if (!el) return;

    if (card.length === 0) {
        el.innerHTML = `<h2>Моя карточка</h2><p class="muted-note">Карточка не найдена (генерация ещё не завершилась или пуст character_pool).</p>`;
        return;
    }

    const room = state.room;
    const note = await dbFetchNote(state.currentRoomCode, state.playerId);
    const revealOrder = state.players.filter(p => p.id !== room.host_id);
    const isMyRevealTurn = room.current_phase === 'reveal' && (revealOrder[room.reveal_index || 0] || {}).id === state.playerId;
    const amEliminated = (state.players.find(p => p.id === state.playerId) || {}).is_alive === false;

    // [Шаг 6, п.1.2] Свой текст видно всегда; числовую "ценность" характеристики игрок не видит никогда.
    const itemsHtml = card.map(c => {
        const isSpecial = c.category === 'special_condition';
        let liClass = '', extra = '';
        if (!c.revealed) {
            if (amEliminated) {
                extra = '<div class="muted-note" style="font-size:11px; margin-top:3px;">(вы выбыли — открытие недоступно)</div>';
            } else if (room.current_phase !== 'reveal') {
                extra = '<div class="muted-note" style="font-size:11px; margin-top:3px;">(не открыто остальным — доступно только в фазе «Открытие раунда»)</div>';
            } else if (!isMyRevealTurn) {
                extra = '<div class="muted-note" style="font-size:11px; margin-top:3px;">(не открыто остальным — сейчас не ваш ход)</div>';
            } else {
                const check = canRevealCategory(card, room, c.category);
                extra = check.ok
                    ? `<button class="btn btn-sm btn-primary" style="margin-top:5px;" onclick="actionRevealTrait('${c.id}')">Открыть остальным</button>`
                    : `<div class="muted-note" style="font-size:11px; margin-top:3px;">${escapeHtml(check.reason)}</div>`;
            }
        } else if (isSpecial && !c.used) {
            liClass = ' special-unused';
            if (amEliminated) {
                extra = '<div class="muted-note" style="font-size:11px; margin-top:3px;">(вы выбыли — использование недоступно)</div>';
            } else {
            const others = state.players.filter(p => p.id !== state.playerId && p.id !== room.host_id);
            extra = `<div style="margin-top:6px;">
                    <button class="btn btn-sm btn-primary" onclick="toggleTargetPicker('${c.id}')">Использовать</button>
                    <div id="targetPicker_${c.id}" style="display:none; margin-top:6px;">
                        ${others.length ? others.map(p =>
                            `<label class="muted-note" style="display:block;"><input type="checkbox" value="${p.id}" style="width:auto; display:inline-block; margin-right:4px;">${escapeHtml(p.name)}</label>`
                        ).join('') : '<span class="muted-note">Нет других игроков для выбора цели.</span>'}
                        <button class="btn btn-sm btn-danger" style="margin-top:4px;" onclick="actionUseSpecialCondition('${c.id}')">Подтвердить использование</button>
                    </div>
                </div>`;
            }
        } else if (isSpecial && c.used) {
            liClass = ' special-used';
            const targetNames = (c.used_targets || []).map(id => (state.players.find(p => p.id === id) || {}).name).filter(Boolean);
            extra = `<span class="muted-note">(использовано${targetNames.length ? ' · цель: ' + escapeHtml(targetNames.join(', ')) : ''})</span>`;
        } else {
            extra = c.revealed ? '<span class="muted-note">(открыто остальным)</span>' : '';
        }
        return `<li class="${liClass}"><span class="prop-tag">${escapeHtml(CATEGORY_LABELS[c.category] || c.category)}</span>${escapeHtml(c.text)} ${extra}</li>`;
    }).join('');

    const historyHtml = card.filter(c => c.revealed).sort((a, b) => (a.round_revealed || 0) - (b.round_revealed || 0))
        .map(c => `<li class="muted-note">Раунд ${c.round_revealed || '?'}: открыли «${escapeHtml(CATEGORY_LABELS[c.category] || c.category)}»${c.used ? ' · использовали' : ''}</li>`).join('');

    el.innerHTML = `
        <h2>Моя карточка</h2>
        <ul class="prop-list">${itemsHtml}</ul>

        <h3 style="margin-top:14px;">Личные заметки</h3>
        <p class="muted-note">Видны только вам, ведущий их не видит.</p>
        <textarea id="myNotes" rows="3" style="width:100%; padding:10px; background:var(--void); border:1px solid #4a4e28; color:var(--paper); border-radius:4px; font-family:inherit;">${escapeHtml(note?.text || '')}</textarea>
        <button class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="actionSaveNote(this)">Сохранить заметку</button>

        ${historyHtml ? `<h3 style="margin-top:14px;">История ваших действий</h3><ul class="prop-list">${historyHtml}</ul>` : ''}
    `;
}

function toggleTargetPicker(cardId) {
    const el = document.getElementById('targetPicker_' + cardId);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function actionUseSpecialCondition(cardId) {
    const picker = document.getElementById('targetPicker_' + cardId);
    const targets = picker ? Array.from(picker.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value) : [];
    const card = (state.myCardCache || []).find(c => String(c.id) === String(cardId));
    const { error } = await supabaseClient.from('player_cards').update({ used: true, used_targets: targets }).eq('id', cardId);
    if (error) { console.error('Ошибка использования спецусловия:', error); return alert('Не удалось использовать спецусловие: ' + error.message); }
    const myName = (state.players.find(p => p.id === state.playerId) || {}).name || state.playerName;
    const targetNames = targets.map(id => (state.players.find(p => p.id === id) || {}).name).filter(Boolean);
    await dbInsertEvent(state.currentRoomCode, state.room.current_round, 'neutral',
        myName + ' использовал(а) спецусловие: ' + (card ? card.text : '') + (targetNames.length ? ' (цель: ' + targetNames.join(', ') + ')' : ''),
        targets[0] || null, false);
    loadMyCard();
    refreshEventsFeed();
}

async function actionSaveNote(btn) {
    const ta = document.getElementById('myNotes');
    if (!ta) return;
    await dbSaveNote(state.currentRoomCode, state.playerId, ta.value);
    if (btn) {
        const original = btn.textContent;
        btn.textContent = 'Сохранено ✓';
        setTimeout(() => { btn.textContent = original; }, 1500);
    }
}

async function actionRevealTrait(cardId) {
    const room = state.room;
    const me = state.players.find(p => p.id === state.playerId);
    if (me && me.is_alive === false) return alert('Вы выбыли из игры и не можете открывать характеристики.');

    if (room.current_phase === 'awaiting_verdict') {
        if (!room.final_reveal_unlocked) return alert('Ведущий ещё не разрешил открывать последнюю характеристику.');
        const card = state.myCardCache || [];
        const target = card.find(c => String(c.id) === String(cardId));
        if (!target) return alert('Характеристика не найдена, попробуйте обновить страницу.');
        if (target.revealed) return;
        const { error } = await supabaseClient.from('player_cards').update({ revealed: true, round_revealed: room.current_round }).eq('id', cardId);
        if (error) { console.error('Ошибка открытия характеристики:', error); return alert('Не удалось открыть характеристику: ' + error.message); }
        loadMyCard();
        updateGameDynamic();
        return;
    }

    if (room.current_phase !== 'reveal') return alert('Открытие характеристик доступно только в фазе «Открытие раунда».');
    const revealOrder = state.players.filter(p => p.id !== room.host_id);
    const active = revealOrder[room.reveal_index || 0];
    if (!active || active.id !== state.playerId) return alert('Сейчас не ваш ход.');
    const card = state.myCardCache || [];
    const target = card.find(c => String(c.id) === String(cardId));
    if (!target) return alert('Характеристика не найдена, попробуйте обновить страницу.');
    const check = canRevealCategory(card, room, target.category);
    if (!check.ok) return alert(check.reason);
    const { error } = await supabaseClient.from('player_cards').update({ revealed: true, round_revealed: room.current_round }).eq('id', cardId);
    if (error) { console.error('Ошибка открытия характеристики:', error); return alert('Не удалось открыть характеристику: ' + error.message); }
    loadMyCard();
    updateGameDynamic();
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
async function resolveVoting() {
    const room = state.room;
    const nominees = room.nominees || [];
    const { data: votes, error } = await supabaseClient.from('votes')
        .select('*').eq('room_code', state.currentRoomCode).eq('round', room.current_round);
    if (error) { console.error(error); return; }

    const tally = {};
    nominees.forEach(id => { tally[id] = 0; });
    (votes || []).forEach(v => { if (tally[v.target_id] !== undefined) tally[v.target_id]++; });

    const counts = Object.values(tally);
    const maxVotes = counts.length ? Math.max(...counts) : 0;
    const topCandidates = Object.keys(tally).filter(id => tally[id] === maxVotes);

    if (maxVotes === 0 || topCandidates.length === 0) {
        await dbInsertEvent(state.currentRoomCode, room.current_round, 'neutral',
            'Голосование не выявило кандидата на исключение — никто не набрал голосов.', null, false);
        await dbUpdateRoom(state.currentRoomCode, {
            current_phase: 'vote_result', phase_ends_at: null, phase_running: false, phase_paused_remaining: null, last_eliminated_id: null
        });
        return;
    }

    if (topCandidates.length > 1) {
        // Ничья: повторяем оправдательную речь и голосование среди тех, кто набрал максимум (правило из Возможностей, п.3.5)
        const names = topCandidates.map(id => (state.players.find(p => p.id === id) || {}).name || '?').join(', ');
        await supabaseClient.from('votes').delete().eq('room_code', state.currentRoomCode).eq('round', room.current_round);
        await dbInsertEvent(state.currentRoomCode, room.current_round, 'neutral',
            'Ничья при голосовании (' + names + ') — повторная оправдательная речь и голосование среди них.', null, false);
        const seconds = phaseDuration('defense');
        const ends = seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
        await dbUpdateRoom(state.currentRoomCode, {
            nominees: topCandidates, defense_index: 0, current_phase: 'defense',
            phase_ends_at: ends, phase_running: seconds > 0, phase_paused_remaining: null
        });
        return;
    }

    const eliminatedId = topCandidates[0];
    const eliminatedP = state.players.find(p => p.id === eliminatedId);
    await supabaseClient.from('players').update({ is_alive: false }).eq('id', eliminatedId);
    await dbInsertEvent(state.currentRoomCode, room.current_round, 'negative',
        (eliminatedP ? eliminatedP.name : 'Игрок') + ' исключён(а) по итогам голосования (' + maxVotes + ' голос(ов) из ' + (votes || []).length + ').',
        eliminatedId, false);
    await dbUpdateRoom(state.currentRoomCode, {
        current_phase: 'vote_result', phase_ends_at: null, phase_running: false, phase_paused_remaining: null, last_eliminated_id: eliminatedId
    });
}

async function hostAdvancePhase() {
    const room = state.room;
    const phase = room.current_phase;
    const round = room.current_round || 1;
    const nominees = room.nominees || [];
    const defenseIdx = room.defense_index || 0;
    const revealIdx = room.reveal_index || 0;
    const revealOrder = state.players.filter(p => p.id !== room.host_id);

    if (phase === 'reveal' && revealIdx < revealOrder.length - 1) {
        const seconds = phaseDuration('reveal');
        const ends = seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
        await dbUpdateRoom(state.currentRoomCode, {
            reveal_index: revealIdx + 1, phase_ends_at: ends, phase_running: seconds > 0, phase_paused_remaining: null
        });
        return;
    }

    if (phase === 'defense' && defenseIdx < nominees.length - 1) {
        const seconds = phaseDuration('defense');
        const ends = seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
        await dbUpdateRoom(state.currentRoomCode, {
            defense_index: defenseIdx + 1, phase_ends_at: ends, phase_running: seconds > 0, phase_paused_remaining: null
        });
        return;
    }

    if (phase === 'voting') {
        await resolveVoting();
        return;
    }

    if (phase === 'vote_result') {
        const aliveCount = state.players.filter(p => p.id !== room.host_id && p.is_alive !== false).length;
        const targetSurvivors = room.settings?.target_survivors || 1;
        if (aliveCount <= targetSurvivors) {
            await dbUpdateRoom(state.currentRoomCode, {
                current_phase: 'awaiting_verdict', phase_ends_at: null, phase_running: false, phase_paused_remaining: null, last_eliminated_id: null
            });
            return;
        }
    }

    const idx = PHASE_SEQUENCE.indexOf(phase);
    let nextPhase, nextRound = round, nextNominees = nominees, nextNominations = room.nominations || {};
    if (idx === -1 || idx === PHASE_SEQUENCE.length - 1) {
        const totalRounds = room.settings?.rounds || 1;
        if (round >= totalRounds) {
            await dbUpdateRoom(state.currentRoomCode, {
                current_phase: 'awaiting_verdict', phase_ends_at: null, phase_running: false, phase_paused_remaining: null, last_eliminated_id: null
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
        last_eliminated_id: null,
        defense_index: 0, reveal_index: 0, phase_ends_at: ends, phase_running: seconds > 0, phase_paused_remaining: null
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
    const me = state.players.find(p => p.id === state.playerId);
    if (me && me.is_alive === false) return alert('Вы выбыли из игры и не можете выставлять.');

    if (room.current_phase !== 'nomination') return;
    if (targetId === state.playerId) return alert('Нельзя выставить самого себя.');
    if (targetId === room.host_id) return alert('Нельзя выставить ведущего.');
    
    const nominations = { ...(room.nominations || {}) };
    if (nominations[state.playerId]) return alert('Вы уже выставили игрока в этом раунде — изменить нельзя.');
    
    nominations[state.playerId] = targetId;
    const nominees = [...new Set(Object.values(nominations))];
    await dbUpdateRoom(state.currentRoomCode, { nominations, nominees });
}

// ---------- Голосование (слепое, один голос на игрока за раунд, изменить нельзя) ----------
async function actionCastVote(targetId) {
    const room = state.room;
    if (state.playerId === room.host_id) return alert('Ведущий не голосует.');
    const me = state.players.find(p => p.id === state.playerId);
    if (me && me.is_alive === false) return alert('Вы выбыли из игры и не можете голосовать.');
    if (room.current_phase !== 'voting') return;
    if (targetId === state.playerId) return alert('Нельзя голосовать за себя.');
    if (!(room.nominees || []).includes(targetId)) return;
    if (state.myVoteThisRound) return alert('Вы уже проголосовали в этом раунде — изменить нельзя.');

    const { error } = await supabaseClient.from('votes').insert({
        room_code: state.currentRoomCode, round: room.current_round, voter_id: state.playerId, target_id: targetId
    });
    if (error) {
        if (error.code === '23505') {
            state.myVoteThisRound = targetId;
            updateGameDynamic();
            return alert('Вы уже проголосовали в этом раунде.');
        }
        console.error(error);
        return;
    }
    state.myVoteThisRound = targetId;
    updateGameDynamic();
}

async function loadMyVoteStatus() {
    const room = state.room;
    if (!room || room.current_phase !== 'voting' || state.playerId === room.host_id) {
        state.myVoteThisRound = null;
        return;
    }
    state.myVoteThisRound = await dbFetchMyVote(state.currentRoomCode, room.current_round, state.playerId);
    updateGameDynamic();
}

async function loadVoteProgress() {
    const room = state.room;
    const el = document.getElementById('voteProgress');
    if (!el) return;
    if (!room || room.current_phase !== 'voting') { el.textContent = ''; return; }
    const count = await dbFetchVoteCount(state.currentRoomCode, room.current_round);
    const total = state.players.filter(p => p.id !== room.host_id && p.is_alive !== false).length;
    el.textContent = `Проголосовало: ${count} из ${total}`;
}

// ---------- Финальный вердикт ----------
// ---------- Финальная фаза: разрешение на последний реveal + скрытый инструмент вердикта ----------
async function actionToggleFinalReveal() {
    await dbUpdateRoom(state.currentRoomCode, { final_reveal_unlocked: !state.room.final_reveal_unlocked });
}

async function actionSetVerdictChoice(choice) {
    await dbUpdateRoom(state.currentRoomCode, { verdict: choice });
}

async function actionAnnounceVerdict() {
    const room = state.room;
    if (!room.verdict) return alert('Сначала выберите «Победа» или «Поражение».');
    const percentInput = document.getElementById('verdictPercent');
    const percent = percentInput && percentInput.value !== '' ? Math.max(0, Math.min(100, parseInt(percentInput.value) || 0)) : null;
    await dbUpdateRoom(state.currentRoomCode, {
        current_phase: 'finished', phase_ends_at: null, phase_running: false, phase_paused_remaining: null,
        verdict_percent: percent
    });
    const survivors = state.players.filter(p => p.id !== room.host_id && p.is_alive !== false).map(p => p.name).join(', ');
    await dbInsertEvent(state.currentRoomCode, room.current_round,
        room.verdict === 'victory' ? 'positive' : 'negative',
        'Вердикт вынесен: ' + (room.verdict === 'victory' ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ') + '. Выжившие: ' + (survivors || 'никто'),
        null, false);
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
    await dbClearEvents(state.currentRoomCode);
    await dbClearVotes(state.currentRoomCode);
    await supabaseClient.from('players').update({ is_alive: true }).eq('room_code', state.currentRoomCode);
    await dbUpdateRoom(state.currentRoomCode, {
        phase: 'lobby', countdown_ends_at: null, current_round: 1, current_phase: 'reveal',
        phase_ends_at: null, phase_running: false, phase_paused_remaining: null,
        nominees: [], nominations: {}, defense_index: 0, reveal_index: 0,
        active_bonus_ids: [], revealed_bonus_ids: [], scenario_visible: false, last_eliminated_id: null,
        final_reveal_unlocked: false, verdict: null, verdict_percent: null
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
    const roundReveals = [];
    for (let i = 0; i < rounds; i++) {
        const countEl = document.getElementById('roundCount_' + i);
        const count = countEl ? Math.max(1, parseInt(countEl.value) || 1) : 1;
        const slots = [];
        for (let j = 0; j < count; j++) {
            const sel = document.getElementById(`roundSlot_${i}_${j}`);
            slots.push(sel ? sel.value : 'any');
        }
        roundReveals.push(slots);
    }
    const settings = {
        min_players: parseInt(document.getElementById('setMin').value) || 1,
        max_players: parseInt(document.getElementById('setMax').value) || 20,
        target_survivors: parseInt(document.getElementById('setSurvivors').value) || 1,
        rounds,
        round_reveals: roundReveals,
        phase_seconds: {
            reveal: parseInt(document.getElementById('setReveal').value) || 60,
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
