// Carregar variáveis de ambiente
require('dotenv').config();

// Módulo de Banco de Dados MySQL
const { initDatabase, db, getPool, isMySQL } = require('./database');

const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

// ============================================
// TRATAMENTO DE ERROS GLOBAIS
// ============================================

// Capturar erros não tratados (Promise rejections)
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ ERRO NÃO TRATADO - Promise Rejection:');
    console.error('   Reason:', reason);
    console.error('   Promise:', promise);
    console.error('   Stack:', reason?.stack || 'No stack available');
});

// Capturar exceções não tratadas
process.on('uncaughtException', (error) => {
    console.error('❌ ERRO NÃO TRATADO - Uncaught Exception:');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
    // Não encerrar o processo automaticamente, apenas logar
});

// Tratamento de sinais de encerramento graceful
process.on('SIGTERM', () => {
    console.log('� Recebido SIGTERM, encerrando graciosamente...');
    const pool = getPool();
    if (pool) {
        pool.end(() => {
            console.log('✅ Conexões encerradas');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

process.on('SIGINT', () => {
    console.log('� Recebido SIGINT, encerrando graciosamente...');
    const pool = getPool();
    if (pool) {
        pool.end(() => {
            console.log('✅ Conexões encerradas');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

const PORT = process.env.PORT || 3000;
// const BIBLIA_DB_PATH = path.join(__dirname, "biblia.db");

// Token admin via variável de ambiente (seguro)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'maanaim2026';

// Segredo JWT - fixo para manter sessões entre reinicializações
const JWT_SECRET = process.env.JWT_SECRET || 'maanaim_jwt_secret_2026_fixo';

// Tempo de expiração do token (24 horas)
const JWT_EXPIRES_IN = '24h';

// Rate Limiter para login - proteção contra força bruta
const loginRateLimiter = rateLimit({
    windowMs: 2 * 60 * 1000, // 2 minutos
    max: 5, // 5 tentativas
    message: { error: 'Muitas tentativas de login. Tente novamente em 2 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate Limiter geral para APIs
const apiRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100, // 100 requisições por minuto
    message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Variável global para verificar se o SQLite está pronto
let bibliaSQLiteReady = false;

// Variável para armazenar os dados da bíblia em memória
let bibliaDados = {
    nvi: {},
    acf: {},
    aa: {}
};

// Função para carregar os arquivos JSON da bíblia
function carregarBibliaJSON() {
    console.log('📖 Carregando arquivos JSON da bíblia...');
    
    const versoes = ['nvi', 'acf', 'aa'];
    const pastaBase = path.join(__dirname, 'BibliaJSON-master');
    
    let loadedCount = 0;
    let totalBooks = 0;
    
    versoes.forEach(versao => {
        const pastaVersao = path.join(pastaBase, 'biblia_' + versao);
        
        // Lista de arquivos de livros (em ordem)
        const livrosOrdem = [
            'genesis.json', 'exodo.json', 'levitico.json', 'numeros.json', 'deuteronomio.json',
            'josue.json', 'juizes.json', 'rute.json', '1 samuel.json', '2 samuel.json',
            '1 reis.json', '2 reis.json', '1 cronicas.json', '2 cronicas.json', 'esdras.json',
            'neemias.json', 'ester.json', 'jo.json', 'salmos.json', 'proverbios.json',
            'eclesiastes.json', 'canticos.json', 'isaias.json', 'jeremias.json', 'lamentacoes de jeremias.json',
            'ezequiel.json', 'daniel.json', 'oseias.json', 'joel.json', 'amos.json',
            'obadias.json', 'jonas.json', 'miqueias.json', 'naum.json', 'habacuque.json',
            'sofonias.json', 'ageu.json', 'zacarias.json', 'malaquias.json', 'mateus.json',
            'marcos.json', 'lucas.json', 'joao.json', 'atos.json', 'romanos.json',
            '1 corintios.json', '2 corintios.json', 'galatas.json', 'efesios.json', 'filipenses.json',
            'colossenses.json', '1 tessalonicenses.json', '2 tessalonicenses.json', '1 timoteo.json', '2 timoteo.json',
            'tito.json', 'filemom.json', 'hebreus.json', 'tiago.json', '1 pedro.json',
            '2 pedro.json', '1 joao.json', '2 joao.json', '3 joao.json', 'judas.json', 'apocalipse.json'
        ];
        
        try {
            // Verificar se a pasta existe
            if (!fs.existsSync(pastaVersao)) {
                console.log(`⚠️ Pasta não encontrada: ${pastaVersao}`);
                return;
            }
            
            bibliaDados[versao] = {};
            
            livrosOrdem.forEach((arquivo, index) => {
                const livroPath = path.join(pastaVersao, arquivo);
                if (fs.existsSync(livroPath)) {
                    try {
                        const conteudo = fs.readFileSync(livroPath, 'utf-8');
                        // O formato é: [{"1": {...}}, {"2": {...}}, ...]
                        // Cada elemento do array é um capítulo
                        const capitulosArray = JSON.parse(conteudo);
                        
                        if (Array.isArray(capitulosArray)) {
                            const capitulos = {};
                            capitulosArray.forEach((cap) => {
                                // Cada cap é {"1": {...}} ou {"2": {...}}
                                const chapterNum = Object.keys(cap)[0];
                                capitulos[chapterNum] = cap[chapterNum];
                            });
                            bibliaDados[versao][index + 1] = capitulos;
                            loadedCount++;
                        }
                    } catch (e) {
                        console.log(`⚠️ Erro ao carregar ${arquivo}:`, e.message);
                    }
                }
            });
            
            totalBooks = Object.keys(bibliaDados[versao]).length;
            console.log(`✅ Versão ${versao.toUpperCase()}: ${totalBooks} livros carregados`);
            
        } catch (e) {
            console.log(`⚠️ Erro ao carregar versão ${versao}:`, e.message);
        }
    });
    
    // Verificar se pelo menos uma versão foi carregada
    const versoesCarregadas = Object.keys(bibliaDados).filter(v => Object.keys(bibliaDados[v]).length > 0);
    
    if (versoesCarregadas.length > 0) {
        bibliaSQLiteReady = true;
        console.log(`✅ Arquivos JSON da bíblia carregados! Versões disponíveis: ${versoesCarregadas.join(', ')}`);
    } else {
        console.log('❌ Nenhum arquivo JSON da bíblia foi carregado!');
    }
}

// Conexão com banco da Bíblia (FTS5) - será inicializada após o banco principal
let bibliaDb = null;

const app = express();

// ============================================
// MIDDLEWARE DE PARSING JSON (antes do logging)
// ============================================
// Middleware - não processar JSON para FormData
const jsonMiddleware = express.json({ limit: '50mb' });
app.use((req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT') {
        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('multipart/form-data')) {
            // Não usar express.json para FormData, deixe o multer tratar
            return next();
        }
    }
    jsonMiddleware(req, res, next);
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================
// MIDDLEWARE DE LOGGING DETALHADO
// ============================================
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`\n🌐 [${timestamp}] ${req.method} ${req.url}`);
    console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
    if (req.body && Object.keys(req.body).length > 0) {
        console.log(`   Body:`, JSON.stringify(req.body, null, 2));
    }
    next();
});

        // CORS - permitir todas as origens para desenvolvimento
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-admin-token', 'x-user-data']
}));

// Middleware para converter URLs absolutas para relativas (suporte a ngrok)
app.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function(data) {
        if (data && typeof data === 'object') {
            const jsonStr = JSON.stringify(data);
            // Substituir URLs localhost por caminhos relativos
            const processed = jsonStr.replace(/http:\/\/localhost:\d+/g, '');
            return originalJson.call(this, JSON.parse(processed));
        }
        return originalJson.call(this, data);
    };
    next();
});

// Middleware para headers de cache
app.use((req, res, next) => {
    // APIs não devem ser cacheadas no cliente
    if (req.path.startsWith('/api/')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    } else {
        // Arquivos estáticos - não cachear durante desenvolvimento
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
    next();
});

// ✅ REGISTER
app.post("/api/register", loginRateLimiter, async (req, res) => {
    const { username, email, password } = req.body;

    console.log('[REGISTER] Recebendo requisição de registro:', username);

    if (!username || !password) {
        console.log('[REGISTER] Erro: campos obrigatórios faltando');
        return res.status(400).json({ error: "Nome e senha obrigatórios." });
    }

    try {
        const hashed = await bcrypt.hash(password, 10);
        console.log('[REGISTER] Senha hasheada com sucesso');
        
        // O role padrão é 'frequentador' - o admin deve alterar manualmente para 'membro'
        db.run(
            "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
            [username, email || null, hashed, 'frequentador'],
            function(err) {
                if (err) {
                    console.log('[REGISTER] Erro ao inserir usuário:', err.message);
                    if (err.message.includes("UNIQUE")) {
                        return res.status(400).json({ error: "Usuário já existe." });
                    }
                    return res.status(500).json({ error: err.message });
                }
                console.log('[REGISTER] ✅ Usuário criado com sucesso, ID:', this.lastID, '| Role: frequentador (padrão)');
                res.status(201).json({ message: "Cadastro OK!", id: this.lastID });
            }
        );
    } catch (err) {
        console.log('[REGISTER] ❌ Erro ao fazer hash da senha:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ✅ LOGIN
app.post("/api/login", loginRateLimiter, (req, res) => {
    const { username, password } = req.body;
    
    console.log('[SERVER] Login recebido - username:', username);

    if (!username || !password) {
        console.log('[SERVER] Login falhou - campos faltando');
        return res.status(400).json({ error: "Usuário e senha obrigatórios." });
    }

    db.get(
        "SELECT id, username, email, password_hash, role FROM users WHERE username = ?",
        [username],
        (err, row) => {
            if (err) {
                console.error('[SERVER] ❌ Erro no login (DB):', err.message);
                return res.status(500).json({ error: "Erro no servidor. Tente novamente." });
            }
            
            console.log('[SERVER] Consulta DB resultado:', row ? 'usuário encontrado' : 'não encontrado');
            console.log('[SERVER] Dados do usuário no DB:', row ? { id: row.id, username: row.username, role: row.role } : 'nenhum');
            
            if (!row) {
                console.log('[SERVER] Login falhou - usuário não existe');
                return res.status(400).json({ error: "Usuário ou senha inválidos." });
            }

            if (!row.role) {
                console.log('[SERVER] Role estava vazio, definindo como frequentador');
                db.run("UPDATE users SET role = 'frequentador' WHERE id = ?", [row.id]);
                row.role = 'frequentador';
            }

            console.log('[SERVER] Verificando senha...');
            bcrypt.compare(password, row.password_hash, (err, valid) => {
                if (err) {
                    console.error('[SERVER] ❌ Erro ao verificar senha:', err.message);
                    return res.status(500).json({ error: "Erro no servidor. Tente novamente." });
                }
                
                if (!valid) {
                    console.log('[SERVER] Login falhou - senha incorreta');
                    return res.status(400).json({ error: "Usuário ou senha inválidos." });
                }

                console.log('[SERVER] ✅ Login bem-sucedido para:', username, '| Role:', row.role);
                res.json({
                    message: "Login OK!",
                    user: {
                        id: row.id,
                        username: row.username,
                        email: row.email || null,
                        role: row.role
                    }
                });
            });
        }
    );
});

// ✅ REDEFINIÇÃO DE SENHA
// Gerar código aleatório de 6 dígitos
function gerarCodigo() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Solicitar código de redefinição
app.post('/api/solicitar-redefinicao', loginRateLimiter, (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.json({ success: false, message: 'Nome de usuário obrigatório' });
    }
    
    db.get('SELECT id, email FROM users WHERE username = ?', [username], (err, row) => {
        if (err || !row) {
            return res.json({ success: false, message: 'Usuário não encontrado' });
        }
        
        // Gerar código de verificação
        const codigo = gerarCodigo();
        
        // Armazenar código temporariamente (em memória - em produção seria no banco com expiração)
        global.codigosRedefinicao = global.codigosRedefinicao || {};
        global.codigosRedefinicao[username] = {
            codigo: codigo,
            expiracao: Date.now() + 15 * 60 * 1000 // 15 minutos
        };
        
        console.log('Código de redefinição para ' + username + ': ' + codigo);
        
        res.json({ 
            success: true, 
            message: 'Código enviado!',
            codigo: codigo // Em produção, enviar por email
        });
    });
});

// Redefinir senha
app.post('/api/redefinir-senha', loginRateLimiter, async (req, res) => {
    const { username, novaSenha } = req.body;
    
    if (!username || !novaSenha) {
        return res.json({ success: false, message: 'Dados obrigatórios' });
    }
    
    // Verificar se o código foi validado recentemente
    const registroCodigo = global.codigosRedefinicao?.[username];
    if (!registroCodigo) {
        return res.json({ success: false, message: 'Código expirado ou não solicitado' });
    }
    
    if (Date.now() > registroCodigo.expiracao) {
        delete global.codigosRedefinicao[username];
        return res.json({ success: false, message: 'Código expirado' });
    }
    
    try {
        const passwordHash = await bcrypt.hash(novaSenha, 10);
        
        db.run('UPDATE users SET password_hash = ? WHERE username = ?', [passwordHash, username], function(err) {
            if (err) {
                return res.json({ success: false, message: 'Erro ao atualizar senha' });
            }
            
            delete global.codigosRedefinicao[username];
            res.json({ success: true, message: 'Senha atualizada com sucesso!' });
        });
    } catch (err) {
        res.json({ success: false, message: 'Erro ao processar senha' });
    }
});

// Middleware de autenticação admin com JWT (APENAS JWT - mais seguro)
const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    // Verificar se tem token JWT
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            error: 'Token de autenticação não fornecido',
            code: 'NO_TOKEN'
        });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer '
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ 
                error: 'Token expirado ou inválido. Faça login novamente.',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        // Verificar se é token de admin
        if (decoded.role === 'admin' || decoded.isAdmin === true) {
            req.adminUser = decoded;
            return next();
        }
        
        return res.status(403).json({ error: 'Acesso não autorizado' });
    });
};

// Endpoint de login admin (gera JWT usando username e password)
app.post('/api/admin/login', loginRateLimiter, (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ 
            success: false, 
            error: 'Usuário e senha são obrigatórios' 
        });
    }
    
    // Buscar usuário no banco
    db.get(
        "SELECT id, username, email, password_hash, role FROM users WHERE username = ?",
        [username],
        (err, row) => {
            if (err || !row) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'Usuário ou senha inválidos' 
                });
            }
            
            // Verificar se é admin
            if (row.role !== 'admin') {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Acesso restrito a administradores' 
                });
            }
            
            // Verificar senha
            bcrypt.compare(password, row.password_hash, (err, valid) => {
                if (err || !valid) {
                    return res.status(401).json({ 
                        success: false, 
                        error: 'Usuário ou senha inválidos' 
                    });
                }
                
                // Gerar JWT
                const adminToken = jwt.sign(
                    {
                        id: row.id,
                        username: row.username,
                        role: 'admin',
                        isAdmin: true,
                        loginTime: new Date().toISOString()
                    },
                    JWT_SECRET,
                    { expiresIn: JWT_EXPIRES_IN }
                );
                
                return res.json({
                    success: true,
                    token: adminToken,
                    expiresIn: 24 * 60 * 60, // 24 horas em segundos
                    message: 'Login admin realizado com sucesso'
                });
            });
        }
    );
});

// Endpoint para verificar se o token é válido
app.get('/api/admin/verify', verifyAdmin, (req, res) => {
    res.json({ 
        valid: true, 
        admin: req.adminUser 
    });
});

// ✅ ADMIN ROUTES
app.get('/api/admin/users', verifyAdmin, (req, res) => {

    db.all("SELECT id, username, email, role FROM users ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/admin/users/:id/role', verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!['frequentador', 'membro', 'conselho', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Cargo inválido' });
    }

    db.run("UPDATE users SET role = ? WHERE id = ?", [role, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json({ message: 'Cargo atualizado' });
    });
});

app.delete('/api/admin/users/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM users WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json({ message: 'Usuário excluído' });
    });
});

app.get('/api/admin/stats', verifyAdmin, (req, res) => {

    db.all("SELECT role, COUNT(*) as count FROM users GROUP BY role", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const stats = {
            total: rows.reduce((sum, r) => sum + r.count, 0),
            frequentadores: rows.find(r => r.role === 'frequentador')?.count || 0,
            membros: rows.find(r => r.role === 'membro')?.count || 0,
            conselho: rows.find(r => r.role === 'conselho')?.count || 0,
            admins: rows.find(r => r.role === 'admin')?.count || 0
        };
        res.json(stats);
    });
});

// CRUD NOTÍCIAS
app.get('/api/admin/noticias', verifyAdmin, (req, res) => {
    db.all("SELECT * FROM noticias ORDER BY created_at DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/noticias', verifyAdmin, (req, res) => {
    const { titulo, conteudo } = req.body;
    if (!titulo || !conteudo) {
        return res.status(400).json({ error: 'Título e conteúdo obrigatórios' });
    }

    db.run("INSERT INTO noticias (titulo, conteudo) VALUES (?, ?)", [titulo, conteudo], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, titulo, conteudo, created_at: new Date().toISOString() });
    });
});

app.put('/api/admin/noticias/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { titulo, conteudo } = req.body;

    db.run("UPDATE noticias SET titulo = ?, conteudo = ? WHERE id = ?", [titulo, conteudo, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Notícia não encontrada' });
        res.json({ message: 'Notícia atualizada' });
    });
});

app.delete('/api/admin/noticias/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM noticias WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Notícia não encontrada' });
        res.json({ message: 'Notícia excluída' });
    });
});

// CRUD EVENTOS
app.get('/api/admin/eventos', verifyAdmin, (req, res) => {
    db.all("SELECT * FROM eventos ORDER BY created_at DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Parse imagens JSON para cada evento
        rows = rows.map(row => {
            if (row.imagens) {
                try {
                    row.imagens = typeof row.imagens === 'string' ? JSON.parse(row.imagens) : row.imagens;
                } catch (e) {
                    row.imagens = [];
                }
            }
            return row;
        });
        res.json(rows);
    });
});

app.post('/api/admin/eventos', verifyAdmin, (req, res) => {
    const { titulo, data, horario, local, imagem, imagens, tem_inscricao } = req.body;
    // Validar: pelo menos título ou imagem(s) deve ser fornecido
    if (!titulo && !imagem && (!imagens || imagens.length === 0)) {
        return res.status(400).json({ error: 'Título ou imagem é obrigatório' });
    }

    const imagensJson = imagens ? JSON.stringify(imagens) : null;
    
    // Tratar valores vazios como null
    const dataValue = data || null;
    const horarioValue = horario || null;
    const temInscricaoValue = tem_inscricao ? 1 : 0;

    db.run("INSERT INTO eventos (titulo, data, horario, local, imagem, imagens, tem_inscricao) VALUES (?, ?, ?, ?, ?, ?, ?)", 
        [titulo, dataValue, horarioValue, local || null, imagem || null, imagensJson, temInscricaoValue], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ 
            id: this.lastID, 
            titulo, 
            data: dataValue, 
            horario: horarioValue, 
            local, 
            imagem, 
            imagens: imagens || [],
            tem_inscricao: temInscricaoValue,
            created_at: new Date().toISOString() 
        });
    });
});

app.put('/api/admin/eventos/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { titulo, data, horario, local, imagem, imagens, tem_inscricao } = req.body;

    const imagensJson = imagens ? JSON.stringify(imagens) : null;
    
    // Tratar valores vazios como null
    const dataValue = data || null;
    const horarioValue = horario || null;
    const temInscricaoValue = tem_inscricao ? 1 : 0;

    db.run("UPDATE eventos SET titulo = ?, data = ?, horario = ?, local = ?, imagem = ?, imagens = ?, tem_inscricao = ? WHERE id = ?", 
        [titulo, dataValue, horarioValue, local || null, imagem || null, imagensJson, temInscricaoValue, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Evento não encontrado' });
        res.json({ message: 'Evento atualizado' });
    });
});

app.delete('/api/admin/eventos/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM eventos WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Evento não encontrado' });
        res.json({ message: 'Evento excluído' });
    });
});

// Rota para corrigir estrutura da tabela eventos (permitir data nula)
app.post('/api/admin/eventos/fix-structure', verifyAdmin, (req, res) => {
    db.run("ALTER TABLE eventos MODIFY COLUMN data DATE NULL", function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        // Também atualizar registros com data 1899-01-01 ou similar para null
        db.run("UPDATE eventos SET data = NULL WHERE data = '1899-01-01' OR data = '0000-00-00' OR data < '1900-01-01'", function(err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ message: 'Estrutura corrigida! Data allowing null' });
        });
    });
});

// Rota para adicionar coluna tem_inscricao na tabela eventos
app.post('/api/admin/eventos/add-inscricao', verifyAdmin, (req, res) => {
    // Primeiro verifica se a coluna já existe
    db.all("SHOW COLUMNS FROM eventos LIKE 'tem_inscricao'", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (rows.length > 0) {
            // Coluna já existe
            return res.json({ message: 'Coluna tem_inscricao já existe' });
        }
        
        // Adiciona a coluna
        db.run("ALTER TABLE eventos ADD COLUMN tem_inscricao TINYINT(1) DEFAULT 0", function(err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ message: 'Coluna tem_inscricao adicionada com sucesso!' });
        });
    });
});

// INSCRIÇÕES EM EVENTOS (público)
app.post('/api/inscricoes', (req, res) => {
    const { evento_id, nome, email, telefone } = req.body;
    
    if (!evento_id || !nome) {
        return res.status(400).json({ error: 'Evento e nome são obrigatórios' });
    }

    db.run("INSERT INTO inscricoes_eventos (evento_id, nome, email, telefone) VALUES (?, ?, ?, ?)",
        [evento_id, nome, email || null, telefone || null], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Inscrição realizada com sucesso!', id: this.lastID });
    });
});

// Listar inscrições de um evento (público)
app.get('/api/inscricoes/:evento_id', (req, res) => {
    const { evento_id } = req.params;
    
    db.all("SELECT * FROM inscricoes_eventos WHERE evento_id = ? ORDER BY created_at DESC", [evento_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Listar todas as inscrições (admin)
app.get('/api/admin/inscricoes', verifyAdmin, (req, res) => {
    db.all(`
        SELECT i.*, e.titulo as evento_titulo 
        FROM inscricoes_eventos i 
        LEFT JOIN eventos e ON i.evento_id = e.id 
        ORDER BY i.created_at DESC
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Excluir inscrição (admin)
app.delete('/api/admin/inscricoes/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;
    
    db.run("DELETE FROM inscricoes_eventos WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Inscrição não encontrada' });
        res.json({ message: 'Inscrição excluída' });
    });
});

// CRUD CONTEÚDOS DA PÁGINA INICIAL
app.get('/api/admin/page-content', verifyAdmin, (req, res) => {

    db.all("SELECT * FROM page_content ORDER BY section", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/admin/page-content/:section', verifyAdmin, (req, res) => {
    const { section } = req.params;
    const { title, content, link, image } = req.body;

    // Verificar se é uma atualização apenas do título
    if (title && content === undefined) {
        db.run("UPDATE page_content SET title = ?, updated_at = NOW() WHERE section = ?",
            [title, section], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            // Se não encontrou, insere
            if (this.changes === 0) {
                db.run("INSERT INTO page_content (section, title, updated_at) VALUES (?, ?, NOW())",
                    [section, title], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: 'Título criado' });
                });
            } else {
                res.json({ message: 'Título atualizado' });
            }
        });
        return;
    }

    // Verificar se link foi fornecido e não é vazio
    if (link || image) {
        db.run("INSERT INTO page_content (section, title, content, link, image, updated_at) VALUES (?, ?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE title=VALUES(title), content=VALUES(content), link=VALUES(link), image=VALUES(image), updated_at=NOW()",
            [section, title, content, link || null, image || null], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Conteúdo atualizado' });
        });
    } else {
        db.run("INSERT INTO page_content (section, title, content, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE title=VALUES(title), content=VALUES(content), updated_at=NOW()",
            [section, title, content], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Conteúdo atualizado' });
        });
    }
});

// Endpoint para limpar conteúdo (sem auth para emergência)
app.delete('/api/admin/page-content/clear/:section', (req, res) => {
    const { section } = req.params;
    db.run("UPDATE page_content SET content = '' WHERE section = ?", [section], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Conteúdo limpo' });
    });
});

// Endpoint público para obter conteúdos
app.get('/api/page-content', (req, res) => {
    // Adicionar headers para evitar cache
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    // MySQL: buscar todos os campos diretamente
    db.all("SELECT section, title, content, link, image FROM page_content", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const contentMap = {};
        rows.forEach(row => {
            contentMap[row.section] = { 
                title: row.title, 
                content: row.content, 
                link: row.link || '',
                image: row.image || ''
            };
        });
        res.json(contentMap);
    });
});

// ========== GALERIA DE IMAGENS ==========
// Listar imagens da galeria (público)
app.get('/api/gallery', (req, res) => {
    // Adicionar headers para evitar cache
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    db.all("SELECT * FROM gallery ORDER BY created_at DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Converter URLs absolutas para relativas (suporte a ngrok)
        const processedRows = rows.map(row => {
            if (row.url && row.url.startsWith('http://localhost')) {
                row.url = row.url.replace(/^http:\/\/localhost:\d+/, '');
            }
            return row;
        });
        
        res.json(processedRows);
    });
});

// Upload de imagem (admin)
app.post('/api/admin/gallery', verifyAdmin, (req, res) => {
    // Simples upload via base64 (para evitar dependências extras)
    const { image, filename } = req.body;
    
    if (!image) {
        return res.status(400).json({ error: 'Imagem é obrigatória' });
    }
    
    // Gerar nome único
    const ext = filename ? filename.split('.').pop() : 'png';
    const newFilename = 'gallery_' + Date.now() + '.' + ext;
    const url = '/uploads/' + newFilename;
    
    // Salvar arquivo
    const uploadsDir = path.join(__dirname, 'uploads');
    const fs = require('fs');
    
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Log para debug
    console.log('Upload - image length:', image ? image.length : 0);
    console.log('Upload - filename:', filename);
    
    // Decodificar base64 e salvar
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    console.log('Upload - buffer length:', buffer.length);
    
    fs.writeFile(uploadsDir + '/' + newFilename, buffer, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Salvar no banco
        db.run("INSERT INTO gallery (filename, original_name, url) VALUES (?, ?, ?)",
            [newFilename, filename || newFilename, url],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID, filename: newFilename, url: url, message: 'Imagem salva!' });
            }
        );
    });
});

// Buscar todas as imagens da galeria (admin)
app.get('/api/admin/gallery', verifyAdmin, (req, res) => {
    db.all("SELECT * FROM gallery ORDER BY created_at DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Excluir imagem (admin)
app.delete('/api/admin/gallery/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;
    const fs = require('fs');
    
    db.get("SELECT filename FROM gallery WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Imagem não encontrada' });
        
        // Excluir arquivo
        const filepath = path.join(__dirname, 'uploads/', row.filename);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
        
        // Excluir do banco
        db.run("DELETE FROM gallery WHERE id = ?", [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Imagem excluída!' });
        });
    });
});

// ========== YOUTUBE CONFIG ==========
// Get YouTube config (admin)
console.log('📺 Registrando rota: GET /api/admin/youtube-config');
app.get('/api/admin/youtube-config', verifyAdmin, (req, res) => {
    console.log('📺 GET /api/admin/youtube-config chamada');
    db.get("SELECT channel_id, channel_name, enabled FROM youtube_config WHERE id = 1", (err, row) => {
        if (err) {
            console.error('❌ Erro ao buscar config YouTube:', err.message);
            return res.status(500).json({ error: err.message });
        }
        console.log('📺 Configuração atual:', row);
        res.json(row || { channel_id: '', channel_name: '', enabled: 0 });
    });
});

// DEBUG: Rota pública para verificar config (sem necessidade de admin)
console.log('📺 Registrando rota: GET /api/debug/youtube-config');
app.get('/api/debug/youtube-config', (req, res) => {
    db.get("SELECT channel_id, channel_name, enabled FROM youtube_config WHERE id = 1", (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        console.log('📺 DEBUG Configuração:', row);
        res.json(row || { channel_id: '', channel_name: '', enabled: 0 });
    });
});

// Update YouTube config (admin)
console.log('📺 Registrando rota: PUT /api/admin/youtube-config');
app.put('/api/admin/youtube-config', verifyAdmin, (req, res) => {
    const { channel_id, channel_name, enabled } = req.body;
    
    console.log('📺 PUT /api/admin/youtube-config chamada');
    console.log('   channel_id:', channel_id);
    console.log('   channel_name:', channel_name);
    console.log('   enabled:', enabled);
    
    db.run("UPDATE youtube_config SET channel_id = ?, channel_name = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
        [channel_id || '', channel_name || '', enabled ? 1 : 0],
        function(err) {
            if (err) {
                console.error('❌ Erro ao salvar config YouTube:', err.message);
                return res.status(500).json({ error: err.message });
            }
            console.log('✅ Configuração YouTube salva com sucesso!');
            res.json({ message: 'Configuração do YouTube atualizada!' });
        }
    );
});

// Cache para YouTube (5 minutos)
let youtubeCache = {
    live: { data: null, timestamp: 0 },
    latest: { data: null, timestamp: 0 }
};
const YOUTUBE_CACHE_TIME = 1 * 60 * 1000; // 1 minuto (reduzido para debug)

// Get YouTube live status (público) - Agora usa RSS (sem API Key)
console.log('📺 Registrando rota: GET /api/youtube-live');
app.get('/api/youtube-live', async (req, res) => {
    // Verificar cache
    const now = Date.now();
    if (youtubeCache.live.data && (now - youtubeCache.live.timestamp) < YOUTUBE_CACHE_TIME) {
        console.log('📺 Retornando live do cache');
        return res.json(youtubeCache.live.data);
    }
    
    try {
        db.get("SELECT channel_id, enabled FROM youtube_config WHERE id = 1", async (err, config) => {
            console.log('📺 YouTube config from DB:', config);
            
            // Agora aceitamos exibir se o canal estiver configurado, mesmo que enabled seja 0
            // Isso permite testar sem precisar habilitar no admin
            if (err || !config || !config.channel_id) {
                console.log('📺 YouTube config not found or disabled');
                const result = { isLive: false, video: null };
                youtubeCache.live = { data: result, timestamp: now };
                return res.json(result);
            }
            
            // Verifica se há canal configurado
            const hasChannel = config.channel_id && config.channel_id.trim().length > 0;
            if (!hasChannel) {
                console.log('📺 Canal não configurado');
                const result = { isLive: false, video: null };
                youtubeCache.live = { data: result, timestamp: now };
                return res.json(result);
            }
            
            // Se enabled for 0, logamos um aviso mas ainda assim verificamos a live
            if (!config.enabled) {
                console.log('📺 AVISO: Monitoramento está desabilitado (enabled=0) mas vamos verificar mesmo assim');
            }
            
            let channelId = config.channel_id.trim();
            
            // Se for URL, extrair o ID
            if (channelId.includes('youtube.com/')) {
                const match = channelId.match(/channel\/([^/]+)/);
                if (match) channelId = match[1];
            }
            
            console.log('Checking live for channel via RSS:', channelId);
            
            // Usar RSS do YouTube (não requer API Key)
            const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
            
            try {
                const response = await fetch(rssUrl);
                const text = await response.text();
                
                // Parsear o XML do RSS
                // O primeiro <title> é do canal, o segundo é do vídeo mais recente
                const videoIdMatch = text.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
                const titleMatches = text.match(/<title>([^<]+)<\/title>/g);
                // Pegar o segundo título (do vídeo), não o primeiro (do canal)
                const videoTitle = (titleMatches && titleMatches.length > 1) ? titleMatches[1].replace(/<title>/, '').replace(/<\/title>/, '') : 'Vídeo do YouTube';
                const publishedMatch = text.match(/<published>([^<]+)<\/published>/);
                
                if (videoIdMatch && videoIdMatch[1]) {
                    const videoId = videoIdMatch[1];
                    const publishedAt = publishedMatch ? new Date(publishedMatch[1]) : null;
                    const nowDate = new Date();
                    const hoursDiff = publishedAt ? (nowDate - publishedAt) / (1000 * 60 * 60) : 999;
                    
                    // Verificar se é uma live:
                    // 1. Título contém "ao vivo" ou "live" E vídeo tem menos de 8 horas = LIVE ATIVA
                    // 2. OU vídeo tem menos de 2 horas = Vídeo recente (pode ser culto gravado)
                    const titleLower = videoTitle.toLowerCase();
                    const hasLiveInTitle = titleLower.includes('ao vivo') || titleLower.includes('live');
                    const isLive = (hasLiveInTitle && hoursDiff < 8) || hoursDiff < 2;
                    
                    console.log('📺 Título do vídeo extraído:', videoTitle);
                    console.log('📺 É live?', isLive, '- Horas:', hoursDiff.toFixed(2));
                    
                    const result = {
                        isLive: isLive,
                        video: {
                            videoId: videoId,
                            title: videoTitle,
                            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                            channelTitle: videoTitle
                        },
                        message: isLive ? (titleLower.includes('ao vivo') ? '🔴 Transmissão ao vivo!' : '📺 Vídeo recente') : 'Nenhuma live no momento'
                    };
                    
                    youtubeCache.live = { data: result, timestamp: now };
                    return res.json(result);
                }
                
                const result = { isLive: false, video: null };
                youtubeCache.live = { data: result, timestamp: now };
                return res.json(result);
                
            } catch (rssError) {
                console.error('Erro ao buscar RSS:', rssError);
                const result = { isLive: false, video: null };
                youtubeCache.live = { data: result, timestamp: now };
                return res.json(result);
            }
        });
    } catch (error) {
        res.json({ isLive: false, video: null });
    }
});

// Endpoint para buscar o último vídeo uploadado do canal via RSS (sem API Key)
app.get('/api/youtube/latest', async (req, res) => {
    // Verificar cache
    const now = Date.now();
    if (youtubeCache.latest.data && (now - youtubeCache.latest.timestamp) < YOUTUBE_CACHE_TIME) {
        console.log('📺 Retornando latest do cache');
        return res.json(youtubeCache.latest.data);
    }
    
    try {
        db.get("SELECT channel_id FROM youtube_config WHERE id = 1", async (err, config) => {
            if (err || !config || !config.channel_id) {
                const result = { video: null, message: 'Canal não configurado' };
                youtubeCache.latest = { data: result, timestamp: now };
                return res.json(result);
            }
            
            let channelId = config.channel_id.trim();
            
            // Se for URL, extrair o ID
            if (channelId.includes('youtube.com/')) {
                const match = channelId.match(/channel\/([^/]+)/);
                if (match) channelId = match[1];
            }
            
            console.log('Buscando último vídeo via RSS para canal:', channelId);
            
            // Usar RSS do YouTube (não requer API Key)
            const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
            
            try {
                const response = await fetch(rssUrl);
                const text = await response.text();
                
                // Parsear o XML do RSS
                const videoIdMatch = text.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
                const titleMatch = text.match(/<title>([^<]+)<\/title>/);
                const publishedMatch = text.match(/<published>([^<]+)<\/published>/);
                
                if (videoIdMatch && videoIdMatch[1]) {
                    const videoId = videoIdMatch[1];
                    const result = {
                        video: {
                            videoId: videoId,
                            title: titleMatch ? titleMatch[1] : 'Vídeo do YouTube',
                            description: '',
                            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                            channelTitle: titleMatch ? titleMatch[1] : 'MAANAIM',
                            publishedAt: publishedMatch ? publishedMatch[1] : new Date().toISOString(),
                            isLive: false
                        }
                    };
                    youtubeCache.latest = { data: result, timestamp: now };
                    return res.json(result);
                }
                
                // Se não encontrou no RSS, retornar vazio
                const result = { video: null, message: 'Nenhum vídeo encontrado' };
                youtubeCache.latest = { data: result, timestamp: now };
                return res.json(result);
                
            } catch (rssError) {
                console.error('Erro ao buscar RSS:', rssError);
                const result = { video: null, message: 'Erro ao buscar vídeo' };
                youtubeCache.latest = { data: result, timestamp: now };
                return res.json(result);
            }
        });
    } catch (error) {
        res.json({ video: null, message: 'Erro interno' });
    }
});

// Listar todas as mensagens (público) - Busca automaticamente do YouTube
app.get('/api/mensagens', async (req, res) => {
    // Primeiro tenta buscar do YouTube
    try {
        const response = await fetch('http://localhost:3000/api/youtube/latest');
        const data = await response.json();
        
        if (data.video) {
            // Retorna no formato de mensagem
            return res.json([{
                id: 1,
                titulo: data.video.title,
                conteudo: data.video.description || '',
                video_url: 'https://www.youtube.com/watch?v=' + data.video.videoId,
                video_id: data.video.videoId,
                thumbnail: data.video.thumbnail,
                data_publicacao: data.video.publishedAt,
                ativa: 1,
                is_live: data.video.isLive || false
            }]);
        }
    } catch (e) {
        console.error('Erro ao buscar do YouTube:', e);
    }
    
    // Fallback: retorna array vazio se não conseguir buscar
    res.json([]);
});

// ROTAS ADMIN REMOVIDAS - Mensagens agora são buscadas automaticamente do YouTube

// CRUD MINISTÉRIOS
app.get('/api/admin/ministerios', verifyAdmin, (req, res) => {

    db.all("SELECT * FROM ministerios ORDER BY ordem ASC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/ministerios', verifyAdmin, (req, res) => {
    const { titulo, descricao, icone } = req.body;
    if (!titulo) {
        return res.status(400).json({ error: 'Título obrigatório' });
    }

    db.run("INSERT INTO ministerios (titulo, descricao, icone) VALUES (?, ?, ?)",
        [titulo, descricao || '', icone || 'fas fa-church'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, titulo, descricao, icone });
    });
});

app.put('/api/admin/ministerios/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { titulo, descricao, icone, ordem } = req.body;

    db.run("UPDATE ministerios SET titulo = ?, descricao = ?, icone = ?, ordem = ? WHERE id = ?",
        [titulo, descricao, icone, ordem, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Ministério não encontrado' });
        res.json({ message: 'Ministério atualizado' });
    });
});

app.delete('/api/admin/ministerios/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM ministerios WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Ministério não encontrado' });
        res.json({ message: 'Ministério excluído' });
    });
});

// Endpoint público para ministérios
app.get('/api/ministerios', (req, res) => {
    db.all("SELECT id, titulo, descricao, icone FROM ministerios ORDER BY ordem ASC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// CRUD CULTOS SEMANAIS (Admin)
app.get('/api/admin/cultos', verifyAdmin, (req, res) => {

    db.all("SELECT * FROM cultos ORDER BY id ASC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Parse imagens JSON para cada culto
        rows = rows.map(row => {
            if (row.imagens) {
                try {
                    row.imagens = typeof row.imagens === 'string' ? JSON.parse(row.imagens) : row.imagens;
                } catch (e) {
                    row.imagens = [];
                }
            }
            return row;
        });
        res.json(rows);
    });
});

app.get('/api/cultos', (req, res) => {
    db.all("SELECT id, titulo, SUBSTR(horario, 1, 5) as horario, local, imagem, imagens FROM cultos ORDER BY id ASC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Parse imagens JSON para cada culto
        rows = rows.map(row => {
            if (row.imagens) {
                try {
                    row.imagens = typeof row.imagens === 'string' ? JSON.parse(row.imagens) : row.imagens;
                } catch (e) {
                    row.imagens = [];
                }
            }
            return row;
        });
        res.json(rows);
    });
});

app.put('/api/admin/cultos/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { titulo, horario, local, imagem, imagens } = req.body;

    const imagensJson = imagens ? JSON.stringify(imagens) : null;

    db.run("UPDATE cultos SET titulo = ?, horario = ?, local = ?, imagem = ?, imagens = ?, updated_at = NOW() WHERE id = ?",
        [titulo, horario, local, imagem || null, imagensJson, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Culto não encontrado' });
        res.json({ message: 'Culto atualizado' });
    });
});

app.post('/api/admin/cultos', verifyAdmin, (req, res) => {
    const { titulo, horario, local, imagem, imagens } = req.body;
    // Validar: pelo menos título ou imagem(s) deve ser fornecido
    if (!titulo && !imagem && (!imagens || imagens.length === 0)) {
        return res.status(400).json({ error: 'Título ou imagem é obrigatório' });
    }

    const imagensJson = imagens ? JSON.stringify(imagens) : null;

    db.run("INSERT INTO cultos (titulo, horario, local, imagem, imagens) VALUES (?, ?, ?, ?, ?)",
        [titulo, horario || '', local || '', imagem || null, imagensJson], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, titulo, horario, local, imagem, imagens: imagens || [] });
    });
});

app.delete('/api/admin/cultos/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM cultos WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Culto não encontrado' });
        res.json({ message: 'Culto excluído' });
    });
});

// CRUD TÓPICOS BÍBLICOS (Admin)
app.get('/api/admin/topicos-biblia', verifyAdmin, (req, res) => {
    db.all("SELECT * FROM topicos_biblia ORDER BY ordem ASC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Listar tópicos ativos (público) - apenas publicados ou sem agendamento
app.get('/api/topicos-biblia', (req, res) => {
    // Busca todos os tópicos ativos e filtra no JavaScript para considerar fuso horário
    const query = `
        SELECT id, titulo, descricao, conteudo, categoria, icone, data_publicacao, hora_publicacao
        FROM topicos_biblia 
        WHERE ativo = 1 
        ORDER BY ordem ASC`;
    
    console.log('Query:', query);
    
    db.all(query, 
        (err, rows) => {
        if (err) {
            console.error('Erro na query:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Filtrar tópicos agendados no JavaScript (considerando fuso horário Brasil UTC-3)
        const agora = new Date();
        // Ajustar para o fuso horário brasileiro
        const agoraBrasil = new Date(agora.getTime() - (3 * 60 * 60 * 1000));
        
        console.log('Agora (UTC):', agora.toISOString());
        console.log('Agora (BRT):', agoraBrasil.toISOString());
        
        const topicosFiltrados = rows.filter(topico => {
            console.log('=== PROCESSANDO TOPICO:', topico.titulo, '===');
            console.log('data_publicacao:', topico.data_publicacao);
            console.log('hora_publicacao:', topico.hora_publicacao);
            console.log('agoraBrasil:', agoraBrasil.toISOString());
            
            // Verificar se tem hora de publicação sem data
            const horaPub = topico.hora_publicacao ? topico.hora_publicacao.substring(0, 5) : '';
            const temHoraPublicacao = horaPub && horaPub !== '' && horaPub !== '00:00';
            
            // Se não tem data de publicação, mas tem hora, usar data de hoje
            if (!topico.data_publicacao || topico.data_publicacao === null || topico.data_publicacao === '') {
                if (temHoraPublicacao) {
                    // Tem hora mas sem data - agendar para hoje nessa hora
                    // Comparar horas diretamente (ambas em horário de Brasília)
                    try {
                        const [horaPubNum, minutoPubNum] = horaPub.split(':').map(Number);
                        
                        // Obter hora atual do Brasil (UTC-3)
                        const agora = new Date();
                        let horasUTC = agora.getUTCHours();
                        const minutosUTC = agora.getUTCMinutes();
                        
                        // Converter UTC para BRT (UTC-3)
                        let horasBRT = horasUTC - 3;
                        const minutosBRT = minutosUTC;
                        
                        // Se horas ficarem negativas (antes das 3h UTC), somar 24
                        if (horasBRT < 0) {
                            horasBRT += 24;
                        }
                        
                        const agoraTotal = horasBRT * 60 + minutosBRT;
                        const pubTotal = horaPubNum * 60 + minutoPubNum;
                        
                        console.log('Topico:', topico.titulo, '- horaPub:', horaPub, '- agora (BRT):', horasBRT + ':' + String(minutosBRT).padStart(2, '0'));
                        
                        // Se a hora de hoje ainda não chegou, não mostrar
                        if (pubTotal > agoraTotal) {
                            console.log('Topico:', topico.titulo, '- ainda não chegou (hora pub:', pubTotal, '> agora:', agoraTotal, '), não mostrar');
                            return false;
                        }
                        // Se a hora já passou, mostrar o tópico
                        console.log('Topico:', topico.titulo, '- já passou (hora pub:', pubTotal, '< agora:', agoraTotal, '), mostrar');
                        return true;
                    } catch (e) {
                        console.error('Erro ao processar hora:', e);
                        return true;
                    }
                }
                // Sem data e sem hora - mostrar sempre
                return true;
            }
            
            // Tem data de publicação - verificar se já passou
            try {
                // Converter para string para garantir que funciona
                let dataStr = String(topico.data_publicacao);
                const horaStr = topico.hora_publicacao || '00:00';
                console.log('DEBUG: dataStr original:', dataStr, 'tipo:', typeof dataStr);
                
                // Se tem 'T' e 'GMT', é um objeto Date convertido para string local
                // Precisamos extrair a parte da data (YYYY-MM-DD)
                let dataPart;
                if (dataStr.includes('T') && dataStr.includes('GMT')) {
                    // Formato local: "Fri Mar 06 2026 00:00:00 GMT-0300 (Brasilia Standard Time)"
                    // Extrair a parte da data
                    const partes = dataStr.split(' ');
                    // partes = ['Fri', 'Mar', '06', '2026', '00:00:00', 'GMT-0300', ...]
                    const meses = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
                    const mes = meses[partes[1]];
                    const dia = parseInt(partes[2]);
                    const ano = parseInt(partes[3]);
                    dataPart = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                    console.log('DEBUG: extraido do Date local:', dataPart);
                } else if (dataStr.includes('T')) {
                    // Formato ISO: "2026-03-06T03:00:00.000Z"
                    dataPart = dataStr.split('T')[0];
                } else {
                    // Já é YYYY-MM-DD
                    dataPart = dataStr;
                }
                
                // Criar dataPub usando dataPart extraída
                const horaParts = horaStr.split(':');
                const hora = parseInt(horaParts[0]);
                const minuto = parseInt(horaParts[1]) || 0;
                const [ano, mes, dia] = dataPart.split('-').map(Number);
                dataPub = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto));
                console.log('DEBUG final: dataPart:', dataPart, 'ano:', ano, 'mes:', mes, 'dia:', dia, 'hora:', hora, 'minuto:', minuto, 'dataPub:', dataPub.toISOString());
                
                // Se a data é inválida, mostra o tópico
                if (isNaN(dataPub.getTime())) {
                    return true;
                }
                
                console.log('Topico:', topico.titulo, '- dataPub:', dataPub.toISOString(), '- agora:', agoraBrasil.toISOString());
                
                // A data/hora de publicação já passou?
                return dataPub.getTime() <= agoraBrasil.getTime();
            } catch (e) {
                console.error('Erro ao processar data:', e);
                // Em caso de erro, mostra o tópico
                return true;
            }
        });
        
        // Remover campos internos do resultado
        const resultado = topicosFiltrados.map(t => ({
            id: t.id,
            titulo: t.titulo,
            descricao: t.descricao,
            conteudo: t.conteudo,
            categoria: t.categoria,
            icone: t.icone
        }));
        
        console.log('Tópicos retornados:', resultado.length);
        res.json(resultado);
    });
});

// Criar tópico bíblico
app.post('/api/admin/topicos-biblia', verifyAdmin, (req, res) => {
    const { titulo, descricao, conteudo, categoria, icone, ordem, ativo, data_publicacao, hora_publicacao } = req.body;
    
    console.log('Recebido data_publicacao:', data_publicacao, 'hora_publicacao:', hora_publicacao);
    
    if (!titulo) {
        return res.status(400).json({ error: 'Título é obrigatório' });
    }
    
    // Se não tem data e hora (ou são vazios), publicar diretamente (null)
    const dataPub = (data_publicacao && data_publicacao !== '') ? data_publicacao : null;
    const horaPub = (hora_publicacao && hora_publicacao !== '' && hora_publicacao !== '00:00') ? hora_publicacao : null;
    
    console.log('Salvando - dataPub:', dataPub, 'horaPub:', horaPub);
    
    db.run("INSERT INTO topicos_biblia (titulo, descricao, conteudo, categoria, icone, ordem, ativo, data_publicacao, hora_publicacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [titulo, descricao || '', conteudo || '', categoria || 'geral', icone || 'fas fa-book-bible', ordem || 0, ativo !== undefined ? ativo : 1, dataPub, horaPub], 
        function(err) {
        if (err) {
            console.error('Erro ao criar tópico:', err);
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'Tópico bíblico criado!', id: this.lastID });
    });
});

// Atualizar tópico bíblico
app.put('/api/admin/topicos-biblia/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { titulo, descricao, conteudo, categoria, icone, ordem, ativo, data_publicacao, hora_publicacao } = req.body;
    
    console.log('PUT /api/admin/topicos-biblia/:id');
    console.log('ID do tópico:', id);
    console.log('Tipo do ID:', typeof id);
    console.log('Dados recebidos:', { titulo, data_publicacao, hora_publicacao });
    console.log('Atualizando - data_publicacao:', data_publicacao, 'hora_publicacao:', hora_publicacao);
    
    // Se não tem data e hora (ou são vazios), publicar diretamente (null)
    const dataPub = (data_publicacao && data_publicacao !== '') ? data_publicacao : null;
    const horaPub = (hora_publicacao && hora_publicacao !== '' && hora_publicacao !== '00:00') ? hora_publicacao : null;
    
    console.log('Salvando - dataPub:', dataPub, 'horaPub:', horaPub);
    
    db.run("UPDATE topicos_biblia SET titulo = ?, descricao = ?, conteudo = ?, categoria = ?, icone = ?, ordem = ?, ativo = ?, data_publicacao = ?, hora_publicacao = ? WHERE id = ?",
        [titulo, descricao, conteudo, categoria, icone, ordem, ativo, dataPub, horaPub, id], function(err) {
        if (err) {
            console.error('Erro ao atualizar:', err);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Tópico não encontrado' });
        res.json({ message: 'Tópico bíblico atualizado!' });
    });
});

// Excluir tópico bíblico
app.delete('/api/admin/topicos-biblia/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM topicos_biblia WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Tópico não encontrado' });
        res.json({ message: 'Tópico bíblico excluído!' });
    });
});


// ✅ ENDPOINTS PÚBLICOS

// GET /api/noticias (público)
app.get('/api/noticias', (req, res) => {
    console.log('[API] GET /api/noticias - Carregando notícias');
    db.all("SELECT id, titulo, conteudo, created_at FROM noticias ORDER BY created_at DESC LIMIT 10", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/eventos', (req, res) => {
    console.log('[DEBUG] GET /api/eventos - Buscando eventos');
    db.all("SELECT id, titulo, data, SUBSTR(horario, 1, 5) as horario, local, imagem, imagens, created_at FROM eventos ORDER BY COALESCE(data, '9999-12-31') ASC", (err, rows) => {
        if (err) {
            console.log('[DEBUG] ERRO ao buscar eventos:', err.message);
            return res.status(500).json({ error: err.message });
        }
        // Parse imagens JSON para cada evento
        rows = rows.map(row => {
            if (row.imagens) {
                try {
                    row.imagens = typeof row.imagens === 'string' ? JSON.parse(row.imagens) : row.imagens;
                } catch (e) {
                    row.imagens = [];
                }
            }
            return row;
        });
        console.log('[DEBUG] Eventos encontrados:', rows.length);
        if (rows.length > 0) {
            console.log('[DEBUG] Primeiro evento:', JSON.stringify(rows[0]));
        }
        res.json(rows);
    });
});

// ========== BÍBLIA API ==========

// Mapeamento de IDs para nomes completos
const NOMES_LIVROS = {
    1: 'Gênesis', 2: 'Êxodo', 3: 'Levítico', 4: 'Números', 5: 'Deuteronômio',
    6: 'Josué', 7: 'Juízes', 8: 'Rute', 9: '1 Samuel', 10: '2 Samuel',
    11: '1 Reis', 12: '2 Reis', 13: '1 Crônicas', 14: '2 Crônicas', 15: 'Esdras',
    16: 'Neemias', 17: 'Ester', 18: 'Jó', 19: 'Salmos', 20: 'Provérbios',
    21: 'Eclesiastes', 22: 'Cânticos', 23: 'Isaías', 24: 'Jeremias', 25: 'Lamentações',
    26: 'Ezequiel', 27: 'Daniel', 28: 'Oséias', 29: 'Joel', 30: 'Amós',
    31: 'Obadias', 32: ' Jonas', 33: 'Miquéias', 34: 'Naum', 35: 'Habacuque',
    36: 'Sofonias', 37: 'Ageu', 38: 'Zacarias', 39: 'Malaquias', 40: 'Mateus',
    41: 'Marcos', 42: 'Lucas', 43: 'João', 44: 'Atos', 45: 'Romanos',
    46: '1 Coríntios', 47: '2 Coríntios', 48: 'Gálatas', 49: 'Efésios', 50: 'Filipenses',
    51: 'Colossenses', 52: '1 Tessalonicenses', 53: '2 Tessalonicenses', 54: '1 Timóteo', 55: '2 Timóteo',
    56: 'Tito', 57: 'Filemom', 58: 'Hebreus', 59: 'Tiago', 60: '1 Pedro',
    61: '2 Pedro', 62: '1 João', 63: '2 João', 64: '3 João', 65: 'Judas',
    66: 'Apocalipse'
};

// Mapeamento de IDs para abreviações
const ABREVIACOES_LIVROS = {
    1: 'genesis', 2: 'exodo', 3: 'levitico', 4: 'numeros', 5: 'deuteronomio',
    6: 'josue', 7: 'juizes', 8: 'rute', 9: '1samuel', 10: '2samuel',
    11: '1reis', 12: '2reis', 13: '1cronicas', 14: '2cronicas', 15: 'esdras',
    16: 'neemias', 17: 'ester', 18: 'jo', 19: 'salmos', 20: 'proverbios',
    21: 'eclesiastes', 22: 'canticos', 23: 'isaias', 24: 'jeremias', 25: 'lamentacoes',
    26: 'ezequiel', 27: 'daniel', 28: 'oseias', 29: 'joel', 30: 'amos',
    31: 'obadias', 32: 'jonas', 33: 'miqueias', 34: 'naum', 35: 'habacuque',
    36: 'sofonias', 37: 'ageu', 38: 'zacarias', 39: 'malaquias', 40: 'mateus',
    41: 'marcos', 42: 'lucas', 43: 'joao', 44: 'atos', 45: 'romanos',
    46: '1corintios', 47: '2corintios', 48: 'galatas', 49: 'efesios', 50: 'filipenses',
    51: 'colossenses', 52: '1tessalonicenses', 53: '2tessalonicenses', 54: '1timoteo', 55: '2timoteo',
    56: 'tito', 57: 'filemom', 58: 'hebreus', 59: 'tiago', 60: '1pedro',
    61: '2pedro', 62: '1joao', 63: '2joao', 64: '3joao', 65: 'judas', 66: 'apocalipse'
};

// Mapeamento de abreviações curtas para IDs
const ABREVIACOES_SHORT = {
    'gn': 1, 'ex': 2, 'lv': 3, 'nm': 4, 'dt': 5,
    'js': 6, 'jz': 7, 'rt': 8, '1sm': 9, '2sm': 10,
    '1rs': 11, '2rs': 12, '1cr': 13, '2cr': 14, 'ed': 15,
    'ne': 16, 'et': 17, 'jo': 18, 'sl': 19, 'pv': 20,
    'ec': 21, 'ct': 22, 'is': 23, 'jr': 24, 'lm': 25,
    'ez': 26, 'dn': 27, 'os': 28, 'jl': 29, 'am': 30,
    'ob': 31, 'jn': 32, 'mq': 33, 'na': 34, 'hc': 35,
    'sf': 36, 'ag': 37, 'zc': 38, 'ml': 39, 'mt': 40,
    'mc': 41, 'lc': 42, 'jo': 43, 'at': 44, 'rm': 45,
    '1co': 46, '2co': 47, 'gl': 48, 'ef': 49, 'fp': 50,
    'cl': 51, '1ts': 52, '2ts': 53, '1tm': 54, '2tm': 55,
    'tt': 56, 'fm': 57, 'hb': 58, 'tg': 59, '1pe': 60,
    '2pe': 61, '1jo': 62, '2jo': 63, '3jo': 64, 'jd': 65, 'ap': 66,
    // Versões com números escritos
    '1corintios': 46, '2corintios': 47,
    '1samuel': 9, '2samuel': 10,
    '1reis': 11, '2reis': 12,
    '1cronicas': 13, '2cronicas': 14,
    '1tessalonicenses': 52, '2tessalonicenses': 53,
    '1timoteo': 54, '2timoteo': 55,
    '1pedro': 60, '2pedro': 61,
    '1joao': 62, '2joao': 63, '3joao': 64,
    // Abreviações extras comuns
    'deut': 5, 'dt': 5,
    'sal': 19
};

// Contagem de capítulos por livro
const CAPITULOS_LIVRO = {
    1: 50, 2: 40, 3: 27, 4: 36, 5: 34, 6: 24, 7: 21, 8: 4, 9: 31, 10: 24,
    11: 22, 12: 25, 13: 29, 14: 36, 15: 10, 16: 13, 17: 10, 18: 42, 19: 150, 20: 31,
    21: 12, 22: 8, 23: 66, 24: 52, 25: 5, 26: 48, 27: 12, 28: 14, 29: 3, 30: 9,
    31: 1, 32: 4, 33: 7, 34: 3, 35: 3, 36: 3, 37: 2, 38: 14, 39: 4, 40: 28,
    41: 16, 42: 24, 43: 21, 44: 28, 45: 16, 46: 16, 47: 13, 48: 6, 49: 6, 50: 4,
    51: 4, 52: 5, 53: 3, 54: 6, 55: 4, 56: 3, 57: 1, 58: 13, 59: 5, 60: 5,
    61: 3, 62: 5, 63: 1, 64: 1, 65: 1, 66: 22
};

// Listar todos os livros da Bíblia
app.get('/api/biblia/livros', (req, res) => {
    if (bibliaSQLiteReady) {
        // Usar SQLite - retornar array de objetos com id, nome, abreviacao, capitulos
        const livros = [];
        for (let id = 1; id <= 66; id++) {
            livros.push({
                id: id,
                nome: NOMES_LIVROS[id],
                abreviacao: ABREVIACOES_LIVROS[id],
                capitulos: CAPITULOS_LIVRO[id]
            });
        }
        res.json(livros);
    } else {
        res.status(500).json({ error: 'Banco de dados da bíblia não encontrado' });
    }
});

// Obter livro específico com todos os capítulos
app.get('/api/biblia/livro/:idOuAbrev', (req, res) => {
    const { idOuAbrev } = req.params;
    
    if (bibliaSQLiteReady) {
        // Primeiro, encontrar o ID do livro
        let livroId = null;
        let nomeLivro = null;
        
        // Primeiro verificar abreviações curtas (gn, 1co, 2cr, etc)
        const busca = idOuAbrev.toLowerCase();
        if (ABREVIACOES_SHORT[busca]) {
            livroId = ABREVIACOES_SHORT[busca];
            nomeLivro = NOMES_LIVROS[livroId];
        } else {
            // Verificar se é um ID numérico
            const idNum = parseInt(idOuAbrev);
            if (!isNaN(idNum) && idNum >= 1 && idNum <= 66) {
                livroId = idNum;
                nomeLivro = NOMES_LIVROS[idNum];
            } else {
                // Procurar por abreviação ou nome completo
                for (const [id, abreviacao] of Object.entries(ABREVIACOES_LIVROS)) {
                    if (abreviacao === busca || NOMES_LIVROS[parseInt(id)].toLowerCase().includes(busca)) {
                        livroId = parseInt(id);
                        nomeLivro = NOMES_LIVROS[id];
                        break;
                    }
                }
            }
        }
        
        if (!livroId) {
            return res.status(404).json({ error: 'Livro não encontrado' });
        }
        
        // Gerar array de capítulos
        const capitulos = [];
        for (let i = 1; i <= CAPITULOS_LIVRO[livroId]; i++) {
            capitulos.push({ numero: i });
        }
        
        res.json({
            id: livroId,
            nome: nomeLivro,
            abreviacao: ABREVIACOES_LIVROS[livroId],
            capitulos: capitulos
        });
    } else {
        res.status(500).json({ error: 'Banco de dados da bíblia não encontrado' });
    }
});

// Obter capítulo específico
app.get('/api/biblia/:livro/:capitulo', (req, res) => {
    const { livro, capitulo } = req.params;
    const capituloNum = parseInt(capitulo);
    
    if (bibliaSQLiteReady) {
        // Mapa de abreviações para nomes de livros
        const abreviacoes = {
            'genesis': 1, 'gen': 1, 'gn': 1,
            'exodo': 2, 'ex': 2, 'exo': 2,
            'levitico': 3, 'lv': 3, 'lev': 3,
            'numeros': 4, 'nm': 4, 'num': 4,
            'deuteronomio': 5, 'dt': 5, 'deut': 5,
            'josue': 6, 'js': 6, 'jos': 6,
            'juizes': 7, 'jz': 7, 'juiz': 7,
            'rute': 8, 'rt': 8, 'rute': 8,
            '1samuel': 9, '1 sm': 9, '1sam': 9, '1sm': 9,
            '2samuel': 10, '2 sm': 10, '2sam': 10, '2sm': 10,
            '1reis': 11, '1 rs': 11, '1reis': 11, '1rs': 11,
            '2reis': 12, '2 rs': 12, '2reis': 12, '2rs': 12,
            '1cronicas': 13, '1 cr': 13, '1cr': 13,
            '2cronicas': 14, '2 cr': 14, '2cr': 14,
            'esdras': 15, 'ed': 15, 'esd': 15,
            'neemias': 16, 'ne': 16, 'neem': 16,
            'ester': 17, 'et': 17, 'ester': 17,
            'jo': 18, 'jó': 18, 'job': 18,
            'salmos': 19, 'sl': 19, 'salm': 19,
            'proverbios': 20, 'pv': 20, 'prov': 20,
            'eclesiastes': 21, 'ec': 21, 'ecl': 21,
            'canticos': 22, 'ct': 22, 'cant': 22,
            'isaias': 23, 'is': 23, 'isa': 23,
            'jeremias': 24, 'jr': 24, 'jer': 24,
            'lamentacoes': 25, 'lm': 25, 'lam': 25,
            'ezequiel': 26, 'ez': 26, 'ezeq': 26,
            'daniel': 27, 'dn': 27, 'dan': 27,
            'oseias': 28, 'os': 28, 'ose': 28,
            'joel': 29, 'jl': 29, 'joel': 29,
            'amos': 30, 'am': 30, 'amos': 30,
            'obadias': 31, 'ob': 31, 'obad': 31,
            'jonas': 32, 'jn': 32, 'jonas': 32,
            'miqueias': 33, 'mq': 33, 'miq': 33,
            'naum': 34, 'na': 34, 'naum': 34,
            'habacuque': 35, 'hc': 35, 'hab': 35,
            'sofonias': 36, 'sf': 36, 'sof': 36,
            'ageu': 37, 'ag': 37, 'ageu': 37,
            'zacarias': 38, 'zc': 38, 'zac': 38,
            'malaquias': 39, 'ml': 39, 'mal': 39,
            'mateus': 40, 'mt': 40, 'mate': 40,
            'marcos': 41, 'mc': 41, 'mar': 41,
            'lucas': 42, 'lc': 42, 'luc': 42,
            'joao': 43, 'jo': 43, 'joao': 43,
            'atos': 44, 'at': 44, 'atos': 44,
            'romanos': 45, 'rm': 45, 'rom': 45,
            '1corintios': 46, '1 co': 46, '1cor': 46,
            '2corintios': 47, '2 co': 47, '2cor': 47,
            'galatas': 48, 'gl': 48, 'gal': 48,
            'efesios': 49, 'ef': 49, 'efes': 49,
            'filipenses': 50, 'fp': 50, 'fil': 50,
            'colossenses': 51, 'cl': 51, 'col': 51,
            '1tessalonicenses': 52, '1 ts': 52, '1 tess': 52,
            '2tessalonicenses': 53, '2 ts': 53, '2 tess': 53,
            '1timoteo': 54, '1 tm': 54, '1tim': 54,
            '2timoteo': 55, '2 tm': 55, '2tim': 55,
            'tito': 56, 'tt': 56, 'tito': 56,
            'filemom': 57, 'fm': 57, 'filem': 57,
            'hebreus': 58, 'hb': 58, 'heb': 58,
            'tiago': 59, 'tg': 59, 'tiag': 59,
            '1pedro': 60, '1 pe': 60, '1ped': 60,
            '2pedro': 61, '2 pe': 61, '2ped': 61,
            '1joao': 62, '1 jo': 62, '1 joao': 62,
            '2joao': 63, '2 jo': 63, '2 joao': 63,
            '3joao': 64, '3 jo': 64, '3 joao': 64,
            'judas': 65, 'jd': 65, 'judas': 65,
            'apocalipse': 66, 'ap': 66, 'apoc': 66
        };
        
        const livroBusca = livro.toLowerCase().replace(/\s/g, '');
        let livroId = abreviacoes[livroBusca];
        
        if (!livroId) {
            // Tentar buscar por nome usando os dados em memória
            const nomeBusca = livro.toLowerCase().replace(/\s/g, '');
            
            // Buscar no mapeamento de nomes
            for (const [id, nome] of Object.entries(NOMES_LIVROS)) {
                const nomeNormalizado = nome.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const abreviacao = ABREVIACOES_LIVROS[parseInt(id)];
                
                if (nomeNormalizado.includes(nomeBusca) || abreviacao === nomeBusca) {
                    livroId = parseInt(id);
                    break;
                }
            }
        }
        
        if (!livroId) {
            return res.status(404).json({ error: 'Livro não encontrado: ' + livro });
        }
        
        buscarCapitulo(livroId);
    }
    
    function buscarCapitulo(livroId) {
        // Usar dados JSON carregados em memória
        const versao = 'nvi'; // Versão padrão
        const capituloNumInt = parseInt(capituloNum);
        
        if (!bibliaDados[versao] || !bibliaDados[versao][livroId]) {
            return res.status(404).json({ error: 'Livro não encontrado nos dados carregados' });
        }
        
        const livroData = bibliaDados[versao][livroId];
        
        if (!livroData[capituloNumInt]) {
            return res.status(404).json({ error: 'Capítulo ' + capitulo + ' não encontrado. Livros disponíveis: ' + Object.keys(livroData).join(', ') });
        }
        
        const capituloData = livroData[capituloNumInt];
        const versos = [];
        
        // Converter objeto de versículos em array
        for (const [numero, texto] of Object.entries(capituloData)) {
            versos.push({
                numero: parseInt(numero),
                texto: texto
            });
        }
        
        // Ordenar versículos por número
        versos.sort((a, b) => a.numero - b.numero);
        
        res.json({
            livro: NOMES_LIVROS[livroId],
            capitulo: capituloNumInt,
            versos: versos
        });
    }
});
app.get('/api/biblia/busca', (req, res) => {
    const { q, limite = 20, offset = 0 } = req.query;
    
    if (!q || q.length < 2) {
        return res.status(400).json({ error: 'Termo de busca deve ter pelo menos 2 caracteres' });
    }
    
    if (bibliaSQLiteReady) {
        const termo = q.toLowerCase();
        const resultados = [];
        // Verificar qual versão da bíblía está disponível e tem mais livros
        let versao = 'acf';  // ACF tem 65 livros carregados
        if (!bibliaDados.acf || Object.keys(bibliaDados.acf).length === 0) {
            versao = 'aa';
        }
        if (!bibliaDados[versao] || Object.keys(bibliaDados[versao]).length === 0) {
            versao = 'nvi';
        }
        const bibliaLivros = bibliaDados[versao];
        console.log('DEBUG BUSCA - Usando versão da bíblía:', versao, 'Livros carregados:', Object.keys(bibliaLivros).length);
        
        if (!bibliaLivros) {
            return res.status(500).json({ error: 'Dados da bíblia não carregados' });
        }
        
        // Verificar se é uma busca por múltiplos livros (contém " e " ou " &")
        const separadores = [' e ', ' & ', ' and ', ','];
        let termosBusca = [termo];
        
        // Primeiro verificar se há padrão de referência bíblica com texto misturado
        // Ex: "deut 32 a 34 salmos 91" -> deve ser tratado como múltiplas refs
        const temReferenciaMista = termo.match(/\d+\s+(a|e)\s+\d+\s+\w+/);
        if (temReferenciaMista) {
            console.log('DEBUG - Referência mista detectada, tentando separar por livro...');
            // Tentar separar por nomes de livros conhecidos
            // Buscar por padrões onde um livro termina e outro começa
            // Padrão: "número a número" seguido de espaço e depois um livro
            // Ex: "deut 32 a 34 salmos 91" -> "deut 32 a 34" e "salmos 91"
            
            // Primeiro, verificar se tem " a " (intervalo) seguido de livro
            const separacaoPorIntervalo = termo.match(/^(.+?)(\d+)\s+a\s+(\d+)\s+(\w.*)$/i);
            if (separacaoPorIntervalo) {
                // Encontrou padrão: "deut 32 a 34 salmos 91"
                const primeiraParte = separacaoPorIntervalo[1].trim() + ' ' + separacaoPorIntervalo[2] + ' a ' + separacaoPorIntervalo[3]; // "deut 32 a 34"
                const segundaParte = separacaoPorIntervalo[4].trim(); // "salmos 91"
                
                if (primeiraParte && segundaParte) {
                    // Verificar se a segunda parte começa com um livro conhecido
                    const segundaParteLower = segundaParte.toLowerCase().trim();
                    let startsWithBook = false;
                    for (const [abrev, id] of Object.entries(ABREVIACOES_SHORT)) {
                        if (segundaParteLower.startsWith(abrev) || segundaParteLower.startsWith(NOMES_LIVROS[id].toLowerCase())) {
                            startsWithBook = true;
                            break;
                        }
                    }
                    if (startsWithBook) {
                        termosBusca = [primeiraParte, segundaParte];
                        console.log('DEBUG - Termos separados por intervalo:', termosBusca);
                    }
                }
            }
        }
        
        for (const sep of separadores) {
            if (termo.includes(sep) && termosBusca.length === 1) {
                termosBusca = termo.split(sep).map(t => t.trim()).filter(t => t.length > 0);
                break;
            }
        }
        
        // Mapeamento de nomes de livros para IDs (incluindo versões com números por extenso)
        const nomeParaId = {};
        for (const [id, nome] of Object.entries(NOMES_LIVROS)) {
            // Nome completo: "2 Reis", "2 Pedro"
            nomeParaId[nome.toLowerCase()] = parseInt(id);
            // Abreviação: "2reis", "2pedro"
            nomeParaId[ABREVIACOES_LIVROS[parseInt(id)].toLowerCase()] = parseInt(id);
            // Versão sem espaço: "2reis" -> 12
            const nomeSemEspaco = nome.toLowerCase().replace(/\s/g, '');
            nomeParaId[nomeSemEspaco] = parseInt(id);
        }
        // Adicionar mapeamentos extras para números por extenso
        nomeParaId['2reis'] = 12;
        nomeParaId['1reis'] = 11;
        nomeParaId['2pedro'] = 61;
        nomeParaId['1pedro'] = 60;
        nomeParaId['2samuel'] = 10;
        nomeParaId['1samuel'] = 9;
        // Abreviações comuns extras
        nomeParaId['deut'] = 5;
        nomeParaId['sal'] = 19;
        
        // Função para extrair livro, capítulo e versículo de um termo
        function parseReferencia(texto) {
            // Detectar padrões: 
            // "livro capítulo:verso" ou "livro capítulo:verso-fim" (formato antigo)
            // "livro capítulo versiculo" ou "livro capítulo versiculo versiculo_fim" (novo formato com espaços)
            // Exemplos: "2 reis 1:10", "2 pedro 2", "2reis 1", "2 reis 3 1 4", "2 pedro 2 1 7"
            
            let livroId = null;
            let capitulo = null;
            let versiculo = null;
            let livroNome = null;
            let livroNomeOriginal = null;
            
            // Primeiro tenta encontrar o livro no termo
            let termoSemEspaco = texto.toLowerCase().replace(/\s/g, '');
            
            // Procurar pelo nome do livro no termo - vamos encontrar o mais longo
            let melhorNome = '';
            for (const [nome, id] of Object.entries(nomeParaId)) {
                if (texto.toLowerCase().includes(nome) || termoSemEspaco.includes(nome)) {
                    if (nome.length > melhorNome.length) {
                        melhorNome = nome;
                        livroId = id;
                        livroNome = NOMES_LIVROS[id];
                        livroNomeOriginal = nome;
                    }
                }
            }
            
            if (!livroId) return null;
            
            // Remover o nome do livro para encontrar capítulo e versículo
            let resto = texto.toLowerCase();
            if (livroNomeOriginal) {
                resto = resto.replace(livroNomeOriginal, '').trim();
            }
            // Also remove common variations
            for (const nome of Object.keys(nomeParaId)) {
                if (nome !== livroNomeOriginal) {
                    resto = resto.replace(nome, '').trim();
                }
            }
            
            console.log('DEBUG parseReferencia - texto:', texto, 'livro:', livroNome, 'resto:', resto);
            
            // Detectar intervalo de capítulos mesmo com texto depois (ex: "32 a 34 salmos 91")
            const matchIntervaloCapitulos = resto.match(/^(\d+)\s+(a|e)\s+(\d+)/);
            if (matchIntervaloCapitulos) {
                // Retorna com capituloFim para indicar intervalo
                capitulo = parseInt(matchIntervaloCapitulos[1]);
                return { livroId, livroNome, capitulo, capituloFim: parseInt(matchIntervaloCapitulos[3]) };
            }
            
            // Detectar capítulo:verso (ex: "1:10" ou "1:10-15") - formato antigo
            const matchCapituloVerso = resto.match(/(\d+):(\d+(?:-\d+)?)/);
            if (matchCapituloVerso) {
                capitulo = parseInt(matchCapituloVerso[1]);
                if (matchCapituloVerso[2].includes('-')) {
                    // Range de versículos: 1:10-15
                    versiculo = matchCapituloVerso[2]; // Retorna "10-15"
                } else {
                    versiculo = parseInt(matchCapituloVerso[2]);
                }
            } else if (resto && resto.length > 0) {
                // Novo formato com espaços: "3 1" = capítulo 3 versículo 1
                // ou "3 1 4" = capítulo 3, versículos 1 a 4
                const numeros = resto.match(/(\d+)/g);
                if (numeros && numeros.length >= 1) {
                    capitulo = parseInt(numeros[0]);
                    if (numeros.length >= 2) {
                        if (numeros.length >= 3) {
                            // "3 1 4" = capítulo 3, versículos 1 a 4
                            versiculo = `${numeros[1]}-${numeros[2]}`;
                        } else {
                            // "3 1" = capítulo 3 versículo 1
                            versiculo = parseInt(numeros[1]);
                        }
                    }
                }
            }
            
            console.log('DEBUG parseReferencia - resultado:', { livroId, livroNome, capitulo, versiculo });
            
            return { livroId, livroNome, capitulo, versiculo };
        }
        
        // Verificar se é uma busca por referências completas (livro + capítulo)
        const referencias = [];
        for (const t of termosBusca) {
            const ref = parseReferencia(t);
            console.log('DEBUG loop ref - termo:', t, 'result:', ref);
            if (ref && ref.livroId) {
                referencias.push(ref);
            }
        }
        
        console.log('DEBUG - referencias:', referencias.length, 'termos:', termosBusca.length);
        console.log('DEBUG - termosBusca array:', JSON.stringify(termosBusca));
        
        // Se encontrou referências completas (livro + capítulo), retornar para navegação direta
        if (referencias.length > 0 && referencias.length === termosBusca.length) {
            console.log('DEBUG - Entrou no bloco de referências completas! referencias:', referencias.length, 'termos:', termosBusca.length);
            // Se tem versículos específicos, buscar esses versículos
            const resultados = [];
            for (const ref of referencias) {
                try {
                    const livroIdNum = parseInt(ref.livroId);
                    console.log('DEBUG - Buscando livroId:', livroIdNum, 'cap:', ref.capitulo, 'vers:', ref.versiculo);
                    console.log('DEBUG - bibliaLivros[12]:', typeof bibliaLivros[12], Object.keys(bibliaLivros[12] || {}));
                    
                    // Estrutura: bibliaLivros[12]['1'] = objeto com versículos { '1': 'texto', '2': 'texto', ... }
                    if (ref.capituloFim) {
                        // Intervalo de capítulos (ex: Deut 32 a 34)
                        for (let cap = ref.capitulo; cap <= ref.capituloFim; cap++) {
                            const capituloData = bibliaLivros[livroIdNum]?.[cap];
                            if (capituloData && typeof capituloData === 'object') {
                                Object.keys(capituloData).forEach((verso) => {
                                    resultados.push({
                                        livro: ref.livroNome,
                                        abreviacao: ABREVIACOES_LIVROS[livroIdNum],
                                        capitulo: cap,
                                        verso: parseInt(verso),
                                        texto: capituloData[verso]
                                    });
                                });
                            }
                        }
                    } else if (ref.versiculo) {
                        // Buscar versículo(s) específico(s)
                        const capituloData = bibliaLivros[livroIdNum]?.[ref.capitulo];
                        console.log('DEBUG - capituloData:', capituloData ? 'existe' : 'null', typeof capituloData);
                        if (capituloData) {
                            if (typeof ref.versiculo === 'string' && ref.versiculo.includes('-')) {
                                // Range de versículos
                                const [ini, fin] = ref.versiculo.split('-').map(Number);
                                for (let v = ini; v <= fin; v++) {
                                    const textoVersiculo = capituloData[v];
                                    console.log('DEBUG - verso', v, 'texto:', textoVersiculo ? 'existe' : 'null');
                                    if (textoVersiculo) {
                                        resultados.push({
                                            livro: ref.livroNome,
                                            abreviacao: ABREVIACOES_LIVROS[livroIdNum],
                                            capitulo: ref.capitulo,
                                            verso: v,
                                            texto: textoVersiculo
                                        });
                                    }
                                }
                            } else {
                                // Versículo único
                                const v = parseInt(ref.versiculo);
                                const textoVersiculo = capituloData[v];
                                if (textoVersiculo) {
                                    resultados.push({
                                        livro: ref.livroNome,
                                        abreviacao: ABREVIACOES_LIVROS[livroIdNum],
                                        capitulo: ref.capitulo,
                                        verso: v,
                                        texto: textoVersiculo
                                    });
                                }
                            }
                        }
                    } else if (ref.capitulo) {
                        // Apenas capítulo, retornar o capítulo completo
                        const capituloData = bibliaLivros[livroIdNum]?.[ref.capitulo];
                        if (capituloData && typeof capituloData === 'object') {
                            Object.keys(capituloData).forEach((verso) => {
                                resultados.push({
                                    livro: ref.livroNome,
                                    abreviacao: ABREVIACOES_LIVROS[livroIdNum],
                                    capitulo: ref.capitulo,
                                    verso: parseInt(verso),
                                    texto: capituloData[verso]
                                });
                            });
                        }
                    } else {
                        // Sem capítulo especificado, retornar o primeiro capítulo
                        const livroData = bibliaLivros[livroIdNum];
                        if (livroData && livroData['1']) {
                            const capituloData = livroData['1'];
                            if (typeof capituloData === 'object') {
                                Object.keys(capituloData).forEach((verso) => {
                                    resultados.push({
                                        livro: ref.livroNome,
                                        abreviacao: ABREVIACOES_LIVROS[livroIdNum],
                                        capitulo: 1,
                                        verso: parseInt(verso),
                                        texto: capituloData[verso]
                                    });
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.log('Erro ao buscar referência:', e);
                }
            }
            
            if (resultados.length > 0) {
                // Aplicar offset e limite para paginação
                const offsetNum = parseInt(offset);
                const limiteNum = parseInt(limite);
                const paginados = resultados.slice(offsetNum, offsetNum + limiteNum);
                
                return res.json({
                    total: resultados.length,
                    limite: limiteNum,
                    offset: offsetNum,
                    resultados: paginados,
                    tipo: 'capitulos'
                });
            }
        }
        
        // Verificar se a busca contém nomes de livros (para mostrar os livros encontrados)
        const livrosEncontrados = [];
        for (const t of termosBusca) {
            // Tentar encontrar o livro
            let livroId = null;
            const termoSemEspaco = t.replace(/\s/g, '').toLowerCase();
            
            // Primeiro tenta direta
            if (nomeParaId[t]) {
                livroId = nomeParaId[t];
            } else if (nomeParaId[termoSemEspaco]) {
                // Tenta sem espaços
                livroId = nomeParaId[termoSemEspaco];
            } else {
                // Buscar se o termo contém o nome de algum livro
                for (const [nome, id] of Object.entries(nomeParaId)) {
                    if (t.includes(nome) || nome.includes(t) || t.includes(nome.replace(/\s/g, '')) || termoSemEspaco.includes(nome)) {
                        livroId = id;
                        break;
                    }
                }
            }
            
            if (livroId !== null && !livrosEncontrados.includes(livroId)) {
                livrosEncontrados.push(livroId);
            }
        }
        
        // Verificar se a busca contém nomes de livros (para mostrar os livros encontrados)
        if (livrosEncontrados.length > 0 && livrosEncontrados.length === termosBusca.length) {
            const livrosResponse = livrosEncontrados.map(id => ({
                id: id,
                nome: NOMES_LIVROS[id],
                abreviacao: ABREVIACOES_LIVROS[id]
            }));
            
            return res.json({
                total: livrosResponse.length,
                limite: parseInt(limite),
                offset: parseInt(offset),
                resultados: [],
                livros: livrosResponse,
                tipo: 'livros'
            });
        }
        
        // Função para buscar em um livro específico
        function buscarEmLivro(livroTermo, limiteLivro) {
            const resultadosLivro = [];
            let livroId = null;
            
            // Tentar encontrar o livro pelo nome ou abreviação
            // Primeiro, verificar se o termo é exatamente um nome de livro
            if (nomeParaId[livroTermo]) {
                livroId = nomeParaId[livroTermo];
            } else {
                // Buscar se o termo contém o nome de algum livro
                for (const [nome, id] of Object.entries(nomeParaId)) {
                    if (livroTermo.includes(nome) || nome.includes(livroTermo)) {
                        livroId = id;
                        break;
                    }
                }
            }
            
            console.log('Buscando termo:', livroTermo, '-> livroId:', livroId);
            
            // Se encontrou um livro específico, buscar apenas nele
            if (livroId !== null && bibliaLivros[livroId]) {
                const capitulos = bibliaLivros[livroId];
                for (const [capituloNum, versosObj] of Object.entries(capitulos)) {
                    for (const [versoNum, texto] of Object.entries(versosObj)) {
                        if (typeof texto === 'string' && texto.toLowerCase().includes(livroTermo)) {
                            resultadosLivro.push({
                                livro: NOMES_LIVROS[livroId],
                                abreviacao: ABREVIACOES_LIVROS[livroId],
                                capitulo: parseInt(capituloNum),
                                verso: parseInt(versoNum),
                                texto: texto
                            });
                            
                            if (resultadosLivro.length >= limiteLivro) {
                                break;
                            }
                        }
                    }
                    if (resultadosLivro.length >= limiteLivro) {
                        break;
                    }
                }
            } else {
                // Buscar em todos os livros (comportamento original)
                for (const [livroId, capitulos] of Object.entries(bibliaLivros)) {
                    for (const [capituloNum, versosObj] of Object.entries(capitulos)) {
                        for (const [versoNum, texto] of Object.entries(versosObj)) {
                            if (typeof texto === 'string' && texto.toLowerCase().includes(livroTermo)) {
                                resultadosLivro.push({
                                    livro: NOMES_LIVROS[parseInt(livroId)],
                                    abreviacao: ABREVIACOES_LIVROS[parseInt(livroId)],
                                    capitulo: parseInt(capituloNum),
                                    verso: parseInt(versoNum),
                                    texto: texto
                                });
                                
                                if (resultadosLivro.length >= limiteLivro) {
                                    break;
                                }
                            }
                        }
                        if (resultadosLivro.length >= limiteLivro) {
                            break;
                        }
                    }
                    if (resultadosLivro.length >= limiteLivro) {
                        break;
                    }
                }
            }
            
            return resultadosLivro;
        }
        
        // Se há múltiplos termos de busca (múltiplos livros)
        if (termosBusca.length > 1) {
            const limitePorLivro = Math.ceil((parseInt(limite) + parseInt(offset)) / termosBusca.length);
            
            for (const termoLivro of termosBusca) {
                const resultadosLivro = buscarEmLivro(termoLivro, limitePorLivro);
                resultados.push(...resultadosLivro);
            }
        } else {
            // Busca normal em todos os livros
            for (const [livroId, capitulos] of Object.entries(bibliaLivros)) {
                for (const [capituloNum, versosObj] of Object.entries(capitulos)) {
                    for (const [versoNum, texto] of Object.entries(versosObj)) {
                        if (typeof texto === 'string' && texto.toLowerCase().includes(termo)) {
                            resultados.push({
                                livro: NOMES_LIVROS[parseInt(livroId)],
                                abreviacao: ABREVIACOES_LIVROS[parseInt(livroId)],
                                capitulo: parseInt(capituloNum),
                                verso: parseInt(versoNum),
                                texto: texto
                            });
                            
                            // Limitar resultados para performance
                            if (resultados.length >= parseInt(limite) + parseInt(offset)) {
                                break;
                            }
                        }
                    }
                    if (resultados.length >= parseInt(limite) + parseInt(offset)) {
                        break;
                    }
                }
                if (resultados.length >= parseInt(limite) + parseInt(offset)) {
                    break;
                }
            }
        }
        
        // Aplicar offset e limite
        const total = resultados.length;
        const paginados = resultados.slice(parseInt(offset), parseInt(offset) + parseInt(limite));
        
        res.json({
            total,
            limite: parseInt(limite),
            offset: parseInt(offset),
            resultados: paginados
        });
    } else {
        res.status(500).json({ error: 'Banco de dados da bíblia não encontrado' });
    }
});

// Autocomplete para busca
app.get('/api/biblia/autocomplete', (req, res) => {
    const { q } = req.query;
    
    if (!q || q.length < 1) {
        return res.json([]);
    }
    
    if (bibliaSQLiteReady) {
        // Buscar livros pelo nome usando dados JSON
        const termo = q.toLowerCase();
        const sugestoes = [];
        
        for (const [id, nome] of Object.entries(NOMES_LIVROS)) {
            if (nome.toLowerCase().includes(termo) || ABREVIACOES_LIVROS[parseInt(id)].includes(termo)) {
                sugestoes.push({
                    tipo: 'livro',
                    nome: nome,
                    abreviacao: ABREVIACOES_LIVROS[parseInt(id)]
                });
            }
            if (sugestoes.length >= 10) break;
        }
        
        res.json(sugestoes);
    } else {
        res.json([]);
    }
});

// ========== ÁREA DO MEMBRO ==========

// Configuração do multer para upload de PDFs
const multer = require('multer');
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'uploads', 'pdfs');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

// CRUD ÁREA DO MEMBRO (Admin)
app.get('/api/admin/area-membro', verifyAdmin, (req, res) => {
    db.all("SELECT * FROM area_membro ORDER BY ordem ASC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Listar tópicos da área do membro (público)
app.get('/api/area-membro', (req, res) => {
    db.all("SELECT id, titulo, descricao, conteudo, pdf_path, categoria, icone, ordem FROM area_membro WHERE ativo = 1 ORDER BY ordem ASC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Upload de PDF (via Base64)
app.post('/api/admin/upload-pdf-base64', verifyAdmin, (req, res) => {
    console.log('[DEBUG API] upload-pdf-base64 chamado');
    console.log('[DEBUG API] req.body:', JSON.stringify(req.body).substring(0, 500));
    try {
        const { filename, data } = req.body;
        
        if (!filename || !data) {
            console.log('[DEBUG API] Erro: Nome do arquivo ou dados faltando');
            return res.status(400).json({ error: 'Nome do arquivo e dados são obrigatórios' });
        }
        
        console.log('[DEBUG API] Recebendo arquivo:', filename, '- Tamanho dos dados:', data.length);
        
        // Decodificar Base64
        const buffer = Buffer.from(data, 'base64');
        console.log('[DEBUG API] Buffer criado, tamanho:', buffer.length);
        
        // Gerar nome de arquivo único
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = filename.split('.').pop() || 'pdf';
        const savedFilename = uniqueSuffix + '.' + ext;
        
        // Salvar arquivo
        const dir = path.join(__dirname, 'uploads', 'pdfs');
        if (!fs.existsSync(dir)) {
            console.log('[DEBUG API] Criando diretório:', dir);
            fs.mkdirSync(dir, { recursive: true });
        }
        
        const filePath = path.join(dir, savedFilename);
        console.log('[DEBUG API] Salvando em:', filePath);
        fs.writeFileSync(filePath, buffer);
        
        const pdfPath = '/uploads/pdfs/' + savedFilename;
        console.log('[DEBUG API] PDF salvo com sucesso, path:', pdfPath);
        res.json({ path: pdfPath, message: 'Arquivo enviado com sucesso!' });
    } catch (error) {
        console.error('[DEBUG API] Erro ao salvar PDF:', error);
        res.status(500).json({ error: 'Erro ao salvar arquivo: ' + error.message });
    }
});

// Criar tópico da área do membro
app.post('/api/admin/area-membro', verifyAdmin, (req, res) => {
    const { titulo, descricao, conteudo, pdfPath, categoria, icone, ordem, ativo } = req.body;
    
    db.run("INSERT INTO area_membro (titulo, descricao, conteudo, pdf_path, categoria, icone, ordem, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
        [titulo, descricao || '', conteudo || '', pdfPath || '', categoria, icone || 'fas fa-book', ordem || 0, ativo !== undefined ? ativo : 1], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: 'Tópico criado!' });
        });
});

// Atualizar tópico da área do membro
app.put('/api/admin/area-membro/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { titulo, descricao, conteudo, pdfPath, categoria, icone, ordem, ativo } = req.body;
    
    db.run("UPDATE area_membro SET titulo = ?, descricao = ?, conteudo = ?, pdf_path = ?, categoria = ?, icone = ?, ordem = ?, ativo = ? WHERE id = ?",
        [titulo, descricao || '', conteudo || '', pdfPath || '', categoria, icone || 'fas fa-book', ordem || 0, ativo !== undefined ? ativo : 1, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Tópico não encontrado' });
            res.json({ message: 'Tópico atualizado!' });
        });
});

// Excluir tópico da área do membro
app.delete('/api/admin/area-membro/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;
    
    db.run("DELETE FROM area_membro WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Tópico não encontrado' });
        res.json({ message: 'Tópico excluído!' });
    });
});

// ========== VÍDEO AULAS ==========

// Listar todas as aulas (público)
app.get('/api/aulas', (req, res) => {
    console.log('[DEBUG API] GET /api/aulas - Buscando aulas ativas');
    db.all("SELECT * FROM aulas WHERE ativo = 1 ORDER BY created_at DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        console.log('[DEBUG API] GET /api/aulas - Aulas encontradas:', rows.length);
        if (rows.length > 0) {
            console.log('[DEBUG API] GET /api/aulas - Primeira aula:', JSON.stringify(rows[0]));
        }
        res.json(rows);
    });
});

// Listar todas as aulas (admin)
app.get('/api/admin/aulas', verifyAdmin, (req, res) => {
    console.log('[DEBUG API] GET /api/admin/aulas - Buscando todas as aulas');
    db.all("SELECT * FROM aulas ORDER BY created_at DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        console.log('[DEBUG API] GET /api/admin/aulas - Aulas encontradas:', rows.length);
        if (rows.length > 0) {
            console.log('[DEBUG API] GET /api/admin/aulas - Primeira aula:', JSON.stringify(rows[0]));
        }
        res.json(rows);
    });
});

// Criar aula
app.post('/api/admin/aulas', verifyAdmin, (req, res) => {
    const { titulo, descricao, video_url, thumbnail, pdf_path, duracao, autor, categoria, ativo } = req.body;
    
    console.log('[DEBUG API] POST /api/admin/aulas recebido');
    console.log('[DEBUG API] pdf_path recebido:', pdf_path);
    
    if (!titulo || !video_url) {
        return res.status(400).json({ error: 'Título e URL do vídeo são obrigatórios' });
    }

    db.run("INSERT INTO aulas (titulo, descricao, video_url, thumbnail, pdf_path, duracao, autor, categoria, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [titulo, descricao || '', video_url, thumbnail || '', pdf_path || '', duracao || '00:00', autor || 'MAANAIM', categoria || 'estudos', ativo !== undefined ? ativo : 1],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            console.log('[DEBUG API] Aula criada com ID:', this.lastID, '- pdf_path:', pdf_path);
            res.status(201).json({ message: 'Aula criada!', id: this.lastID });
        });
});

// Atualizar aula
app.put('/api/admin/aulas/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { titulo, descricao, video_url, thumbnail, pdf_path, duracao, autor, categoria, ativo } = req.body;
    
    console.log('[DEBUG API] PUT /api/admin/aulas/' + id + ' recebido');
    console.log('[DEBUG API] pdf_path recebido:', pdf_path);

    db.run("UPDATE aulas SET titulo = ?, descricao = ?, video_url = ?, thumbnail = ?, pdf_path = ?, duracao = ?, autor = ?, categoria = ?, ativo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [titulo, descricao || '', video_url, thumbnail || '', pdf_path || '', duracao || '00:00', autor || 'MAANAIM', categoria || 'estudos', ativo !== undefined ? ativo : 1, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Aula não encontrada' });
            console.log('[DEBUG API] Aula atualizada, ID:', id, '- pdf_path:', pdf_path);
            res.json({ message: 'Aula atualizada!' });
        });
});

// Excluir aula
app.delete('/api/admin/aulas/:id', verifyAdmin, (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM aulas WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Aula não encontrada' });
        res.json({ message: 'Aula excluída!' });
    });
});

// Incrementar visualizações e registrar quem assistiu
app.post('/api/aulas/:id/views', (req, res) => {
    const { id } = req.params;
    const usuarioId = req.body && req.body.usuario_id ? req.body.usuario_id : null;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const tempoAssistido = req.body && req.body.tempo_assistido ? req.body.tempo_assistido : 0;
    
    console.log('[DEBUG API] POST /api/aulas/' + id + '/views');
    console.log('[DEBUG API] - usuario_id recebido:', usuarioId);
    console.log('[DEBUG API] - ip:', ipAddress);
    console.log('[DEBUG API] - req.body completo:', JSON.stringify(req.body));
    
    // Incrementar visualizações na tabela de aulas
    db.run("UPDATE aulas SET visualizacoes = visualizacoes + 1 WHERE id = ?", [id], function(err) {
        if (err) {
            console.error('[DEBUG API] Erro ao atualizar visualizações:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Registrar visualização detalhada
        db.run("INSERT INTO visualizacoes_aulas (aula_id, usuario_id, ip_address, tempo_assistido) VALUES (?, ?, ?, ?)", 
            [id, usuarioId, ipAddress, tempoAssistido], 
            function(err2) {
                if (err2) {
                    console.error('[DEBUG API] Erro ao registrar visualização:', err2);
                }
                res.json({ message: 'Visualização registrada' });
            });
    });
});

// Atualizar tempo assistido (sem incrementar visualização)
app.post('/api/aulas/:id/tempo', (req, res) => {
    const { id } = req.params;
    const tempoAssistido = req.body && req.body.tempo_assistido ? parseInt(req.body.tempo_assistido) : 0;
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    
    console.log('[DEBUG API] POST /api/aulas/' + id + '/tempo - tempo:', tempoAssistido, '- IP:', ipAddress);
    
    // Primeiro verifica se já existe registro recente (últimos 30 minutos)
    const trintaMinutosAtras = Date.now() - (30 * 60 * 1000);
    
    db.get(`SELECT id, tempo_assistido FROM visualizacoes_aulas 
            WHERE aula_id = ? AND ip_address = ? AND data_visualizacao > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
            ORDER BY data_visualizacao DESC LIMIT 1`, 
        [id, ipAddress], 
        function(err, row) {
            if (err) {
                console.error('[DEBUG API] Erro ao buscar visualização:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (row) {
                // Atualiza o tempo existente (substitui pelo novo tempo enviado)
                // O frontend envia o tempo total desde o início, não o incremento
                db.run("UPDATE visualizacoes_aulas SET tempo_assistido = ? WHERE id = ?", 
                    [tempoAssistido, row.id], 
                    function(err2) {
                        if (err2) {
                            console.error('[DEBUG API] Erro ao atualizar tempo:', err2);
                        }
                        res.json({ message: 'Tempo atualizado', tempo: tempoAssistido });
                    });
            } else {
                // Se não encontrou registro recente, cria um novo
                db.run("INSERT INTO visualizacoes_aulas (aula_id, usuario_id, ip_address, tempo_assistido) VALUES (?, ?, ?, ?)", 
                    [id, null, ipAddress, tempoAssistido], 
                    function(err2) {
                        if (err2) {
                            console.error('[DEBUG API] Erro ao registrar tempo:', err2);
                        }
                        res.json({ message: 'Tempo registrado' });
                    });
            }
        });
});

// Listar visualizações de todas as aulas (admin) - agrupadas por vídeo
app.get('/api/admin/biblioteca/visualizacoes', verifyAdmin, (req, res) => {
    console.log('[DEBUG API] GET /api/admin/biblioteca/visualizacoes');
    db.all(`
        SELECT 
            v.id as visualizacao_id,
            v.aula_id,
            v.usuario_id,
            v.ip_address,
            v.data_visualizacao,
            v.tempo_assistido,
            a.titulo as aula_titulo,
            a.thumbnail as aula_thumbnail,
            u.username as usuario_nome,
            u.email as usuario_email
        FROM visualizacoes_aulas v
        LEFT JOIN aulas a ON v.aula_id = a.id
        LEFT JOIN users u ON v.usuario_id = u.id
        ORDER BY a.titulo, v.data_visualizacao DESC
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        console.log('[DEBUG API] Visualizações encontradas:', rows.length);
        
        // Agrupar por aula_id
        const grouped = {};
        rows.forEach(row => {
            if (!grouped[row.aula_id]) {
                grouped[row.aula_id] = {
                    aula_id: row.aula_id,
                    aula_titulo: row.aula_titulo,
                    aula_thumbnail: row.aula_thumbnail,
                    visualizacoes: []
                };
            }
            grouped[row.aula_id].visualizacoes.push({
                visualizacao_id: row.visualizacao_id,
                usuario_id: row.usuario_id,
                usuario_nome: row.usuario_nome,
                usuario_email: row.usuario_email,
                ip_address: row.ip_address,
                data_visualizacao: row.data_visualizacao,
                tempo_assistido: row.tempo_assistido
            });
        });
        
        // Converter para array
        const resultado = Object.values(grouped);
        res.json(resultado);
    });
});

// Estatísticas da biblioteca (admin)
app.get('/api/admin/biblioteca/estatisticas', verifyAdmin, (req, res) => {
    console.log('[DEBUG API] GET /api/admin/biblioteca/estatisticas');
    db.all(`
        SELECT 
            a.id,
            a.titulo,
            a.visualizacoes as visualizacoes_total,
            COUNT(DISTINCT v.usuario_id) as usuarios_unicos,
            COUNT(v.id) as total_visualizacoes
        FROM aulas a
        LEFT JOIN visualizacoes_aulas v ON a.id = v.aula_id
        GROUP BY a.id, a.titulo, a.visualizacoes
        ORDER BY a.visualizacoes DESC
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ✅ Static files (SEMPRE POR ÚLTIMO)
// Headers para evitar cache
app.use((req, res, next) => {
    if (req.url.endsWith('.js') || req.url.endsWith('.css')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
    next();
});

// Servir arquivos estáticos com cache desabilitado para desenvolvimento
app.use("/", express.static(path.join(__dirname), {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders: function (res, path) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
}));

app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders: function (res, path) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
}));

// Servir node_modules (bibliotecas) com cache
app.use("/node_modules", express.static(path.join(__dirname, "node_modules")));

// Endpoint para servir CSS com cache desabilitado
app.get('/api/css', (req, res) => {
    const cssPath = path.join(__dirname, 'css', 'styles.css');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Content-Type', 'text/css');
    fs.readFile(cssPath, 'utf8', (err, data) => {
        if (err) {
            return res.status(404).send('CSS not found');
        }
        res.send(data);
    });
});

// ROTAS PARA PÁGINAS HTML (sem extensão) - sem cache
app.get('/login', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/admin', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/membro', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'membro.html'));
});

app.get('/programacao', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'programacao.html'));
});

app.get('/aulas', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'aulas.html'));
});

app.get('/biblia', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'biblia.html'));
});

app.get('/editor', (req, res) => {
    console.log('📝 EDITOR: Requisição recebida para /editor');
    console.log('📝 EDITOR: Query params:', req.query);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'editor.html'));
});

// Middleware de erro para retornar JSON
app.use((err, req, res, next) => {
    console.error('Erro:', err);
    res.status(500).json({ error: err.message || 'Erro interno do servidor' });
});

// Iniciar o servidor - primeiro inicializar o banco de dados
initDatabase((err) => {
    if (err) {
        console.error('❌ Erro ao iniciar banco de dados:', err);
        process.exit(1);
    }
    
    // Carregar bíblia JSON após banco de dados
    carregarBibliaJSON();
    
    app.listen(PORT, () => {
        console.log(`✅ MAANAIM Server: http://localhost:${PORT}`);
    });
});
