function buildLossReasonOptions(lead: LeadRecord) {
    const current = String(lead.lossReason || '').trim();
    const options = ['Preço', 'Concorrência', 'Desistência'];
    const finalOptions = current && !options.includes(current) ? [current, ...options] : options;
    return finalOptions.map((option) => `<option value="${option}" ${current === option ? 'selected' : ''}>${option}</option>`).join('');
}

function showLeadEditModal(id: string) {
    if (!canWrite()) return;
    const lead = findLeadById(id);
    if (!lead) return;

    const leadId = JSON.stringify(lead.id);
    const tasks = Array.isArray(lead.tasks) ? lead.tasks : [];
    const canClaimLead = !!(canWrite() && !isAdmin() && currentSession && currentSession.role === 'consultor' && isSharedSiteLead(lead));
    const ownerLabel = isSharedSiteLead(lead) ? '—' : (lead.owner || '—');
    const modal = document.getElementById('modal-edit');
    if (!modal) return;

    modal.innerHTML = `
        <div class="modal-card edit-card">
            <div class="modal-header">
                <h3>Editar Lead</h3>
                <button onclick="toggleModal('modal-edit', false)">&times;</button>
            </div>
            <div class="edit-body">
                <div class="edit-main">
                    <div class="edit-hero">
                        <div class="edit-hero-copy">
                            <span class="edit-kicker">Lead em edição</span>
                            <h4>${lead.name || 'Lead sem nome'}</h4>
                            <p>Atualize etapa, dados comerciais e observações sem perder o contexto do atendimento.</p>
                        </div>
                        <div class="edit-hero-badges">
                            <span class="edit-stage-pill">${lead.stage || 'Sem etapa'}</span>
                            <span class="edit-date-pill">${formatDateOnly(lead.createdAt ?? lead.id)}</span>
                        </div>
                    </div>

                    <div class="edit-summary-grid">
                        <div class="edit-summary-card edit-owner-slot">
                            <span class="edit-summary-label">Responsável</span>
                            <strong>${ownerLabel}</strong>
                            ${canClaimLead ? `<button class="btn-confirm btn-small edit-claim-btn" type="button" onclick='claimLead(${leadId})'>Assumir lead</button>` : ''}
                        </div>
                        <div class="edit-summary-card">
                            <span class="edit-summary-label">Criado em</span>
                            <strong>${formatDateOnly(lead.createdAt ?? lead.id)}</strong>
                        </div>
                        <div class="edit-summary-card">
                            <span class="edit-summary-label">Valor atual</span>
                            <strong>R$ ${Number(lead.value || 0).toLocaleString()}</strong>
                        </div>
                    </div>

                    <div class="edit-section-card">
                        <div class="edit-section-head">
                            <div>
                                <h5>Pipeline e contato</h5>
                                <p>Defina etapa, valor, telefone e próximo passo.</p>
                            </div>
                        </div>
                        <div class="edit-form-grid">
                            <div class="edit-field edit-field-full">
                                <label>Etapa atual</label>
                                <select id="ed-stage" onchange="checkLoss(this.value)">
                                    ${STAGES.map((stage) => `<option value="${stage}" ${lead.stage === stage ? 'selected' : ''}>${stage}</option>`).join('')}
                                </select>
                            </div>
                            <div id="loss-area" class="edit-field edit-field-full" style="display: ${lead.stage === 'Perdido' ? 'block' : 'none'}">
                                <label>Motivo da perda</label>
                                <select id="ed-loss">
                                    ${buildLossReasonOptions(lead)}
                                </select>
                            </div>
                            <div class="edit-field">
                                <label>Valor</label>
                                <input type="number" id="ed-value" value="${lead.value || 0}">
                            </div>
                            <div class="edit-field">
                                <label>Celular</label>
                                <input type="tel" id="ed-phone" value="${lead.phone || ''}" placeholder="Ex: (11) 91234-5678">
                            </div>
                            <div class="edit-field edit-field-full">
                                <label>Próximo passo</label>
                                <input type="text" id="ed-step" value="${lead.nextStep || ''}">
                            </div>
                        </div>
                    </div>

                    <div class="edit-section-card">
                        <div class="edit-section-head">
                            <div>
                                <h5>Contexto comercial</h5>
                                <p>Use tags e observações para dar mais contexto ao atendimento.</p>
                            </div>
                        </div>
                        <div class="edit-form-grid">
                            <div class="edit-field edit-field-full">
                                <label>Tags</label>
                                <input type="text" id="ed-tags" value="${Array.isArray(lead.tags) ? lead.tags.join(', ') : ''}" placeholder="Ex: quente, whatsapp, indicação">
                            </div>
                            <div class="edit-field edit-field-full">
                                <label>Observações</label>
                                <textarea id="ed-obs">${lead.obs || ''}</textarea>
                            </div>
                        </div>
                    </div>

                    <div class="edit-actions">
                        <button class="btn-confirm" type="button" onclick='saveEdit(${leadId})'>Salvar alterações</button>
                        <button class="btn-danger" type="button" onclick='deleteLead(${leadId})'>Apagar lead</button>
                    </div>
                </div>

                <div class="edit-tasks">
                    <div class="edit-side-head">
                        <div>
                            <span class="edit-kicker">Rotina</span>
                            <h4><i class="ph ph-check-square"></i> Tarefas</h4>
                            <p>Centralize pendências e acompanhe o que já foi executado.</p>
                        </div>
                    </div>
                    <div class="task-add">
                        <input type="text" id="tk-new" placeholder="Nova tarefa...">
                        <button type="button" onclick='addTask(${leadId})'><i class="ph ph-plus"></i></button>
                    </div>
                    <div class="tk-list">
                        ${tasks.map((task, index) => `
                            <div class="tk-item ${task.done ? 'done' : ''}" onclick='toggleTask(${leadId}, ${index})'>
                                <div class="tk-item-row">
                                    <span>${task.done ? '✅' : '⬤'} Tarefa ${index + 1} • ${coerceEpochMs(task && task.createdAt) ? formatDateOnly(task.createdAt) : 'sem data'} — ${task.desc}</span>
                                    <button type="button" class="tk-del" title="Excluir tarefa" onclick='event.stopPropagation(); deleteTask(${leadId}, ${index})'>
                                        <i class="ph ph-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;

    toggleModal('modal-edit', true);

    if (isAdmin()) {
        const ownerSlot = modal.querySelector('.edit-owner-slot');
        if (ownerSlot) {
            ownerSlot.innerHTML = `<span class="edit-summary-label">Consultor</span><select id="ed-owner">${buildOwnerOptionsHtmlV2(lead.owner, undefined)}</select>`;
            populateOwnerSelect(lead.owner);
        }
    }
}

async function claimLeadAction(id: string) {
    if (!canWrite()) return;
    if (!currentSession || currentSession.role !== 'consultor') return;

    const me = sanitizeString(currentSession.user || '', 60).toLowerCase();
    if (!me) return;

    const lead = findLeadById(id);
    if (!lead) return;
    if (!isSharedSiteLead(lead)) {
        alert('Este lead já foi assumido por outro consultor.');
        return;
    }

    const now = Date.now();
    const next = { ...lead, owner: me, updatedAt: now };

    if (backendOnline) {
        try {
            const saved = await apiUpdateLead(next.id, next);
            const idx = findLeadIndexById(id);
            if (idx >= 0) leads[idx] = saved;
        } catch (e) {
            const err = e as ApiError;
            if (err && err.code === 'forbidden') {
                alert('Este lead já foi assumido por outro consultor.');
                try {
                    leads = await apiGetLeads();
                    cacheLeads(leads);
                } catch { }
                toggleModal('modal-edit', false);
                renderApp();
                return;
            }
            if (handleApiFailure(err, 'Não foi possível assumir o lead no servidor.')) return;
            const idx = findLeadIndexById(id);
            if (idx >= 0) leads[idx] = next;
        }
    } else {
        const idx = findLeadIndexById(id);
        if (idx >= 0) leads[idx] = next;
    }

    save();
    showLeadEditModal(id);
    renderApp();
}

async function saveEditAction(id: string) {
    if (!canWrite()) return;
    const lead = findLeadById(id);
    if (!lead) return;

    const shouldAutoClaim = !!(!isAdmin() && currentSession && currentSession.role === 'consultor' && isSharedSiteLead(lead));
    const now = Date.now();

    if (!coerceEpochMs(lead.createdAt)) lead.createdAt = coerceEpochMs(lead.id) ?? now;
    lead.updatedAt = now;

    if (isAdmin()) {
        const ownerEl = document.getElementById('ed-owner') as HTMLSelectElement | null;
        if (ownerEl) lead.owner = sanitizeString(ownerEl.value, 60).toLowerCase();
    }

    if (shouldAutoClaim) {
        const me = sanitizeString(currentSession.user || '', 60).toLowerCase();
        if (me) lead.owner = me;
    }

    const stageEl = document.getElementById('ed-stage') as HTMLSelectElement | null;
    const valueEl = document.getElementById('ed-value') as HTMLInputElement | null;
    const phoneEl = document.getElementById('ed-phone') as HTMLInputElement | null;
    const stepEl = document.getElementById('ed-step') as HTMLInputElement | null;
    const tagsEl = document.getElementById('ed-tags') as HTMLInputElement | null;
    const obsEl = document.getElementById('ed-obs') as HTMLTextAreaElement | null;
    const lossEl = document.getElementById('ed-loss') as HTMLSelectElement | null;

    lead.stage = stageEl ? stageEl.value : lead.stage;
    lead.value = Number(valueEl ? valueEl.value : lead.value) || 0;
    lead.phone = sanitizePhone(phoneEl ? phoneEl.value : '', 30);
    lead.nextStep = sanitizeString(stepEl ? stepEl.value : '', 160);
    lead.tags = parseTags(tagsEl ? tagsEl.value : '');
    lead.obs = sanitizeString(obsEl ? obsEl.value : '', 2000);
    lead.lossReason = lead.stage === 'Perdido' ? (lossEl ? lossEl.value : '') : '';

    if (backendOnline) {
        try {
            const saved = await apiUpdateLead(lead.id, lead);
            const idx = findLeadIndexById(id);
            if (idx >= 0) leads[idx] = saved;
        } catch (e) {
            if (handleApiFailure(e as ApiError, 'Não foi possível salvar no servidor. Salvando só localmente.')) return;
        }
    }

    save();
    toggleModal('modal-edit', false);
    renderApp();
}

async function deleteLeadAction(id: string) {
    if (!canWrite()) return;
    const lead = findLeadById(id);
    if (!lead) return;

    const ok = confirm(`Apagar o lead "${lead.name}"?\n\nEssa ação não pode ser desfeita.`);
    if (!ok) return;

    maybeCreateBackupFromPersisted({ force: true });

    if (backendOnline) {
        try {
            await apiDeleteLead(id);
        } catch (e) {
            const err = e as ApiError;
            if (err && err.message === 'unauthorized') {
                handleApiFailure(err, 'Não foi possível apagar no servidor.');
                return;
            }
            if (err && err.code && err.code !== 'not_found') {
                handleApiFailure(err, 'Não foi possível apagar no servidor.');
                return;
            }
        }
    }

    leads = leads.filter((item) => !leadIdEquals(item && item.id, id));
    save();
    toggleModal('modal-edit', false);
    renderApp();
}
