function renderUsersPage(container: HTMLElement) {
    const canManageUsers = isAdmin();

    if (!canManageUsers) {
        container.innerHTML = `
            <section class="users-view">
                <div class="users-hero users-hero-locked">
                    <div>
                        <span class="users-kicker">Controle de acesso</span>
                        <h2>Usuários</h2>
                        <p>Gerencie acessos do CRM em uma área dedicada.</p>
                    </div>
                </div>
                <div class="data-card users-lock-card">
                    <h4>Acesso restrito</h4>
                    <p class="users-empty">Somente administradores podem criar, editar e remover usuários.</p>
                </div>
            </section>
        `;
        return;
    }

    container.innerHTML = `
        <section class="users-view">
            <div class="users-hero">
                <div>
                    <span class="users-kicker">Painel de acesso</span>
                    <h2>Usuários</h2>
                    <p>Crie, revise e remova acessos sem depender do modal de dados.</p>
                </div>
                <div class="users-summary">
                    <div class="users-summary-card">
                        <span>Total</span>
                        <strong id="users-total">0</strong>
                    </div>
                    <div class="users-summary-card">
                        <span>Admins</span>
                        <strong id="users-admins">0</strong>
                    </div>
                    <div class="users-summary-card">
                        <span>Consultores</span>
                        <strong id="users-consultores">0</strong>
                    </div>
                    <div class="users-summary-card">
                        <span>Leitura</span>
                        <strong id="users-readonly">0</strong>
                    </div>
                </div>
            </div>
            <div class="users-grid">
                <div class="data-card users-create-card" id="users-card">
                    <h4>Novo usuário</h4>
                    <p>Crie acessos para consultores, leitura e administradores.</p>
                    <div class="data-meta" id="usr-hint"></div>
                    <label>Usuário</label>
                    <input type="text" id="usr-name" placeholder="Ex: joao">
                    <label>Senha</label>
                    <input type="password" id="usr-pass" placeholder="Mínimo 4 caracteres">
                    <label>Perfil</label>
                    <select id="usr-role">
                        <option value="consultor">Consultor</option>
                        <option value="leitura">Leitura</option>
                        <option value="admin">Admin</option>
                    </select>
                    <div class="data-actions">
                        <button class="btn-confirm" id="btn-create-user" type="button" onclick="createUserFromUsersView()">Criar usuário</button>
                        <button class="btn-secondary" id="btn-refresh-users" type="button" onclick="refreshUsersList()">Atualizar lista</button>
                    </div>
                </div>
                <div class="data-card users-list-card">
                    <div class="users-list-head">
                        <div>
                            <h4>Acessos cadastrados</h4>
                            <p>Revise perfis ativos, remova logins antigos e ajuste permissões.</p>
                        </div>
                    </div>
                    <div class="usr-list" id="usr-list"></div>
                </div>
            </div>
        </section>
    `;

    setUsersAdminUiState();
    refreshUsersList();
}

function updateUsersSummaryData(users: UserRecord[]) {
    const totalEl = document.getElementById('users-total');
    const adminsEl = document.getElementById('users-admins');
    const consultoresEl = document.getElementById('users-consultores');
    const readonlyEl = document.getElementById('users-readonly');
    const safeUsers = Array.isArray(users) ? users : [];

    if (totalEl) totalEl.textContent = String(safeUsers.length);
    if (adminsEl) adminsEl.textContent = String(safeUsers.filter((u) => u.role === 'admin').length);
    if (consultoresEl) consultoresEl.textContent = String(safeUsers.filter((u) => u.role === 'consultor').length);
    if (readonlyEl) readonlyEl.textContent = String(safeUsers.filter((u) => u.role === 'leitura').length);
}

function renderUsersListView(users: UserRecord[]) {
    const list = document.getElementById('usr-list');
    if (!list) return;
    list.replaceChildren();
    updateUsersSummaryData(users);

    if (!isAdmin()) return;
    if (!backendOnline) {
        const meta = document.createElement('div');
        meta.className = 'users-empty-state';
        meta.textContent = 'Servidor offline.';
        list.appendChild(meta);
        return;
    }

    if (!Array.isArray(users) || users.length === 0) {
        const meta = document.createElement('div');
        meta.className = 'users-empty-state';
        meta.textContent = 'Nenhum usuário cadastrado.';
        list.appendChild(meta);
        return;
    }

    users.forEach((u) => {
        const row = document.createElement('div');
        row.className = 'usr-row';

        const left = document.createElement('div');
        left.className = 'usr-row-main';

        const avatar = document.createElement('div');
        avatar.className = 'usr-avatar';
        avatar.textContent = String(u.user || '?').slice(0, 1).toUpperCase();

        const info = document.createElement('div');
        info.className = 'usr-row-info';

        const title = document.createElement('div');
        title.className = 'usr-row-title';
        title.textContent = u.user || '—';

        const badges = document.createElement('div');
        badges.className = 'usr-row-badges';

        const roleBadge = document.createElement('span');
        roleBadge.className = `usr-role-badge role-${String(u.role || 'consultor')}`;
        roleBadge.textContent = String(u.role || 'consultor');
        badges.appendChild(roleBadge);

        if (u.user === currentSession.user) {
            const selfBadge = document.createElement('span');
            selfBadge.className = 'usr-self-badge';
            selfBadge.textContent = 'você';
            badges.appendChild(selfBadge);
        }

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = u.role === 'admin'
            ? 'Controle total do sistema'
            : u.role === 'leitura'
                ? 'Acesso somente leitura'
                : 'Atendimento e operação comercial';

        info.appendChild(title);
        info.appendChild(badges);
        info.appendChild(meta);
        left.appendChild(avatar);
        left.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'usr-row-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-secondary btn-small';
        editBtn.textContent = editingUserId === u.user ? 'Fechar' : 'Editar';
        editBtn.disabled = !canWrite();
        editBtn.onclick = () => {
            editingUserId = editingUserId === u.user ? '' : String(u.user || '');
            renderUsersListView(users);
        };

        const btn = document.createElement('button');
        btn.className = 'btn-danger btn-small';
        btn.textContent = 'Remover';
        btn.disabled = !canWrite() || u.user === currentSession.user;
        btn.onclick = async () => {
            const who = u.user || '';
            if (!who) return;
            const ok = confirm(`Remover o usuário "${who}"?\n\nEssa ação desativa o login desse usuário.`);
            if (!ok) return;
            try {
                await apiDeleteUser(who);
                await refreshUsersList();
            } catch (e) {
                const err = e as ApiError;
                if (err && err.code === 'last_admin') return alert('Não é possível remover o último admin.');
                if (handleApiFailure(err, 'Não foi possível remover o usuário.')) return;
            }
        };

        actions.appendChild(editBtn);
        actions.appendChild(btn);
        row.appendChild(left);
        row.appendChild(actions);

        if (editingUserId === u.user) {
            const editWrap = document.createElement('div');
            editWrap.className = 'usr-edit';
            editWrap.innerHTML = `
                <label>Perfil</label>
                <select id="usr-edit-role-${u.user}">
                    <option value="consultor" ${u.role === 'consultor' ? 'selected' : ''}>Consultor</option>
                    <option value="leitura" ${u.role === 'leitura' ? 'selected' : ''}>Leitura</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
                <label>Nova senha</label>
                <input type="password" id="usr-edit-pass-${u.user}" placeholder="Deixe vazio para manter a atual">
                <div class="data-actions">
                    <button class="btn-confirm" type="button" onclick="saveUserEdit(${JSON.stringify(String(u.user || ''))})">Salvar alterações</button>
                    <button class="btn-secondary" type="button" onclick="cancelUserEdit()">Cancelar</button>
                </div>
            `;
            row.appendChild(editWrap);
        }

        list.appendChild(row);
    });
}
