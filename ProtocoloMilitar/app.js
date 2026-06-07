// ============================================
// PROTOCOLO MILITAR - Sistema de Protocolos Pessoais
// Lógica Principal
// ============================================

// Estado da aplicação
let protocols = [];
let currentEditId = null;

// Estado do Timer
let timerInterval = null;
let timerSeconds = 0;
let timerDuration = 25 * 60; // 25 minutos em segundos
let timerRunning = false;
let timerPaused = false;

// Elementos DOM
const protocolForm = document.getElementById('protocolForm');
const protocolNameInput = document.getElementById('protocolName');
const triggerInput = document.getElementById('trigger');
const stepsContainer = document.getElementById('stepsContainer');
const addStepBtn = document.getElementById('addStep');
const escapeValveInput = document.getElementById('escapeValve');
const clearFormBtn = document.getElementById('clearForm');
const protocolsList = document.getElementById('protocolsList');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const modal = document.getElementById('protocolModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const closeModalBtn = document.getElementById('closeModal');
const editProtocolBtn = document.getElementById('editProtocol');
const deleteProtocolBtn = document.getElementById('deleteProtocol');

// Elementos do Timer
const currentTimeEl = document.getElementById('currentTime');
const currentDateEl = document.getElementById('currentDate');
const timerProtocolSelect = document.getElementById('timerProtocolSelect');
const startTimerBtn = document.getElementById('startTimer');
const pauseTimerBtn = document.getElementById('pauseTimer');
const resetTimerBtn = document.getElementById('resetTimer');
const timerDurationInput = document.getElementById('timerDuration');
const progressBar = document.getElementById('progressBar');
const timerStatus = document.getElementById('timerStatus');

// ============================================
// Inicialização
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadProtocols();
    renderProtocols();
    updateTimerProtocolSelect();
    startClock();
    setupEventListeners();
});

// ============================================
// Configuração de Event Listeners
// ============================================
function setupEventListeners() {
    // Formulário
    protocolForm.addEventListener('submit', handleFormSubmit);

    // Botões do formulário
    clearFormBtn.addEventListener('click', resetForm);
    addStepBtn.addEventListener('click', addStep);

    // Busca
    searchInput.addEventListener('input', handleSearch);

    // Modal
    closeModalBtn.addEventListener('click', closeModal);
    editProtocolBtn.addEventListener('click', handleEditFromModal);
    deleteProtocolBtn.addEventListener('click', handleDeleteFromModal);

    // Fechar modal ao clicar fora
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Tecla ESC para fechar modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });

    // Timer
    startTimerBtn.addEventListener('click', startTimer);
    pauseTimerBtn.addEventListener('click', pauseTimer);
    resetTimerBtn.addEventListener('click', resetTimer);
    timerDurationInput.addEventListener('change', updateTimerDuration);
    timerProtocolSelect.addEventListener('change', handleProtocolSelect);
}

// ============================================
// Relógio Digital
// ============================================
function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();

    // Hora
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    currentTimeEl.textContent = `${hours}:${minutes}:${seconds}`;

    // Data
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    currentDateEl.textContent = `${day}/${month}/${year}`;
}

// ============================================
// Gerenciamento de Passos
// ============================================
function addStep() {
    const stepItems = stepsContainer.querySelectorAll('.step-item');
    const newStepNumber = stepItems.length + 1;

    const stepDiv = document.createElement('div');
    stepDiv.className = 'step-item';
    stepDiv.innerHTML = `
        <span class="step-number">${newStepNumber}</span>
        <textarea placeholder="Passo ${newStepNumber}..." required></textarea>
        <button type="button" class="btn-remove-step" title="Remover passo">✕</button>
    `;

    stepsContainer.appendChild(stepDiv);

    // Adiciona listener ao botão de remover
    const removeBtn = stepDiv.querySelector('.btn-remove-step');
    removeBtn.addEventListener('click', () => removeStep(stepDiv));

    // Atualiza números dos passos
    updateStepNumbers();
}

function removeStep(stepElement) {
    const stepItems = stepsContainer.querySelectorAll('.step-item');
    if (stepItems.length <= 1) {
        showNotification('É necessário manter pelo menos um passo.', 'error');
        return;
    }

    stepElement.remove();
    updateStepNumbers();
}

function updateStepNumbers() {
    const stepItems = stepsContainer.querySelectorAll('.step-item');
    stepItems.forEach((item, index) => {
        const numberSpan = item.querySelector('.step-number');
        numberSpan.textContent = index + 1;
        const textarea = item.querySelector('textarea');
        textarea.placeholder = `Passo ${index + 1}...`;
    });
}

function getSteps() {
    const stepTextareas = stepsContainer.querySelectorAll('textarea');
    const steps = [];
    stepTextareas.forEach(textarea => {
        if (textarea.value.trim()) {
            steps.push(textarea.value.trim());
        }
    });
    return steps;
}

function setSteps(steps) {
    // Limpa passos existentes
    stepsContainer.innerHTML = '';

    // Adiciona passos
    steps.forEach((step, index) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'step-item';
        stepDiv.innerHTML = `
            <span class="step-number">${index + 1}</span>
            <textarea placeholder="Passo ${index + 1}..." required>${step}</textarea>
            <button type="button" class="btn-remove-step" title="Remover passo">✕</button>
        `;
        stepsContainer.appendChild(stepDiv);

        // Adiciona listener ao botão de remover
        const removeBtn = stepDiv.querySelector('.btn-remove-step');
        removeBtn.addEventListener('click', () => removeStep(stepDiv));
    });
}

// ============================================
// Gerenciamento de Protocolos
// ============================================
function handleFormSubmit(e) {
    e.preventDefault();

    const name = protocolNameInput.value.trim();
    const trigger = triggerInput.value.trim();
    const steps = getSteps();
    const escapeValve = escapeValveInput.value.trim();

    // Validação
    if (!name || !trigger || steps.length === 0 || !escapeValve) {
        showNotification('Preencha todos os campos obrigatórios.', 'error');
        return;
    }

    const protocol = {
        id: currentEditId || Date.now().toString(),
        name,
        trigger,
        steps,
        escapeValve,
        createdAt: currentEditId ? getProtocolById(currentEditId).createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (currentEditId) {
        // Atualiza protocolo existente
        const index = protocols.findIndex(p => p.id === currentEditId);
        if (index !== -1) {
            protocols[index] = protocol;
            showNotification('Protocolo atualizado com sucesso!');
        }
        currentEditId = null;
    } else {
        // Adiciona novo protocolo
        protocols.unshift(protocol);
        showNotification('Protocolo criado com sucesso!');
    }

    saveProtocols();
    renderProtocols();
    updateTimerProtocolSelect();
    resetForm();
}

function getProtocolById(id) {
    return protocols.find(p => p.id === id);
}

function handleEdit(id) {
    const protocol = getProtocolById(id);
    if (!protocol) return;

    currentEditId = id;

    // Preenche formulário
    protocolNameInput.value = protocol.name;
    triggerInput.value = protocol.trigger;
    setSteps(protocol.steps);
    escapeValveInput.value = protocol.escapeValve;

    // Rola para o formulário
    document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });

    // Destaca formulário
    document.querySelector('.form-section').style.borderColor = 'var(--color-accent)';
    setTimeout(() => {
        document.querySelector('.form-section').style.borderColor = '';
    }, 2000);
}

function handleDelete(id) {
    if (!confirm('Tem certeza que deseja excluir este protocolo?')) return;

    protocols = protocols.filter(p => p.id !== id);
    saveProtocols();
    renderProtocols();
    updateTimerProtocolSelect();
    showNotification('Protocolo excluído.');
}

function handleEditFromModal() {
    const protocolId = modal.dataset.protocolId;
    closeModal();
    setTimeout(() => handleEdit(protocolId), 300);
}

function handleDeleteFromModal() {
    const protocolId = modal.dataset.protocolId;
    closeModal();
    setTimeout(() => handleDelete(protocolId), 300);
}

function resetForm() {
    protocolForm.reset();
    currentEditId = null;
    setSteps(['']); // Mantém um passo vazio
}

// ============================================
// Renderização
// ============================================
function renderProtocols(filteredProtocols = null) {
    const protocolsToRender = filteredProtocols || protocols;

    if (protocolsToRender.length === 0) {
        protocolsList.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    protocolsList.classList.remove('hidden');
    emptyState.classList.add('hidden');

    protocolsList.innerHTML = protocolsToRender.map(protocol => `
        <div class="protocol-card" data-id="${protocol.id}" onclick="openProtocolModal('${protocol.id}')">
            <div class="protocol-card-header">
                <span class="protocol-name">${escapeHtml(protocol.name)}</span>
                <span class="protocol-date">${formatDate(protocol.updatedAt)}</span>
            </div>
            <div class="protocol-preview trigger-preview">
                <strong>Gatilho:</strong> ${escapeHtml(truncate(protocol.trigger, 80))}
            </div>
            <div class="protocol-steps-count">
                ${protocol.steps.length} passo${protocol.steps.length !== 1 ? 's' : ''} definido${protocol.steps.length !== 1 ? 's' : ''}
            </div>
            <div class="protocol-actions">
                <button class="action-btn edit" onclick="event.stopPropagation(); handleEdit('${protocol.id}')" title="Editar">✏️</button>
                <button class="action-btn delete" onclick="event.stopPropagation(); handleDelete('${protocol.id}')" title="Excluir">🗑️</button>
            </div>
        </div>
    `).join('');
}

// ============================================
// Modal
// ============================================
function openProtocolModal(id) {
    const protocol = getProtocolById(id);
    if (!protocol) return;

    modal.dataset.protocolId = id;
    modalTitle.textContent = protocol.name;

    modalBody.innerHTML = `
        <div class="modal-section">
            <div class="modal-section-title">📍 GATILHO (TRIGGER)</div>
            <div class="modal-section-content">${escapeHtml(protocol.trigger)}</div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title">📋 PASSO A PASSO</div>
            <div class="modal-steps">
                ${protocol.steps.map((step, index) => `
                    <div class="modal-step">
                        <span class="modal-step-number">${index + 1}.</span>
                        <span class="modal-step-text">${escapeHtml(step)}</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title">🚪 VÁLVULA DE ESCAPE</div>
            <div class="modal-section-content">${escapeHtml(protocol.escapeValve)}</div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title">📅 INFORMAÇÕES</div>
            <div class="modal-section-content">
                <p>Criado: ${formatDate(protocol.createdAt)}</p>
                <p>Atualizado: ${formatDate(protocol.updatedAt)}</p>
            </div>
        </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// ============================================
// Busca
// ============================================
function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();

    if (!query) {
        renderProtocols();
        return;
    }

    const filtered = protocols.filter(protocol =>
        protocol.name.toLowerCase().includes(query) ||
        protocol.trigger.toLowerCase().includes(query) ||
        protocol.escapeValve.toLowerCase().includes(query) ||
        protocol.steps.some(step => step.toLowerCase().includes(query))
    );

    renderProtocols(filtered);
}

// ============================================
// Timer Functions
// ============================================
function updateTimerProtocolSelect() {
    const currentValue = timerProtocolSelect.value;
    timerProtocolSelect.innerHTML = '<option value="">Selecione um protocolo...</option>';

    protocols.forEach(protocol => {
        const option = document.createElement('option');
        option.value = protocol.id;
        option.textContent = protocol.name;
        timerProtocolSelect.appendChild(option);
    });

    // Restaura seleção anterior se ainda existir
    if (currentValue && protocols.find(p => p.id === currentValue)) {
        timerProtocolSelect.value = currentValue;
    }
}

function handleProtocolSelect() {
    const protocolId = timerProtocolSelect.value;
    if (protocolId) {
        const protocol = getProtocolById(protocolId);
        if (protocol) {
            // Sugere duração baseada no número de passos (5 min por passo, min 15, max 60)
            const suggestedDuration = Math.min(Math.max(protocol.steps.length * 5, 15), 60);
            timerDurationInput.value = suggestedDuration;
            updateTimerDuration();
            showNotification(`Protocolo "${protocol.name}" selecionado. Duração sugerida: ${suggestedDuration}min`);
        }
    }
}

function updateTimerDuration() {
    const minutes = parseInt(timerDurationInput.value) || 25;
    timerDuration = minutes * 60;

    // Se timer não está rodando, atualiza a barra de progresso
    if (!timerRunning && !timerPaused) {
        timerSeconds = timerDuration;
        updateProgressBar();
    }
}

function startTimer() {
    const protocolId = timerProtocolSelect.value;
    if (!protocolId) {
        showNotification('Selecione um protocolo antes de iniciar o timer.', 'error');
        return;
    }

    if (timerRunning) return;

    const protocol = getProtocolById(protocolId);
    if (!protocol) return;

    timerRunning = true;
    timerPaused = false;
    timerStatus.textContent = `Executando: ${protocol.name}`;
    timerStatus.classList.add('running');
    timerStatus.classList.remove('paused');

    // Se timer estava resetado ou pausado, ajusta tempo inicial
    if (timerSeconds === 0) {
        timerSeconds = timerDuration;
    }

    // Solicita permissão para notificações
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    timerInterval = setInterval(() => {
        timerSeconds--;

        if (timerSeconds <= 0) {
            timerComplete();
        } else {
            updateProgressBar();
            updateTimerDisplay();
        }
    }, 1000);

    showNotification(`Timer iniciado: ${protocol.name}`);
}

function pauseTimer() {
    if (!timerRunning || timerPaused) return;

    clearInterval(timerInterval);
    timerPaused = true;
    timerRunning = false;
    timerStatus.textContent = 'Pausado';
    timerStatus.classList.remove('running');
    timerStatus.classList.add('paused');
    showNotification('Timer pausado');
}

function resetTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    timerPaused = false;
    timerSeconds = timerDuration;
    timerStatus.textContent = 'Aguardando início...';
    timerStatus.classList.remove('running', 'paused');
    updateProgressBar();
    updateTimerDisplay();
}

function timerComplete() {
    clearInterval(timerInterval);
    timerRunning = false;
    timerPaused = false;
    timerSeconds = 0;

    timerStatus.textContent = 'Protocolo Concluído!';
    timerStatus.classList.remove('running', 'paused');
    updateProgressBar();
    updateTimerDisplay();

    // Notificação sonora (se suportado)
    playNotificationSound();

    // Notificação do navegador
    sendNotification();

    const protocolId = timerProtocolSelect.value;
    const protocol = getProtocolById(protocolId);
    const protocolName = protocol ? protocol.name : 'Protocolo';

    showNotification(`🎯 ${protocolName} concluído!`);
}

function updateProgressBar() {
    const percentage = (timerSeconds / timerDuration) * 100;
    progressBar.style.width = `${percentage}%`;
}

function updateTimerDisplay() {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    // Atualiza também o relógio principal (opcional, ou manter hora atual)
    // currentTimeEl.textContent = display; // Comente se quiser manter hora atual
}

function playNotificationSound() {
    // Cria um beep simples usando Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);

        // Segundo beep
        setTimeout(() => {
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.frequency.value = 1000;
            osc2.type = 'sine';
            gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            osc2.start(audioContext.currentTime);
            osc2.stop(audioContext.currentTime + 0.5);
        }, 200);
    } catch (error) {
        console.log('Web Audio API não suportada');
    }
}

function sendNotification() {
    if (!('Notification' in window)) return;

    const protocolId = timerProtocolSelect.value;
    const protocol = getProtocolById(protocolId);
    const protocolName = protocol ? protocol.name : 'Protocolo';

    const options = {
        body: `O timer para "${protocolName}" foi concluído!`,
        icon: '⚔️',
        badge: '🔔'
    };

    // Notificação mesmo se não foi permitida previamente (pode não aparecer)
    if (Notification.permission === 'granted') {
        new Notification('Protocolo Militar - Timer Concluído!', options);
    }
}

// ============================================
// Persistência (localStorage)
// ============================================
function saveProtocols() {
    try {
        localStorage.setItem('militaryProtocols', JSON.stringify(protocols));
    } catch (error) {
        console.error('Erro ao salvar protocolos:', error);
        showNotification('Erro ao salvar dados.', 'error');
    }
}

function loadProtocols() {
    try {
        const saved = localStorage.getItem('militaryProtocols');
        if (saved) {
            protocols = JSON.parse(saved);
        }
    } catch (error) {
        console.error('Erro ao carregar protocolos:', error);
        protocols = [];
    }
}

// ============================================
// Utilitários
// ============================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// ============================================
// Expor funções globalmente para onclick
// ============================================
window.handleEdit = handleEdit;
window.handleDelete = handleDelete;
window.openProtocolModal = openProtocolModal;
