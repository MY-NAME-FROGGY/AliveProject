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
// [ИСПРАВЛЕНО] Добавлены fact1, fact2 и goal. Убрана абстрактная 'fact'.
// Короткие описания всех effect_key для справочника ведущего (панель «Мастер-редактор»).
// Полная версия с подробностями — в файле effect_key_reference.md.
const EFFECT_KEY_DESCRIPTIONS = {
    vote_immunity: 'Свой голос не может быть использован в этом раунде.',
    vote_nullified: 'Голос цели не засчитывается при подсчёте.',
    vote_weight: 'Голос цели/своя считается за увеличенный вес (обычно ×2).',
    protect_target: 'Голоса ПРОТИВ цели/себя не засчитываются в этом раунде.',
    skip_vote: 'Пропустить голосование без объяснений (фиксация факта).',
    cancel_nomination: 'Убрать себя из выставленных на голосование.',
    open_voting: 'После голосования публикуется, кто за кого голосовал.',
    second_vote_abstain: 'Воздержавшийся автоматически поддерживает лидера (отложенный эффект).',
    coin_flip_survival: 'Монета при попытке изгнать вас — орёл спасает (отложенный эффект).',
    tie_breaker: 'При ничьей лично решаете исход (отложенный эффект).',
    spy_vote: 'После голосования приватно узнаёте, за кого голосовала цель.',
    reveal_past_vote: 'Немедленно показывает голос цели в прошлом раунде.',
    view_tally: 'Показывает текущий подсчёт голосов до оглашения.',
    nullify_and_double_vote: 'Голос цели аннулируется + свой голос ×2.',
    exclude_from_vote: 'Цель исключается из голосования в этом раунде.',
    heir: 'Если цель выбудет по голосованию — получите её открытые карты (отложенный эффект).',
    direct_eliminate: 'Немедленно исключает цель из игры, минуя голосование.',
    revive_player: 'Возвращает выбывшего в игру без права голоса в этом раунде.',
    steal_trait: 'Открытая кража открытой характеристики цели.',
    steal_trait_blind: 'Слепая кража — выбор категории без просмотра содержимого.',
    steal_fixed_category_blind: 'Слепая кража с жёстко заданной категорией (без выбора).',
    swap_trait: 'Открытый обмен характеристикой той же категории.',
    swap_trait_blind: 'Слепой обмен категорией.',
    swap_fixed_category: 'Обмен характеристикой жёстко заданной категории.',
    swap_between_others: 'Обмен характеристикой между ДВУМЯ другими игроками.',
    swap_fact_between_others: 'Обмен фактом (1 или 2, выбор в момент применения) между двумя другими.',
    copy_trait: 'Скопировать открытую характеристику цели себе.',
    inherit_trait: 'Немедленно получить характеристику цели той же категории.',
    transfer_card: 'Безвозвратно отдать свою карту категории другому игроку.',
    protect_card: 'Защитить свою характеристику от кражи/обмена до конца игры.',
    restore_lost_trait: 'Вернуть себе последнюю утраченную характеристику.',
    force_reveal: 'Принудительно раскрыть карту цели(ей) указанной категории.',
    reveal_own_trait_early: 'Досрочно раскрыть свою скрытую характеристику по выбору.',
    reveal_random_hidden: 'Раскрыть случайную свою скрытую характеристику.',
    peek_trait: 'Приватно посмотреть скрытую характеристику цели.',
    peek_goal: 'Приватно посмотреть Цель другого игрока.',
    show_trait_again: 'Публично напомнить об открытой характеристике цели.',
    reveal_or_peek_fact: 'Узнать факт цели — открыто или только себе (выбор в момент применения).',
    redraw_category: 'Заменить карту категории у цели на новую случайную.',
    redraw_health_and_phobia: 'Заменить здоровье и фобию цели на новые случайные.',
    reset_cards: 'Обнулить и перетянуть заново все свои карты (кроме Био).',
    cure_health: 'Вылечить карту здоровья цели.',
    cure_phobia: 'Снять фобию у цели.',
    infect_disease: 'Заразить цель — новая случайная карта здоровья.',
    false_trail: 'Ложный след — событие есть, но БЕЗ указания, кто применил.',
    false_fact: 'Распространить ложный слух о цели (текст вручную).',
    positive_fact: 'Опубликовать положительный факт о цели (текст вручную).',
    steal_luggage_choice: 'Кража багажа с выбором большой/малый.',
    swap_reveal_order: 'Поменяться очередью раскрытия с целью (если оба ещё не ходили).',
    pass_turn_to_next: 'Цель открывает следующей сразу после текущего активного.',
    move_to_last_next_round: 'В СЛЕДУЮЩЕМ раунде открываете последним.',
    swap_seats: 'Реально поменяться местами за столом.',
    swap_with_host: 'Раскрыть bonus-свойство + решающий голос при ничьей + продвинуть фазу.',
    swap_fates: '4 режима на выбор: воскрешение/голоса/статус выставления/полный обмен картами.',
    block_bunker_property: 'Блокирует выбранное свойство бункера (через RPC).',
    increase_bunker_capacity: 'Увеличивает вместимость бункера (через RPC).',
    decrease_bunker_capacity: 'Уменьшает вместимость бункера (через RPC).',
    reveal_random_bonus_property: 'Досрочно раскрывает случайное ещё не раскрытое bonus-свойство.',
    destroy_random_bonus_property: 'Переводит случайное доступное bonus-свойство в статус «заблокировано».',
    add_random_room: 'Добавляет случайное bonus-свойство из общего каталога.',
    delay_bonus_reveal: 'Флаг задержки раскрытия bonus-свойства (на усмотрение ведущего).',
    catastrophe_immunity: 'Флаг иммунитета к одной катастрофе бункера.',
    adjust_bunker_resource: 'Изменяет числовой ресурс бункера (если учёт включён).',
    worsen_random_resource: 'Уменьшает случайный включённый ресурс бункера.',
    chat_block_all: 'Блокирует общий чат цели на этот раунд.',
    chat_block_neighbors: 'То же самое, что chat_block_all.',
    chat_block_self_private: 'Блокирует личный чат самому себе на этот раунд.',
    mute_and_double_vote: 'Мут (is_muted=true) + голос за двоих. Снимать мут вручную.',
    timeout_immune: 'Постоянный флаг иммунитета к одному муту/таймауту от ведущего.',
    skip_defense_penalty: 'Пропустить оправдательную речь без штрафа (флаг).',
    defense_time_adjust: 'Меняет длительность следующей оправдательной речи.',
    extend_phase: 'Продлевает текущую фазу на N секунд.',
    forced_reveal_category_next_round: 'В след. раунде категория раскрытия выбирается случайно.',
    skip_nomination: 'Флаг: нельзя никого выставить на голосование в этом раунде.',
    block_special_condition: 'Запрещает цели использовать её спецусловия в этом раунде.',
    pardon_flag: 'Постоянный флаг прощения одного будущего нарушения.',
    health_bonus: 'Разовый бонус к здоровью цели на раунд.',
    block_luggage: 'Блокирует багаж — scope:all даёт всем сразу, иначе только цели/себе.',
    swap_notes: 'Обменяться личными текстовыми заметками с целью.',
    clone_special_condition: 'Копирует и повторно исполняет реально применённый эффект другого игрока в этом раунде.',
    narrative_effect: 'Нарративная карта — тратится и логируется, но состояние игры не меняет.'
};

const CATEGORY_LABELS = {
    bio: 'БИО', profession: 'Профессия', hobby: 'Хобби', 
    fact1: 'Факт 1', fact2: 'Факт 2', 
    health: 'Здоровье', phobia: 'Фобия', 
    luggage_big: 'Большой багаж', luggage_small: 'Малый багаж', 
    trait: 'Черта характера', special_condition: 'Спец.условие',
    goal: 'Цель' // Только для отображения, не участвует в случайной генерации
};

// [ИСПРАВЛЕНО] Список категорий для БАЛАНСИРОВАННОЙ генерации. 
// 'goal' НЕ добавляем сюда, так как в character_pool нет записей с категорией goal.
const CATEGORY_LIST = Object.keys(CATEGORY_LABELS).filter(k => k !== 'goal');

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
    cardsGenerationInFlight: false,
    roomBunkerProperties: [],
    lastBunkerRoundCleanup: null
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

async function dbSetCustomization(roomCode, playerId, patch) {
    const { error } = await supabaseClient.from('players').update(patch).eq('id', playerId).eq('room_code', roomCode);
    if (error) {
        console.error('Ошибка сохранения кастомизации:', error);
        alert('Не удалось сохранить: ' + error.message);
    }
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

    return `<h3 style="margin-top:4px;">Аватар</h3>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">${avatarsHtml}</div>
            <h3 style="margin-top:12px;">Цвет ника</h3>
            <div style="display:flex; flex-wrap:wrap;">${swatches(me.color, 'actionSetColor')}</div>
            <h3 style="margin-top:12px;">Цвет обводки карточки</h3>
            <div style="display:flex; flex-wrap:wrap;">${swatches(me.outline_color, 'actionSetOutlineColor')}</div>`;
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

// ВАЖНО: здесь намеренно перечислены только "публичные" колонки.
// В базе у scenarios/bunker_properties есть ещё host_notes/host_note —
// это подсказки ТОЛЬКО для ведущего, и эта функция их не запрашивает,
// потому что её результат уходит в общий предпросмотр и в игровой экран,
// которые видят все игроки. Подсказки ведущего грузятся отдельно, через
// dbFetchHostNotes() — см. ниже.
async function dbFetchScenarioDetail(id) {
    const { data: scenario } = await supabaseClient.from('scenarios').select('id,title,catastrophe_description,has_presets').eq('id', id).maybeSingle();
    const { data: props } = await supabaseClient.from('bunker_properties').select('id,scenario_id,type,text').eq('scenario_id', id);
    return {
        scenario,
        base: (props || []).filter(p => p.type === 'base'),
        bonus: (props || []).filter(p => p.type === 'bonus')
    };
}

// Заметки ТОЛЬКО ДЛЯ ВЕДУЩЕГО: как карты бункера взаимодействуют с
// профессиями/фактами игроков + победные/проигрышные комбинации сценария.
// Идёт через RPC-функцию get_host_notes (см. SQL), которая на стороне
// базы данных сама проверяет, что запрашивающий playerId — это
// действительно host_id этой комнаты, и только тогда отдаёт текст.
// Никогда не вызывать эту функцию из экрана/компонента, который видят
// обычные игроки.
async function dbFetchHostNotes(scenarioId) {
    if (!state.room || state.room.host_id !== state.playerId || !state.currentRoomCode) {
        return { properties: {}, scenarioNotes: '' };
    }
    const { data, error } = await supabaseClient.rpc('get_host_notes', {
        p_scenario_id: scenarioId,
        p_room_code: state.currentRoomCode,
        p_player_id: state.playerId
    });
    if (error) { console.error('Ошибка загрузки заметок ведущего:', error); return { properties: {}, scenarioNotes: '' }; }
    const properties = {};
    let scenarioNotes = '';
    (data || []).forEach(row => {
        if (row.host_note) properties[row.bunker_property_id] = row.host_note;
        if (row.scenario_host_notes) scenarioNotes = row.scenario_host_notes;
    });
    return { properties, scenarioNotes };
}

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
    // [ИСПРАВЛЕНО] Теперь CATEGORY_LIST содержит fact1 и fact2, и они корректно генерируются
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
        card.push({ category: cat, pool_id: pick.id, text: pick.text, value: pick.value, target_type: pick.target_type || null, action_type: pick.action_type || null, effect_key: pick.effect_key || null, effect_params: pick.effect_params || {}, target_kind: pick.target_kind || 'player' });
    }
    return card;
}

async function dbFetchCharacterPool() {
    // [ФИКС] Supabase/PostgREST по умолчанию отдаёт максимум 1000 строк за один select.
    // character_pool теперь ~1500+ строк — без пагинации хвост категорий (в т.ч. большинство,
    // кроме тех, что физически шли первыми) просто не возвращался, отсюда "генерируется только
    // большой багаж". Достаём постранично, пока не выберем всё.
    let all = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await supabaseClient.from('character_pool')
            .select('id,category,text,value,target_type,effect_key,effect_params,target_kind')
            .eq('is_active', true)
            .range(from, from + pageSize - 1);
        if (error) { console.error('Ошибка загрузки character_pool:', error); break; }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

async function dbCardsExist(roomCode) {
    const { data, error } = await supabaseClient.from('player_cards').select('id').eq('room_code', roomCode).limit(1);
    if (error) { console.error(error); return false; }
    return !!(data && data.length > 0);
}

async function dbInsertPlayerCard(roomCode, playerId, card) {
    const rows = card.map(c => ({
        room_code: roomCode, player_id: playerId, category: c.category,
        pool_id: c.pool_id, text: c.text, value: c.value, revealed: false,
        target_type: c.target_type || null, action_type: c.action_type || null, effect_key: c.effect_key || null, effect_params: c.effect_params || {}, target_kind: c.target_kind || 'player'
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

// ==========================================
// СОСТОЯНИЕ БУНКЕРА В КОНКРЕТНОЙ ИГРЕ
// ==========================================
async function dbSyncRoomBunkerProperties(roomCode, scenarioId) {
    if (!roomCode || !scenarioId) return;
    const { error } = await supabaseClient.rpc('sync_room_bunker_properties', {
        p_room_code: roomCode,
        p_scenario_id: scenarioId
    });
    if (error) console.error('Ошибка синхронизации свойств бункера:', error);
}

async function dbFetchRoomBunkerProperties(roomCode) {
    if (!roomCode) return [];
    const { data, error } = await supabaseClient.from('room_bunker_properties')
        .select('id,room_code,property_id,type,text,available,revealed,blocked,blocked_until_round')
        .eq('room_code', roomCode)
        .order('type', { ascending: true })
        .order('id', { ascending: true });
    if (error) {
        console.error('Ошибка загрузки состояния бункера:', error);
        return [];
    }
    return data || [];
}

async function refreshRoomBunkerProperties() {
    state.roomBunkerProperties = await dbFetchRoomBunkerProperties(state.currentRoomCode);
    return state.roomBunkerProperties;
}
async function refreshBunkerPanelIndependent() {
    if (!state.currentRoomCode) return;
    try {
        await refreshRoomBunkerProperties();
        refreshBunkerList();
    } catch (e) {
        console.error('Ошибка обновления панели Бункер:', e);
    }
}

async function dbCleanupRoundBunkerEffects(roomCode, round) {
    if (!roomCode || !round) return;
    const { error } = await supabaseClient.rpc('cleanup_round_bunker_effects', {
        p_room_code: roomCode,
        p_round: round
    });
    if (error) console.error('Ошибка очистки эффектов бункера:', error);
}

async function dbExecuteBunkerEffect(card, targetPropertyId = null) {
    const { data, error } = await supabaseClient.rpc('execute_bunker_effect', {
        p_room_code: state.currentRoomCode,
        p_player_id: state.playerId,
        p_card_id: Number(card.id),
        p_effect_key: card.effect_key,
        p_target_property_id: targetPropertyId ? Number(targetPropertyId) : null,
        p_effect_params: card.effect_params || {}
    });
    if (error) throw error;
    return data;
}

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
            const rows = traits.map(t => ({
                room_code: roomCode, player_id: p.id, category: t.category,
                pool_id: null, text: t.text, value: t.value, revealed: false,
                target_type: t.target_type || null,
                action_type: t.action_type || null,
                effect_key: t.effect_key || null,
                effect_params: t.effect_params || {},
                target_kind: t.target_kind || 'player'
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

// Раньше state.myCardCache обновлялась только когда игрок сам что-то делал в своей панели —
// если ДРУГОЙ игрок применял эффект, меняющий вашу карту (кража, обмен, мутация, лечение и т.п.),
// ваш экран никогда не узнавал об этом сам по себе. Сравниваем с БД на каждый тик поллинга
// и перерисовываем панель, только если данные реально изменились — не сбрасываем открытые
// пикеры целей понапрасну.
async function refreshMyCardIfChanged() {
    if (!state.currentRoomCode || !state.playerId) return;
    const fresh = await dbFetchMyCard(state.currentRoomCode, state.playerId);
    const sig = c => (c || []).map(x => `${x.id}:${x.text}:${x.value}:${x.revealed}:${x.used}`).sort().join('|');
    if (sig(fresh) !== sig(state.myCardCache || [])) {
        await loadMyCard();
    }
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
            state.cardsGenerationInFlight = true;
            try {
                if (room.card_mode === 'preset') {
                    await assignPresetCardsForRoom(state.currentRoomCode, players, room.host_id, room.scenario_id);
                } else {
                    await generateCardsForRoom(state.currentRoomCode, players, room.host_id);
                }
                const activeBonusIds = await selectActiveBonusIds(room.scenario_id, players.length);
                await dbSyncRoomBunkerProperties(state.currentRoomCode, room.scenario_id);
                await refreshRoomBunkerProperties();
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
            if (!isHost) await refreshMyCardIfChanged();
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
    return String(str).replace(/[&<>"']/g, s => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": "'" }[s]));
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
        <div class="lobby-grid">
            <div class="lobby-col">
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
            </div>
            <div class="lobby-col">
                <div class="panel">
                    <details ${isHost ? 'open' : ''}>
                        <summary style="cursor:pointer;"><h2 style="display:inline;">Кастомизация</h2></summary>
                        <p class="muted-note">Аватар и цвета будут видны и в лобби, и за столом в игре.</p>
                        <div id="customizationPicker">${renderCustomizationPicker()}</div>
                    </details>
                </div>
                <div class="panel">
                    <details>
                        <summary style="cursor:pointer;"><h2 style="display:inline;">Выбор места</h2></summary>
                        <p class="muted-note">Номер места будет виден рядом с вашим именем в лобби и в игре.</p>
                        <div id="seatPicker">${renderSeatPicker(room)}</div>
                    </details>
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

function resourceUnitLabel(unit) {
    return unit === 'months' ? 'мес.' : unit === 'days' ? 'дн.' : 'да/нет';
}

function defaultResourceItems() {
    return {
        food: { label: 'Еда', unit: 'months', start: 6, enabled: false },
        water: { label: 'Вода', unit: 'months', start: 6, enabled: false },
        electricity: { label: 'Электричество', unit: 'yesno', start: 1, enabled: false },
        medicine: { label: 'Медикаменты', unit: 'days', start: 30, enabled: false }
    };
}

function renderResourceValueField(key, unit, start) {
    return unit === 'yesno'
        ? `<select id="resVal_${key}" style="width:100%;"><option value="1" ${start ? 'selected' : ''}>Да</option><option value="0" ${!start ? 'selected' : ''}>Нет</option></select>`
        : `<input type="number" min="0" id="resVal_${key}" value="${start ?? 0}">`;
}

// Перерисовывает поле значения при смене единицы измерения (месяцы/дни ↔ да-нет) —
// раньше select менялся, а поле значения оставалось прежним и не соответствовало новой единице.
function onResourceUnitChange(key) {
    const unitEl = document.getElementById('resUnit_' + key);
    const wrap = document.getElementById('resValWrap_' + key);
    if (!unitEl || !wrap) return;
    const unit = unitEl.value;
    const prevInput = document.getElementById('resVal_' + key);
    let start = 0;
    if (prevInput) {
        start = unit === 'yesno' ? (Number(prevInput.value) > 0 ? 1 : 0) : Number(prevInput.value || 0);
    }
    wrap.innerHTML = renderResourceValueField(key, unit, start);
}

function renderResourceRow(key, item) {
    const unitOptions = [
        ['months', 'Месяцы'], ['days', 'Дни'], ['yesno', 'Да/Нет']
    ].map(([v, label]) => `<option value="${v}" ${item.unit === v ? 'selected' : ''}>${label}</option>`).join('');

    return `
        <div class="resource-row" style="display:grid; grid-template-columns:auto 1fr 110px 90px; gap:8px; align-items:center; margin-bottom:6px;">
            <input type="checkbox" id="resEnabled_${key}" style="width:auto;" ${item.enabled ? 'checked' : ''}>
            <input type="text" id="resLabel_${key}" value="${item.label}" placeholder="Название ресурса">
            <select id="resUnit_${key}" onchange="onResourceUnitChange('${key}')">${unitOptions}</select>
            <div id="resValWrap_${key}">${renderResourceValueField(key, item.unit, item.start)}</div>
        </div>`;
}

function renderResourceSettings(s) {
    const items = Object.assign(defaultResourceItems(), (s.resources && s.resources.items) || {});
    const rowsHtml = Object.entries(items).map(([key, item]) => renderResourceRow(key, item)).join('');
    return `
        <h3 style="margin-top:14px;">Ресурсы бункера (доп. сложность)</h3>
        <p class="muted-note">Отметьте нужные ресурсы, задайте единицу и стартовый запас. Если у выбранного сценария задан свой набор ресурсов — он используется принудительно, этот блок игнорируется.</p>
        <div id="resourceRows">${rowsHtml}</div>
        <button type="button" class="btn btn-ghost btn-sm" style="margin-top:4px;" onclick="addCustomResourceRow()">+ Свой ресурс</button>
    `;
}

let customResourceCounter = 0;
function addCustomResourceRow() {
    customResourceCounter++;
    const key = 'custom_' + Date.now() + '_' + customResourceCounter;
    const container = document.getElementById('resourceRows');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', renderResourceRow(key, { label: '', unit: 'months', start: 0, enabled: true }));
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
        ${renderResourceSettings(s)}
        <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="actionSaveSettings()">Сохранить настройки</button>
    `;
}

function renderSettingsReadonly(s) {
    const roundSummary = (s.round_reveals || []).map((slots, i) => {
        const labels = (slots || []).map(t => t === 'any' ? 'любая' : (CATEGORY_LABELS[t] || t));
        return `Раунд ${i + 1}: ${labels.length} (${labels.join(', ')})`;
    }).join(' · ');

    const activeResources = Object.values((s.resources && s.resources.items) || {}).filter(r => r.enabled);
    const resourcesSummary = activeResources.length
        ? activeResources.map(r => `${r.label}: ${r.unit === 'yesno' ? (r.start ? 'да' : 'нет') : r.start + ' ' + resourceUnitLabel(r.unit)}`).join(' · ')
        : 'не заданы';

    return `<div class="readonly-settings">
        Игроков: ${s.min_players ?? '?'}–${s.max_players ?? '?'} · Нужно выживших: ${s.target_survivors ?? '?'}<br>
        Раундов: ${s.rounds ?? '?'}<br>
        ${roundSummary ? '<div class="muted-note">' + roundSummary + '</div>' : ''}
        Фазы: открытие ${s.phase_seconds?.reveal ?? '?'}с · обсуждение ${s.phase_seconds?.discussion ?? '?'}с · оправдание ${s.phase_seconds?.defense ?? '?'}с · голосование ${s.phase_seconds?.voting ?? '?'}с<br>
        Личные чаты: ${s.private_chat_enabled ? 'включены' : 'выключены'}<br>
        Ресурсы бункера: ${resourcesSummary}
    </div>`;
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
        html += `
            <div style="background:var(--void); border-radius:4px; padding:8px 10px; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <strong style="width:80px; flex-shrink:0;">Раунд ${i + 1}</strong>
                    <label class="muted-note">характеристик: 
                        <input type="number" min="1" max="10" id="roundCount_${i}" value="${count}" onchange="regenerateRoundSlots(${i})" style="width:60px; display:inline-block; margin:0 0 0 4px;">
                    </label>
                </div>
                <div id="roundSlots_${i}" style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;"></div>
            </div>
        `;
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
    } else if (room.phase_paused_remaining) {
        el.innerHTML = `<span style="color:var(--hazard);">⏸ На паузе — осталось ${room.phase_paused_remaining} сек.</span>`;
    } else {
        el.innerHTML = `<span class="muted-note" style="font-size:16px; text-transform:none; letter-spacing:normal;">⏹ Таймер остановлен</span>`;
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
        ${state.catalog.map(s => `
            <div class="scenario-card" onclick="openScenarioDetail('${s.id}')">
                <h3 style="margin:0;">${escapeHtml(s.title)}</h3>
                ${presetIds.has(s.id) ? '<p class="muted-note" style="margin-top:4px;">🎭 есть готовые карточки персонажей</p>' : ''}
            </div>
        `).join('')}
    `;
}

async function openScenarioDetail(id) {
    if (!state.room || state.room.host_id !== state.playerId) return;
    stopPolling();
    state.view = 'scenarioDetail';
    state.viewingScenario = await dbFetchScenarioDetail(id);
    state.viewingPresets = await dbFetchPresetsForScenario(id);
    state.viewingHostNotes = await dbFetchHostNotes(id);
    renderScenarioDetail();
}

function renderScenarioDetail() {
    const { scenario, base, bonus } = state.viewingScenario;
    const presets = state.viewingPresets || [];
    const isHost = state.room && state.room.host_id === state.playerId;
    // Этот экран и так открывается только ведущему (см. проверку в
    // openScenarioDetail выше), так что здесь можно спокойно показать
    // hostNotes — обычный игрок сюда попасть не может.
    const hostNotes = state.viewingHostNotes || { properties: {}, scenarioNotes: '' };
    const notedBonus = bonus.filter(p => hostNotes.properties[p.id]);

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
        ${isHost && (notedBonus.length || hostNotes.scenarioNotes) ? `
        <div class="panel" style="border:1px dashed #9b7fd4;">
            <h3>🔒 Только для ведущего</h3>
            <p class="muted-note">Игроки этот блок никогда не видят.</p>
            ${notedBonus.length ? `<ul class="prop-list">${notedBonus.map(p => `<li>${escapeHtml(hostNotes.properties[p.id])}</li>`).join('')}</ul>` : ''}
            ${hostNotes.scenarioNotes ? `<h4 style="margin-top:10px;">Победные / проигрышные комбинации</h4><p class="muted-note" style="white-space:pre-line;">${escapeHtml(hostNotes.scenarioNotes)}</p>` : ''}
        </div>
        ` : ''}
        ${presets.length > 0 ? `
            <div class="panel">
                <h3>Готовые карточки персонажей (${presets.length} шт.)</h3>
                <p class="muted-note">У этого сценария есть заранее написанные карточки. Если игроков больше, чем готовых карточек — остальным сгенерируются случайные.</p>
                <ul class="prop-list">${presets.map(pr => `<li>${escapeHtml(pr.label)}</li>`).join('')}</ul>
            </div>
        ` : ''}
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
// ЗАГРУЗКА ОТКРЫТЫХ ХАРАКТЕРИСТИК
// ==========================================
// Порядок открытия характеристик. По умолчанию — порядок игроков как пришли (без ведущего).
// Если карта спецусловия сохранила переопределение на этот раунд (rooms.reveal_order_override),
// используем его — так реально работают «Обмен очередью хода», «Открывает последним» и т.п.
function getRevealOrder(room, players) {
    const base = players.filter(p => p.id !== room.host_id && p.is_alive !== false);
    const override = room.reveal_order_override;
    if (override && override.round === (room.current_round || 1) && Array.isArray(override.order)) {
        const byId = new Map(base.map(p => [p.id, p]));
        const ordered = override.order.map(id => byId.get(id)).filter(Boolean);
        const rest = base.filter(p => !override.order.includes(p.id));
        return [...ordered, ...rest];
    }
    return base;
}

async function fetchRevealedTraits() {
    const { data, error } = await supabaseClient.from('player_cards')
        .select('player_id, category, text')
        .eq('room_code', state.currentRoomCode)
        .eq('revealed', true);
    if (error) return {};

    const traitsByPlayer = {};
    data.forEach(c => {
        if (!traitsByPlayer[c.player_id]) traitsByPlayer[c.player_id] = [];
        traitsByPlayer[c.player_id].push({ cat: CATEGORY_LABELS[c.category] || c.category, text: c.text });
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
        const revealOrder = getRevealOrder(room, state.players);
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
                    <div id="bunkerRevealedList" style="max-height:260px; overflow-y:auto;"></div>
                    <div id="bunkerResourcesList" style="margin-top:10px;"></div>
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
            </div>
            <div class="game-aside">
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
    if (isHost) loadHostMasterPanel();
    loadScenarioPanelGame();
    refreshEventsFeed();
    refreshGameChat();
    loadMyVoteStatus();
    updateGameDynamic();
}

// Блок вердикта вынесен отдельно, чтобы перерисовывать его на каждый тик поллинга —
// раньше кнопки Победа/Поражение не подсвечивались после нажатия (экран рисуется только
// один раз при входе в фазу), а игроки вообще не видели, к чему склоняется ведущий.
function renderVerdictControls(room, isHost) {
    if (room.current_phase !== 'awaiting_verdict') return '';

    if (isHost) {
        return `
            <div class="verdict-controls">
                <div class="settings-field wide" style="margin-top:10px;">
                    <label><input type="checkbox" id="finalRevealToggle" onchange="actionToggleFinalReveal()" ${room.final_reveal_unlocked ? 'checked' : ''} style="width:auto;display:inline-block;margin-right:6px;vertical-align:middle;">Разрешить игрокам открыть последнюю характеристику</label>
                </div>
                <div style="margin-top:10px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                    <button class="btn ${room.verdict === 'victory' ? 'btn-primary' : 'btn-ghost'}" onclick="actionSetVerdictChoice('victory')">${room.verdict === 'victory' ? '✓ ' : ''}Победа</button>
                    <button class="btn ${room.verdict === 'defeat' ? 'btn-danger' : 'btn-ghost'}" onclick="actionSetVerdictChoice('defeat')">${room.verdict === 'defeat' ? '✓ ' : ''}Поражение</button>
                </div>
                <div style="margin-top:12px;">
                    <label class="muted-note" style="display:block; margin-bottom:6px;">Шанс выжить</label>
                    <div style="display:flex; align-items:center; gap:10px; justify-content:center;">
                        <input type="range" id="verdictPercentRange" min="0" max="100" value="${room.verdict_percent ?? 50}" oninput="document.getElementById('verdictPercent').value=this.value" onchange="actionSetVerdictPercent(this.value)" style="flex:1; max-width:220px;">
                        <input type="number" id="verdictPercent" placeholder="%" min="0" max="100" value="${room.verdict_percent ?? ''}" oninput="document.getElementById('verdictPercentRange').value=this.value" onchange="actionSetVerdictPercent(this.value)" style="width:80px; margin:0;"> %
                    </div>
                </div>
                <p class="muted-note" style="margin-top:6px;">Ваш черновой выбор виден игрокам живьём (но ни на что не влияет, пока вы не нажмёте «Огласить вердикт»).</p>
                <button class="btn btn-danger" style="margin-top:12px; width:100%;" onclick="actionAnnounceVerdict()">ОГЛАСИТЬ ВЕРДИКТ</button>
            </div>
        `;
    }

    const choiceLabel = room.verdict === 'victory' ? '🏆 Победа' : (room.verdict === 'defeat' ? '💀 Поражение' : 'ещё не решено');
    return `
        <div class="verdict-controls">
            <p class="muted-note">Черновой выбор ведущего прямо сейчас (окончательно не оглашён):</p>
            <p style="margin-top:6px; font-size:16px;"><strong>${choiceLabel}</strong>${room.verdict_percent != null ? ` · шанс выжить: <strong>${room.verdict_percent}%</strong>` : ''}</p>
        </div>
    `;
}

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
                    ? '<p class="muted-note">Можно открыть последнюю характеристику — кнопка на своей карточке за столом ниже или в своей карточке.</p>'
                    : '<p class="muted-note">Обсудите с ведущим вслух свои шансы на выживание.</p>'));
    } else {
        const survivors = state.players.filter(p => p.id !== room.host_id && p.is_alive !== false);
        const isVictory = room.verdict === 'victory';
        const isDefeat = room.verdict === 'defeat';
        const verdictLabel = isVictory ? 'ПОБЕДА' : (isDefeat ? 'ПОРАЖЕНИЕ' : 'ВЕРДИКТ');
        const verdictClass = isVictory ? 'verdict-win' : (isDefeat ? 'verdict-loss' : '');
        const percent = (room.verdict_percent !== null && room.verdict_percent !== undefined) ? room.verdict_percent : null;
        phaseBody = `
            <div class="verdict-display ${verdictClass}">
                <div class="verdict-icon">${isVictory ? '🏆' : (isDefeat ? '💀' : '⚖️')}</div>
                <div class="verdict-label">${verdictLabel}</div>
                ${percent !== null ? `
                    <div class="verdict-percent-container">
                        <div class="verdict-percent-bar" style="width:${percent}%"></div>
                        <span class="verdict-percent-text">${percent}% шанс выжить</span>
                    </div>` : ''}
                <div class="survivors-list">
                    <span class="survivors-label">Выжившие</span>
                    <strong>${survivors.map(p => escapeHtml(p.name)).join(', ') || 'никто'}</strong>
                </div>
            </div>`;
    }

    document.getElementById('app').innerHTML = `
        <h1>ОСТАТЬСЯ <span>В ЖИВЫХ</span></h1>
        <div class="hazard-strip"></div>
        <div class="panel" style="border-left:6px solid ${meta.color}; text-align:center;">
            <div style="font-size:14px; letter-spacing:0.08em; text-transform:uppercase; color:${meta.color};">${meta.icon} ${escapeHtml(meta.label)}</div>
            ${phaseBody}
            <div id="verdictControls">${renderVerdictControls(room, isHost)}</div>
        </div>
        <div class="panel">
            <h2>Стол</h2>
            <div id="hostStrip"></div>
            <div class="ptable-grid" id="gamePlayersList"></div>
        </div>
        ${!isHost ? `<div class="panel" id="myCardPanel">
            <h2>Моя карточка</h2>
            <p class="muted-note">Загрузка...</p>
        </div>` : ''}
        ${isHost ? `<button class="btn btn-ghost" style="margin-top:16px;" onclick="actionResetToLobby()">Сбросить в лобби (для теста)</button>` : ''}
    `;

    if (!isHost) loadMyCard();
    updateGameDynamic();
}

function renderGameChatPanel(room) {
    const privateEnabled = !!room.settings?.private_chat_enabled;
    const others = state.players.filter(p => p.id !== state.playerId);

    return `
        <div class="panel">
            <div class="section-title"><h2>Чат</h2>
                ${privateEnabled ? `
                    <select id="gameChatRecipient" onchange="switchGameChatRecipient()" style="width:auto; margin:0;">
                        <option value="">Общий чат</option>
                        ${others.map(p => `<option value="${p.id}" ${state.gameChatRecipient === p.id ? 'selected' : ''}>${escapeHtml(p.name)}${p.id === room.host_id ? ' (Ведущий)' : ''}</option>`).join('')}
                    </select>
                ` : ''}
            </div>
            <div class="chat-box">
                <div class="chat-messages" id="gameChatMessages"></div>
                <div class="chat-input-row">
                    <input id="gameChatInput" placeholder="Сообщение..." onkeydown="handleGameChatKey(event)">
                    <button class="btn btn-primary btn-sm" onclick="actionSendGameChat()">➤</button>
                </div>
            </div>
        </div>
    `;
}

function renderHostToolsPanel(room) {
    const targets = state.players.filter(p => p.id !== room.host_id);

    return `
        <div class="panel" id="hostToolsPanel">
            <h2>Панель ведущего</h2>
            <p class="muted-note">Личной карточки у ведущего нет — вместо неё инструменты, которые влияют на ход игры.</p>

            <div id="hostNotesPanel"></div>

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

            <div id="hostMasterPanel"></div>
        </div>`;
}

async function loadHostMasterPanel() {
    const el = document.getElementById('hostMasterPanel');
    if (!el || !state.room) return;
    const room = state.room;

    const [{ data: resources }, { data: properties }] = await Promise.all([
        supabaseClient.from('room_resources').select('*').eq('room_code', state.currentRoomCode).order('key'),
        supabaseClient.from('room_bunker_properties').select('*').eq('room_code', state.currentRoomCode).order('id')
    ]);
    state.hostPropertiesCache = properties || [];

    let catalogOptions = '';
    if (room.scenario_id) {
        const existingIds = (properties || []).map(p => p.property_id).filter(Boolean);
        const { data: catalog } = await supabaseClient.from('bunker_properties').select('id,type,text');
        state.hostCatalogCache = (catalog || []).filter(c => !existingIds.includes(c.id));
        catalogOptions = state.hostCatalogCache.map(c => `<option value="${c.id}">${c.type === 'bonus' ? 'Бонус · ' : 'База · '}${escapeHtml(c.text)}</option>`).join('');
    }

    const resourceRows = (resources || []).map(r => `
        <div style="display:flex; gap:6px; align-items:center; margin-bottom:4px; flex-wrap:wrap;">
            <span style="flex:1;">${escapeHtml(r.label)} <span class="muted-note">(${escapeHtml(r.key)}, ${escapeHtml(r.unit || 'months')})</span></span>
            <input type="number" id="hostResVal_${r.key}" value="${r.amount}" style="width:80px;">
            <button class="btn btn-sm btn-primary" onclick="actionHostSetResource('${r.key}')">✓</button>
            <button class="btn btn-sm btn-ghost" onclick="actionHostDeleteResource('${r.key}')">✕</button>
        </div>
    `).join('') || '<p class="muted-note">Ресурсы не заведены.</p>';

    const propertyRows = (properties || []).map(p => `
        <div style="display:flex; gap:6px; align-items:center; margin-bottom:4px; flex-wrap:wrap;">
            <span style="flex:1;">${p.type === 'bonus' ? '🎁' : '🏠'} ${escapeHtml(p.text)}</span>
            <label class="muted-note"><input type="checkbox" style="width:auto;" ${p.available !== false ? 'checked' : ''} onchange="actionHostTogglePropertyField(${p.id}, 'available')"> доступно</label>
            <label class="muted-note"><input type="checkbox" style="width:auto;" ${p.revealed ? 'checked' : ''} onchange="actionHostTogglePropertyField(${p.id}, 'revealed')"> раскрыто</label>
            <label class="muted-note"><input type="checkbox" style="width:auto;" ${p.blocked ? 'checked' : ''} onchange="actionHostTogglePropertyField(${p.id}, 'blocked')"> заблокировано</label>
            <button class="btn btn-sm btn-ghost" onclick="actionHostDeleteProperty(${p.id})">✕</button>
        </div>
    `).join('') || '<p class="muted-note">Свойств пока нет.</p>';

    el.innerHTML = `
        <h3 style="margin-top:16px;">🛠 Мастер-редактор</h3>
        <p class="muted-note">Живое вмешательство в игру — меняйте что угодно прямо по ходу партии.</p>

        <details open style="margin-top:10px;">
            <summary style="cursor:pointer; font-weight:bold; color:var(--hazard); padding:6px 0;">Ресурсы бункера</summary>
            ${resourceRows}
            <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
                <input id="hostNewResKey" placeholder="ключ (food_extra)" style="flex:1; min-width:100px;">
                <input id="hostNewResLabel" placeholder="название" style="flex:1; min-width:100px;">
                <select id="hostNewResUnit"><option value="months">Месяцы</option><option value="days">Дни</option><option value="yesno">Да/Нет</option></select>
                <input type="number" id="hostNewResAmount" placeholder="0" style="width:70px;">
                <button class="btn btn-sm btn-primary" onclick="actionHostAddResource()">+ Добавить</button>
            </div>
        </details>

        <details style="margin-top:10px;">
            <summary style="cursor:pointer; font-weight:bold; color:var(--hazard); padding:6px 0;">Свойства бункера</summary>
            ${propertyRows}
            <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
                ${catalogOptions ? `<select id="hostCatalogPropSelect" style="flex:1; min-width:160px;">${catalogOptions}</select><button class="btn btn-sm btn-primary" onclick="actionHostAddPropertyFromCatalog()">+ Из каталога</button>` : '<span class="muted-note">Каталог пуст или сценарий не выбран.</span>'}
            </div>
            <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
                <input id="hostCustomPropText" placeholder="своё свойство (текст)" style="flex:1; min-width:160px;">
                <select id="hostCustomPropType"><option value="bonus">Бонус</option><option value="base">База</option></select>
                <button class="btn btn-sm btn-primary" onclick="actionHostAddCustomProperty()">+ Добавить своё</button>
            </div>
        </details>

        <details style="margin-top:10px;">
            <summary style="cursor:pointer; font-weight:bold; color:var(--hazard); padding:6px 0;">Карточки игроков</summary>
            <select id="hostCardEditorPlayer" onchange="loadHostCardEditor(this.value)">
                <option value="">— выберите игрока —</option>
                ${state.players.filter(p => p.id !== room.host_id).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
            <div id="hostCardEditorList" style="margin-top:8px;"></div>
        </details>

        <details style="margin-top:10px;">
            <summary style="cursor:pointer; font-weight:bold; color:var(--hazard); padding:6px 0;">⚙️ Настройки игры</summary>
            <p class="muted-note">То же самое, что задавалось в лобби, но теперь можно поменять по ходу партии. Длительность фаз применяется к следующему запуску таймера — уже идущий отсчёт не меняет.</p>
            <div class="settings-grid">
                <div class="settings-field"><label>Нужно выживших</label><input type="number" min="1" id="liveTargetSurvivors" value="${room.settings?.target_survivors ?? 3}"></div>
                <div class="settings-field"><label>Всего раундов</label><input type="number" min="${room.current_round || 1}" id="liveRounds" value="${room.settings?.rounds ?? 6}"></div>
                <div class="settings-field"><label>Открытие, сек</label><input type="number" min="1" id="liveReveal" value="${room.settings?.phase_seconds?.reveal ?? 60}"></div>
                <div class="settings-field"><label>Обсуждение, сек</label><input type="number" min="1" id="liveDiscussion" value="${room.settings?.phase_seconds?.discussion ?? 180}"></div>
                <div class="settings-field"><label>Оправдание, сек</label><input type="number" min="1" id="liveDefense" value="${room.settings?.phase_seconds?.defense ?? 30}"></div>
                <div class="settings-field"><label>Голосование, сек</label><input type="number" min="1" id="liveVoting" value="${room.settings?.phase_seconds?.voting ?? 60}"></div>
                <div class="settings-field wide">
                    <label><input type="checkbox" id="livePrivateChat" style="width:auto;display:inline-block;margin-right:6px;vertical-align:middle;" ${room.settings?.private_chat_enabled ? 'checked' : ''}>Разрешить личные чаты между игроками</label>
                </div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="actionHostSaveLiveSettings()">Сохранить настройки игры</button>
        </details>

        ${renderEffectKeyReference()}
    `;
}

// Справочник всех реально зарегистрированных effect_key — берётся напрямую из движка
// (AliveEffectEngine.list()), чтобы список не расходился с кодом effect-registry.js.
// datalist даёт автоподстановку в поле effect_key выше — так сложнее опечататься.
function updateEffectKeyHint(cardId) {
    const input = document.getElementById('hostCardEffectKey_' + cardId);
    const hint = document.getElementById('hostCardEffectKeyHint_' + cardId);
    if (!input || !hint) return;
    hint.textContent = EFFECT_KEY_DESCRIPTIONS[input.value] || (input.value ? 'Неизвестный ключ — не зарегистрирован в effect-registry.js' : '');
}

function renderEffectKeyReference() {
    const keys = (typeof window !== 'undefined' && window.AliveEffectEngine?.list) ? window.AliveEffectEngine.list().sort() : [];
    return `
        <datalist id="registeredEffectKeys">
            ${keys.map(k => `<option value="${escapeHtml(k)}" label="${escapeHtml(EFFECT_KEY_DESCRIPTIONS[k] || '')}">`).join('')}
        </datalist>
        <details style="margin-top:12px;">
            <summary class="muted-note" style="cursor:pointer;">Справочник: все зарегистрированные effect_key (${keys.length})</summary>
            <div style="font-size:12px; line-height:1.6; margin-top:6px; max-height:260px; overflow-y:auto;">
                ${keys.map(k => `<div style="margin-bottom:5px;"><code style="background:var(--void); padding:1px 5px; border-radius:3px; color:var(--hazard);">${escapeHtml(k)}</code> <span class="muted-note">— ${escapeHtml(EFFECT_KEY_DESCRIPTIONS[k] || 'нет описания')}</span></div>`).join('')}
            </div>
        </details>`;
}

async function actionHostSetResource(key) {
    const input = document.getElementById('hostResVal_' + key);
    if (!input) return;
    const { error } = await supabaseClient.from('room_resources')
        .update({ amount: Number(input.value || 0), updated_at: new Date().toISOString() })
        .eq('room_code', state.currentRoomCode).eq('key', key);
    if (error) return alert('Ошибка: ' + error.message);
    loadHostMasterPanel();
    refreshBunkerResources();
}

async function actionHostDeleteResource(key) {
    if (!confirm('Удалить ресурс из игры?')) return;
    await supabaseClient.from('room_resources').delete().eq('room_code', state.currentRoomCode).eq('key', key);
    loadHostMasterPanel();
    refreshBunkerResources();
}

async function actionHostAddResource() {
    const key = document.getElementById('hostNewResKey').value.trim();
    const label = document.getElementById('hostNewResLabel').value.trim();
    const unit = document.getElementById('hostNewResUnit').value;
    const amount = Number(document.getElementById('hostNewResAmount').value || 0);
    if (!key || !label) return alert('Укажите ключ и название.');
    const { error } = await supabaseClient.from('room_resources')
        .upsert({ room_code: state.currentRoomCode, key, label, unit, amount }, { onConflict: 'room_code,key' });
    if (error) return alert('Ошибка: ' + error.message);
    loadHostMasterPanel();
    refreshBunkerResources();
}

async function actionHostTogglePropertyField(id, field) {
    const p = (state.hostPropertiesCache || []).find(x => x.id === id);
    if (!p) return;
    const { error } = await supabaseClient.from('room_bunker_properties').update({ [field]: !p[field] }).eq('id', id);
    if (error) return alert('Ошибка: ' + error.message);
    loadHostMasterPanel();
    await refreshRoomBunkerProperties();
    refreshBunkerList();
}

async function actionHostDeleteProperty(id) {
    if (!confirm('Удалить это свойство из бункера этой комнаты?')) return;
    await supabaseClient.from('room_bunker_properties').delete().eq('id', id);
    loadHostMasterPanel();
    await refreshRoomBunkerProperties();
    refreshBunkerList();
}

async function actionHostAddPropertyFromCatalog() {
    const sel = document.getElementById('hostCatalogPropSelect');
    if (!sel || !sel.value) return;
    const pick = (state.hostCatalogCache || []).find(x => String(x.id) === String(sel.value));
    if (!pick) return;
    const { error } = await supabaseClient.from('room_bunker_properties').insert({
        room_code: state.currentRoomCode, property_id: pick.id, type: pick.type, text: pick.text,
        available: true, revealed: true, blocked: false
    });
    if (error) return alert('Ошибка: ' + error.message);
    loadHostMasterPanel();
    await refreshRoomBunkerProperties();
    refreshBunkerList();
}

async function actionHostAddCustomProperty() {
    const textEl = document.getElementById('hostCustomPropText');
    const typeEl = document.getElementById('hostCustomPropType');
    const text = textEl.value.trim();
    if (!text) return alert('Введите текст свойства.');
    // Если у вас в БД property_id обязателен (NOT NULL / внешний ключ на bunker_properties),
    // эта вставка упадёт с ошибкой — тогда нужно снять это ограничение отдельным ALTER TABLE.
    const { error } = await supabaseClient.from('room_bunker_properties').insert({
        room_code: state.currentRoomCode, property_id: null, type: typeEl.value, text,
        available: true, revealed: true, blocked: false
    });
    if (error) return alert('Ошибка: ' + error.message + '\n\nВозможно, property_id не может быть пустым в вашей схеме — уберите это ограничение через ALTER TABLE room_bunker_properties ALTER COLUMN property_id DROP NOT NULL.');
    textEl.value = '';
    loadHostMasterPanel();
    await refreshRoomBunkerProperties();
    refreshBunkerList();
}

async function loadHostCardEditor(playerId) {
    const el = document.getElementById('hostCardEditorList');
    if (!el) return;
    if (!playerId) { el.innerHTML = ''; return; }
    const { data, error } = await supabaseClient.from('player_cards').select('*')
        .eq('room_code', state.currentRoomCode).eq('player_id', playerId).order('category');
    if (error) { el.innerHTML = '<p class="muted-note">Ошибка загрузки карт.</p>'; return; }
    el.innerHTML = (data || []).map(c => {
        const isSpecial = c.category === 'special_condition';
        const mechanicFields = isSpecial ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:6px;">
                <label class="muted-note">effect_key
                    <input id="hostCardEffectKey_${c.id}" value="${escapeHtml(c.effect_key || '')}" placeholder="начните вводить..." list="registeredEffectKeys" oninput="updateEffectKeyHint('${c.id}')">
                    <div id="hostCardEffectKeyHint_${c.id}" class="muted-note" style="font-size:11px; margin-top:-4px;">${escapeHtml(EFFECT_KEY_DESCRIPTIONS[c.effect_key] || '')}</div>
                </label>
                <label class="muted-note">target_type
                    <select id="hostCardTargetType_${c.id}">
                        ${['self', 'one', 'two', 'all', 'one_any', 'host'].map(t => `<option value="${t}" ${c.target_type === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                </label>
                <label class="muted-note">target_kind
                    <select id="hostCardTargetKind_${c.id}">
                        ${['player', 'property'].map(t => `<option value="${t}" ${(c.target_kind || 'player') === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                </label>
                <label class="muted-note">effect_params (JSON)
                    <input id="hostCardEffectParams_${c.id}" value='${escapeHtml(JSON.stringify(c.effect_params || {}))}'>
                </label>
            </div>
            <p class="muted-note" style="font-size:11px; margin-top:2px;">effect_key должен совпадать с зарегистрированным в effect-registry.js — иначе карта при использовании выдаст ошибку «эффект не зарегистрирован».</p>
        ` : '';
        return `
        <div class="card-row" style="flex-direction:column; align-items:stretch;">
            <div style="display:flex; justify-content:space-between;">
                <span class="card-row-cat">${escapeHtml(CATEGORY_LABELS[c.category] || c.category)}</span>
                <span class="muted-note">${c.revealed ? 'раскрыто' : 'скрыто'}${c.used ? ' · использовано' : ''}</span>
            </div>
            <textarea id="hostCardText_${c.id}" style="min-height:50px;">${escapeHtml(c.text || '')}</textarea>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <label class="muted-note">Значение <input type="number" id="hostCardValue_${c.id}" value="${c.value ?? 0}" style="width:80px; display:inline-block;"></label>
                <label class="muted-note"><input type="checkbox" id="hostCardRevealed_${c.id}" style="width:auto;" ${c.revealed ? 'checked' : ''}> раскрыто</label>
                <label class="muted-note"><input type="checkbox" id="hostCardUsed_${c.id}" style="width:auto;" ${c.used ? 'checked' : ''}> использовано</label>
            </div>
            ${mechanicFields}
            <button class="btn btn-sm btn-primary" style="margin-top:6px;" onclick="actionHostSaveCard('${c.id}', ${isSpecial})">Сохранить</button>
        </div>`;
    }).join('') || '<p class="muted-note">У игрока нет карт.</p>';
}

async function actionHostSaveLiveSettings() {
    const room = state.room;
    const targetSurvivors = parseInt(document.getElementById('liveTargetSurvivors').value) || 1;
    const rounds = parseInt(document.getElementById('liveRounds').value) || (room.current_round || 1);
    const reveal = parseInt(document.getElementById('liveReveal').value) || 60;
    const discussion = parseInt(document.getElementById('liveDiscussion').value) || 180;
    const defense = parseInt(document.getElementById('liveDefense').value) || 30;
    const voting = parseInt(document.getElementById('liveVoting').value) || 60;
    const privateChat = document.getElementById('livePrivateChat').checked;

    if (rounds < (room.current_round || 1)) {
        return alert('Нельзя выставить меньше раундов, чем уже сыграно (' + (room.current_round || 1) + ').');
    }

    const settings = {
        ...(room.settings || {}),
        target_survivors: targetSurvivors,
        rounds,
        phase_seconds: { reveal, discussion, defense, voting },
        private_chat_enabled: privateChat
    };

    await dbUpdateRoom(state.currentRoomCode, { settings });
    alert('Настройки игры обновлены.');
    loadHostMasterPanel();
}

async function actionHostSaveCard(cardId, isSpecial) {
    const text = document.getElementById('hostCardText_' + cardId).value;
    const value = Number(document.getElementById('hostCardValue_' + cardId).value || 0);
    const revealed = document.getElementById('hostCardRevealed_' + cardId).checked;
    const used = document.getElementById('hostCardUsed_' + cardId).checked;
    const patch = { text, value, revealed, used };

    if (isSpecial) {
        const effectKeyEl = document.getElementById('hostCardEffectKey_' + cardId);
        const targetTypeEl = document.getElementById('hostCardTargetType_' + cardId);
        const targetKindEl = document.getElementById('hostCardTargetKind_' + cardId);
        const paramsEl = document.getElementById('hostCardEffectParams_' + cardId);
        if (effectKeyEl) patch.effect_key = effectKeyEl.value.trim() || null;
        if (targetTypeEl) patch.target_type = targetTypeEl.value;
        if (targetKindEl) patch.target_kind = targetKindEl.value;
        if (paramsEl) {
            try {
                patch.effect_params = paramsEl.value.trim() ? JSON.parse(paramsEl.value) : {};
            } catch (e) {
                return alert('effect_params — некорректный JSON: ' + e.message);
            }
        }
    }

    const { error } = await supabaseClient.from('player_cards').update(patch).eq('id', cardId);
    if (error) return alert('Ошибка: ' + error.message);
    updateGameDynamic();
}

function renderHostPhaseControls(room, hasTimer) {
    let timerButtons = '';
    if (hasTimer) {
        if (room.phase_running) {
            timerButtons = `<button class="btn btn-ghost btn-sm" onclick="hostPauseTimer()">⏸ Пауза</button> <button class="btn btn-ghost btn-sm" onclick="hostStopTimer()">⏹ Сброс</button>`;
        } else if (room.phase_paused_remaining) {
            timerButtons = `<button class="btn btn-primary btn-sm" onclick="hostResumeTimer()">▶ Продолжить</button> <button class="btn btn-ghost btn-sm" onclick="hostStopTimer()">⏹ Сброс</button>`;
        } else {
            timerButtons = `<button class="btn btn-primary btn-sm" onclick="hostStartTimer()">▶ Старт таймера</button>`;
        }
    }

    const advanceButton = `<button class="btn btn-danger btn-sm" onclick="hostAdvancePhase()">Далее →</button>`;

    return `<div style="margin-top:12px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;"> ${timerButtons} ${advanceButton} </div>`;
}

async function updateGameDynamic() {
    const room = state.room;
    if (!room) return;
    const isHost = room.host_id === state.playerId;

    const verdictEl = document.getElementById('verdictControls');
    if (verdictEl) verdictEl.innerHTML = renderVerdictControls(room, isHost);

    const nominees = room.nominees || [];
    const defenseIdx = room.defense_index || 0;
    const revealIdx = room.reveal_index || 0;
    const revealOrder = getRevealOrder(room, state.players);
    const revealActiveId = (revealOrder[revealIdx] || {}).id;

    const nominations = room.nominations || {};
    const myNomination = nominations[state.playerId];

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

            const traitsHtml = (revealedTraits[p.id] || []).map(t => 
                `<div style="font-size:11px; color:#b7b190; margin-top:2px;"><b>${t.cat}:</b> ${escapeHtml(t.text)}</div>`
            ).join('');

            let finalRevealHtml = '';
            if (room.current_phase === 'awaiting_verdict' && isMe) {
                const hidden = (state.myCardCache || []).filter(c => !c.revealed);
                if (hidden.length > 0) {
                    finalRevealHtml = room.final_reveal_unlocked
                        ? hidden.map(c => `<button class="btn btn-sm btn-primary" style="margin-top:4px;" onclick="actionRevealTrait('${c.id}')">Открыть: ${escapeHtml(CATEGORY_LABELS[c.category] || c.category)}</button>`).join('')
                        : '<div class="muted-note" style="font-size:11px; margin-top:4px;">Ждите разрешения ведущего</div>';
                }
            }

            const isTimedOut = p.timeout_until && new Date(p.timeout_until) > new Date();
            const modBadges = `${p.is_muted ? '<span class="badge badge-muted">Мут</span>' : ''}${isTimedOut ? '<span class="badge badge-timeout">Таймаут</span>' : ''}`;
            const modControls = (isHost && !isMe) ? `
                <div style="display:flex; gap:4px; margin-top:4px;">
                    <button class="btn btn-ghost btn-sm" onclick="actionToggleMute('${p.id}', ${p.is_muted})">${p.is_muted ? 'Размутить' : 'Мут'}</button>
                    <button class="btn btn-ghost btn-sm" onclick="actionTimeout('${p.id}', '${escapeHtml(p.name)}')">Таймаут</button>
                </div>` : '';

            return `<div class="ptable-card${isSpeaking ? ' speaking' : ''}${isNominated ? ' nominated' : ''}${isEliminated ? ' eliminated' : ''}">
                <div class="ptable-card-head">
                    ${avatarChip(p)}
                    <div class="ptable-name" style="${nameColorStyle(p)}">${p.seat_number ? '№' + p.seat_number + ' ' : ''}${escapeHtml(p.name)}${isMe ? ' (Вы)' : ''}</div>
                </div>
                <div class="ptable-card-body">
                    ${traitsHtml}
                    ${isEliminated ? '<span class="badge badge-muted">Выбыл(а)</span>' : ''}
                    ${isNominated && !isEliminated ? '<span class="badge badge-timeout">Выставлен(а)</span>' : ''}
                    ${modBadges}
                    ${myNomination === p.id ? '<span class="muted-note">Ваш выбор</span>' : ''}
                    ${canNominate ? `<button class="btn btn-ghost btn-sm" onclick="actionNominate('${p.id}')">Выставить</button>` : ''}
                    ${state.myVoteThisRound === p.id ? '<span class="muted-note">Ваш голос</span>' : ''}
                    ${canVote ? `<button class="btn btn-ghost btn-sm" onclick="actionCastVote('${p.id}')">Голосовать</button>` : ''}
                    ${finalRevealHtml}
                    ${modControls}
                </div>
            </div>`;
        }).join('');
    }

    loadVoteProgress();

    const scenPanel = document.getElementById('scenarioPanelGame');
    if (scenPanel) scenPanel.style.display = room.scenario_visible ? 'block' : 'none';

    await refreshRoomBunkerProperties();
    refreshBunkerList();
    refreshBunkerResources();
    refreshEventsFeed();
    refreshGameChat();
    syncGamePhaseTimerTicker();
}

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

// Проверяет активные флаги блокировки чата от карт спецусловий за этот раунд.
// isPrivate=true — проверяем личный чат (chat_block_self_private), иначе общий (chat_block_all/neighbors).
async function checkChatBlocked(isPrivate) {
    const room = state.room;
    if (!room) return null;
    const keys = isPrivate ? ['chat_block_self_private'] : ['chat_block_all', 'chat_block_neighbors'];
    const { data } = await supabaseClient.from('round_effects').select('id')
        .eq('room_code', state.currentRoomCode).eq('round', room.current_round || 1)
        .eq('is_active', true).eq('target_player_id', state.playerId).in('effect_key', keys);
    if (data && data.length) return 'Использование ' + (isPrivate ? 'личного чата' : 'чата') + ' заблокировано в этом раунде (эффект спецусловия).';
    return null;
}

async function actionSendGameChat() {
    const input = document.getElementById('gameChatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const me = state.players.find(p => p.id === state.playerId);
    if (me && me.is_muted) return alert('Вы в муте, писать нельзя.');
    if (me && me.timeout_until && new Date(me.timeout_until) > new Date()) return alert('Вы в таймауте.');

    const chatBlocked = await checkChatBlocked(!!state.gameChatRecipient);
    if (chatBlocked) return alert(chatBlocked);

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

    const visible = events.filter(e => !e.private || isHost || e.target_id === state.playerId);
    if (visible.length === 0) { el.innerHTML = '<li class="muted-note">Пока ничего не произошло.</li>'; return; }

    el.innerHTML = visible.map(e => {
        const targetName = e.target_id ? (state.players.find(p => p.id === e.target_id) || {}).name : null;
        return `<li>${eventIcon(e.type)} ${escapeHtml(e.text)}${targetName ? `<span class="muted-note">(${escapeHtml(targetName)})</span>` : ''}${e.private ? '<span class="muted-note">🔒 лично</span>' : ''}</li>`;
    }).join('');
}

async function actionSendEvent() {
    const textEl = document.getElementById('eventText');
    const text = textEl.value.trim();
    if (!text) return alert('Введите текст события.');

    const type = document.getElementById('eventType').value;
    const targetId = document.getElementById('eventTarget').value || null;

    await dbInsertEvent(state.currentRoomCode, state.room.current_round, type, text, targetId, !!targetId);
    textEl.value = '';
    refreshEventsFeed();
}

async function actionQuickEvent(kind) {
    const room = state.room;
    const alivePlayers = state.players.filter(p => p.id !== room.host_id);

    if (kind === 'find') {
        const text = await hostRevealRandomBonusProperty();
        if (!text) return alert('Все доступные бонусные свойства бункера уже открыты.');
        await dbInsertEvent(state.currentRoomCode, room.current_round, 'positive',
            `Пока шло обсуждение, один из выживших обнаружил в дальнем углу бункера ещё один тайник — досрочно открыто: «${text}».`, null, false);
        refreshBunkerList();
        refreshBunkerResources();
        if (typeof loadHostMasterPanel === 'function') loadHostMasterPanel();
    } else if (kind === 'incident') {
        if (alivePlayers.length === 0) return;
        const victim = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        await dbTimeoutPlayer(state.currentRoomCode, victim.id, state.playerId, 60);
        await dbInsertEvent(state.currentRoomCode, room.current_round, 'negative',
            victim.name + ' получил(а) лёгкую травму при ЧП в бункере и не может писать в чат следующую минуту.', victim.id, false);
    }
    refreshEventsFeed();
}

async function actionToggleScenarioVisible() {
    await dbUpdateRoom(state.currentRoomCode, { scenario_visible: !state.room.scenario_visible });
}

function canRevealCategory(card, room, category) {
    // Спец.условие — карта-действие: НЕ занимает слот раскрытия и не считается в лимите раунда.
    if (category === 'special_condition') return { ok: true };

    // Финал: лимит раскрытий раунда сюда не применяется вообще — это отдельный, разовый
    // механизм «открыть последнюю характеристику», единственное условие — разрешение ведущего.
    if (room.current_phase === 'awaiting_verdict') {
        if (!room.final_reveal_unlocked) return { ok: false, reason: 'Ведущий пока не разрешил открывать последнюю характеристику.' };
        return { ok: true };
    }

    if (category === 'goal') {
        return { ok: false, reason: 'Цель нельзя открывать другим игрокам.' };
    }
    
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
    if (card.some(c => c.category === 'special_condition' && c.target_kind === 'property')) {
        await refreshRoomBunkerProperties();
    }
    const note = await dbFetchNote(state.currentRoomCode, state.playerId);

    const revealOrder = getRevealOrder(room, state.players);
    const isMyRevealTurn = room.current_phase === 'reveal' && (revealOrder[room.reveal_index || 0] || {}).id === state.playerId;
    const amEliminated = (state.players.find(p => p.id === state.playerId) || {}).is_alive === false;

    const itemsHtml = card.map(c => {
        const isSpecial = c.category === 'special_condition';
        let liClass = '', extra = '';

        if (isSpecial && !c.used) {
            // Спецусловия — карты-действия, а не информация «на раскрытие по расписанию»:
            // используются в любой момент игры, без привязки к фазе «Открытие», очереди хода
            // и лимиту характеристик за раунд (это ограничение только для обычных характеристик ниже).
            liClass = 'special-unused';
            if (amEliminated) {
                extra = '<div class="muted-note" style="font-size:11px; margin-top:3px;">(вы выбыли — использование недоступно)</div>';
            } else {
                const targetKind = c.target_kind || 'player';
                const tt = c.target_type || 'self';

                if (targetKind === 'property') {
                    const properties = (state.roomBunkerProperties || []).filter(p =>
                        p.available !== false && !(p.blocked && (p.blocked_until_round == null || p.blocked_until_round >= (room.current_round || 1)))
                    );
                    const selectedId = `bunkerPropertyPicker_${c.id}`;
                    extra = `<div style="margin-top:6px;">
                        <div class="muted-note" style="font-size:11px; margin-bottom:4px;">Выберите свойство бункера</div>
                        ${properties.length ? `<select id="${selectedId}" style="width:100%; padding:8px; background:var(--void); border:1px solid #4a4e28; color:var(--paper); border-radius:4px;">${properties.map(p => `<option value="${p.property_id}">${escapeHtml(p.type === 'bonus' ? 'Бонус · ' : 'База · ')}${escapeHtml(p.text)}</option>`).join('')}</select>
                        <button class="btn btn-sm btn-danger" style="margin-top:5px;" onclick="actionUseSpecialCondition('${c.id}')">Подтвердить использование</button>` : '<span class="muted-note">Нет доступных свойств бункера для выбора.</span>'}
                    </div>`;
                } else {
                    const others = state.players.filter(p => p.id !== state.playerId && p.id !== room.host_id);

                    if (tt === 'self') {
                        extra = `<div style="margin-top:6px;">
                                <button class="btn btn-sm btn-primary" onclick="actionUseSpecialCondition('${c.id}')">Использовать</button>
                            </div>`;
                    } else if (tt === 'all') {
                        extra = `<div style="margin-top:6px;">
                                <button class="btn btn-sm btn-primary" onclick="actionUseSpecialCondition('${c.id}')">Использовать (на всех игроков)</button>
                            </div>`;
                    } else {
                        const inputType = tt === 'two' ? 'checkbox' : 'radio';
                        const needCount = tt === 'two' ? 2 : 1;
                        const hint = tt === 'two' ? 'Выберите ровно 2 цели' : 'Выберите 1 цель';
                        extra = `<div style="margin-top:6px;">
                                <button class="btn btn-sm btn-primary" onclick="toggleTargetPicker('${c.id}')">Использовать</button>
                                <div id="targetPicker_${c.id}" data-target-type="${tt}" data-need-count="${needCount}" style="display:none; margin-top:6px;">
                                    <div class="muted-note" style="font-size:11px;">${hint}</div>
                                    ${others.length ? others.map(p =>
                                        `<label class="muted-note" style="display:block;"><input type="${inputType}" name="targetPicker_${c.id}_radio" value="${p.id}" style="width:auto; display:inline-block; margin-right:4px;">${escapeHtml(p.name)}</label>`
                                    ).join('') : '<span class="muted-note">Нет других игроков для выбора цели.</span>'}
                                    <button class="btn btn-sm btn-danger" style="margin-top:4px;" onclick="actionUseSpecialCondition(\'${c.id}\')">Подтвердить использование</button>
                                </div>
                            </div>`;
                    }
                }
            }
        } else if (!c.revealed) {
            if (room.current_phase === 'awaiting_verdict') {
                const check = canRevealCategory(card, room, c.category);
                extra = check.ok
                    ? `<button class="btn btn-sm btn-primary" style="margin-top:5px;" onclick="actionRevealTrait('${c.id}')">Открыть остальным</button>`
                    : `<div class="muted-note" style="font-size:11px; margin-top:3px;">${escapeHtml(check.reason)}</div>`;
            } else if (amEliminated) {
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
        } else if (isSpecial && c.used) {
            liClass = 'special-used';
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
        ${historyHtml ? `<details style="margin-top:14px;"><summary style="cursor:pointer; font-weight:bold; color:var(--hazard);">История ваших действий</summary><ul class="prop-list" style="margin-top:8px;">${historyHtml}</ul></details>` : ''}
    `;
}

function toggleTargetPicker(cardId) {
    const el = document.getElementById('targetPicker_' + cardId);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

const bunkerEffectHandlers = {
    decrease_bunker_capacity: async (card) => dbExecuteBunkerEffect(card, null),
    increase_bunker_capacity: async (card) => dbExecuteBunkerEffect(card, null),
    block_bunker_property: async (card, targetPropertyId) => {
        if (!targetPropertyId) throw new Error('Для этого эффекта необходимо выбрать свойство бункера.');
        return dbExecuteBunkerEffect(card, targetPropertyId);
    }
};

async function actionUseSpecialCondition(cardId) {
    const card = (state.myCardCache || []).find(c => String(c.id) === String(cardId));
    if (!card) return alert('Спецусловие не найдено. Обновите страницу и попробуйте снова.');
    if (card.used) return alert('Это спецусловие уже использовано.');

    const room = state.room;
    const targetKind = card.target_kind || 'player';
    const tt = card.target_type || 'self';
    const picker = document.getElementById('targetPicker_' + cardId);
    let targets = [];
    let targetPropertyId = null;

    if (targetKind === 'property') {
        const propertyPicker = document.getElementById('bunkerPropertyPicker_' + cardId);
        targetPropertyId = propertyPicker ? propertyPicker.value : null;
        if (!targetPropertyId) return alert('Выберите свойство бункера.');

        const property = (state.roomBunkerProperties || []).find(p => String(p.property_id) === String(targetPropertyId));
        if (!property) return alert('Свойство бункера не найдено. Обновите экран.');
        if (property.available === false) return alert('Это свойство сейчас недоступно.');
        if (property.blocked && (property.blocked_until_round == null || property.blocked_until_round >= (room.current_round || 1))) {
            return alert('Это свойство уже заблокировано в текущем раунде.');
        }
    } else if (tt === 'self') {
        targets = [];
    } else if (tt === 'all') {
        targets = state.players.filter(p => p.id !== state.playerId && p.id !== room.host_id && p.is_alive !== false).map(p => p.id);
    } else {
        targets = picker ? Array.from(picker.querySelectorAll('input:checked')).map(cb => cb.value) : [];
        const needCount = tt === 'two' ? 2 : 1;
        if (targets.length !== needCount) {
            return alert('Нужно выбрать ровно ' + needCount + ' цел' + (needCount === 1 ? 'ь' : 'и') + ' для этого спецусловия.');
        }
    }

    const handler = card.action_type === 'bunker_effect' ? bunkerEffectHandlers[card.effect_key] : null;
    if (handler) {
        try {
            const result = await handler(card, targetPropertyId);
            if (result === false) return;
            state.room = await dbFetchRoom(state.currentRoomCode);
            await refreshRoomBunkerProperties();
            await loadMyCard();
            updateGameDynamic();
            return;
        } catch (e) {
            console.error('Ошибка применения bunker_effect:', e);
            return alert('Не удалось применить эффект. Карта не потрачена.\n' + (e.message || e));
        }
    }

    const { error } = await supabaseClient.from('player_cards').update({ used: true, used_targets: targets }).eq('id', cardId);
    if (error) { console.error('Ошибка использования спецусловия:', error); return alert('Не удалось использовать спецусловие: ' + error.message); }

    const myName = (state.players.find(p => p.id === state.playerId) || {}).name || state.playerName;
    const targetNames = targets.map(id => (state.players.find(p => p.id === id) || {}).name).filter(Boolean);

    await dbInsertEvent(state.currentRoomCode, state.room.current_round, 'neutral',
        myName + ' использовал(а) спецусловие: ' + card.text + (targetNames.length ? ' (цель: ' + targetNames.join(', ') + ')' : ''),
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

    if (room.current_phase === 'awaiting_verdict') {
        if (!room.final_reveal_unlocked) return alert('Ведущий ещё не разрешил открывать последнюю характеристику.');
        const card = state.myCardCache || [];
        const target = card.find(c => String(c.id) === String(cardId));
        if (!target) return alert('Характеристика не найдена, попробуйте обновить страницу.');
        if (target.revealed) return;
        const check = canRevealCategory(card, room, target.category);
        if (!check.ok) return alert(check.reason);

        const { error } = await supabaseClient.from('player_cards').update({ revealed: true, round_revealed: room.current_round }).eq('id', cardId);
        if (error) { console.error('Ошибка открытия характеристики:', error); return alert('Не удалось открыть характеристику: ' + error.message); }
        loadMyCard();
        updateGameDynamic();
        return;
    }

    if (me && me.is_alive === false) return alert('Вы выбыли из игры и не можете открывать характеристики.');
    if (room.current_phase !== 'reveal') return alert('Открытие характеристик доступно только в фазе «Открытие раунда».');

    const revealOrder = getRevealOrder(room, state.players);
    const active = revealOrder[room.reveal_index || 0];
    if (!active || active.id !== state.playerId) return alert('Сейчас не ваш ход.');

    const card = state.myCardCache || [];
    const target = card.find(c => String(c.id) === String(cardId));
    if (!target) return alert('Характеристика не найдена, попробуйте обновить страницу.');

    const check = canRevealCategory(card, room, target.category);
    if (!check.ok) return alert(check.reason);

    if (target.category === 'luggage_big' || target.category === 'luggage_small') {
        const luggageBlock = await checkLuggageBlocked(room, target.category);
        if (luggageBlock) return alert(luggageBlock);
    }

    const { error } = await supabaseClient.from('player_cards').update({ revealed: true, round_revealed: room.current_round }).eq('id', cardId);
    if (error) { console.error('Ошибка открытия характеристики:', error); return alert('Не удалось открыть характеристику: ' + error.message); }

    loadMyCard();
    updateGameDynamic();
}

// Проверяет активные эффекты block_luggage за этот раунд: либо направленные лично на вас,
// либо с scope='all' (действуют на всех игроков сразу — например карта «Запрет»).
async function checkLuggageBlocked(room, category) {
    const { data, error } = await supabaseClient.from('round_effects').select('*')
        .eq('room_code', state.currentRoomCode).eq('round', room.current_round || 1)
        .eq('is_active', true).eq('effect_key', 'block_luggage');
    if (error) { console.error('[checkLuggageBlocked]', error); return null; }

    const blocking = (data || []).find(e => {
        const categories = e.effect_params?.categories || ['luggage_big', 'luggage_small'];
        if (!categories.includes(category)) return false;
        return e.target_player_id === null || e.target_player_id === state.playerId;
    });
    if (!blocking) return null;
    return blocking.target_player_id === null
        ? 'Использование багажа заблокировано у всех игроков в этом раунде.'
        : 'Использование багажа заблокировано у вас в этом раунде.';
}

async function loadScenarioPanelGame() {
    const room = state.room;
    if (!room.scenario_id) return;

    if (!state.gameScenario || state.gameScenario.scenario?.id !== room.scenario_id) {
        state.gameScenario = await dbFetchScenarioDetail(room.scenario_id);
    }

    const isHost = room.host_id === state.playerId;
    if (isHost && (!state.gameHostNotes || state.gameHostNotesFor !== room.scenario_id)) {
        state.gameHostNotes = await dbFetchHostNotes(room.scenario_id);
        state.gameHostNotesFor = room.scenario_id;
    }

    renderScenarioPanelGameContent();
    await refreshRoomBunkerProperties();
    refreshBunkerList();
    refreshBunkerResources();
    if (isHost) refreshHostNotesPanel();
}

// Рендерит блок "только для ведущего" внутри панели ведущего (см.
// renderHostToolsPanel). Ничего не делает для обычных игроков — контейнер
// #hostNotesPanel вообще не существует в их разметке.
function refreshHostNotesPanel() {
    const el = document.getElementById('hostNotesPanel');
    if (!el) return;
    const room = state.room;
    if (!room || room.host_id !== state.playerId) { el.innerHTML = ''; return; }

    const hostNotes = state.gameHostNotes || { properties: {}, scenarioNotes: '' };
    const bonus = state.gameScenario?.bonus || [];
    const notedBonus = bonus.filter(p => hostNotes.properties[p.id]);

    if (!notedBonus.length && !hostNotes.scenarioNotes) { el.innerHTML = ''; return; }

    el.innerHTML = `
        <div class="panel" style="border:1px dashed #9b7fd4;">
            <h3>🔒 Только для ведущего</h3>
            <p class="muted-note">Игроки этот блок никогда не видят.</p>
            ${notedBonus.length ? `<ul class="prop-list">${notedBonus.map(p => `<li>${escapeHtml(p.text)}<br><span class="muted-note">${escapeHtml(hostNotes.properties[p.id])}</span></li>`).join('')}</ul>` : ''}
            ${hostNotes.scenarioNotes ? `<h4 style="margin-top:10px;">Победные / проигрышные комбинации</h4><p class="muted-note" style="white-space:pre-line;">${escapeHtml(hostNotes.scenarioNotes)}</p>` : ''}
        </div>
    `;
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

async function refreshBunkerResources() {
    const el = document.getElementById('bunkerResourcesList');
    if (!el) return;
    const room = state.room;
    if (!room?.code && !state.currentRoomCode) { el.innerHTML = ''; return; }

    const { data, error } = await supabaseClient.from('room_resources')
        .select('*').eq('room_code', state.currentRoomCode).order('key');
    if (error) { console.error('[refreshBunkerResources]', error); return; }

    if (!data || !data.length) { el.innerHTML = ''; return; }

    el.innerHTML = `
        <div class="muted-note" style="font-size:11px; text-transform:uppercase; margin-bottom:4px;">Ресурсы</div>
        <ul style="list-style:none;">
            ${data.map(r => {
                const low = Number(r.amount) <= 0;
                const display = r.unit === 'yesno'
                    ? (Number(r.amount) > 0 ? 'Да' : 'Нет')
                    : `${r.amount} ${resourceUnitLabel(r.unit)}`;
                return `<li style="display:flex; justify-content:space-between; padding:4px 0; ${low ? 'color:var(--danger);' : ''}">
                    <span>${escapeHtml(r.label)}</span><strong>${escapeHtml(display)}</strong>
                </li>`;
            }).join('')}
        </ul>
    `;
}

function refreshBunkerList() {
    const bunkerEl = document.getElementById('bunkerRevealedList');
    if (!bunkerEl) return;

    const room = state.room || {};
    const capacity = Number(room.settings?.target_survivors || 1);
    const props = state.roomBunkerProperties || [];

    const blocked = props.filter(p => p.blocked && (p.blocked_until_round == null || p.blocked_until_round >= (room.current_round || 1)));
    const revealedBonus = props.filter(p => p.type === 'bonus' && p.revealed && p.available !== false && !blocked.includes(p));
    const activeCount = props.filter(p => p.available !== false && !p.blocked).length;

    bunkerEl.innerHTML = `
        <li style="list-style:none; margin-bottom:8px;"><strong>Вместимость:</strong> ${capacity} чел.</li>
        ${blocked.length ? `<li style="list-style:none; margin-bottom:8px;"><span class="badge badge-timeout">ЗАБЛОКИРОВАНО: ${blocked.length}</span><div class="muted-note" style="font-size:11px; margin-top:4px;">${blocked.map(p => escapeHtml(p.text)).join('<br>')}</div></li>` : ''}
        ${revealedBonus.length ? revealedBonus.map(p => `<li class="bonus"><span class="prop-tag">Бонус</span>${escapeHtml(p.text)}</li>`).join('') : '<li class="muted-note" style="list-style:none;">Пока ничего не открыто.</li>'}
        <li class="muted-note" style="list-style:none; margin-top:6px;">Активных свойств: ${activeCount}</li>
    `;
}

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
    const revealOrder = getRevealOrder(room, state.players);

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
        await dbCleanupRoundBunkerEffects(state.currentRoomCode, round);
        await refreshRoomBunkerProperties();
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

async function actionNominate(targetId) {
    const room = state.room;
    if (state.playerId === room.host_id) return alert('Ведущий не может участвовать в голосованиях и выставлениях.');

    const me = state.players.find(p => p.id === state.playerId);
    if (me && me.is_alive === false) return alert('Вы выбыли из игры и не можете выставлять.');
    if (room.current_phase !== 'nomination') return;
    if (targetId === state.playerId) return alert('Нельзя выставить самого себя.');
    if (targetId === room.host_id) return alert('Нельзя выставить ведущего.');

    const { data: blocks } = await supabaseClient.from('round_effects').select('id')
        .eq('room_code', state.currentRoomCode).eq('round', room.current_round || 1)
        .eq('is_active', true).eq('effect_key', 'skip_nomination').eq('target_player_id', state.playerId);
    if (blocks && blocks.length) return alert('В этом раунде вы не можете никого выставить на голосование (эффект спецусловия).');

    const nominations = { ...(room.nominations || {}) };
    if (nominations[state.playerId]) return alert('Вы уже выставили игрока в этом раунде — изменить нельзя.');

    nominations[state.playerId] = targetId;
    const nominees = [...new Set(Object.values(nominations))];

    await dbUpdateRoom(state.currentRoomCode, { nominations, nominees });
}

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

async function actionToggleFinalReveal() {
    await dbUpdateRoom(state.currentRoomCode, { final_reveal_unlocked: !state.room.final_reveal_unlocked });
}

async function actionSetVerdictChoice(choice) {
    await dbUpdateRoom(state.currentRoomCode, { verdict: choice });
}

async function actionSetVerdictPercent(value) {
    const percent = Math.max(0, Math.min(100, parseInt(value) || 0));
    await dbUpdateRoom(state.currentRoomCode, { verdict_percent: percent });
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

// Единая точка раскрытия случайного bonus-свойства бункера — через room_bunker_properties,
// ту же таблицу, что использует effect-registry.js для карт спецусловий. Раньше кнопка
// ведущего и «Находка» работали через отдельную систему (rooms.active_bonus_ids/revealed_bonus_ids),
// никак не связанную с тем, что видят и меняют спецусловия — теперь везде один источник истины.
async function hostRevealRandomBonusProperty() {
    const props = state.roomBunkerProperties && state.roomBunkerProperties.length
        ? state.roomBunkerProperties
        : await refreshRoomBunkerProperties();
    const hidden = (props || []).filter(p => p.type === 'bonus' && !p.revealed);
    if (!hidden.length) return null;
    const pick = hidden[Math.floor(Math.random() * hidden.length)];
    const { error } = await supabaseClient.from('room_bunker_properties')
        .update({ revealed: true, available: true }).eq('id', pick.id);
    if (error) { console.error('[hostRevealRandomBonusProperty]', error); return null; }
    await refreshRoomBunkerProperties();
    return pick.text;
}

async function actionRevealBonus() {
    const text = await hostRevealRandomBonusProperty();
    if (!text) return alert('Все дополнительные свойства этой партии уже открыты.');
    refreshBunkerList();
    if (typeof loadHostMasterPanel === 'function') loadHostMasterPanel();
}

async function actionResetToLobby() {
    stopGamePhaseTick();
    const roomCode = state.currentRoomCode;
    const scenarioId = state.room?.scenario_id;

    await dbClearCards(roomCode);
    await dbClearEvents(roomCode);
    await dbClearVotes(roomCode);
    await supabaseClient.from('players').update({ is_alive: true }).eq('room_code', roomCode);

    // Таблицы движка спецусловий — без этого старые блокировки/эффекты/изменённые
    // ресурсы бункера и переставленная очередь хода переживают рестарт и ошибочно
    // применяются в новой игре (например, block_special_condition с прошлого теста
    // снова совпадёт с раундом 1 новой партии).
    await supabaseClient.from('round_effects').delete().eq('room_code', roomCode);
    await supabaseClient.from('effect_log').delete().eq('room_code', roomCode);
    await supabaseClient.from('room_resources').delete().eq('room_code', roomCode);
    if (scenarioId) await dbSyncRoomBunkerProperties(roomCode, scenarioId);

    await dbUpdateRoom(state.currentRoomCode, {
        phase: 'lobby', countdown_ends_at: null, current_round: 1, current_phase: 'reveal',
        phase_ends_at: null, phase_running: false, phase_paused_remaining: null,
        nominees: [], nominations: {}, defense_index: 0, reveal_index: 0, reveal_order_override: null,
        active_bonus_ids: [], revealed_bonus_ids: [], scenario_visible: false, last_eliminated_id: null,
        final_reveal_unlocked: false, verdict: null, verdict_percent: null
    });

    state.lastRenderedView = null;
    state.lastGameRenderKey = null;
    state.gameScenario = null;
    state.roomBunkerProperties = [];
    state.lastBunkerRoundCleanup = null;
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

    const resourceRowsEl = document.getElementById('resourceRows');
    const resourceItems = {};
    if (resourceRowsEl) {
        resourceRowsEl.querySelectorAll('.resource-row').forEach(row => {
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (!checkbox) return;
            const key = checkbox.id.replace('resEnabled_', '');
            const labelEl = document.getElementById('resLabel_' + key);
            const unitEl = document.getElementById('resUnit_' + key);
            const valEl = document.getElementById('resVal_' + key);
            const label = (labelEl?.value || '').trim();
            if (!label) return; // пустое название — пропускаем строку (например, пустой «свой ресурс»)
            resourceItems[key] = {
                label,
                unit: unitEl?.value || 'months',
                start: Number(valEl?.value || 0),
                enabled: checkbox.checked
            };
        });
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
        private_chat_enabled: document.getElementById('setPrivateChat').checked,
        resources: {
            enabled: Object.values(resourceItems).some(r => r.enabled),
            items: resourceItems
        }
    };

    await dbUpdateRoom(state.currentRoomCode, { settings });
    await syncRoomResources(state.currentRoomCode, resourceItems);
    alert('Настройки сохранены');
}

// Заранее создаёт/обновляет строки в room_resources для включённых ресурсов,
// чтобы они были видны и готовы сразу, а не только при первом использовании карты.
// Если у сценария задан свой resource_schema — он всё равно имеет приоритет в effect-registry.js,
// эта синхронизация лишь готовит значения из ручных настроек хоста.
async function syncRoomResources(roomCode, items) {
    const enabledEntries = Object.entries(items).filter(([, item]) => item.enabled);
    if (!enabledEntries.length) return;
    const rows = enabledEntries.map(([key, item]) => ({
        room_code: roomCode, key, label: item.label, amount: Number(item.start || 0), unit: item.unit || 'months'
    }));
    const { error } = await supabaseClient.from('room_resources').upsert(rows, { onConflict: 'room_code,key' });
    if (error) console.error('[syncRoomResources]', error);
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

    const { data: immune } = await supabaseClient.from('round_effects').select('id')
        .eq('room_code', state.currentRoomCode).eq('round', 0)
        .eq('is_active', true).eq('effect_key', 'timeout_immune').eq('target_player_id', targetId);
    if (immune && immune.length) {
        await supabaseClient.from('round_effects').update({ is_active: false }).eq('id', immune[0].id);
        return alert(targetName + ' использовал(а) карту иммунитета — таймаут в этот раз не применён (иммунитет израсходован).');
    }

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

// ============================================================
// STAGE 4.2 — FINAL BUNKER EFFECT CLIENT LAYER
// ============================================================
// Этот блок дополняет уже существующую реализацию Stage 4.2.
// Он не создаёт новую архитектуру, а синхронизирует UI
// с текущими SQL-функциями:
//
//   execute_bunker_effect()
//   sync_room_bunker_properties()
//   cleanup_round_bunker_effects()
//
// Источник истины:
//   rooms.settings.target_survivors
//   room_bunker_properties
//   player_cards.used
//   round_effects
// ============================================================


/**
 * Возвращает текущий номер раунда.
 */
function getCurrentRoundSafe() {
    return Number(state.room?.current_round || state.room?.round || 1);
}


/**
 * Проверяет, действительно ли свойство заблокировано
 * именно сейчас.
 *
 * blocked_until_round = текущий раунд
 * означает, что свойство заблокировано до конца текущего раунда.
 */
function isBunkerPropertyBlockedNow(property, round = getCurrentRoundSafe()) {
    if (!property) return false;
    if (property.available === false) return true;
    if (!property.blocked) return false;

    if (
        property.blocked_until_round == null ||
        Number(property.blocked_until_round) >= Number(round)
    ) {
        return true;
    }

    return false;
}


/**
 * Возвращает только доступные для выбора свойства.
 */
function getAvailableBunkerProperties() {
    const round = getCurrentRoundSafe();

    return (state.roomBunkerProperties || []).filter(property => {
        if (property.available === false) return false;
        if (isBunkerPropertyBlockedNow(property, round)) return false;
        return true;
    });
}


/**
 * Повторно загружает состояние бункера.
 *
 * Важно:
 * SQL является источником истины.
 * Локальный state никогда не изменяем вручную
 * после bunker-effect.
 */
async function refreshBunkerStateAfterEffect() {
    if (!state.currentRoomCode) return;

    try {
        state.room = await dbFetchRoom(state.currentRoomCode);

        state.roomBunkerProperties =
            await dbFetchRoomBunkerProperties(state.currentRoomCode);

        if (typeof dbFetchPlayers === 'function') {
            state.players =
                await dbFetchPlayers(state.currentRoomCode);
        }

        return true;
    } catch (error) {
        console.error(
            'Ошибка обновления состояния бункера:',
            error
        );

        return false;
    }
}


/**
 * Безопасное выполнение bunker-effect.
 *
 * SQL всё равно является главным валидатором,
 * поэтому клиент не пытается самостоятельно менять
 * target_survivors или room_bunker_properties.
 */
async function dbExecuteBunkerEffect(card, targetPropertyId = null) {

    if (!card) {
        throw new Error('Карта спецусловия не найдена.');
    }

    if (card.category !== 'special_condition') {
        throw new Error('Эта карта не является спецусловием.');
    }

    if (card.used) {
        throw new Error('Это спецусловие уже использовано.');
    }

    if (!card.effect_key) {
        throw new Error(
            'У этого спецусловия отсутствует effect_key.'
        );
    }

    if (!state.currentRoomCode) {
        throw new Error('Игровая комната не определена.');
    }

    const targetId =
        targetPropertyId !== null &&
        targetPropertyId !== undefined &&
        targetPropertyId !== ''
            ? Number(targetPropertyId)
            : null;


    // --------------------------------------------------------
    // Дополнительная клиентская проверка Саботажа.
    // --------------------------------------------------------

    if (card.effect_key === 'block_bunker_property') {

        if (!targetId) {
            throw new Error(
                'Для Саботажа необходимо выбрать свойство бункера.'
            );
        }

        const property =
            (state.roomBunkerProperties || []).find(
                p => Number(p.property_id) === targetId
            );

        if (!property) {
            throw new Error(
                'Выбранное свойство бункера не найдено.'
            );
        }

        if (property.available === false) {
            throw new Error(
                'Это свойство бункера недоступно.'
            );
        }

        if (isBunkerPropertyBlockedNow(property)) {
            throw new Error(
                'Это свойство уже заблокировано в текущем раунде.'
            );
        }
    }


    // --------------------------------------------------------
    // RPC
    // --------------------------------------------------------

    const { data, error } =
        await supabaseClient.rpc(
            'execute_bunker_effect',
            {
                p_room_code: state.currentRoomCode,
                p_player_id: state.playerId,
                p_card_id: Number(card.id),
                p_effect_key: card.effect_key,
                p_target_property_id: targetId,
                p_effect_params:
                    card.effect_params || {}
            }
        );

    if (error) {
        console.error(
            'Ошибка execute_bunker_effect:',
            error
        );

        throw error;
    }


    // --------------------------------------------------------
    // После успешного RPC БД уже изменилась.
    // Теперь обновляем клиент.
    // --------------------------------------------------------

    await refreshBunkerStateAfterEffect();

    return data;
}


/**
 * Актуальные обработчики bunker-effect.
 *
 * Не создаём новый const — объект уже существует
 * в текущем app.js.
 */
if (typeof bunkerEffectHandlers !== 'undefined') {

    Object.assign(
        bunkerEffectHandlers,

        {

            decrease_bunker_capacity: async card => {
                return dbExecuteBunkerEffect(card, null);
            },


            increase_bunker_capacity: async card => {
                return dbExecuteBunkerEffect(card, null);
            },


            block_bunker_property: async (
                card,
                targetPropertyId
            ) => {

                if (!targetPropertyId) {
                    throw new Error(
                        'Выберите свойство бункера.'
                    );
                }

                return dbExecuteBunkerEffect(
                    card,
                    targetPropertyId
                );
            }

        }
    );
}


/**
 * Финальная версия использования спецусловия.
 *
 * Она заменяет старую actionUseSpecialCondition,
 * сохраняя существующий UI.
 */
async function actionUseSpecialCondition(cardId) {

    const card =
        (state.myCardCache || []).find(
            c => String(c.id) === String(cardId)
        );


    if (!card) {
        return alert(
            'Спецусловие не найдено. Обновите страницу.'
        );
    }


    if (card.used) {
        return alert(
            'Это спецусловие уже использовано.'
        );
    }


    if (card.category !== 'special_condition') {
        return alert(
            'Эта карта не является спецусловием.'
        );
    }


    if (!card.effect_key) {
        return alert(
            'У карты отсутствует effect_key.'
        );
    }


    const room = state.room;

    if (!room) {
        return alert(
            'Игровая комната ещё не загружена.'
        );
    }


    const targetKind =
        card.target_kind || 'player';

    let targetPropertyId = null;
    let targets = [];


    // ========================================================
    // TARGET: BUNKER PROPERTY
    // ========================================================

    if (targetKind === 'property') {

        const picker =
            document.getElementById(
                'bunkerPropertyPicker_' + cardId
            );


        targetPropertyId =
            picker ? picker.value : null;


        if (!targetPropertyId) {
            return alert(
                'Выберите свойство бункера.'
            );
        }


        const property =
            (state.roomBunkerProperties || []).find(
                p =>
                    String(p.property_id) ===
                    String(targetPropertyId)
            );


        if (!property) {
            return alert(
                'Свойство бункера не найдено. Обновите экран.'
            );
        }


        if (property.available === false) {
            return alert(
                'Это свойство сейчас недоступно.'
            );
        }


        if (isBunkerPropertyBlockedNow(property)) {
            return alert(
                'Это свойство уже заблокировано в текущем раунде.'
            );
        }
    }


    // ========================================================
    // ОСТАЛЬНЫЕ TARGET TYPE
    // ========================================================

    else {

        const targetType =
            card.target_type || 'self';


        if (targetType === 'self') {
            targets = [];
        }


        else if (targetType === 'all') {
            targets =
                state.players
                    .filter(
                        p =>
                            p.id !== state.playerId &&
                            p.is_alive !== false
                    )
                    .map(p => p.id);
        }


        else {

            const picker =
                document.getElementById(
                    'targetPicker_' + cardId
                );


            if (!picker) {
                return alert(
                    'Не удалось открыть выбор цели.'
                );
            }


            const checked =
                Array.from(
                    picker.querySelectorAll(
                        'input[type="radio"]:checked,' +
                        'input[type="checkbox"]:checked'
                    )
                );


            const targetTypeValue =
                picker.dataset.targetType ||
                targetType;


            const needCount =
                Number(
                    picker.dataset.needCount ||
                    (
                        targetTypeValue === 'two'
                            ? 2
                            : 1
                    )
                );


            targets =
                checked.map(
                    input => input.value
                );


            if (targets.length !== needCount) {
                return alert(
                    'Нужно выбрать ровно ' +
                    needCount +
                    ' цел' +
                    (
                        needCount === 1
                            ? 'ь'
                            : 'и'
                    ) +
                    ' для этого спецусловия.'
                );
            }
        }
    }


    // ========================================================
    // BUNKER EFFECT
    // ========================================================

    const handler =
        card.action_type === 'bunker_effect'
            ? bunkerEffectHandlers[card.effect_key]
            : null;


    if (!handler) {
        return alert(
            'Для этого спецусловия пока нет обработчика: ' +
            card.effect_key
        );
    }


    try {

        // Блокируем кнопки конкретной карты,
        // чтобы двойной клик не отправил два RPC.
        const cardButtons =
            document.querySelectorAll(
                `[onclick*="${String(cardId)}"]`
            );

        cardButtons.forEach(button => {
            button.disabled = true;
        });


        const result =
            await handler(
                card,
                targetPropertyId
            );


        // ----------------------------------------------------
        // ВАЖНО:
        // карта должна стать used в БД внутри RPC.
        // Здесь НЕ делаем update player_cards вручную.
        // ----------------------------------------------------


        // Обновляем комнату и свойства.
        await refreshBunkerStateAfterEffect();


        // Обновляем локальный cache карточек.
        if (
            Array.isArray(state.myCardCache)
        ) {

            const cachedCard =
                state.myCardCache.find(
                    c =>
                        String(c.id) ===
                        String(cardId)
                );

            if (cachedCard) {
                cachedCard.used = true;

                if (
                    targetPropertyId !== null
                ) {
                    cachedCard.used_targets =
                        [Number(targetPropertyId)];
                }
            }
        }


        // ----------------------------------------------------
        // Если существует перерисовка игры —
        // запускаем её.
        // ----------------------------------------------------

        if (typeof renderGame === 'function') {
            try {
                renderGame();
            } catch (renderError) {
                console.warn(
                    'Не удалось сразу перерисовать игру:',
                    renderError
                );
            }
        }


        alert(
            card.effect_key ===
                'block_bunker_property'

                ? 'Свойство бункера заблокировано до конца текущего раунда.'

                : card.effect_key ===
                    'increase_bunker_capacity'

                    ? 'Вместимость бункера увеличена.'

                    : 'Вместимость бункера уменьшена.'
        );


        return result;

    } catch (error) {

        console.error(
            'Ошибка применения спецусловия:',
            error
        );


        alert(
            error?.message ||
            'Не удалось применить спецусловие.'
        );


        // При ошибке снова разрешаем кнопки.
        const cardButtons =
            document.querySelectorAll(
                `[onclick*="${String(cardId)}"]`
            );

        cardButtons.forEach(button => {
            button.disabled = false;
        });
    }
}


/**
 * Обновление bunker state после смены раунда.
 *
 * cleanup_round_bunker_effects вызывается сервером,
 * затем клиент перечитывает состояние.
 */
async function refreshBunkerStateForCurrentRound() {

    if (!state.currentRoomCode) {
        return;
    }

    const round =
        getCurrentRoundSafe();


    try {

        await dbCleanupRoundBunkerEffects(
            state.currentRoomCode,
            round - 1
        );

    } catch (error) {

        console.warn(
            'Не удалось выполнить cleanup эффектов:',
            error
        );

    }


    await refreshBunkerStateAfterEffect();
}


/**
 * Удобный helper для отображения вместимости.
 */
function getBunkerCapacity() {

    return Number(
        state.room?.settings?.target_survivors ??
        1
    );
}


/**
 * Человеческое описание bunker-effect.
 */
function getBunkerEffectLabel(effectKey) {

    switch (effectKey) {

        case 'decrease_bunker_capacity':
            return 'Уменьшение вместимости бункера';

        case 'increase_bunker_capacity':
            return 'Увеличение вместимости бункера';

        case 'block_bunker_property':
            return 'Блокировка свойства бункера';

        default:
            return effectKey || 'Эффект бункера';
    }
}


/**
 * Для будущего UI:
 * получить состояние конкретного свойства.
 */
function getBunkerPropertyState(propertyId) {

    return (
        state.roomBunkerProperties || []
    ).find(
        p =>
            Number(p.property_id) ===
            Number(propertyId)
    ) || null;
}
