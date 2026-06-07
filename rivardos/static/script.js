// ============================================
// VARIABLES
// ============================================

let items = [];
let rustItems = [];

// ============================================
// UTILITY
// ============================================

function formatBRL(value) {
    const number = Number(value) || 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(number);
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
}

function mapApiItem(it) {
    return {
        id: it.id,
        name: it.name,
        quantity: Number(it.quantity) || 0,
        purchase_price: Number(it.purchase_price) || 0,
        current_price: Number(it.current_price) || 0,
        purchase_total: parseFloat(it.purchase_total) || 0,
        total: parseFloat(it.total) || 0,
        tax: parseFloat(it.tax) || 0,
        net: parseFloat(it.net ?? it.liquid) || 0,
        liquid: parseFloat(it.liquid ?? it.net) || 0,
        profit: parseFloat(it.profit) || 0,
        steam_item_id: it.steam_item_id || '',
        img: it.img || '/steam_cache/default.png'
    };
}

// ============================================
// API CALLS
// ============================================

async function loadItems() {
    console.log('[DEBUG] loadItems() called');
    try {
        const resp = await fetch('/api/inventory');
        console.log('[DEBUG] API response status:', resp.status);
        const data = await resp.json();
        console.log('[DEBUG] Inventory data:', data);

        if (data.success && data.items) {
            items = data.items.map(mapApiItem);
            console.log('[DEBUG] Processed items:', items.length);
            render();
        } else {
            console.error('Failed to load inventory:', data.error);
            const cards = document.getElementById('cards');
            if (cards) {
                cards.innerHTML = '<p style="text-align:center;color:#8fa1c2;padding:60px;font-size:16px;">Nenhum item no inventário.</p>';
            }
        }
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

async function loadStats() {
    try {
        const resp = await fetch('/api/stats');
        const data = await resp.json();
        if (data.success) {
            const stats = data.stats;
            document.getElementById('stat-total').textContent = stats.total_items || 0;
            document.getElementById('stat-bruto').textContent = formatBRL(stats.total_value || 0);
            document.getElementById('stat-taxas').textContent = formatBRL(stats.taxes || 0);
            document.getElementById('stat-liquido').textContent = formatBRL(stats.liquid_value || 0);
            document.getElementById('stat-resultado').textContent = formatBRL(stats.profit_value || 0);
            document.getElementById('menu-badge-total').textContent = stats.total_items || 0;
        }
    } catch (e) {
        console.error('Error loading stats:', e);
    }
}

async function loadLogs() {
    try {
        const resp = await fetch('/api/logs');
        const data = await resp.json();
        if (data.success) {
            const logsEl = document.getElementById('logs-list');
            logsEl.innerHTML = data.logs.map(log =>
                `<div class="log">${log.type === 'error' ? '✖' : '✔'} ${log.message}</div>`
            ).join('');
            document.getElementById('menu-badge-logs').textContent = data.logs.filter(l => l.type === 'error').length;
        }
    } catch (e) {
        console.error('Error loading logs:', e);
    }
}

async function loadRustItems() {
    try {
        const resp = await fetch('/api/rust/inventory');
        const data = await resp.json();
        if (data.success && data.items) {
            rustItems = data.items.map(mapApiItem);
            renderRust();
        } else {
            renderRustEmpty(data.error || 'Nenhuma skin Rust importada.');
        }
    } catch (e) {
        console.error('Error loading Rust items:', e);
        renderRustEmpty('Erro ao carregar skins Rust.');
    }
}

async function loadRustStats() {
    try {
        const resp = await fetch('/api/rust/stats');
        const data = await resp.json();
        if (data.success) {
            const stats = data.stats;
            document.getElementById('rust-stat-total').textContent = stats.total_items || 0;
            document.getElementById('rust-stat-bruto').textContent = formatBRL(stats.total_value || 0);
            document.getElementById('rust-stat-taxas').textContent = formatBRL(stats.taxes || 0);
            document.getElementById('rust-stat-liquido').textContent = formatBRL(stats.liquid_value || 0);
            document.getElementById('rust-stat-resultado').textContent = formatBRL(stats.profit_value || 0);
        }
    } catch (e) {
        console.error('Error loading Rust stats:', e);
    }
}

async function importRustSpreadsheet(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('replace', 'true');

    try {
        const resp = await fetch('/api/rust/import', {
            method: 'POST',
            body: formData
        });
        const data = await resp.json();
        document.getElementById('rust-file-input').value = '';
        if (data.success) {
            alert(data.message || 'Planilha Rust importada com sucesso.');
            await loadRustItems();
            await loadRustStats();
        } else {
            alert('Erro: ' + (data.error || 'Falha ao importar planilha Rust.'));
        }
    } catch (e) {
        document.getElementById('rust-file-input').value = '';
        alert('Erro ao importar planilha Rust.');
        console.error(e);
    }
}

async function updateRustPrices() {
    if (!confirm('Atualizar os preços das skins Rust pela Steam?')) return;
    try {
        const resp = await fetch('/api/rust/update-all', { method: 'POST' });
        const data = await resp.json();
        if (data.success) {
            alert(`Preços Rust atualizados: ${data.updated}/${data.total}`);
            await loadRustItems();
            await loadRustStats();
        } else {
            alert('Erro: ' + (data.error || 'Falha ao atualizar preços Rust.'));
        }
    } catch (e) {
        alert('Erro ao atualizar preços Rust.');
        console.error(e);
    }
}

// ============================================
// RENDER
// ============================================

function render() {
    const cardsEl = document.getElementById('cards');
    if (!cardsEl) return;
    cardsEl.innerHTML = '';

    if (items.length === 0) {
        cardsEl.innerHTML = '<p style="text-align:center;color:#8fa1c2;padding:60px;font-size:16px;">Nenhum item no inventário.</p>';
        return;
    }

    items.forEach(item => {
        const resultClass = item.profit < 0 ? 'loss' : 'profit';
        cardsEl.innerHTML += `
            <div class="card" onclick="showDetails(${item.id})">
                <img src="${item.img}" alt="${item.name}" onerror="this.src='/static/img/default_item.png'">
                <h3>${item.name}</h3>
                <div class="info">
                    <span>Total Bruto</span>
                    <strong>${formatBRL(item.total)}</strong>
                </div>
                <div class="info">
                    <span>Quantidade</span>
                    <strong>${item.quantity} un.</strong>
                </div>
                <div class="tax">
                    Taxa Steam: ${formatBRL(item.tax)}
                </div>
                <div class="profit">
                    Líquido após taxa: ${formatBRL(item.net)}
                </div>
                <div class="${resultClass}">
                    Resultado: ${formatBRL(item.profit)}
                </div>
                <div class="card-actions">
                    <button class="icon-btn blue" onclick="openEditModal(${item.id}); event.stopPropagation();" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="icon-btn red" onclick="deleteItem(${item.id}); event.stopPropagation();" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
    });
}

function renderRustEmpty(message) {
    const cardsEl = document.getElementById('rust-cards');
    if (cardsEl) {
        cardsEl.innerHTML = `<p style="text-align:center;color:#8fa1c2;padding:60px;font-size:16px;">${escapeHtml(message)}</p>`;
    }
}

function renderRust() {
    const cardsEl = document.getElementById('rust-cards');
    if (!cardsEl) return;
    cardsEl.innerHTML = '';

    if (rustItems.length === 0) {
        renderRustEmpty('Nenhuma skin Rust importada.');
        return;
    }

    rustItems.forEach(item => {
        const resultClass = item.profit < 0 ? 'loss' : 'profit';
        cardsEl.innerHTML += `
            <div class="card" onclick="showRustDetails(${item.id})">
                <img src="${item.img}" alt="${escapeHtml(item.name)}" onerror="this.src='/static/img/default_item.png'">
                <h3>${escapeHtml(item.name)}</h3>
                <div class="info">
                    <span>Total Bruto</span>
                    <strong>${formatBRL(item.total)}</strong>
                </div>
                <div class="info">
                    <span>Quantidade</span>
                    <strong>${item.quantity} un.</strong>
                </div>
                <div class="tax">
                    Taxa Steam: ${formatBRL(item.tax)}
                </div>
                <div class="profit">
                    Líquido após taxa: ${formatBRL(item.net)}
                </div>
                <div class="${resultClass}">
                    Resultado: ${formatBRL(item.profit)}
                </div>
                <div class="card-actions">
                    <button class="icon-btn blue" onclick="openRustModal(${item.id}); event.stopPropagation();" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="icon-btn red" onclick="deleteRustItem(${item.id}); event.stopPropagation();" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
    });
}

// ============================================
// ITEM CRUD
// ============================================

async function saveItem(e) {
    e.preventDefault();
    const id = document.getElementById('form-item-id').value;
    const name = document.getElementById('form-name').value.trim();
    const quantity = parseFloat(document.getElementById('form-quantity').value) || 0;
    const purchase_price = parseFloat(document.getElementById('form-purchase-price').value) || 0;
    const current_price = parseFloat(document.getElementById('form-current-price').value) || 0;

    if (!name) {
        alert('Informe o nome do item.');
        return;
    }

    try {
        const method = id ? 'PUT' : 'POST';
        const endpoint = id ? `/api/inventory/${id}` : '/api/inventory';

        const resp = await fetch(endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, quantity, purchase_price, current_price })
        });

        const data = await resp.json();

        if (data.success) {
            alert(id ? 'Item atualizado com sucesso!' : 'Item criado com sucesso!');
            loadItems();
            loadStats();
            closeModal();
        } else {
            alert('Erro: ' + (data.error || 'Erro desconhecido'));
        }
    } catch (err) {
        alert('Erro ao salvar item. Verifique se o servidor está rodando.');
        console.error(err);
    }
}

async function deleteItem(id) {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    try {
        const resp = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.success) {
            alert('Item deletado com sucesso');
            loadItems();
            loadStats();
        } else {
            alert('Erro: ' + (data.error || 'Erro desconhecido'));
        }
    } catch (err) {
        alert('Erro ao deletar item');
        console.error(err);
    }
}

async function saveRustItem(e) {
    e.preventDefault();
    const id = document.getElementById('rust-form-item-id').value;
    const name = document.getElementById('rust-form-name').value.trim();
    const quantity = parseFloat(document.getElementById('rust-form-quantity').value) || 0;
    const purchase_price = parseFloat(document.getElementById('rust-form-purchase-price').value) || 0;
    const current_price = parseFloat(document.getElementById('rust-form-current-price').value) || 0;
    const steam_item_id = document.getElementById('rust-form-steam-id').value.trim();

    if (!name) {
        alert('Informe o nome da skin Rust.');
        return;
    }

    try {
        const method = id ? 'PUT' : 'POST';
        const endpoint = id ? `/api/rust/inventory/${id}` : '/api/rust/inventory';
        const body = { name, quantity, purchase_price, current_price, steam_item_id };
        const resp = await fetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await resp.json();
        if (data.success) {
            alert(id ? 'Skin Rust atualizada com sucesso!' : 'Skin Rust criada com sucesso!');
            closeRustModal();
            await loadRustItems();
            await loadRustStats();
        } else {
            alert('Erro: ' + (data.error || 'Erro desconhecido'));
        }
    } catch (err) {
        alert('Erro ao salvar skin Rust.');
        console.error(err);
    }
}

async function deleteRustItem(id) {
    if (!confirm('Tem certeza que deseja excluir esta skin Rust?')) return;
    try {
        const resp = await fetch(`/api/rust/inventory/${id}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.success) {
            alert('Skin Rust deletada com sucesso');
            await loadRustItems();
            await loadRustStats();
        } else {
            alert('Erro: ' + (data.error || 'Erro desconhecido'));
        }
    } catch (err) {
        alert('Erro ao deletar skin Rust.');
        console.error(err);
    }
}

// ============================================
// MODALS
// ============================================

function openModal() {
    document.getElementById('form-item-id').value = '';
    document.getElementById('form-name').value = '';
    document.getElementById('form-quantity').value = '';
    document.getElementById('form-purchase-price').value = '';
    document.getElementById('form-current-price').value = '';
    document.getElementById('modal-title').textContent = 'Novo Item';
    document.getElementById('form-submit-btn').textContent = 'Salvar';
    document.getElementById('modal-overlay').classList.add('active');
}

function openEditModal(id) {
    const item = items.find(it => it.id === id);
    if (!item) return;
    document.getElementById('form-item-id').value = item.id;
    document.getElementById('form-name').value = item.name;
    document.getElementById('form-quantity').value = item.quantity;
    document.getElementById('form-purchase-price').value = item.purchase_price;
    document.getElementById('form-current-price').value = item.current_price;
    document.getElementById('modal-title').textContent = 'Editar Item';
    document.getElementById('form-submit-btn').textContent = 'Atualizar';
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

function showDetails(id) {
    const item = items.find(it => it.id === id);
    if (!item) return;
    document.getElementById('details-title').textContent = item.name;
    document.getElementById('details-content').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div class="tax"><strong>Quantidade:</strong><br>${item.quantity} un.</div>
            <div class="profit"><strong>Preço de Compra:</strong><br>${formatBRL(item.purchase_price)}</div>
            <div class="tax"><strong>Preço Atual:</strong><br>${formatBRL(item.current_price)}</div>
            <div class="profit"><strong>Total Compra:</strong><br>${formatBRL(item.purchase_total)}</div>
            <div class="tax"><strong>Total Bruto:</strong><br>${formatBRL(item.total)}</div>
            <div class="profit"><strong>Líquido após taxa:</strong><br>${formatBRL(item.net)}</div>
            <div class="${item.profit < 0 ? 'tax' : 'profit'}"><strong>Resultado:</strong><br>${formatBRL(item.profit)}</div>
        </div>
        <p style="margin-top:16px;font-size:13px;color:#8fa1c2;">
            <strong>Taxa Steam:</strong> ${formatBRL(item.tax)}
        </p>
    `;
    document.getElementById('details-modal-overlay').classList.add('active');
}

function closeDetailsModal() {
    document.getElementById('details-modal-overlay').classList.remove('active');
}

// ============================================
// SEARCH & FILTER
// ============================================

function filterItems(query) {
    const cards = document.querySelectorAll('.cards .card');
    cards.forEach(card => {
        const name = card.querySelector('h3').textContent.toLowerCase();
        card.style.display = name.includes(query.toLowerCase()) ? '' : 'none';
    });
}

// ============================================
// EXPORT
// ============================================

function exportItems() {
    const csv = ['id,nome,quantidade,preco_compra,preco_atual,total_compra,total_bruto,taxa,liquido_apos_taxa,resultado'];
    items.forEach(it => {
        csv.push(`${it.id},"${it.name}",${it.quantity},${it.purchase_price},${it.current_price},${it.purchase_total},${it.total},${it.tax},${it.net},${it.profit}`);
    });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventario_export.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// EXPORT (download from backend)
// ============================================

// async function exportItems() {
//     try {
//         const resp = await fetch('/api/export');
//         const blob = await resp.blob();
//         const url = URL.createObjectURL(blob);
//         const a = document.createElement('a');
//         a.href = url;
//         a.download = 'inventario.csv';
//         a.click();
//         URL.revokeObjectURL(url);
//     } catch(e) {
//         alert('Erro ao exportar');
//     }
// }

// ============================================
// SETTINGS
// ============================================

function switchSettingsTab(btn, tab) {
    document.querySelectorAll('.settings-menu .btn').forEach(b => {
        b.classList.remove('btn-blue');
        b.classList.add('btn-dark');
    });
    btn.classList.remove('btn-dark');
    btn.classList.add('btn-blue');

    document.getElementById('settings-geral').style.display = tab === 'geral' ? '' : 'none';
    document.getElementById('settings-integracoes').style.display = tab === 'integracoes' ? '' : 'none';
    document.getElementById('settings-seguranca').style.display = tab === 'seguranca' ? '' : 'none';
}

function saveSettings() {
    alert('Configurações salvas! (funcionalidade em desenvolvimento)');
}

// ============================================
// PAGE SWITCH
// ============================================

const menuItems = document.querySelectorAll('.menu-item');
const pages = document.querySelectorAll('.page');

menuItems.forEach(item => {
    item.addEventListener('click', () => {
        menuItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const page = item.dataset.page;
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(page).classList.add('active');
    });
});

// ============================================
// CHARTS
// ============================================

new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: {
        labels: ['01/05', '02/05', '03/05', '04/05', '05/05'],
        datasets: [{
            label: 'Lucro',
            data: [120, 180, 150, 240, 300],
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37,99,235,.2)',
            fill: true,
            tension: .4
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: '#fff' } }
        },
        scales: {
            y: {
                ticks: { color: '#fff' },
                grid: { color: 'rgba(255,255,255,.05)' }
            },
            x: {
                ticks: { color: '#fff' },
                grid: { color: 'rgba(255,255,255,.05)' }
            }
        }
    }
});

new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
        labels: ['Caixas', 'Chaves', 'Adesivos'],
        datasets: [{
            data: [74, 18, 8],
            backgroundColor: ['#2563eb', '#7c3aed', '#16a34a']
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: '#fff' } }
        }
    }
});

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('[DEBUG] DOMContentLoaded - Carregando dados...');
    loadItems();
    loadStats();
    loadLogs();
});

// Fallback
setTimeout(() => {
    if (items.length === 0) {
        console.log('[DEBUG] Fallback: carregando dados...');
        loadItems();
        loadStats();
        loadLogs();
    }
}, 1000);
