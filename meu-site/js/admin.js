// Sidebar Navigation
document.addEventListener('DOMContentLoaded', function() {
    // Obter dados do usuário logado
    const userData = localStorage.getItem('maanaim_user');
    window.MAANAIM_ADMIN_USER = userData ? JSON.parse(userData) : null;
    
    carregarEstatisticas();
    carregarUsuarios();

    document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const sectionId = this.dataset.section;
            console.log('Clique no menu:', sectionId);
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            
            const target = document.getElementById(sectionId);
            console.log('Elemento alvo:', target);
            console.log('Tem classe active antes:', target?.classList.contains('active'));
            
            if (target) target.classList.add('active');
            this.classList.add('active');
        });
    });
});

// Função helper para obter headers de autenticação (sem Content-Type para permitir FormData)
function getAdminHeaders(includeContentType = true) {
    const headers = {};
    
    // Usar JWT
    const token = localStorage.getItem('maanaim_admin_token');
    const expiry = localStorage.getItem('maanaim_admin_expiry');
    
    if (token && expiry && Date.now() < parseInt(expiry)) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Adicionar Content-Type apenas se necessário (não para FormData)
    if (includeContentType) {
        headers['Content-Type'] = 'application/json';
    }
    
    return headers;
}

// Toast notification
function mostrarToast(mensagem, tipo = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    toast.style.background = tipo === 'success' ? '#28a745' : '#dc3545';
    document.body.appendChild(toast);
    setTimeout(() => toast.style.transform = 'translateX(0)', 10);
    setTimeout(() => {
        toast.style.transform = 'translateX(400px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Carregar Estatísticas
async function carregarEstatisticas() {
    try {
        const response = await fetch('/api/admin/stats', {
            headers: getAdminHeaders()
        });
        if (!response.ok) throw new Error('Erro ao carregar estatísticas');
        const stats = await response.json();
        document.getElementById('totalUsuarios').textContent = stats.total;
        document.getElementById('frequentadores').textContent = stats.frequentadores;
        document.getElementById('admins').textContent = stats.admins;
        // Adicionei online como placeholder, pode ser implementado depois
        document.getElementById('online').textContent = 'N/A';
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
        mostrarToast('❌ Erro ao carregar estatísticas', 'error');
    }
}

// Carregar Usuários
async function carregarUsuarios() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: getAdminHeaders()
        });
        if (!response.ok) throw new Error('Erro ao carregar usuários');
        const usuarios = await response.json();

        document.getElementById('usuariosBody').innerHTML = usuarios.map(criarLinhaUsuario).join('');
        document.getElementById('loadingUsuarios').style.display = 'none';
        document.getElementById('tabelaUsuarios').style.display = 'table';
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        mostrarToast('❌ Erro ao carregar usuários', 'error');
        document.getElementById('loadingUsuarios').textContent = 'Erro ao carregar usuários.';
    }
}

function criarLinhaUsuario(user) {
    const cargos = { 'frequentador': 'Frequentador', 'membro': 'Membro', 'conselho': 'Conselho', 'admin': 'Admin' };
    return `
        <tr>
            <td>${user.id}</td>
            <td><strong>${user.username}</strong></td>
            <td>${user.email || 'N/A'}</td>
            <td><span class="role-badge cargo-${user.role}">${cargos[user.role]}</span></td>
            <td>
                <div class="dropdown-cargo">
                    <button class="btn-editar-cargo" onclick="toggleDropdown(${user.id})">👑 Setar Cargo</button>
                    <div class="dropdown-menu" id="dropdown-${user.id}">
                        <button class="cargo-item" data-userid="${user.id}" data-cargo="frequentador">👤 Frequentador</button>
                        <button class="cargo-item" data-userid="${user.id}" data-cargo="membro">🥈 Membro</button>
                        <button class="cargo-item" data-userid="${user.id}" data-cargo="conselho">🥉 Conselho</button>
                        <button class="cargo-item" data-userid="${user.id}" data-cargo="admin">👑 Admin</button>
                    </div>
                </div>
                <button class="btn-delete" onclick="excluirUsuario(${user.id})">🗑️</button>
            </td>
        </tr>`;
}

// DROPDOWN FUNCTIONS - 100% CORRIGIDAS
function toggleDropdown(userId) {
    const dropdown = document.getElementById(`dropdown-${userId}`);
    const isVisible = dropdown.style.display === 'block';
    document.querySelectorAll('.dropdown-menu').forEach(d => d.style.display = 'none');
    dropdown.style.display = isVisible ? 'none' : 'block';
}

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('cargo-item')) {
        const userId = e.target.dataset.userid;
        const cargo = e.target.dataset.cargo;
        setarCargo(userId, cargo);
        document.getElementById(`dropdown-${userId}`).style.display = 'none';
    }
});

async function setarCargo(userId, cargo) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/role`, {
            method: 'PUT',
            headers: getAdminHeaders(),
            body: JSON.stringify({ role: cargo })
        });

        if (!response.ok) throw new Error('Erro ao alterar cargo');

        // Atualiza visual
        const row = document.querySelector(`#dropdown-${userId}`).closest('tr');
        const badge = row.querySelector('.role-badge');
        const cargos = { 'frequentador': 'Frequentador', 'membro': 'Membro', 'conselho': 'Conselho', 'admin': 'Admin' };
        badge.textContent = cargos[cargo];
        badge.className = `role-badge cargo-${cargo}`;

        mostrarToast(`✅ Cargo alterado para: ${cargos[cargo]}`, 'success');
        // Recarregar estatísticas
        carregarEstatisticas();
    } catch (error) {
        console.error('Erro ao alterar cargo:', error);
        mostrarToast('❌ Erro ao alterar cargo', 'error');
    }
}

async function excluirUsuario(id) {
    if (!confirm(`Excluir usuário ${id}? Esta ação não pode ser desfeita.`)) return;

    try {
        const response = await fetch(`/api/admin/users/${id}`, {
            method: 'DELETE',
            headers: getAdminHeaders()
        });

        if (!response.ok) throw new Error('Erro ao excluir usuário');

        mostrarToast('🗑️ Usuário excluído!', 'success');
        // Recarregar usuários e estatísticas
        carregarUsuarios();
        carregarEstatisticas();
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        mostrarToast('❌ Erro ao excluir usuário', 'error');
    }
}

// NOTÍCIAS
document.getElementById('btnNovaNoticia').addEventListener('click', () => mostrarFormNoticia());
document.getElementById('btnSalvarNoticia').addEventListener('click', salvarNoticia);
document.getElementById('btnCancelarNoticia').addEventListener('click', () => ocultarFormNoticia());

async function carregarNoticias() {
    try {
        const response = await fetch('/api/admin/noticias', {
            headers: getAdminHeaders()
        });
        if (!response.ok) throw new Error('Erro ao carregar notícias');
        const noticias = await response.json();

        document.getElementById('listaNoticias').innerHTML = noticias.map(criarItemNoticia).join('');
        document.getElementById('loadingNoticias').style.display = 'none';
    } catch (error) {
        console.error('Erro ao carregar notícias:', error);
        mostrarToast('❌ Erro ao carregar notícias', 'error');
        document.getElementById('loadingNoticias').textContent = 'Erro ao carregar notícias.';
    }
}

function criarItemNoticia(noticia) {
    return `
        <div style="background: white; border: 1px solid #eee; border-radius: 10px; padding: 1.5rem; margin-bottom: 1rem;">
            <h4 style="margin: 0 0 1rem 0; color: #dc3545;">${noticia.titulo}</h4>
            <p style="margin: 0 0 1rem 0; color: #666;">${noticia.conteudo.substring(0, 200)}${noticia.conteudo.length > 200 ? '...' : ''}</p>
            <small style="color: #999;">Criado em: ${new Date(noticia.created_at).toLocaleString('pt-BR')}</small>
            <div style="margin-top: 1rem;">
                <button onclick="editarNoticia(${noticia.id})" class="btn-editar-cargo" style="margin-right: 0.5rem;">✏️ Editar</button>
                <button onclick="excluirNoticia(${noticia.id})" class="btn-delete">🗑️ Excluir</button>
            </div>
        </div>`;
}

function mostrarFormNoticia(noticia = null) {
    const form = document.getElementById('formNoticia');
    const title = document.getElementById('formTitle');
    const id = document.getElementById('noticiaId');
    const titulo = document.getElementById('noticiaTitulo');
    const conteudo = document.getElementById('noticiaConteudo');

    if (noticia) {
        title.textContent = 'Editar Notícia';
        id.value = noticia.id;
        titulo.value = noticia.titulo;
        conteudo.value = noticia.conteudo;
    } else {
        title.textContent = 'Nova Notícia';
        id.value = '';
        titulo.value = '';
        conteudo.value = '';
    }

    form.style.display = 'block';
}

function ocultarFormNoticia() {
    document.getElementById('formNoticia').style.display = 'none';
}

async function salvarNoticia() {
    const id = document.getElementById('noticiaId').value;
    const titulo = document.getElementById('noticiaTitulo').value;
    const conteudo = document.getElementById('noticiaConteudo').value;

    if (!titulo || !conteudo) {
        mostrarToast('❌ Título e conteúdo são obrigatórios', 'error');
        return;
    }

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/admin/noticias/${id}` : '/api/admin/noticias';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...getAdminHeaders()
            },
            body: JSON.stringify({ titulo, conteudo })
        });

        if (!response.ok) throw new Error('Erro ao salvar notícia');

        mostrarToast(`✅ Notícia ${id ? 'atualizada' : 'criada'} com sucesso!`, 'success');
        ocultarFormNoticia();
        carregarNoticias();
    } catch (error) {
        console.error('Erro ao salvar notícia:', error);
        mostrarToast('❌ Erro ao salvar notícia', 'error');
    }
}

async function editarNoticia(id) {
    try {
        const response = await fetch(`/api/admin/noticias`, {
            headers: getAdminHeaders()
        });
        const noticias = await response.json();
        const noticia = noticias.find(n => n.id == id);
        if (noticia) mostrarFormNoticia(noticia);
    } catch (error) {
        console.error('Erro ao carregar notícia:', error);
        mostrarToast('❌ Erro ao carregar notícia', 'error');
    }
}

async function excluirNoticia(id) {
    if (!confirm('Tem certeza que deseja excluir esta notícia?')) return;

    try {
        const response = await fetch(`/api/admin/noticias/${id}`, {
            method: 'DELETE',
            headers: getAdminHeaders()
        });

        if (!response.ok) throw new Error('Erro ao excluir notícia');

        mostrarToast('🗑️ Notícia excluída!', 'success');
        carregarNoticias();
    } catch (error) {
        console.error('Erro ao excluir notícia:', error);
        mostrarToast('❌ Erro ao excluir notícia', 'error');
    }
}

// EVENTOS
document.getElementById('btnNovoEvento').addEventListener('click', () => mostrarFormEvento());
document.getElementById('btnSalvarEvento').addEventListener('click', salvarEvento);
document.getElementById('btnCancelarEvento').addEventListener('click', () => ocultarFormEvento());

async function carregarEventos() {
    try {
        const response = await fetch('/api/admin/eventos', {
            headers: getAdminHeaders()
        });
        if (!response.ok) throw new Error('Erro ao carregar eventos');
        const eventos = await response.json();

        document.getElementById('listaEventos').innerHTML = eventos.map(criarItemEvento).join('');
        document.getElementById('loadingEventos').style.display = 'none';
    } catch (error) {
        console.error('Erro ao carregar eventos:', error);
        mostrarToast('❌ Erro ao carregar eventos', 'error');
        document.getElementById('loadingEventos').textContent = 'Erro ao carregar eventos.';
    }
}

function criarItemEvento(evento) {
    // Formatar data e hora juntos
    const dataHora = evento.horario 
        ? new Date(evento.data).toLocaleDateString('pt-BR') + ' às ' + evento.horario
        : new Date(evento.data).toLocaleString('pt-BR');
    
    return `
        <div style="background: white; border: 1px solid #eee; border-radius: 10px; padding: 1.5rem; margin-bottom: 1rem;">
            <h4 style="margin: 0 0 1rem 0; color: #dc3545;">${evento.titulo}</h4>
            <p style="margin: 0 0 0.5rem 0; color: #666;"><strong>Data:</strong> ${dataHora}</p>
            ${evento.local ? `<p style="margin: 0 0 1rem 0; color: #666;"><strong>Local:</strong> ${evento.local}</p>` : ''}
            <small style="color: #999;">Criado em: ${new Date(evento.created_at).toLocaleString('pt-BR')}</small>
            <div style="margin-top: 1rem;">
                <button onclick="editarEvento(${evento.id})" class="btn-editar-cargo" style="margin-right: 0.5rem;">✏️ Editar</button>
                <button onclick="excluirEvento(${evento.id})" class="btn-delete">🗑️ Excluir</button>
            </div>
        </div>`;
}

function mostrarFormEvento(evento = null) {
    const form = document.getElementById('formEvento');
    const title = document.getElementById('formEventoTitle');
    const id = document.getElementById('eventoId');
    const titulo = document.getElementById('eventoTitulo');
    const data = document.getElementById('eventoData');
    const local = document.getElementById('eventoLocal');
    const temInscricao = document.getElementById('eventoTemInscricao');

    if (evento) {
        title.textContent = 'Editar Evento';
        id.value = evento.id;
        titulo.value = evento.titulo;
        // Combinar data e horario para o campo datetime-local
        const dataObj = new Date(evento.data);
        const hora = evento.horario || '00:00';
        data.value = `${dataObj.toISOString().slice(0, 10)}T${hora}`;
        local.value = evento.local || '';
        temInscricao.checked = evento.tem_inscricao === 1 || evento.tem_inscricao === true;
    } else {
        title.textContent = 'Novo Evento';
        id.value = '';
        titulo.value = '';
        data.value = '';
        local.value = '';
        temInscricao.checked = false;
    }

    form.style.display = 'block';
}

function ocultarFormEvento() {
    document.getElementById('formEvento').style.display = 'none';
}

async function salvarEvento() {
    const id = document.getElementById('eventoId').value;
    const titulo = document.getElementById('eventoTitulo').value;
    const dataInput = document.getElementById('eventoData').value;
    const local = document.getElementById('eventoLocal').value;
    const temInscricao = document.getElementById('eventoTemInscricao').checked;

    if (!titulo) {
        mostrarToast('❌ Título é obrigatório', 'error');
        return;
    }

    // Se dataInput estiver vazia, enviar null para data e horario
    let data = null;
    let horario = null;
    
    if (dataInput) {
        // Extrair a hora do campo datetime-local (formato: YYYY-MM-DDTHH:MM)
        horario = dataInput.includes('T') ? dataInput.split('T')[1] : null;
        data = dataInput.split('T')[0]; // Apenas a data (YYYY-MM-DD)
    }

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/admin/eventos/${id}` : '/api/admin/eventos';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...getAdminHeaders()
            },
            body: JSON.stringify({ titulo, data, horario, local, tem_inscricao: temInscricao })
        });

        if (!response.ok) throw new Error('Erro ao salvar evento');

        mostrarToast(`✅ Evento ${id ? 'atualizado' : 'criado'} com sucesso!`, 'success');
        ocultarFormEvento();
        carregarEventos();
    } catch (error) {
        console.error('Erro ao salvar evento:', error);
        mostrarToast('❌ Erro ao salvar evento', 'error');
    }
}

async function editarEvento(id) {
    try {
        const response = await fetch(`/api/admin/eventos`, {
            headers: getAdminHeaders()
        });
        const eventos = await response.json();
        const evento = eventos.find(e => e.id == id);
        if (evento) mostrarFormEvento(evento);
    } catch (error) {
        console.error('Erro ao carregar evento:', error);
        mostrarToast('❌ Erro ao carregar evento', 'error');
    }
}

async function excluirEvento(id) {
    if (!confirm('Tem certeza que deseja excluir este evento?')) return;

    try {
        const response = await fetch(`/api/admin/eventos/${id}`, {
            method: 'DELETE',
            headers: getAdminHeaders()
        });

        if (!response.ok) throw new Error('Erro ao excluir evento');

        mostrarToast('🗑️ Evento excluído!', 'success');
        carregarEventos();
    } catch (error) {
        console.error('Erro ao excluir evento:', error);
        mostrarToast('❌ Erro ao excluir evento', 'error');
    }
}

// CULTOS SEMANAIS
async function carregarCultos() {
    try {
        const response = await fetch('/api/cultos', {
            headers: getAdminHeaders()
        });
        if (!response.ok) throw new Error('Erro ao carregar cultos');
        const cultos = await response.json();
        
        // Preencher os campos com os valores do banco
        cultos.forEach(culto => {
            const tituloEl = document.getElementById(`culto${culto.id}-titulo`);
            const horarioEl = document.getElementById(`culto${culto.id}-horario`);
            const localEl = document.getElementById(`culto${culto.id}-local`);
            
            if (tituloEl) tituloEl.value = culto.titulo || '';
            if (horarioEl) horarioEl.value = culto.horario || '';
            if (localEl) localEl.value = culto.local || '';
        });
        
        document.getElementById('cultosContainer').style.display = 'block';
        document.getElementById('loadingCultos').style.display = 'none';
    } catch (error) {
        console.error('Erro ao carregar cultos:', error);
        mostrarToast('❌ Erro ao carregar cultos', 'error');
    }
}

async function salvarCulto(dia) {
    const cultosMap = {
        'sabado': 1,
        'domingo_ebd': 2,
        'domingo': 3,
        'quarta': 4
    };
    
    const id = cultosMap[dia];
    if (!id) return;
    
    const titulo = document.getElementById(`culto${id}-titulo`).value;
    const horario = document.getElementById(`culto${id}-horario`).value;
    const local = document.getElementById(`culto${id}-local`).value;
    
    try {
        const response = await fetch(`/api/admin/cultos/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAdminHeaders()
            },
            body: JSON.stringify({ titulo, horario, local })
        });
        
        if (!response.ok) throw new Error('Erro ao salvar culto');
        
        mostrarToast('✅ Culto salvo com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao salvar culto:', error);
        mostrarToast('❌ Erro ao salvar culto', 'error');
    }
}

// Carregar conteúdo quando navegar para as seções
document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
    link.addEventListener('click', function(e) {
        const section = this.dataset.section;
        if (section === 'noticias') {
            setTimeout(carregarNoticias, 100);
        } else if (section === 'programacao') {
            setTimeout(carregarCultos, 100);
            setTimeout(carregarEventos, 200);
        } else if (section === 'pagina-inicial') {
            setTimeout(carregarConteudos, 100);
        } else if (section === 'ministerios') {
            setTimeout(carregarMinisterios, 100);
        } else if (section === 'biblia') {
            setTimeout(carregarTopicosBiblia, 100);
        } else if (section === 'youtube') {
            setTimeout(carregarYoutubeConfig, 100);
        } else if (section === 'aulas') {
            console.log('Seção aulas clicada - chamando loadAulas');
            setTimeout(loadAulas, 100);
        } else if (section === 'area-membro') {
            setTimeout(carregarAreaMembro, 100);
        }
    });
});

// ========== YOUTUBE ==========
async function carregarYoutubeConfig() {
    try {
        const response = await fetch('/api/admin/youtube-config', {
            headers: getAdminHeaders()
        });
        
        if (!response.ok) throw new Error('Erro ao carregar config');
        
        const config = await response.json();
        document.getElementById('youtubeChannelId').value = config.channel_id || '';
        document.getElementById('youtubeChannelName').value = config.channel_name || '';
        document.getElementById('youtubeEnabled').checked = config.enabled === 1;
    } catch (error) {
        console.error('Erro ao carregar YouTube config:', error);
    }
}

document.getElementById('btnSalvarYoutube').addEventListener('click', async () => {
    const channelId = document.getElementById('youtubeChannelId').value.trim();
    const channelName = document.getElementById('youtubeChannelName').value.trim();
    const enabled = document.getElementById('youtubeEnabled').checked;
    
    if (!channelId) {
        document.getElementById('youtubeStatus').innerHTML = '<span style="color: red;">⚠️ O ID do canal é obrigatório</span>';
        return;
    }
    
    try {
        const response = await fetch('/api/admin/youtube-config', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAdminHeaders()
            },
            body: JSON.stringify({ channel_id: channelId, channel_name: channelName, enabled })
        });
        
        if (!response.ok) throw new Error('Erro ao salvar');
        
        document.getElementById('youtubeStatus').innerHTML = '<span style="color: green;">✅ Configurações salvas!</span>';
    } catch (error) {
        document.getElementById('youtubeStatus').innerHTML = '<span style="color: red;">❌ Erro ao salvar</span>';
    }
});

// MINISTÉRIOS
document.getElementById('btnNovoMinisterio').addEventListener('click', () => mostrarFormMinisterio());
document.getElementById('btnSalvarMinisterio').addEventListener('click', salvarMinisterio);
document.getElementById('btnCancelarMinisterio').addEventListener('click', () => ocultarFormMinisterio());

// VÍDEO AULAS
document.getElementById('btnNovaAula').addEventListener('click', () => openModal());
document.getElementById('aulaForm').addEventListener('submit', saveAula);

async function carregarMinisterios() {
    try {
        const response = await fetch('/api/admin/ministerios', {
            headers: getAdminHeaders()
        });
        if (!response.ok) throw new Error('Erro ao carregar ministérios');
        const ministerios = await response.json();

        const container = document.getElementById('listaMinisterios');
        if (ministerios.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">Nenhum ministry cadastrado.</p>';
        } else {
            container.innerHTML = ministerios.map(criarItemMinisterio).join('');
        }
        document.getElementById('loadingMinisterios').style.display = 'none';
    } catch (error) {
        console.error('Erro ao carregar ministérios:', error);
        mostrarToast('❌ Erro ao carregar ministérios', 'error');
        document.getElementById('loadingMinisterios').textContent = 'Erro ao carregar ministérios.';
    }
}

function criarItemMinisterio(ministerio) {
    return `
        <div style="background: white; border: 1px solid #eee; border-radius: 10px; padding: 1.5rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 1rem;">
                <div style="font-size: 2rem; color: var(--verde-principal);">
                    <i class="${ministerio.icone}"></i>
                </div>
                <div>
                    <h4 style="margin: 0 0 0.5rem 0; color: #333;">${ministerio.titulo}</h4>
                    <p style="margin: 0; color: #666;">${ministerio.descricao || ''}</p>
                </div>
            </div>
            <div>
                <button onclick="editarMinisterio(${ministerio.id})" class="btn-editar-cargo" style="margin-right: 0.5rem;">✏️ Editar</button>
                <button onclick="excluirMinisterio(${ministerio.id})" class="btn-delete">🗑️ Excluir</button>
            </div>
        </div>`;
}

function mostrarFormMinisterio(ministerio = null) {
    const form = document.getElementById('formMinisterio');
    const title = document.getElementById('formMinisterioTitle');
    const id = document.getElementById('ministerioId');
    const titulo = document.getElementById('ministerioTitulo');
    const descricao = document.getElementById('ministerioDescricao');
    const icone = document.getElementById('ministerioIcone');

    if (ministerio) {
        title.textContent = 'Editar Ministério';
        id.value = ministerio.id;
        titulo.value = ministerio.titulo;
        descricao.value = ministerio.descricao || '';
        icone.value = ministerio.icone || 'fas fa-church';
    } else {
        title.textContent = 'Novo Ministério';
        id.value = '';
        titulo.value = '';
        descricao.value = '';
        icone.value = 'fas fa-church';
    }

    form.style.display = 'block';
}

function ocultarFormMinisterio() {
    document.getElementById('formMinisterio').style.display = 'none';
}

async function salvarMinisterio() {
    const id = document.getElementById('ministerioId').value;
    const titulo = document.getElementById('ministerioTitulo').value;
    const descricao = document.getElementById('ministerioDescricao').value;
    const icone = document.getElementById('ministerioIcone').value;

    if (!titulo) {
        mostrarToast('❌ Título é obrigatório', 'error');
        return;
    }

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/admin/ministerios/${id}` : '/api/admin/ministerios';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...getAdminHeaders()
            },
            body: JSON.stringify({ titulo, descricao, icone })
        });

        if (!response.ok) throw new Error('Erro ao salvar ministry');

        mostrarToast(`✅ Ministério ${id ? 'atualizado' : 'criado'} com sucesso!`, 'success');
        ocultarFormMinisterio();
        carregarMinisterios();
    } catch (error) {
        console.error('Erro ao salvar ministry:', error);
        mostrarToast('❌ Erro ao salvar ministry', 'error');
    }
}

async function editarMinisterio(id) {
    try {
        const response = await fetch('/api/admin/ministerios', {
            headers: getAdminHeaders()
        });
        const ministerios = await response.json();
        const ministerio = ministerios.find(m => m.id == id);
        if (ministerio) mostrarFormMinisterio(ministerio);
    } catch (error) {
        console.error('Erro ao carregar ministry:', error);
        mostrarToast('❌ Erro ao carregar ministry', 'error');
    }
}

async function excluirMinisterio(id) {
    if (!confirm('Tem certeza que deseja excluir este ministry?')) return;

    try {
        const response = await fetch(`/api/admin/ministerios/${id}`, {
            method: 'DELETE',
            headers: getAdminHeaders()
        });

        if (!response.ok) throw new Error('Erro ao excluir ministry');

        mostrarToast('🗑️ Ministério excluído!', 'success');
        carregarMinisterios();
    } catch (error) {
        console.error('Erro ao excluir ministry:', error);
        mostrarToast('❌ Erro ao excluir ministry', 'error');
    }
}

// CONTEÚDOS DA PÁGINA INICIAL
async function carregarConteudos() {
    try {
        const response = await fetch('/api/admin/page-content', {
            headers: getAdminHeaders()
        });
        if (!response.ok) throw new Error('Erro ao carregar conteúdos');
        const conteudos = await response.json();

        const container = document.getElementById('conteudosContainer');
        container.innerHTML = `
            <div style="margin-bottom: 2rem;">
                <h3 style="color: var(--verde-principal); margin-bottom: 1rem;">Hero Section</h3>
                <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 10px; margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Título:</label>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="text" id="hero-title" value="${conteudos.hero?.title || 'Bem-vindo à MAANAIM'}" style="flex: 1; padding: 0.5rem; border: 1px solid #ddd; border-radius: 5px;">
                        <button onclick="abrirEditorRico('hero-title', document.getElementById('hero-title').value)" style="padding: 8px 12px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">🖼️</button>
                        <button onclick="salvarTitulo('hero')" style="padding: 8px 16px; background: #22c55e; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">💾 Salvar</button>
                    </div>
                </div>
                <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 10px; margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">
                        Conteúdo:
                    </label>
                    <input type="hidden" id="hero-content" value="${conteudos.hero?.content || ''}">
                    <div id="hero-contentPreview" onclick="abrirEditorRico('hero-content', document.getElementById('hero-content').value)" style="background: white; padding: 20px; border-radius: 8px; min-height: 80px; border: 2px dashed #667eea; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; justify-content: center; flex-direction: column; color: #667eea; font-weight: 500;">
                        ${conteudos.hero?.content ? conteudos.hero.content : '<span style="font-size: 2rem;">🖼️</span><span>Clique para editar o conteúdo</span>'}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 2rem;">
                <h3 style="color: var(--verde-principal); margin-bottom: 1rem;">Sobre Nós</h3>
                <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 10px; margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Título:</label>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="text" id="sobre-title" value="${conteudos.sobre?.title || 'Sobre Nós'}" style="flex: 1; padding: 0.5rem; border: 1px solid #ddd; border-radius: 5px;">
                        <button onclick="abrirEditorRico('sobre-title', document.getElementById('sobre-title').value)" style="padding: 8px 12px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">🖼️</button>
                        <button onclick="salvarTitulo('sobre')" style="padding: 8px 16px; background: #22c55e; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">💾 Salvar</button>
                    </div>
                </div>
                <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 10px; margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">
                        Conteúdo:
                    </label>
                    <input type="hidden" id="sobre-content" value="${conteudos.sobre?.content || ''}">
                    <div id="sobre-contentPreview" onclick="abrirEditorRico('sobre-content', document.getElementById('sobre-content').value)" style="background: white; padding: 20px; border-radius: 8px; min-height: 80px; border: 2px dashed #667eea; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; justify-content: center; flex-direction: column; color: #667eea; font-weight: 500;">
                        ${conteudos.sobre?.content ? conteudos.sobre.content : '<span style="font-size: 2rem;">🖼️</span><span>Clique para editar o conteúdo</span>'}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 2rem;">
                <h3 style="color: var(--verde-principal); margin-bottom: 1rem;">Título dos Ministérios</h3>
                <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 10px; margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Título:</label>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="text" id="ministerios-title" value="${conteudos.ministerios?.title || 'Nossos Ministérios'}" style="flex: 1; padding: 0.5rem; border: 1px solid #ddd; border-radius: 5px;">
                        <button onclick="abrirEditorRico('ministerios-title', document.getElementById('ministerios-title').value)" style="padding: 8px 12px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">🖼️</button>
                        <button onclick="salvarTitulo('ministerios')" style="padding: 8px 16px; background: #22c55e; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">💾 Salvar</button>
                    </div>
                </div>
            </div>

            <p style="color: #666; font-style: italic; margin-bottom: 2rem;">
                ℹ️ Osministérios agora são gerenciados na aba <strong>"Ministrérios"</strong> do menu lateral.
            </p>
        `;

        document.getElementById('loadingConteudos').style.display = 'none';
    } catch (error) {
        console.error('Erro ao carregar conteúdos:', error);
        mostrarToast('❌ Erro ao carregar conteúdos', 'error');
        document.getElementById('loadingConteudos').textContent = 'Erro ao carregar conteúdos.';
    }
}

// Funções auxiliares

function mostrarToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.background = type === 'success' ? '#28a745' : '#dc3545';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.style.transform = 'translateX(0)', 100);
    setTimeout(() => {
        toast.style.transform = 'translateX(400px)';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ABRIR EDITOR RICO EM NOVA JANELA
function abrirEditorRico(fieldId, conteudoAtual) {
    // Salvar o ID do campo no localStorage
    localStorage.setItem('current_editor_field', fieldId);
    
    // Abrir editor em nova janela/popup
    const editorWindow = window.open(
        '/editor.html?field=' + fieldId + '&content=' + encodeURIComponent(conteudoAtual || ''),
        'EditorRico',
        'width=1200,height=800,scrollbars=yes,resizable=yes'
    );
    
    // Verificar periodicamente se o conteúdo foi salvo
    const checkInterval = setInterval(() => {
        const savedContent = localStorage.getItem('saved_content_' + fieldId);
        if (savedContent) {
            // Atualizar o campo de texto
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = savedContent;
            }
            // Limpar o flag
            localStorage.removeItem('saved_content_' + fieldId);
            clearInterval(checkInterval);
            mostrarToast('✅ Conteúdo do editor importado!', 'success');
        }
    }, 500);
}

// Verificar se há conteúdo salvo ao carregar a página
document.addEventListener('DOMContentLoaded', function() {
    const fieldId = localStorage.getItem('current_editor_field');
    if (fieldId) {
        const savedContent = localStorage.getItem('saved_content_' + fieldId);
        if (savedContent) {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = savedContent;
                localStorage.removeItem('saved_content_' + fieldId);
                mostrarToast('✅ Conteúdo do editor importado!', 'success');
            }
        }
    }
});

// ========== YOUTUBE CONFIG ==========
async function carregarYoutubeConfig() {
    try {
        const response = await fetch('/api/admin/youtube-config', {
            headers: getAdminHeaders()
        });
        if (!response.ok) throw new Error('Erro ao carregar config');
        const config = await response.json();
        
        document.getElementById('youtubeChannelId').value = config.channel_id || '';
        document.getElementById('youtubeChannelName').value = config.channel_name || '';
        document.getElementById('youtubeEnabled').checked = config.enabled === 1 || config.enabled === true;
    } catch (error) {
        console.error('Erro ao carregar config do YouTube:', error);
    }
}

async function salvarYoutubeConfig() {
    const channel_id = document.getElementById('youtubeChannelId').value;
    const channel_name = document.getElementById('youtubeChannelName').value;
    const enabled = document.getElementById('youtubeEnabled').checked;
    
    try {
        const response = await fetch('/api/admin/youtube-config', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAdminHeaders()
            },
            body: JSON.stringify({ channel_id, channel_name, enabled })
        });
        
        if (!response.ok) throw new Error('Erro ao salvar');
        
        mostrarToast('✅ Configuração do YouTube salva!', 'success');
    } catch (error) {
        console.error('Erro ao salvar config do YouTube:', error);
        mostrarToast('❌ Erro ao salvar configuração', 'error');
    }
}

async function salvarTitulo(section) {
    const titleInput = document.getElementById(`${section}-title`);
    if (!titleInput) {
        mostrarToast('❌ Campo de título não encontrado', 'error');
        return;
    }
    
    const title = titleInput.value;
    
    try {
        const response = await fetch(`/api/admin/page-content/${section}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAdminHeaders()
            },
            body: JSON.stringify({ title })
        });
        
        if (!response.ok) throw new Error('Erro ao salvar');
        
        mostrarToast('✅ Título salvo com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao salvar título:', error);
        mostrarToast('❌ Erro ao salvar título', 'error');
    }
}

// Event listener para o botão do YouTube
document.getElementById('btnSalvarYoutube')?.addEventListener('click', salvarYoutubeConfig);

// Carregar config do YouTube quando navegar para a seção
document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
    link.addEventListener('click', function() {
        if (this.dataset.section === 'youtube') {
            setTimeout(carregarYoutubeConfig, 100);
        }
    });
});

