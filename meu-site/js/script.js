// VARIÁVEL GLOBAL para controle
window.MAANAIM_AUTH = { usuario: null, atualizarHeader: null };

// Captura de erros globais
window.addEventListener('error', function(e) {
    console.error('[ERRO GLOBAL JS] Erro capturado:', e.message, 'em', e.filename, 'linha', e.lineno);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('[ERRO GLOBAL JS] Promise rejeitada não tratada:', e.reason);
});

console.log('[JS] Script carregado - Version 8');

// Variáveis globais para busca bíblica
let bibliaLivros = [];
let livroAtual = null;
let capituloAtual = null;
let buscaOffset = 0;
const buscaLimite = 10;
let termoBuscaAtual = '';

// Função para extrair ID do vídeo do YouTube
function extractVideoId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    return match ? match[1] : null;
}

// Função para detectar a proporção da imagem e ajustar o aspect-ratio automaticamente
function setupImageAspectRatio(imgElement) {
    if (!imgElement || imgElement.dataset.aspectRatioSet) return;
    
    const img = new Image();
    img.onload = function() {
        const width = this.width;
        const height = this.height;
        const ratio = width / height;
        
        if (ratio > 1.1) {
            // Imagem horizontal (paisagem) - usa 16:9
            img.style.aspectRatio = '16/9';
        } else if (ratio < 0.9) {
            // Imagem vertical (retrato) - usa 9:16
            img.style.aspectRatio = '9/16';
        } else {
            // Imagem quadrada ou próxima - usa 1:1
            img.style.aspectRatio = '1/1';
        }
        
        img.dataset.aspectRatioSet = 'true';
    };
    img.onerror = function() {
        // Mantém o aspect-ratio original em caso de erro
    };
    img.src = imgElement.src;
}

// Função para configurar todas as imagens de um container
function setupAllImages(container) {
    const images = container.querySelectorAll('img');
    images.forEach(img => {
        if (img.complete) {
            setupImageAspectRatio(img);
        } else {
            img.addEventListener('load', () => setupImageAspectRatio(img));
        }
    });
}

// Função para detectar a proporção da imagem e retornar estilos CSS
// Retorna objeto com width, height, objectFit e aspectRatio
function getImageStyleByProportion(imgUrl, maxWidth = '100%', maxHeight = '100%') {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const width = this.width;
            const height = this.height;
            const ratio = width / height;
            
            let style = {
                width: maxWidth,
                height: maxHeight,
                objectFit: 'contain',
                aspectRatio: 'auto'
            };
            
            if (ratio > 1.1) {
                // Imagem horizontal (paisagem)
                style.aspectRatio = '16/9';
                style.objectFit = 'contain';
                style.height = 'auto';
            } else if (ratio < 0.9) {
                // Imagem vertical (retrato) - como stories do Instagram
                style.aspectRatio = '9/16';
                style.objectFit = 'contain';
                style.width = 'auto';
            } else {
                // Imagem quadrada ou próxima
                style.aspectRatio = '1/1';
                style.objectFit = 'contain';
            }
            
            resolve(style);
        };
        img.onerror = function() {
            // Em caso de erro, retorna estilo padrão
            resolve({
                width: maxWidth,
                height: maxHeight,
                objectFit: 'cover',
                aspectRatio: 'auto'
            });
        };
        img.src = imgUrl;
    });
}

// Função síncrona simplificada que retorna estilo base (sem detectar proporção)
// Útil para uso em templates onde não podemos usar Promise
function getImageStyleBase(maxWidth = '100%', aspectRatio = 'auto', objectFit = 'contain') {
    return `width: ${maxWidth}; aspect-ratio: ${aspectRatio}; object-fit: ${objectFit};`;
}

// Função para converter tags de imagem em HTML
// Formatos suportados:
// [img]URL[/img] - imagem inline
// [img-left]URL[/img] - alinhada à esquerda
// [img-right]URL[/img] - alinhada à direita
// [img-center]URL[/img] - centralizada
function parseContentImages(texto) {
    if (!texto) return '';
    
    // Se o texto já contém tags HTML (como <img, <p>, <div>), retornar diretamente
    if (texto.includes('<img') || texto.includes('<div') || texto.includes('<p>') || texto.includes('<br')) {
        return texto;
    }
    
    // Substituir quebras de linha por <br>
    let html = texto.replace(/\n/g, '<br>');
    
    // Imagem centralizada [img-center]URL[/img-center]
    html = html.replace(/\[img-center\](.*?)\[\/img-center\]/gi, 
        '<img src="$1" class="content-image content-image-center" alt="Imagem">');
    
    // Imagem à esquerda [img-left]URL[/img-left]
    html = html.replace(/\[img-left\](.*?)\[\/img-left\]/gi, 
        '<img src="$1" class="content-image content-image-left" alt="Imagem">');
    
    // Imagem à direita [img-right]URL[/img-right]
    html = html.replace(/\[img-right\](.*?)\[\/img-right\]/gi, 
        '<img src="$1" class="content-image content-image-right" alt="Imagem">');
    
    // Imagem inline [img]URL[/img]
    html = html.replace(/\[img\](.*?)\[\/img\]/gi, 
        '<img src="$1" class="content-image" alt="Imagem">');
    
    return html;
}

// Função helper para exibir conteúdo com imagens
function renderContentWithImages(texto, containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        let html = parseContentImages(texto);
        
        // Adicionar tratamento de erro para imagens quebradas
        html = html.replace(/<img src="([^"]+)"/g, function(match, src) {
            return '<img src="' + src + '" onerror="this.style.display=\'none\'"';
        });
        
        container.innerHTML = html;
    }
}

// ========== YOUTUBE LIVE CHECK ==========
async function checkYoutubeLive() {
    try {
        const response = await fetch('/api/youtube-live');
        const data = await response.json();
        
        if (data.isLive && data.video) {
            // Mostrar o player embed do YouTube
            const container = document.getElementById('youtube-live-container');
            const iframe = document.getElementById('youtube-live-iframe');
            const title = document.getElementById('youtube-live-title');
            
            if (container && iframe) {
                container.style.display = 'block';
                // Usar embed com autoplay para live
                iframe.src = `https://www.youtube.com/embed/${data.video.videoId}?autoplay=1&rel=0`;
                // Mostrar título
                if (title) {
                    title.textContent = data.video.title;
                }
            }
        }
    } catch (error) {
        console.log('YouTube live check failed:', error);
    }
}

// Verificar a cada 30 segundos (reduzido para debug)
checkYoutubeLive();
setInterval(checkYoutubeLive, 30000);

// Funções de Lightbox para imagens
function abrirLightbox(src) {
    let lightbox = document.getElementById('lightboxModal');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'lightboxModal';
        lightbox.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 10000; display: flex; align-items: center; justify-content: center; cursor: pointer;';
        lightbox.innerHTML = '<img id="lightboxImage" style="max-width: 90%; max-height: 90%; object-fit: contain; border-radius: 10px;" onclick="fecharLightbox()">';
        lightbox.onclick = function(e) {
            if (e.target === lightbox) fecharLightbox();
        };
        document.body.appendChild(lightbox);
    }
    document.getElementById('lightboxImage').src = src;
    lightbox.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function fecharLightbox() {
    const lightbox = document.getElementById('lightboxModal');
    if (lightbox) {
        lightbox.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Fechar lightbox ao pressionar ESC
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        fecharLightbox();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    let usuarioLogado = null;

    // ✅ HEADER CORRIGIDO COM "Entrar" para Visitante
    function atualizarHeader() {
        const nav = document.querySelector('.nav');
        if (!nav) return;

        nav.innerHTML = ''; // Limpa tudo

        let abasVisiveis;
        if (usuarioLogado?.role === 'admin') {
            abasVisiveis = ['inicio', 'programacao', 'biblia', 'membro', 'admin'];
        } else if (usuarioLogado?.role === 'membro' || usuarioLogado?.role === 'conselho') {
            abasVisiveis = ['inicio', 'programacao', 'biblia', 'membro'];
        } else if (usuarioLogado?.role === 'frequentador') {
            abasVisiveis = ['inicio', 'programacao', 'biblia'];
        } else {
            // 👇 VISITANTE: Início | Programação | Entrar
            abasVisiveis = ['inicio', 'programacao', 'entrar'];
        }

        const links = {
            'inicio': { href: 'index.html', texto: 'Início' },
            'programacao': { href: 'programacao.html', texto: 'Programação' },
            'biblia': { href: 'biblia.html', texto: 'Bíblia' },
            'membro': { href: 'membro.html', texto: 'Área do Membro' },
            'admin': { href: 'admin.html', texto: 'Admin' },
            'entrar': { href: 'login.html', texto: 'Entrar' }
        };

        abasVisiveis.forEach(aba => {
            if (links[aba]) {
                const link = document.createElement('a');
                link.href = links[aba].href;
                link.textContent = links[aba].texto;
                link.dataset.aba = aba;
                nav.appendChild(link);
            }
        });

        // Botão Sair (se logado)
        if (usuarioLogado) {
            const logoutBtn = document.createElement('a');
            logoutBtn.href = '#';
            logoutBtn.id = 'logout-link';
            logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Sair';
            logoutBtn.style.cssText = 'color: #ff6b6b !important; font-weight: 600;';
            logoutBtn.onclick = (e) => { e.preventDefault(); fazerLogout(); };
            nav.appendChild(logoutBtn);
        }
    }

    // Carrega usuário
    function carregarUsuario() {
        const userData = localStorage.getItem('maanaim_user');
        console.log('[DEBUG] localStorage:', userData);
        
        // Tratar dados inválidos no localStorage
        if (!userData || userData === 'null' || userData === 'undefined' || userData === '') {
            console.log('[DEBUG] Usuário não logado (localStorage vazio ou inválido)');
            usuarioLogado = null;
        } else {
            try {
                usuarioLogado = JSON.parse(userData);
                console.log('[DEBUG] Usuário logado:', usuarioLogado);
            } catch(e) {
                console.error('[DEBUG] Erro ao parsear usuário:', e);
                localStorage.removeItem('maanaim_user');
                usuarioLogado = null;
            }
        }
        
        atualizarHeader();

        // Debug pathname
        const pathname = window.location.pathname || window.location.href;
        console.log('[DEBUG] Página atual:', pathname);
        
        // Redireciona se já logado E tem id válido
        if (usuarioLogado && usuarioLogado.id) {
            if (pathname.includes('login.html') || pathname.includes('register.html')) {
                console.log('[DEBUG] Redirecionando para index.html');
                window.location.href = 'index.html';
                return;
            }
        }
    }

    // Logout
    function fazerLogout() {
        localStorage.removeItem('maanaim_user');
        usuarioLogado = null;
        atualizarHeader();
        setTimeout(() => window.location.reload(), 100);
    }

    // LOGIN
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(loginForm).entries());
            console.log('[DEBUG LOGIN] Enviando dados:', body);

            fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
            .then(r => {
                console.log('[DEBUG LOGIN] Status:', r.status);
                return r.json();
            })
            .then(data => {
                if (data.error) {
                    alert("❌ " + data.error);
                } else {
                    localStorage.setItem('maanaim_user', JSON.stringify(data.user));
                    usuarioLogado = data.user;
                    atualizarHeader();
                    // Forçar recarregamento completo para atualizar o header
                    window.location.href = 'index.html';
                }
            })
            .catch(err => {
                console.error('[DEBUG LOGIN] Erro:', err);
                alert("❌ " + err.message);
            });
        });
    }

    // REGISTER
    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
        registerForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(registerForm).entries());

            fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    alert("❌ " + data.error);
                } else {
                    alert("✅ Cadastro OK!");
                    window.location.href = 'login.html';
                }
            })
            .catch(err => alert("❌ " + err.message));
        });
    }

    // Multi-abas
    window.addEventListener('storage', (e) => {
        if (e.key === 'maanaim_user') window.location.reload();
    });

    // Carregar notícias (se estiver na página inicial)
    if (document.getElementById('noticiasContainer')) {
        carregarNoticias();
    }

    // Carregar eventos (se estiver na página inicial ou programação)
    if (document.getElementById('eventosContainer') || document.getElementById('eventosEspeciaisContainer')) {
        carregarEventos();
    }

    // Carregar cultos (se estiver na página de programação)
    if (document.getElementById('cultosContainer')) {
        carregarCultos();
    }

    // Carregar conteúdos da página inicial (se estiver na página inicial)
    if (document.getElementById('heroTitle')) {
        carregarConteudosPaginaInicial();
        carregarMinisterios();
        carregarMensagensHome();
    }

    // Inicializa
    carregarUsuario();
});

// Função para carregar notícias
async function carregarNoticias() {
    try {
        console.log('[DEBUG JS] Carregando notícias...');
        const response = await fetch('/api/noticias');
        if (!response.ok) throw new Error('Erro ao carregar notícias: ' + response.status);

        const noticias = await response.json();
        console.log('[DEBUG JS] Notícias recebidas:', noticias.length);
        const container = document.getElementById('noticiasContainer');

        if (noticias.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">Nenhuma notícia disponível no momento.</p>';
            return;
        }

        container.innerHTML = noticias.map(noticia => {
            // Usar parseContentImages para renderizar imagens
            const conteudoHtml = parseContentImages(noticia.conteudo);
            return `
                <div class="noticia-card">
                    <h4>${noticia.titulo}</h4>
                    <div class="noticia-conteudo">${conteudoHtml}</div>
                    <div class="noticia-data">${new Date(noticia.created_at).toLocaleDateString('pt-BR')}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('[ERRO JS] Erro ao carregar notícias:', error);
        document.getElementById('noticiasContainer').innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">Erro ao carregar notícias.</p>';
    }
}

// Função para carregar eventos
async function carregarEventos() {
    try {
        console.log('[DEBUG JS] Carregando eventos...');
        
        // Buscar eventos especiais e cultos semanais em paralelo
        const [eventosResp, cultosResp] = await Promise.all([
            fetch('/api/eventos'),
            fetch('/api/cultos').catch(() => ({ ok: true, json: () => [] })) // Fallback se falhar
        ]);
        
        if (!eventosResp.ok) throw new Error('Erro ao carregar eventos');
        
        let eventos = await eventosResp.json();
        const cultos = cultosResp.ok ? await cultosResp.json() : [];

        console.log('[DEBUG JS] Eventos recebidos:', eventos);
        console.log('[DEBUG JS] Cultos recebidos:', cultos);

        // Processar eventos para extrair horario da data se necessário
        eventos = eventos.map(evento => {
            if (!evento.horario && evento.data) {
                // Extrair hora do campo data (formato: 2026-03-21T22:00)
                const horaExtraida = evento.data.split('T')[1];
                if (horaExtraida) {
                    evento.horario = horaExtraida.substring(0, 5); // Pega HH:MM
                }
            }
            return evento;
        });

        // Carregar eventos no index (resumo)
        const containerIndex = document.getElementById('eventosContainer');
        if (containerIndex) {
            let html = '';
            
            // Adicionar cultos semanais primeiro
            if (cultos.length > 0) {
                cultos.slice(0, 2).forEach(culto => {
                    html += `<p><strong>${culto.titulo}</strong><br>${culto.horario} - ${culto.local}</p>`;
                });
            }
            
            // Adicionar eventos especiais
            if (eventos.length > 0) {
                eventos.slice(0, 2).forEach(evento => {
                    let dataFormatada = '';
                    if (evento.data) {
                        // Extrair a data diretamente da string ISO sem conversão de fuso horário
                        const dataPart = evento.data.split('T')[0];
                        const [ano, mes, dia] = dataPart.split('-');
                        dataFormatada = `${dia}/${mes}/${ano}`;
                    }
                    let infoEvento = `<strong>${evento.titulo}</strong>`;
                    if (dataFormatada) {
                        infoEvento += `<br>${dataFormatada}${evento.horario ? ' às ' + evento.horario : ''}`;
                    } else if (evento.horario) {
                        infoEvento += `<br>${evento.horario}`;
                    }
                    if (evento.local) {
                        infoEvento += ` - ${evento.local}`;
                    }
                    // Sempre adicionar o evento se tiver título
                    html += `<p>${infoEvento}</p>`;
                });
            }
            
            if (html === '') {
                containerIndex.innerHTML = '<p>Nenhum evento programado.</p>';
            } else {
                containerIndex.innerHTML = html;
            }
        }

        // Carregar eventos na programação (detalhados)
        const containerProgramacao = document.getElementById('eventosEspeciaisContainer');
        if (containerProgramacao) {
            if (eventos.length === 0) {
                containerProgramacao.innerHTML = '<p style="text-align: center; color: #666; font-style: italic; grid-column: 1 / -1;">Nenhum evento especial programado.</p>';
            } else {
                containerProgramacao.innerHTML = eventos.map((evento, idx) => {
                    // Formatar data apenas se existir
                    let dataFormatada = '';
                    let diaSemana = '';
                    if (evento.data) {
                        // Extrair a data diretamente da string ISO sem conversão de fuso horário
                        const dataPart = evento.data.split('T')[0];
                        const [ano, mes, dia] = dataPart.split('-');
                        dataFormatada = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                        diaSemana = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', { weekday: 'short' });
                    }
                    
                    // Gerar HTML do carrossel de imagens com Swiper
                    let carouselHtml = '';
                    const imagens = evento.imagens ? (typeof evento.imagens === 'string' ? JSON.parse(evento.imagens) : evento.imagens) : [];
                    const temImagens = imagens.length > 0 || evento.imagem;
                    const uniqueId = `evento-swiper-${evento.id}-${idx}`;
                    
                    if (temImagens) {
                        const todasImagens = evento.imagem ? [evento.imagem, ...imagens] : imagens;
                        if (todasImagens.length > 1) {
                            // Carrossel Swiper com múltiplas imagens - proporção automática com object-fit: contain
                            carouselHtml = `
                                <div class="swiper-container swiper-evento-${evento.id}" id="${uniqueId}" style="width: 100%; max-width: 250px; aspect-ratio: 9 / 16; margin: 0 auto 1rem auto; border-radius: 10px; overflow: hidden; position: relative;">
                                    <div class="swiper-wrapper">
                                        ${todasImagens.map(img => `
                                            <div class="swiper-slide">
                                                <img src="${img}" style="width: 100%; height: 100%; object-fit: contain; background: #f0f0f0;" onerror="this.style.display='none'" onload="setupImageAspectRatio(this)">
                                            </div>
                                        `).join('')}
                                    </div>
                                    <div class="swiper-pagination" style="bottom: 10px; z-index: 10;"></div>
                                    <div class="swiper-button-next" style="right: 10px; z-index: 10; color: white; width: 40px; height: 40px; background: rgba(0,0,0,0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;"></div>
                                    <div class="swiper-button-prev" style="left: 10px; z-index: 10; color: white; width: 40px; height: 40px; background: rgba(0,0,0,0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;"></div>
                                </div>
                            `;
                        } else {
                            // Imagem única com clique para ampliar - object-fit: contain para não cortar
                            carouselHtml = `
                                <img src="${todasImagens[0]}" style="width: 100%; max-width: 250px; aspect-ratio: 9 / 16; object-fit: contain; background: #f0f0f0; border-radius: 10px; margin: 0 auto 1rem auto; display: block; cursor: pointer;" onclick="abrirLightbox(this.src)" onerror="this.style.display='none'" onload="setupImageAspectRatio(this)">
                            `;
                        }
                    }
                    
                    // Verificar se há informações de texto (título, data, horario, local)
                    const temTexto = evento.titulo || evento.data || evento.horario || evento.local;
                    
                    // Verificar se o evento permite inscrição
                    const permiteInscricao = evento.tem_inscricao === 1 || evento.tem_inscricao === true;
                    
                    // Botão de inscrição: aparece se tem_inscricao estiver habilitado OU se tiver data
                    const botaoInscricao = permiteInscricao || evento.data ? 
                        `<button onclick="abrirInscricao(${evento.id}, '${evento.titulo.replace(/'/g, "\\'")}')" style="background: var(--verde-principal); color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 8px; cursor: pointer; margin-top: 1rem;">📝 Inscrever-se</button>` 
                        : '';
                    
                    // Se não tem nenhuma informação de texto, mostra apenas a imagem (se houver)
                    const infoHtml = (temTexto || temImagens) ? `
                        ${evento.titulo ? `<div style="font-size: 3rem; color: var(--dourado); margin-bottom: 1rem;">
                            <i class="fas fa-calendar-alt"></i>
                        </div>
                        <h4>${evento.titulo}</h4>` : ''}
                        ${evento.data ? `<p style="font-size: 1.2rem; font-weight: 600; color: var(--verde-principal); margin-bottom: 1rem;">
                            ${dataFormatada}${evento.horario ? ' às ' + evento.horario : ''}
                        </p>` : ''}
                        ${evento.local ? `<p>${evento.local}</p>` : ''}
                        ${botaoInscricao}
                    ` : '';
                    
                    return `
                    <div class="evento-card" style="background: white; border-radius: 20px; padding: 2.5rem; box-shadow: var(--sombra);">
                        ${carouselHtml}
                        ${infoHtml}
                    </div>
                `}).join('') + (() => {
                    // Usar MutationObserver para detectar quando osSwiper containers são adicionados
                    const initSwipers = () => {
                        const swiperContainers = document.querySelectorAll('.swiper-container');
                        console.log('[DEBUG] MutationObserver: Swiper containers encontrados:', swiperContainers.length);
                        
                        if (swiperContainers.length > 0) {
                            swiperContainers.forEach(swiperContainer => {
                                if (swiperContainer.swiper) {
                                    console.log('[DEBUG] Swiper já inicializado para:', swiperContainer.className);
                                    return;
                                }
                                
                                const nextBtn = swiperContainer.querySelector('.swiper-button-next');
                                const prevBtn = swiperContainer.querySelector('.swiper-button-prev');
                                console.log('[DEBUG] Botões encontrados - next:', !!nextBtn, 'prev:', !!prevBtn);
                                
                                try {
                                    const swiper = new Swiper(swiperContainer, {
                                        loop: true,
                                        observer: true,
                                        observeParents: true,
                                        autoplay: { delay: 3000, disableOnInteraction: false },
                                        pagination: { 
                                            el: swiperContainer.querySelector('.swiper-pagination'),
                                            clickable: true 
                                        },
                                        navigation: {
                                            nextEl: nextBtn,
                                            prevEl: prevBtn,
                                        },
                                        grabCursor: true
                                    });
                                    console.log('[DEBUG] Swiper inicializado com sucesso!');
                                    
                                    // Configurar aspect-ratio das imagens após inicialização
                                    setupAllImages(swiperContainer);
                                } catch (e) {
                                    console.error('[DEBUG] Erro ao inicializar Swiper:', e);
                                }
                            });
                        }
                    };
                    
                    // Tentar inicializar imediatamente
                    initSwipers();
                    
                    // Também observar mudanças no DOM
                    const observer = new MutationObserver(initSwipers);
                    const container = document.getElementById('eventosEspeciaisContainer');
                    if (container) {
                        observer.observe(container, { childList: true, subtree: true });
                    }
                    
                    return '';
                })();
            }
        }

    } catch (error) {
        console.error('Erro ao carregar eventos:', error);
        // Mantém o conteúdo padrão em caso de erro
        const containerIndex = document.getElementById('eventosContainer');
        if (containerIndex) {
            containerIndex.innerHTML = '<p>Erro ao carregar eventos.</p>';
        }
        const containerProgramacao = document.getElementById('eventosEspeciaisContainer');
        if (containerProgramacao) {
            containerProgramacao.innerHTML = '<p style="text-align: center; color: #666; font-style: italic; grid-column: 1 / -1;">Erro ao carregar eventos especiais.</p>';
        }
    }
}

// Carregar conteúdos da página inicial
async function carregarConteudosPaginaInicial() {
    console.log('=== DEBUG: Carregando conteúdos da página inicial ===');
    try {
        const response = await fetch('/api/page-content?_t=' + Date.now());
        if (!response.ok) throw new Error('Erro ao carregar conteúdos');

        const conteudos = await response.json();
        console.log('=== DEBUG: Conteudos recebidos ===');
        console.log('Hero:', conteudos.hero ? 'EXISTS' : 'NOT FOUND');
        console.log('Sobre:', conteudos.sobre ? 'EXISTS' : 'NOT FOUND');
        console.log('Mensagem:', conteudos.mensagem ? 'EXISTS' : 'NOT FOUND');

        // Atualizar Hero
        const heroTitle = document.getElementById('heroTitle');
        const heroSubtitle = document.getElementById('heroSubtitle');
        if (heroTitle && conteudos.hero?.title) heroTitle.textContent = conteudos.hero.title;
        if (heroSubtitle && conteudos.hero?.content) {
            console.log('=== DEBUG: Hero Content ===');
            console.log('Content length:', conteudos.hero.content.length);
            console.log('Content preview:', conteudos.hero.content.substring(0, 200));
            console.log('Full content:', conteudos.hero.content);
            heroSubtitle.innerHTML = conteudos.hero.content;
        }

        // Atualizar Sobre
        const sobreTitle = document.getElementById('sobreTitle');
        const sobreContent = document.getElementById('sobreContent');
        if (sobreTitle && conteudos.sobre?.title) sobreTitle.textContent = conteudos.sobre.title;
        if (sobreContent && conteudos.sobre?.content) {
            console.log('=== DEBUG: Sobre Content ===');
            console.log('Content length:', conteudos.sobre.content.length);
            console.log('Content preview:', conteudos.sobre.content.substring(0, 200));
            sobreContent.innerHTML = conteudos.sobre.content;
        }

        // Atualizar Mensagem
        const mensagemTitle = document.getElementById('mensagemTitle');
        const mensagemContent = document.getElementById('mensagemContent');
        if (mensagemTitle && conteudos.mensagem?.title) mensagemTitle.textContent = conteudos.mensagem.title;
        if (mensagemContent && conteudos.mensagem?.content) mensagemContent.innerHTML = conteudos.mensagem.content;

        // Atualizar Título dos Ministérios
        const ministeriosTitle = document.getElementById('ministeriosTitle');
        if (ministeriosTitle && conteudos.ministerios?.title) ministeriosTitle.textContent = conteudos.ministerios.title;

    } catch (error) {
        console.error('Erro ao carregar conteúdos da página inicial:', error);
        // Mantém o conteúdo padrão em caso de erro
    }
}

// Carregar ministérios dinamicamente
async function carregarMinisterios() {
    try {
        const response = await fetch('/api/ministerios');
        if (!response.ok) throw new Error('Erro ao carregar ministérios');

        const ministerios = await response.json();
        const container = document.getElementById('ministeriosContainer');

        if (ministerios.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">Nenhum ministry disponível.</p>';
            return;
        }

        container.innerHTML = ministerios.map(ministerio => `
            <div class="ministerio">
                <div class="ministerio-icone"><i class="${ministerio.icone || 'fas fa-church'}"></i></div>
                <h4>${ministerio.titulo}</h4>
                <p>${ministerio.descricao || ''}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Erro ao carregar ministérios:', error);
        document.getElementById('ministeriosContainer').innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">Erro ao carregar ministérios.</p>';
    }
}

// Carregar cultos semanais dinamicamente
async function carregarCultos() {
    try {
        const response = await fetch('/api/cultos');
        if (!response.ok) throw new Error('Erro ao carregar cultos');

        const cultos = await response.json();
        const container = document.getElementById('cultosContainer');

        if (!container) return;

        if (cultos.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">Nenhum culto disponível.</p>';
            return;
        }

        container.innerHTML = cultos.map((culto, idx) => {
            // Gerar HTML do carrossel de imagens com Swiper - proporção 9:16 com limite
            let carouselHtml = '';
            const imagens = culto.imagens ? (typeof culto.imagens === 'string' ? JSON.parse(culto.imagens) : culto.imagens) : [];
            const temImagens = imagens.length > 0 || culto.imagem;
            const uniqueId = `culto-swiper-${culto.id}-${idx}`;
            
            if (temImagens) {
                const todasImagens = culto.imagem ? [culto.imagem, ...imagens] : imagens;
                if (todasImagens.length > 1) {
                    // Carrossel Swiper com múltiplas imagens - proporção automática com object-fit: contain
                    carouselHtml = `
                        <div class="swiper-container swiper-${culto.id}" id="${uniqueId}" style="width: 100%; max-width: 250px; aspect-ratio: 9 / 16; margin: 0 auto 1rem auto; border-radius: 10px; overflow: hidden; position: relative;">
                            <div class="swiper-wrapper">
                                ${todasImagens.map(img => `
                                    <div class="swiper-slide">
                                        <img src="${img}" style="width: 100%; height: 100%; object-fit: contain; background: #f0f0f0;" onerror="this.style.display='none'" onload="setupImageAspectRatio(this)">
                                    </div>
                                `).join('')}
                            </div>
                            <div class="swiper-pagination" style="bottom: 10px; z-index: 10;"></div>
                            <div class="swiper-button-next" style="right: 10px; z-index: 10; color: white; width: 40px; height: 40px; background: rgba(0,0,0,0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;"></div>
                            <div class="swiper-button-prev" style="left: 10px; z-index: 10; color: white; width: 40px; height: 40px; background: rgba(0,0,0,0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;"></div>
                        </div>
                    `;
                } else {
                    // Imagem única com clique para ampliar - object-fit: contain para não cortar
                    carouselHtml = `
                        <img src="${todasImagens[0]}" style="width: 100%; max-width: 250px; aspect-ratio: 9 / 16; object-fit: contain; background: #f0f0f0; border-radius: 10px; margin: 0 auto 1rem auto; display: block; cursor: pointer;" onclick="abrirLightbox(this.src)" onerror="this.style.display='none'" onload="setupImageAspectRatio(this)">
                    `;
                }
            }
            
            // Verificar se há informações de texto (título, horário, local) ou imagens
            const temTexto = culto.titulo || culto.horario || culto.local;
            
            // Se não tem nenhuma informação de texto, mostra apenas a imagem (se houver)
            const infoHtml = (temTexto || temImagens) ? `
                ${culto.titulo ? `<div style="font-size: 3rem; color: var(--dourado); margin-bottom: 1rem;">
                    <i class="fas fa-music"></i>
                </div>
                <h4>${culto.titulo}</h4>` : ''}
                ${culto.horario ? `<p style="font-size: 1.2rem; font-weight: 600; color: var(--verde-principal); margin-bottom: 1rem;">
                    ${culto.horario}
                </p>` : ''}
                ${culto.local ? `<p>${culto.local}</p>` : ''}
            ` : '';
            
            return `
                <div class="evento-card" style="background: white; border-radius: 20px; padding: 2.5rem; box-shadow: var(--sombra);">
                    ${carouselHtml}
                    ${infoHtml}
                </div>
            `;
        }).join('') + (() => {
            // Inicializar Swipers após renderização
            setTimeout(() => {
                cultos.forEach((culto, idx) => {
                    const swiperContainer = document.getElementById(`culto-swiper-${culto.id}-${idx}`);
                    if (!swiperContainer || swiperContainer.swiper) return;
                    
                    const imagens = culto.imagens ? (typeof culto.imagens === 'string' ? JSON.parse(culto.imagens) : culto.imagens) : [];
                    const temImagens = imagens.length > 0 || culto.imagem;
                    if (!temImagens) return;
                    
                    const todasImagens = culto.imagem ? [culto.imagem, ...imagens] : imagens;
                    if (todasImagens.length <= 1) return;
                    
                    new Swiper(swiperContainer, {
                        loop: true,
                        observer: true,
                        observeParents: true,
                        autoplay: { delay: 3000, disableOnInteraction: false },
                        pagination: { 
                            el: swiperContainer.querySelector('.swiper-pagination'),
                            clickable: true 
                        },
                        navigation: {
                            nextEl: swiperContainer.querySelector('.swiper-button-next'),
                            prevEl: swiperContainer.querySelector('.swiper-button-prev'),
                        },
                        grabCursor: true
                    });
                    
                    // Configurar aspect-ratio das imagens após inicialização
                    setupAllImages(swiperContainer);
                });
            }, 100);
            return '';
        })();
    } catch (error) {
        console.error('Erro ao carregar cultos:', error);
        const container = document.getElementById('cultosContainer');
        if (container) {
            container.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">Erro ao carregar cultos.</p>';
        }
    }
}

// Carregar mensagens na página inicial
async function carregarMensagensHome() {
    const container = document.getElementById('mensagensHomeContainer');
    if (!container) return;
    
    try {
        // Primeiro tenta buscar do YouTube (último vídeo)
        const youtubeResponse = await fetch('/api/youtube/latest');
        const youtubeData = await youtubeResponse.json();
        
        // Se tem vídeo do YouTube, mostrar
        if (youtubeData && youtubeData.video) {
            const video = youtubeData.video;
            const thumbnailUrl = video.thumbnail;
            container.innerHTML = `
                <div class="mensagem-video-container" style="margin-top: 1rem;">
                    ${thumbnailUrl ? `
                        <a href="https://www.youtube.com/watch?v=${video.videoId}" target="_blank" style="display: block; position: relative;">
                            <img src="${thumbnailUrl}" alt="${video.title}" style="width: 100%; max-width: 400px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(255,0,0,0.9); width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-play" style="color: white; font-size: 1.5rem; margin-left: 4px;"></i>
                            </div>
                        </a>
                    ` : ''}
                    ${video.title ? `<h5 style="margin-top: 1rem; margin-bottom: 0;">${video.title}</h5>` : ''}
                </div>
            `;
            return;
        }
        
        // Se não tem YouTube (erro ou sem vídeo), buscar do banco de mensagens
        console.log('YouTube não disponível, buscando do banco de mensagens...');
        const response = await fetch('/api/mensagens');
        const mensagens = await response.json();
        
        console.log('Mensagens recebidas:', mensagens);
        
        // A API já retorna ordenado por data (mais recente primeiro) e só msgs ativas
        const msg = mensagens[0]; // Pegar a mais recente
        
        if (!msg) {
            container.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">Nenhuma mensagem disponível.</p>';
            return;
        }
        
        // Se tem vídeo, mostrar thumbnail clicável
        // Usa o video_id direto se disponível, ou extrai da URL
        const videoId = msg.video_id || (msg.video_url ? extractVideoId(msg.video_url) : null);
        const thumbnailUrl = msg.thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '');
        const videoUrl = msg.video_url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
        
        if (videoUrl) {
            container.innerHTML = `
                <div class="mensagem-video-container" style="margin-top: 1rem;">
                    ${thumbnailUrl ? `
                        <a href="${videoUrl}" target="_blank" style="display: block; position: relative;">
                            <img src="${thumbnailUrl}" alt="${msg.titulo}" style="width: 100%; max-width: 400px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(255,0,0,0.9); width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-play" style="color: white; font-size: 1.5rem; margin-left: 4px;"></i>
                            </div>
                        </a>
                    ` : ''}
                    ${msg.titulo ? `<h5 style="margin-top: 1rem; margin-bottom: 0;">${msg.titulo}</h5>` : ''}
                </div>
            `;
        } else {
            // Se não tem vídeo, mostrar apenas título
            container.innerHTML = `
                <div class="mensagens-card">
                    <h4>${msg.titulo}</h4>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
    }
}

// Carregar tópicos bíblicos na página bíblia
async function carregarTopicosBiblia() {
    console.log('Carregando tópicos bíblicos...');
    try {
        const response = await fetch('/api/topicos-biblia?_t=' + Date.now());
        const topicos = await response.json();
        console.log('Tópicos recebidos:', topicos);
        
        const container = document.getElementById('topicosBibliaContainer');
        if (!container) {
            console.error('Container não encontrado!');
            return;
        }
        
        if (topicos.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">Nenhum tópico bíblico disponível.</p>';
            return;
        }
        
        // Debug detalhado
        console.log('Debug - Título 1:', topicos[0].titulo);
        console.log('Debug - Desc 1:', topicos[0].descricao);
        console.log('Debug - Conteúdo 1:', topicos[0].conteudo);
        console.log('Debug - Tem conteúdo?', topicos[0].hasOwnProperty('conteudo'));
        console.log('Debug - Tipo conteúdo:', typeof topicos[0].conteudo);
        
        container.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center;">
                ${topicos.map(topico => `
                    <div style="background: var(--verde-superclaro); border-radius: 12px; padding: 1rem 1.5rem; cursor: pointer; transition: all 0.3s; border: 2px solid transparent; min-width: 250px;" 
                         onclick="clicarTopico('${escapeHtml(topico.titulo)}', '${escapeHtml(topico.conteudo || '')}', '${escapeHtml(topico.categoria || '')}')"
                         onmouseover="this.style.borderColor='var(--verde-principal)';this.style.transform='translateY(-2px)'"
                         onmouseout="this.style.borderColor='transparent';this.style.transform='translateY(0)'">
                        <i class="${topico.icone || 'fas fa-book-bible'}" style="color: var(--verde-principal); margin-right: 0.5rem;"></i>
                        <strong>${topico.titulo}</strong>
                        ${topico.descricao ? `<div style="color: #666; font-size: 0.85rem; margin-top: 0.3rem;">${topico.descricao}</div>` : ''}
                        ${topico.conteudo ? `<div style="color: var(--verde-principal); font-size: 0.8rem; margin-top: 0.3rem; font-weight: bold;">📖 ${topico.conteudo}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Erro ao carregar tópicos bíblicos:', error);
    }
}

// Expor funções globalmente
window.carregarTopicosBiblia = carregarTopicosBiblia;
window.clicarTopico = clicarTopico;
window.carregarLivros = carregarLivros;
window.setupTabs = setupTabs;
window.setupBusca = setupBusca;
window.realizarBusca = realizarBusca;
window.irParaVerso = irParaVerso;
window.mudarPagina = mudarPagina;
window.carregarCapitulo = carregarCapitulo;
window.buscarPorVersiculo = buscarPorVersiculo;
window.buscarPorCapitulo = buscarPorCapitulo;
window.buscarPorIntervalo = buscarPorIntervalo;
window.buscarPorIntervaloCapitulos = buscarPorIntervaloCapitulos;

// Clique em tópico bíblico - navegar para a referência
function clicarTopico(titulo, conteudo, categoria) {
    if (!conteudo) {
        alert('Este tópico não tem conteúdo bíblico associado.');
        return;
    }
    
    // Se for categoria "leitura-diaria", ir para a aba de busca
    if (categoria === 'leitura-diaria') {
        // Ativar aba de busca
        document.querySelectorAll('.biblia-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.biblia-section').forEach(s => s.classList.remove('active'));
        document.querySelector('.biblia-tab[data-tab="busca"]').classList.add('active');
        document.getElementById('busca-section').classList.add('active');
        
        // Preencher e executar busca
        document.getElementById('buscaInput').value = conteudo;
        realizarBusca();
        return;
    }
    
    // Padrão: Ativar aba de leitura
    document.querySelectorAll('.biblia-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.biblia-section').forEach(s => s.classList.remove('active'));
    document.querySelector('.biblia-tab[data-tab="leitura"]').classList.add('active');
    document.getElementById('leitura-section').classList.add('active');
    
    // Preencher o campo de busca e executar
    document.getElementById('buscaInput').value = conteudo;
    realizarBusca();
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Realizar busca
async function realizarBusca() {
    const termo = document.getElementById('buscaInput').value.trim();
    if (termo.length < 2) {
        alert('Digite pelo menos 2 caracteres para buscar');
        return;
    }
    
    // Normalizar termos como "2 reis" -> "2reis 1" para reconhecer como livro + capítulo
    let termoNormalizado = termo;
    
    // Verificar se é formato "número livro" (ex: "2 reis", "1 samuel") - sem número de capítulo
    const matchNumeroLivroSemCapitulo = termo.match(/^(\d+)\s+(\w+)$/i);
    if (matchNumeroLivroSemCapitulo) {
        const numero = matchNumeroLivroSemCapitulo[1];
        const livro = matchNumeroLivroSemCapitulo[2];
        termoNormalizado = numero + livro + ' 1';  // Assumir capítulo 1
        console.log('[BUSCA] Normalizado de "' + termo + '" para "' + termoNormalizado + '"');
        
        // Agora chama buscarPorCapitulo diretamente com o livro normalizado
        await buscarPorCapitulo(numero + livro, 1);
        return;
    }
    
    // Verificar se é uma referência bíblica
    // Formatos aceitos: 
    // "livro capítulo:versículo" - genesis 1:1 ou genesis 1:1:5
    // "livro capítulo versículo" - genesis 1 1
    // "livro capítulo versículo_inicial versículo_final" - genesis 1 4 7
    // "livro capítulo" - salmos 23 (apenas capítulo)
    // "livro capítulo a capítulo" - levitico 16 a 18 (múltiplos capítulos)
    // "livro capítulo e capítulo" - levitico 22 e 23 (múltiplos capítulos)
    const refMatch = termoNormalizado.match(/^(\w+)\s+(\d+)(?:\s+a\s+(\d+)|\s+e\s+(\d+))?(?::(\d+)(?::(\d+))?|\s+(\d+)(?:\s+(\d+))?)?$/i);
    if (refMatch) {
        const livroAbrev = refMatch[1];
        const capitulo = parseInt(refMatch[2]);
        const termoOriginal = termo.toLowerCase();
        
        // PRIORIDADE 1: Verificar se é formato de múltiplos capítulos ("a" ou "e") - antes de verificar versículos!
        const matchMultiplosCapitulos = termoOriginal.match(/\s+(a|e)\s+(\d+)\s*$/);
        if (matchMultiplosCapitulos) {
            const capituloFinal = parseInt(matchMultiplosCapitulos[2]);
            await buscarPorIntervaloCapitulos(livroAbrev, capitulo, capituloFinal);
            return;
        }
        
        // PRIORIDADE 2: Verificar qual formato foi usado
        if (refMatch[4] !== undefined) {
            // Formato com : (genesis 1:1 ou genesis 1:1:5)
            const versiculo = parseInt(refMatch[4]);
            if (refMatch[5] !== undefined) {
                // Range com dois pontos (genesis 1:1:5)
                const versiculoFinal = parseInt(refMatch[5]);
                await buscarPorIntervalo(livroAbrev, capitulo, versiculo, versiculoFinal);
            } else {
                // Versículo único (genesis 1:1)
                await buscarPorVersiculo(livroAbrev, capitulo, versiculo);
            }
        } else if (refMatch[6] !== undefined) {
            // Formato com espaço (genesis 1 4 ou genesis 1 4 7)
            const versiculoInicial = parseInt(refMatch[6]);
            if (refMatch[7] !== undefined) {
                // Range com espaço (genesis 1 4 7)
                const versiculoFinal = parseInt(refMatch[7]);
                await buscarPorIntervalo(livroAbrev, capitulo, versiculoInicial, versiculoFinal);
            } else {
                // Versículo único (genesis 1 4)
                await buscarPorVersiculo(livroAbrev, capitulo, versiculoInicial);
            }
        } else {
            // Apenas capítulo (genesis 1 ou salmos 23)
            await buscarPorCapitulo(livroAbrev, capitulo);
        }
        return;
    }
    
    // Se não bateu com o padrão de referência, faz busca por texto
    termoBuscaAtual = termo;
    buscaOffset = 0;
    await executarBusca(termo, 0);
}

// Buscar por versículo específico
async function buscarPorVersiculo(livroAbrev, capitulo, versiculo) {
    const resultsContainer = document.getElementById('buscaResults');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '<div class="biblia-loading"><i class="fas fa-spinner"></i><p>Buscando...</p></div>';
    
    try {
        const livroResponse = await fetch(`/api/biblia/livro/${livroAbrev}`);
        if (!livroResponse.ok) {
            resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Livro não encontrado.</p>';
            return;
        }
        const livroData = await livroResponse.json();
        
        const capResponse = await fetch(`/api/biblia/${livroData.abreviacao}/${capitulo}`);
        if (!capResponse.ok) {
            resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Capítulo não encontrado.</p>';
            return;
        }
        const capData = await capResponse.json();
        
        if (versiculo > capData.versos.length || versiculo < 1) {
            resultsContainer.innerHTML = `<p style="text-align: center; color: #666;">Versículo ${versiculo} não encontrado no capítulo ${capitulo}. O capítulo tem ${capData.versos.length} versículos.</p>`;
            return;
        }
        
        const textoVersiculo = capData.versos[versiculo - 1];
        
        resultsContainer.innerHTML = `
            <div class="biblia-result-item" onclick="irParaVerso('${livroData.abreviacao}', ${capitulo}, ${versiculo})">
                <div class="reference">${livroData.nome} ${capitulo}:${versiculo}</div>
                <div class="texto-destaque">${textoVersiculo}</div>
            </div>
        `;
        document.getElementById('buscaPagination').innerHTML = '';
        
    } catch (error) {
        console.error('Erro ao buscar versículo:', error);
        resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Erro ao buscar. Tente novamente.</p>';
    }
}

// Buscar por capítulo inteiro
async function buscarPorCapitulo(livroAbrev, capitulo) {
    const resultsContainer = document.getElementById('buscaResults');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '<div class="biblia-loading"><i class="fas fa-spinner"></i><p>Buscando...</p></div>';
    
    try {
        const livroResponse = await fetch(`/api/biblia/livro/${livroAbrev}`);
        if (!livroResponse.ok) {
            resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Livro não encontrado.</p>';
            return;
        }
        const livroData = await livroResponse.json();
        
        const capResponse = await fetch(`/api/biblia/${livroData.abreviacao}/${capitulo}`);
        if (!capResponse.ok) {
            resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Capítulo não encontrado.</p>';
            return;
        }
        const capData = await capResponse.json();
        
        let html = `<h3 style="text-align: center; margin-bottom: 1rem;">${livroData.nome} ${capitulo}</h3>`;
        html += capData.versos.map((verso, index) => `
            <div class="biblia-result-item" onclick="irParaVerso('${livroData.abreviacao}', ${capitulo}, ${index + 1})">
                <div class="reference">${index + 1}</div>
                <div class="texto-destaque">${verso}</div>
            </div>
        `).join('');
        
        resultsContainer.innerHTML = html;
        document.getElementById('buscaPagination').innerHTML = '';
        
    } catch (error) {
        console.error('Erro ao buscar capítulo:', error);
        resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Erro ao buscar. Tente novamente.</p>';
    }
}

// Buscar por intervalo de versículos
async function buscarPorIntervalo(livroAbrev, capitulo, versiculoInicial, versiculoFinal) {
    const resultsContainer = document.getElementById('buscaResults');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '<div class="biblia-loading"><i class="fas fa-spinner"></i><p>Buscando...</p></div>';
    
    try {
        const livroResponse = await fetch(`/api/biblia/livro/${livroAbrev}`);
        if (!livroResponse.ok) {
            resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Livro não encontrado.</p>';
            return;
        }
        const livroData = await livroResponse.json();
        
        const capResponse = await fetch(`/api/biblia/${livroData.abreviacao}/${capitulo}`);
        if (!capResponse.ok) {
            resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Capítulo não encontrado.</p>';
            return;
        }
        const capData = await capResponse.json();
        
        if (versiculoInicial > capData.versos.length || versiculoFinal > capData.versos.length) {
            resultsContainer.innerHTML = `<p style="text-align: center; color: #666;">Versículos ${versiculoInicial} a ${versiculoFinal} não encontrados no capítulo ${capitulo}. O capítulo tem ${capData.versos.length} versículos.</p>`;
            return;
        }
        
        let html = '';
        for (let i = versiculoInicial - 1; i < versiculoFinal; i++) {
            html += `<div class="biblia-result-item" onclick="irParaVerso('${livroData.abreviacao}', ${capitulo}, ${i + 1})">
                <div class="reference">${livroData.nome} ${capitulo}:${i + 1}</div>
                <div class="texto-destaque">${capData.versos[i]}</div>
            </div>`;
        }
        
        resultsContainer.innerHTML = html;
        document.getElementById('buscaPagination').innerHTML = '';
        
    } catch (error) {
        console.error('Erro ao buscar intervalo:', error);
        resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Erro ao buscar. Tente novamente.</p>';
    }
}

// Buscar por intervalo de capítulos (múltiplos capítulos)
async function buscarPorIntervaloCapitulos(livroAbrev, capituloInicial, capituloFinal) {
    const resultsContainer = document.getElementById('buscaResults');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '<div class="biblia-loading"><i class="fas fa-spinner"></i><p>Buscando...</p></div>';
    
    try {
        const livroResponse = await fetch(`/api/biblia/livro/${livroAbrev}`);
        if (!livroResponse.ok) {
            resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Livro não encontrado.</p>';
            return;
        }
        const livroData = await livroResponse.json();
        
        let html = `<h3 style="text-align: center; margin-bottom: 1rem;">${livroData.nome} ${capituloInicial} - ${capituloFinal}</h3>`;
        
        for (let cap = capituloInicial; cap <= capituloFinal; cap++) {
            const capResponse = await fetch(`/api/biblia/${livroData.abreviacao}/${cap}`);
            if (capResponse.ok) {
                const capData = await capResponse.json();
                html += `<h4 style="margin: 1.5rem 0 0.5rem; color: #22c55e;">Capítulo ${cap}</h4>`;
                html += capData.versos.map((verso, index) => `
                    <div class="biblia-result-item" onclick="irParaVerso('${livroData.abreviacao}', ${cap}, ${index + 1})">
                        <div class="reference">${index + 1}</div>
                        <div class="texto-destaque">${verso}</div>
                    </div>
                `).join('');
            }
        }
        
        resultsContainer.innerHTML = html;
        document.getElementById('buscaPagination').innerHTML = '';
        
    } catch (error) {
        console.error('Erro ao buscar capítulos:', error);
        resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Erro ao buscar. Tente novamente.</p>';
    }
}

// Executar busca com paginação
async function executarBusca(termo, offset) {
    const resultsContainer = document.getElementById('buscaResults');
    const paginationContainer = document.getElementById('buscaPagination');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '<div class="biblia-loading"><i class="fas fa-spinner"></i><p>Buscando...</p></div>';
    
    try {
        const url = `/api/biblia/busca?q=${encodeURIComponent(termo)}&limite=${buscaLimite}&offset=${offset}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            resultsContainer.innerHTML = `<p style="text-align: center; color: #666;">Erro: ${data.error}</p>`;
            return;
        }
        
        // Se retornou livros (busca por nomes de livros)
        console.log('DEBUG - Tipo de resposta:', data.tipo, 'Livros:', data.livros);
        if (data.tipo === 'livros' && data.livros && data.livros.length > 0) {
            console.log('DEBUG - Exibindo livros encontrados:', data.livros);
            let html = '<p style="text-align: center; color: #666; margin-bottom: 1rem;">Livros encontrados:</p>';
            html += data.livros.map(livro => {
                return `
                    <div class="biblia-result-item" onclick="irParaLivro('${livro.abreviacao}')" style="cursor: pointer;">
                        <div class="reference">${livro.nome}</div>
                        <div class="texto-destaque">Clique para navegar neste livro</div>
                    </div>
                `;
            }).join('');
            resultsContainer.innerHTML = html;
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }
        
        if (data.resultados.length === 0) {
            resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Nenhum resultado encontrado.</p>';
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }
        
        const termoLower = termo.toLowerCase();
        
        let html = data.resultados.map(r => {
            const textoDestaque = r.texto.replace(
                new RegExp(`(${termo})`, 'gi'), 
                '<mark>$1</mark>'
            );
            return `
                <div class="biblia-result-item" onclick="irParaVerso('${r.abreviacao}', ${r.capitulo}, ${r.verso})">
                    <div class="reference">${r.livro} ${r.capitulo}:${r.verso}</div>
                    <div class="texto-destaque">${textoDestaque}</div>
                </div>
            `;
        }).join('');
        
        resultsContainer.innerHTML = html;
        
        // Paginação
        const totalPaginas = Math.ceil(data.total / buscaLimite);
        const paginaAtual = Math.floor(offset / buscaLimite) + 1;
        
        let paginationHtml = '';
        
        if (paginaAtual > 1) {
            paginationHtml += `<button onclick="mudarPagina(${offset - buscaLimite})">← Anterior</button>`;
        }
        
        for (let i = Math.max(1, paginaAtual - 2); i <= Math.min(totalPaginas, paginaAtual + 2); i++) {
            paginationHtml += `<button onclick="mudarPagina(${(i - 1) * buscaLimite})" class="${i === paginaAtual ? 'active' : ''}">${i}</button>`;
        }
        
        if (paginaAtual < totalPaginas) {
            paginationHtml += `<button onclick="mudarPagina(${offset + buscaLimite})">Próxima →</button>`;
        }
        
        if (paginationContainer) paginationContainer.innerHTML = paginationHtml;
        
    } catch (error) {
        console.error('Erro ao buscar:', error);
        resultsContainer.innerHTML = '<p style="text-align: center; color: #666;">Erro ao buscar. Tente novamente.</p>';
    }
}

// Ir para livro específico
function irParaLivro(livroAbrev) {
    document.querySelectorAll('.biblia-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.biblia-section').forEach(s => s.classList.remove('active'));
    document.querySelector('.biblia-tab[data-tab="leitura"]').classList.add('active');
    document.getElementById('leitura-section').classList.add('active');
    
    // Selecionar o livro no dropdown
    const livroSelect = document.getElementById('livroSelect');
    if (livroSelect) {
        // Procurar a opção que corresponde à abreviação
        for (let i = 0; i < livroSelect.options.length; i++) {
            const option = livroSelect.options[i];
            if (option.value.toLowerCase() === livroAbrev.toLowerCase()) {
                livroSelect.selectedIndex = i;
                // Disparar o evento de change
                livroSelect.dispatchEvent(new Event('change'));
                break;
            }
        }
    }
}

// Ir para versículo
function irParaVerso(livroAbrev, capitulo, versiculo) {
    document.querySelectorAll('.biblia-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.biblia-section').forEach(s => s.classList.remove('active'));
    document.querySelector('.biblia-tab[data-tab="leitura"]').classList.add('active');
    document.getElementById('leitura-section').classList.add('active');
    
    // Se versiculo for string com range (ex: "1-4"), pegar apenas o primeiro
    let versiculoNum = versiculo;
    if (typeof versiculo === 'string' && versiculo.includes('-')) {
        versiculoNum = parseInt(versiculo.split('-')[0]);
    }
    
    carregarCapitulo(livroAbrev, capitulo).then(() => {
        setTimeout(() => {
            const versos = document.querySelectorAll('.biblia-content .verso');
            if (versos[versiculoNum - 1]) {
                versos[versiculoNum - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
                versos[versiculoNum - 1].style.background = 'var(--verde-superclaro)';
            }
        }, 500);
    });
}

// Carregar um capítulo específico
async function carregarCapitulo(livroAbrev, capitulo) {
    try {
        const response = await fetch(`/api/biblia/${livroAbrev}/${capitulo}`);
        const data = await response.json();
        
        capituloAtual = capitulo;
        
        // Salvar última posição
        localStorage.setItem('biblia_ultima_leitura', JSON.stringify({
            livro: livroAbrev,
            capitulo: capitulo
        }));
        
        // Renderizar conteúdo
        const content = document.getElementById('bibliaContent');
        if (!content) return;
        
        let html = `<h3 style="color: var(--verde-principal); margin-bottom: 1.5rem;">${data.livro} ${data.capitulo}</h3>`;
        
        data.versos.forEach((verso, index) => {
            html += `<div class="verso"><span class="verso-numero">${index + 1}</span>${verso}</div>`;
        });
        
        content.innerHTML = html;
        
        // Atualizar botões de navegação
        const btnAnterior = document.getElementById('capituloAnterior');
        const btnProximo = document.getElementById('proximoCapitulo');
        
        if (btnAnterior) {
            btnAnterior.disabled = capitulo <= 1;
            btnAnterior.onclick = () => {
                if (capitulo > 1) {
                    document.getElementById('capituloSelect').value = capitulo - 1;
                    carregarCapitulo(livroAbrev, capitulo - 1);
                }
            };
        }
        
        if (btnProximo && livroAtual) {
            btnProximo.disabled = capitulo >= livroAtual.capitulos.length;
            btnProximo.onclick = () => {
                if (capitulo < livroAtual.capitulos.length) {
                    document.getElementById('capituloSelect').value = parseInt(capitulo) + 1;
                    carregarCapitulo(livroAbrev, parseInt(capitulo) + 1);
                }
            };
        }
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
    } catch (error) {
        console.error('Erro ao carregar capítulo:', error);
    }
}

// Carregar lista de livros
async function carregarLivros() {
    try {
        const response = await fetch('/api/biblia/livros');
        bibliaLivros = await response.json();
        
        const select = document.getElementById('livroSelect');
        if (!select) return;
        
        bibliaLivros.forEach(livro => {
            const option = document.createElement('option');
            option.value = livro.abreviacao;
            option.textContent = livro.nome;
            select.appendChild(option);
        });
        
        // Event listener para mudança de livro
        select.addEventListener('change', async function() {
            if (this.value) {
                await carregarCapitulos(this.value);
                document.getElementById('capituloSelect').disabled = false;
            } else {
                document.getElementById('capituloSelect').disabled = true;
            }
        });
    } catch (error) {
        console.error('Erro ao carregar livros:', error);
    }
}

// Setup tabs
function setupTabs() {
    document.querySelectorAll('.biblia-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            
            // Atualiza tabs
            document.querySelectorAll('.biblia-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Atualiza seções
            document.querySelectorAll('.biblia-section').forEach(s => s.classList.remove('active'));
            document.getElementById(`${tabId}-section`).classList.add('active');
            
            // Resetar tudo ao mudar de aba
            if (tabId === 'busca') {
                document.getElementById('buscaInput').value = '';
                document.getElementById('buscaResults').innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">Digite pelo menos 2 caracteres para buscar na bíblia.</p>';
                document.getElementById('buscaPagination').innerHTML = '';
            } else if (tabId === 'leitura') {
                // Resetar selects da leitura
                document.getElementById('livroSelect').value = '';
                document.getElementById('capituloSelect').value = '';
                document.getElementById('capituloSelect').disabled = true;
            }
        });
    });
}

// Setup busca
function setupBusca() {
    const input = document.getElementById('buscaInput');
    if (!input) return;
    
    const autocomplete = document.getElementById('autocompleteResults');
    let debounceTimer;

    // Autocomplete
    input.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            if (this.value.length >= 1) {
                try {
                    const response = await fetch(`/api/biblia/autocomplete?q=${encodeURIComponent(this.value)}`);
                    const results = await response.json();
                    
                    if (results.length > 0 && autocomplete) {
                        autocomplete.innerHTML = results.map(r => 
                            `<div class="autocomplete-item" data-tipo="livro" data-valor="${r.abreviacao}">
                                <strong>${r.nome}</strong> (${r.abreviacao})
                            </div>`
                        ).join('');
                        autocomplete.classList.add('show');
                        
                        // Event listeners para autocomplete
                        autocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
                            item.addEventListener('click', function() {
                                input.value = this.dataset.valor;
                                autocomplete.classList.remove('show');
                                realizarBusca();
                            });
                        });
                    } else if (autocomplete) {
                        autocomplete.classList.remove('show');
                    }
                } catch (error) {
                    console.error('Erro no autocomplete:', error);
                }
            } else if (autocomplete) {
                autocomplete.classList.remove('show');
            }
        }, 300);
    });

    // Fechar autocomplete ao clicar fora
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.autocomplete-container') && autocomplete) {
            autocomplete.classList.remove('show');
        }
    });

    // Botão buscar
    const buscarBtn = document.getElementById('buscarBtn');
    if (buscarBtn) {
        buscarBtn.addEventListener('click', realizarBusca);
    }
    
    // Enter para buscar
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            realizarBusca();
        }
    });
}

// Carregar capítulos de um livro
async function carregarCapitulos(livroAbrev) {
    try {
        const response = await fetch(`/api/biblia/livro/${livroAbrev}`);
        const livro = await response.json();
        
        livroAtual = livro;
        
        const select = document.getElementById('capituloSelect');
        if (!select) return;
        
        select.innerHTML = '<option value="">Selecione o Capítulo</option>';
        
        livro.capitulos.forEach(cap => {
            const option = document.createElement('option');
            option.value = cap.numero;
            option.textContent = `Capítulo ${cap.numero}`;
            select.appendChild(option);
        });
        
        // Event listener para mudança de capítulo
        select.addEventListener('change', async function() {
            if (this.value) {
                await carregarCapitulo(livroAbrev, this.value);
            }
        });
    } catch (error) {
        console.error('Erro ao carregar capítulos:', error);
    }
}

// Mudar página
async function mudarPagina(newOffset) {
    buscaOffset = newOffset;
    await executarBusca(termoBuscaAtual, buscaOffset);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Realizar busca por referência bíblica
async function buscarPorReferencia(termo) {
    if (!termo || termo.length < 2) {
        return;
    }
    
    // Verificar se é uma referência (ex: genesis 1:1 ou genesis 1 4 ou gn 1:1)
    const refMatch = termo.match(/^(\w+)\s+(\d+)(?:[:\s](\d+))?$/i);
    if (refMatch) {
        const [, livroAbrev, capitulo, versiculo] = refMatch;
        try {
            if (versiculo) {
                // Buscar versículo específico
                const response = await fetch(`/api/biblia/${livroAbrev}/${capitulo}`);
                const data = await response.json();
                
                // Mostrar apenas o versículo específico
                const versoIndex = parseInt(versiculo) - 1;
                if (versoIndex >= 0 && versoIndex < data.versos.length) {
                    mostrarResultadoBusca([{
                        livro: data.livro,
                        capitulo: data.capitulo,
                        versiculo: versiculo,
                        texto: data.versos[versoIndex]
                    }], true);
                }
            } else {
                // Buscar capítulo inteiro - mostrar na aba de leitura
                await carregarCapitulo(livroAbrev, parseInt(capitulo));
            }
        } catch (error) {
            console.error('Erro ao buscar referência:', error);
        }
    } else {
        // Busca por texto
        buscaOffset = 0;
        termoBuscaAtual = termo;
        await realizarBusca();
    }
}

// Mostrar resultados da busca
function mostrarResultadoBusca(resultados, isSingle = false) {
    const resultsContainer = document.getElementById('buscaResults');
    if (!resultsContainer) return;
    
    if (isSingle) {
        const r = resultados[0];
        resultsContainer.innerHTML = `
            <div class="biblia-result-item" onclick="irParaVersiculo('${r.livro}', ${r.capitulo}, ${r.versiculo})">
                <div class="reference">${r.livro} ${r.capitulo}:${r.versiculo}</div>
                <div class="texto-destaque">${r.texto}</div>
            </div>
        `;
    }
}

// Ir para versículo específico
function irParaVersiculo(livro, capitulo, versiculo) {
    document.querySelectorAll('.biblia-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.biblia-section').forEach(s => s.classList.remove('active'));
    document.querySelector('.biblia-tab[data-tab="leitura"]').classList.add('active');
    document.getElementById('leitura-section').classList.add('active');
    
    carregarCapitulo(livro, capitulo).then(() => {
        // Scroll para o versículo
        setTimeout(() => {
            const versos = document.querySelectorAll('.biblia-content .verso');
            if (versos[versiculo - 1]) {
                versos[versiculo - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
                versos[versiculo - 1].style.background = 'var(--verde-superclaro)';
            }
        }, 500);
    });
}

// Função para abrir imagem em tela cheia (Lightbox)
function abrirLightbox(src) {
    // Criar o modal se não existir
    let lightbox = document.getElementById('lightboxModal');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'lightboxModal';
        lightbox.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 10000; display: flex; align-items: center; justify-content: center; cursor: pointer;';
        lightbox.innerHTML = '<img id="lightboxImage" style="max-width: 90%; max-height: 90%; object-fit: contain; border-radius: 10px;" onclick="fecharLightbox()">';
        lightbox.onclick = function(e) {
            if (e.target === lightbox) fecharLightbox();
        };
        document.body.appendChild(lightbox);
    }
    document.getElementById('lightboxImage').src = src;
    lightbox.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function fecharLightbox() {
    const lightbox = document.getElementById('lightboxModal');
    if (lightbox) {
        lightbox.style.display = 'none';
    }
    document.body.style.overflow = 'auto';
}

// Fechar lightbox com ESC
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        fecharLightbox();
    }
});

// Funções para inscrição em eventos
function abrirInscricao(eventoId, eventoTitulo) {
    document.getElementById('eventoId').value = eventoId;
    document.getElementById('eventoTitulo').textContent = eventoTitulo;
    document.getElementById('modalInscricao').style.display = 'block';
}

function fecharModal() {
    document.getElementById('modalInscricao').style.display = 'none';
    document.getElementById('formInscricao').reset();
}

// Enviar inscrição
const formInscricao = document.getElementById('formInscricao');
if (formInscricao) {
    formInscricao.addEventListener('submit', async (e) => {
        e.preventDefault();
        const evento_id = document.getElementById('eventoId').value;
        const nome = document.getElementById('inscritoNome').value;
        const email = document.getElementById('inscritoEmail').value;
        const telefone = document.getElementById('inscritoTelefone').value;

        try {
            const response = await fetch('/api/inscricoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ evento_id, nome, email, telefone })
            });
            const data = await response.json();
            if (data.error) {
                alert('❌ ' + data.error);
            } else {
                alert('✅ ' + data.message);
                fecharModal();
            }
        } catch (err) {
            alert('❌ Erro ao fazer inscrição');
        }
    });
}
