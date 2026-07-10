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

// [ИСПРАВЛЕНО] fact → fact1 + fact2, добавлен goal
const CATEGORY_LABELS = {
    bio: 'БИО', profession: 'Профессия', hobby: 'Хобби',
    fact1: 'Факт 1', fact2: 'Факт 2',
    health: 'Здоровье', phobia: 'Фобия',
    luggage_big: 'Большой багаж', luggage_small: 'Малый багаж',
    trait: 'Черта характера', special_condition: 'Спец.условие',
    goal: 'Цель'
};
const CATEGORY_LIST = Object.keys(CATEGORY_LABELS);

// [НОВОЕ] Категории, которые могут раскрываться по раундам (goal — НИКОГДА)
const REVEALABLE_CATEGORIES = CATEGORY_LIST.filter(c => c !== 'goal');

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
    catalogPresetIds: new Set(),
    viewingScenario: null,
    viewingPresets: [],
    pollInterval: null,
    countdownTick: null,
    lastSeenSettings: null,
    lastSeenScenarioId: undefined,
    lastGameRenderKey: null,
    gamePhaseTick: null,
    gameScenario: null,
    gameChatRecipient: null,
    cardsGenerationInFlight: false,
    myVoteThisRound: null,
    myCard: [],
    revealedTraits: {}
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
    const { data: room, error: roomErr } = await supabaseClient.from('rooms').select('*').eq('code', code).maybeSingle();
    if (roomErr || !room) throw new Error('Комната не найдена. Проверьте код.');
    if (room.phase !== 'lobby') throw new Error('Игра уже началась, присоединиться нельзя.');
    const { data: players, error: playersErr } = await supabaseClient.from('players').select('*').eq('room_code', code);
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

// ---------- Выбор места за столом ----------
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

// ---------- Кастомизация ----------
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

// ---------- Модерация ----------
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

// ---------- Сценарии ----------
async function dbFetchScenarios() {
    const { data, error } = await supabaseClient.from('scenarios').select('id,title,has_presets').order('title');
    if (error) { console.error(error); return []; }
    return data || [];
}

async function dbFetchScenarioDetail(id) {
    const { data: scenario } = await supabaseClient.from('scenarios').select('*').eq('id', id).maybeSingle();
    const { data: props } = await supabaseClient.from('bunker_properties').select('*').eq('scenario_id', id);
    return {
        scenario,
        base: (props || []).filter(p => p.type === 'base'),
        bonus: (props || []).filter(p => p.type === 'bonus')
    };
}

async function dbFetchPresetsForScenario(scenarioId) {
    const { data, error } = await supabaseClient.from('preset_characters').select('id,label').eq('scenario_id', scenarioId);
    if (error) { console.error('Ошибка загрузки готовых карточек:', error); return []; }
    return data || [];
}

async function dbFetchScenarioIdsWithPresets() {
    // Используем поле has_presets из таблицы scenarios для быстрой проверки
    const { data, error } = await supabaseClient.from('scenarios').select('id').eq('has_presets', true);
    if (error) { console.error(error); return new Set(); }
    return new Set((data || []).map(r => r.id));
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

// [ИСПРАВЛЕНО] Учитывает fact1/fact2 (не допускает одинаковый текст),
// goal выбирается отдельно и не влияет на баланс
function generateBalancedCard(pool) {
    // Баланс считаем только по раскрываемым категориям
    const balanceCats = shuffleArray(REVEALABLE_CATEGORIES);
    const half = Math.ceil(balanceCats.length / 2);
    const positiveCats = new Set(balanceCats.slice(0, half));

    const card = [];
    let fact1Text = null;

    for (const cat of CATEGORY_LIST) {
        // goal — выбираем отдельно, любой (value всегда 0)
        if (cat === 'goal') {
            const items = pool.filter(p => p.category === 'goal');
            if (items.length > 0) {
                const pick = items[Math.floor(Math.random() * items.length)];
                card.push({ category: cat, pool_id: pick.id, text: pick.text, value: pick.value });
            }
            continue;
        }

        const items = pool.filter(p => p.category === cat);
        if (items.length === 0) continue;

        const wantPositive = positiveCats.has(cat);
        let candidates = items.filter(p => wantPositive ? p.value >= 0 : p.value <= 0);
        if (candidates.length === 0) candidates = items;

        // [ИСПРАВЛЕНИЕ] Для fact2 исключаем текст, который уже выпал на fact1
        if (cat === 'fact2' && fact1Text) {
            let filtered = candidates.filter(p => p.text !== fact1Text);
            if (filtered.length === 0) filtered = candidates;
            candidates = filtered;
        }

        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        card.push({ category: cat, pool_id: pick.id, text: pick.text, value: pick.value });

        if (cat === 'fact1') fact1Text = pick.text;
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

async function dbRevealCard(roomCode, playerId, category) {
    // [ИСПРАВЛЕНИЕ] Защита: goal никогда не раскрывается
    if (category === 'goal') return;
    const { error } = await supabaseClient.from('player_cards')
        .update({ revealed: true, round_revealed: state.room?.current_round || 0 })
        .eq('room_code', roomCode).eq('player_id', playerId).eq('category', category);
    if (error) console.error('Ошибка раскрытия:', error);
}

// ---------- Заметки ----------
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

async function dbCastVote(roomCode, round, voterId, targetId) {
    const { error } = await supabaseClient.from('votes').insert({
        room_code: roomCode, round, voter_id: voterId, target_id: targetId
    });
    if (error) console.error('Ошибка голосования:', error);
}

async function dbFetchVoteResults(roomCode, round) {
    const { data, error } = await supabaseClient.from('votes')
        .select('target_id').eq('room_code', roomCode).eq('round', round);
    if (error) { console.error(error); return []; }
    return data || [];
}

// ---------- Генерация карточек для комнаты ----------
async function generateCardsForRoom(roomCode, players, hostId) {
    const already = await dbCardsExist(roomCode);
    if (already) return;
    const pool = await dbFetchCharacterPool();
    if (pool.length === 0) {
        console.error('character_pool пуст — карточки не сгенерированы.');
        return;
    }
    for (const p of players) {
        if (p.id === hostId) continue;
        const card = generateBalancedCard(pool);
        await dbInsertPlayerCard(roomCode, p.id, card);
    }
}

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
    let pool = null;

    for (let i = 0; i < shuffledPlayers.length; i++) {
        const p = shuffledPlayers[i];
        if (i < shuffledPresets.length) {
            const traits = await dbFetchPresetTraits(shuffledPresets[i].id);
            // [ИСПРАВЛЕНИЕ] Фильтруем пустые строки (у пресетов могут быть пустые fact2/luggage_small)
            const validTraits = traits.filter(t => t.text && t.text.trim() !== '');
            const rows = validTraits.map(t => ({
                room_code: roomCode, player_id: p.id, category: t.category,
                pool_id: null, text: t.text, value: t.value, revealed: false
            }));
            if (rows.length > 0) {
                const { error } = await supabaseClient.from('player_cards').insert(rows);
                if (error) console.error('Ошибка назначения готовой карточки игроку ' + p.id + ':', error);
            }
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

async function pollTick
