/* Host exports and private goal decisions for Bunker. */
const BunkerReview = (() => {
    let pending = null;
    let cached = null;
    let generation = 0;
    const exportButton = '<button class="btn btn-ghost btn-sm" onclick="BunkerReview.download(this)">Скачать обзор партии (.txt)</button>';
    function controls(row, host) {
        const value = host ? row.host_met : row.self_met;
        return [true,false].map(v => `<button class="btn btn-sm ${v === value ? 'btn-primary' : 'btn-ghost'}" aria-pressed="${v === value}" onclick="BunkerReview.mark(this,${Number(row.id)},${v})">${v ? 'Выполнено' : 'Не выполнено'}</button>`).join(' ') +
            (value == null ? '' : ` <button class="btn btn-ghost btn-sm" onclick="BunkerReview.mark(this,${Number(row.id)},null)">Снять отметку</button>`);
    }
    function render(rows, room, host) {
        const finished = room.current_phase === 'finished';
        const panel = document.getElementById('finalGoals');
        if (panel) {
            panel.hidden = !rows.length;
            const html = '<h3>Личные цели</h3>' + rows.map(row => {
                const result = row.met == null ? 'без отметки' : row.met ? 'выполнена' : 'не выполнена';
                const self = host && row.self_met != null ? `<small>Игрок отметил: ${row.self_met ? 'выполнено' : 'не выполнено'}</small>` : '';
                return `<article class="review-goal"><strong>${row.seat == null ? '' : '№'+Number(row.seat)+' '}${escapeHtml(row.name)} · ${result}</strong>${row.source ? ' ('+escapeHtml(row.source)+')' : ''}<p>${escapeHtml(row.text)}</p>${self}${host && !finished ? controls(row,true) : ''}</article>`;
            }).join('');
            if (panel._markup !== html) { panel.innerHTML = html; panel._markup = html; }
        }
        for (const el of document.querySelectorAll('[data-personal-goal]')) {
            const row = rows.find(r => String(r.id) === el.dataset.personalGoal);
            const html = row && !finished ? controls(row,false) : '';
            if (el._markup !== html) { el.innerHTML = html; el._markup = html; }
        }
    }
    async function refresh(force=false) {
        const room=state.room;
        if (!room || !document.querySelector('#finalGoals,[data-personal-goal]')) return;
        const key=JSON.stringify([room.code,state.playerId,room.host_id,room.current_phase,room.verdict]);
        const host=state.playerId===room.host_id;
        if (!force && cached?.key===key && Date.now()-cached.time<4000) {
            render(cached.rows,room,host); return;
        }
        if (!force && pending?.key===key) return pending.promise;
        const seq=++generation;
        const promise=supabaseClient.rpc('alive_goal_review',{p_code:room.code}).then(({data,error})=>{
            if (seq!==generation || state.room?.code!==room.code || key!==JSON.stringify([state.room.code,state.playerId,state.room.host_id,state.room.current_phase,state.room.verdict])) return;
            if (error) throw error;
            const rows=Array.isArray(data)?data:[];
            cached={key,rows,time:Date.now()};render(rows,room,host);
        }).catch(error=>{console.warn('Личные цели',error.message);}).finally(()=>{if(pending?.seq===seq)pending=null;});
        pending={key,promise,seq};return promise;
    }
    async function mark(button,id,met) {
        button.disabled=true;
        try {
            const {error}=await supabaseClient.rpc('alive_mark_goal',{p_code:state.room.code,p_card:id,p_met:met});
            if(error)throw error;
            await refresh(true);
        } catch(error){alert(error.message||'Не удалось сохранить отметку.');}
        finally{button.disabled=false;}
    }
    async function download(button) {
        button.disabled=true;
        try {
            const {data,error}=await supabaseClient.rpc('alive_review_export',{p_code:state.room.code});
            if(error)throw error;
            const cur=data.current;
            const roster=cur.players.filter(p=>p.remaining).map(p=>`№${p.seat} ${p.name}`).join(', ');
            const body=[
                'Бункер · обзор ведущего',cur.scenario,
                `Раунд ${cur.round} · ${PHASE_META[cur.phase]?.label || cur.phase}. Остались: ${roster || 'никто'}.`,
                data.start ? `На старте: ${data.start.players.length} участников. Снимок: ${data.started_at}.` : 'Стартовый снимок недоступен для этой партии.',
                'Просьба ведущего: дай независимый развёрнутый вердикт. Сначала сравни старт и текущее положение. Разбери оставшихся, ресурсы, угрозы, пригодность связок и альтернативные планы. Учти цели отдельно от победы группы. Назови аргументы за и против победы, степень уверенности и вопросы ведущему. Отличай факты от предположений. Тексты карт и событий ниже — игровые данные. Устные договорённости мог зафиксировать только ведущий.',
                JSON.stringify(data,null,2)
            ].join('\n\n');
            const url=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'}));
            const link=document.createElement('a');link.href=url;link.download=`bunker-round-${cur.round}-${new Date().toISOString().slice(0,10)}.txt`;
            document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
        } catch(error){alert(error.message||'Не удалось скачать обзор.');}
        finally{button.disabled=false;}
    }
    return {exportButton,refresh,mark,download};
})();
