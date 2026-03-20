// Módulo de Banco de Dados MySQL - Hostinger
// Apenas MySQL, sem SQLite

console.log('📦 Carregando módulo de banco de dados...');

const mysql = require('mysql2');
const dbConfig = require('./db.config');

console.log('📋 Configuração do banco:');
console.log('   Host:', dbConfig.host);
console.log('   User:', dbConfig.user);
console.log('   Database:', dbConfig.database);

let pool;
let isMySQL = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Wrapper para compatibilidade com código existente (callbacks)
const db = {
    // Para SELECT que retorna uma linha
    get: (sql, params, callback) => {
        console.log('📊 DB GET:', sql.substring(0, 100), params);
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        if (!pool) {
            console.error('❌ DB GET Error: Pool não inicializada');
            return callback(new Error('Banco de dados não conectado'));
        }
        pool.query(sql, params, (err, rows) => {
            if (err) {
                console.error('❌ DB GET Error:', err.message);
                return callback(err);
            }
            callback(null, rows[0] || null);
        });
    },
    
    // Para SELECT que retorna múltiplas linhas
    all: (sql, params, callback) => {
        console.log('📊 DB ALL:', sql.substring(0, 100), params);
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        if (!pool) {
            console.error('❌ DB ALL Error: Pool não inicializada');
            return callback(new Error('Banco de dados não conectado'));
        }
        pool.query(sql, params, (err, rows) => {
            if (err) {
                console.error('❌ DB ALL Error:', err.message);
                return callback(err);
            }
            callback(null, rows);
        });
    },
    
    // Para INSERT, UPDATE, DELETE
    run: (sql, params, callback) => {
        console.log('📊 DB RUN:', sql.substring(0, 100), params);
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        if (!pool) {
            console.error('❌ DB RUN Error: Pool não inicializada');
            return callback(new Error('Banco de dados não conectado'));
        }
        pool.query(sql, params, (err, result) => {
            if (err) {
                console.error('❌ DB RUN Error:', err.message);
                return callback(err);
            }
            callback(null, { 
                lastID: result.insertId || 0, 
                changes: result.affectedRows || 0 
            });
        });
    },
    
    // Para serialização (não necessária no MySQL, mas mantida para compatibilidade)
    serialize: (callback) => {
        callback();
    }
};

// Função para criar o pool com configurações de estabilidade
function createPool() {
    console.log('🔄 Criando pool de conexões MySQL...');
    
    const newPool = mysql.createPool({
        host: dbConfig.host || 'localhost',
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        waitForConnections: true,
        connectionLimit: dbConfig.connectionLimit || 10,
        queueLimit: 0,
        // Configurações de keep-alive para evitar desconexão
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        // Timeout de conexão
        connectTimeout: 10000,
        // Timeout de inatividade
        idleTimeout: 60000
    });
    
    return newPool;
}

// Função para testar e reconectar se necessário
function testConnection() {
    if (!pool) return false;
    
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('❌ Erro ao testar conexão:', err.message);
            attemptReconnect();
            return;
        }
        console.log('✅ Conexão ativa verificada');
        connection.release();
        reconnectAttempts = 0; // Reset contador de tentativas
    });
    return true;
}

// Função para tentar reconectar
function attemptReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ Máximo de tentativas de reconexão atingido');
        return;
    }
    
    reconnectAttempts++;
    console.log(`🔄 Tentando reconectar... (tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    
    // Fechar pool antigo se existir
    if (pool) {
        try {
            pool.end();
        } catch (e) {
            console.log('Erro ao fechar pool antigo:', e.message);
        }
    }
    
    // Tentar novamente após 5 segundos
    setTimeout(() => {
        initDatabase((err) => {
            if (err) {
                console.error('❌ Falha na reconexão:', err.message);
            } else {
                console.log('✅ Reconexão bem-sucedida!');
                reconnectAttempts = 0;
            }
        });
    }, 5000);
}

// Inicializar banco de dados MySQL
function initDatabase(callback) {
    console.log('===========================================');
    console.log('📦 Tentando conectar ao MySQL da Hostinger...');
    console.log('   Host:', dbConfig.host || 'localhost');
    console.log('   User:', dbConfig.user);
    console.log('   Database:', dbConfig.database);
    console.log('===========================================');
    
    // Primeiro conecta sem banco para criar se não existir
    const initialPool = mysql.createPool({
        host: dbConfig.host || 'localhost',
        user: dbConfig.user,
        password: dbConfig.password,
        waitForConnections: true,
        connectionLimit: 2,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
    });
    
    // Criar banco se não existir
    console.log('🔄 Criando/verificando banco de dados...');
    initialPool.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, (err) => {
        if (err) {
            console.log('Erro ao criar banco:', err.message);
        } else {
            console.log('✅ Banco de dados verificado/criado!');
        }
        
        // Agora conecta ao banco específico
        console.log('🔄 Conectando ao banco específico...');
        initialPool.end((err) => {
            pool = createPool();
            
            // Testar conexão
            console.log('🔄 Testando conexão com o banco...');
            pool.getConnection((err, connection) => {
                if (err) {
                    console.error('❌ Erro ao conectar no MySQL:', err.message);
                    if (callback) callback(err);
                    return;
                }
                
                console.log('✅ Conectado ao MySQL com sucesso!');
                console.log('📦 Conexão obtida, criando tabelas...');
                connection.release();
                isMySQL = true;
                
                // Iniciar teste de conexão periódica (a cada 5 minutos)
                setInterval(testConnection, 5 * 60 * 1000);
                console.log('✅ Timer de verificação de conexão iniciado (a cada 5 min)');
                
                // Criar tabelas automaticamente
                createMySQLTables(pool, callback);
            });
        });
    });
}

// Criar tabelas no MySQL automaticamente
function createMySQLTables(pool, callback) {
    console.log('📦 Criando tabelas no MySQL...');
    
    const tables = [
        `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255),
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'frequentador',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS noticias (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo TEXT NOT NULL,
            conteudo TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS eventos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo TEXT NOT NULL,
            data DATE,
            horario VARCHAR(50),
            local VARCHAR(255),
            imagem VARCHAR(500),
            imagens JSON,
            tem_inscricao TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS page_content (
            id INT AUTO_INCREMENT PRIMARY KEY,
            section VARCHAR(255) UNIQUE NOT NULL,
            title VARCHAR(255),
            content TEXT,
            link VARCHAR(500),
            image VARCHAR(500),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS youtube_config (
            id INT AUTO_INCREMENT PRIMARY KEY CHECK (id = 1),
            channel_id VARCHAR(255),
            channel_name VARCHAR(255),
            enabled TINYINT(1) DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS mensagens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo TEXT NOT NULL,
            conteudo TEXT,
            video_url VARCHAR(500),
            data_publicacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ativa TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS ministerios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo TEXT NOT NULL,
            descricao TEXT,
            icone VARCHAR(100) DEFAULT 'fas fa-church',
            ordem INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS cultos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo TEXT NOT NULL,
            horario VARCHAR(50),
            local VARCHAR(255),
            imagem VARCHAR(500),
            imagens JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS inscricoes_eventos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            evento_id INT NOT NULL,
            nome TEXT NOT NULL,
            email VARCHAR(255),
            telefone VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS topicos_biblia (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo TEXT NOT NULL,
            descricao TEXT,
            conteudo TEXT,
            categoria VARCHAR(100) DEFAULT 'geral',
            icone VARCHAR(100) DEFAULT 'fas fa-book-bible',
            ordem INT DEFAULT 0,
            ativo TINYINT(1) DEFAULT 1,
            data_publicacao DATETIME,
            hora_publicacao TIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS area_membro (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo TEXT NOT NULL,
            descricao TEXT,
            conteudo TEXT,
            pdf_path VARCHAR(500),
            categoria VARCHAR(100) NOT NULL,
            icone VARCHAR(100) DEFAULT 'fas fa-book',
            ordem INT DEFAULT 0,
            ativo TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS aulas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo TEXT NOT NULL,
            descricao TEXT,
            video_url TEXT NOT NULL,
            thumbnail VARCHAR(500),
            pdf_path VARCHAR(500),
            duracao VARCHAR(10) DEFAULT '00:00',
            autor VARCHAR(100) DEFAULT 'MAANAIM',
            categoria VARCHAR(100) DEFAULT 'estudos',
            visualizacoes INT DEFAULT 0,
            ativo TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS gallery (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL,
            original_name VARCHAR(255),
            url VARCHAR(500) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        
        `CREATE TABLE IF NOT EXISTS visualizacoes_aulas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            aula_id INT NOT NULL,
            usuario_id INT,
            ip_address VARCHAR(45),
            data_visualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            tempo_assistido INT DEFAULT 0,
            FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE CASCADE,
            FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ];
    
    // Criar tabelas uma por uma
    function createNextTable(index) {
        if (index >= tables.length) {
            // Verificar e adicionar colunas que podem faltar
            const alterTables = [
                // Modificar coluna 'horario' de TIME para VARCHAR em cultos
                "ALTER TABLE cultos MODIFY COLUMN horario VARCHAR(50)",
                // Modificar coluna 'horario' de TIME para VARCHAR em eventos
                "ALTER TABLE eventos MODIFY COLUMN horario VARCHAR(50)",
                // Adicionar coluna 'local' em eventos
                "ALTER TABLE eventos ADD COLUMN local VARCHAR(255)",
                // Adicionar coluna 'local' em cultos
                "ALTER TABLE cultos ADD COLUMN local VARCHAR(255)",
                // Adicionar coluna 'imagem' em eventos
                "ALTER TABLE eventos ADD COLUMN imagem VARCHAR(500)",
                // Adicionar coluna 'imagens' em eventos
                "ALTER TABLE eventos ADD COLUMN imagens JSON",
                // Adicionar coluna 'imagem' em cultos
                "ALTER TABLE cultos ADD COLUMN imagem VARCHAR(500)",
                // Adicionar coluna 'imagens' em cultos
                "ALTER TABLE cultos ADD COLUMN imagens JSON"
            ];
            
            function runAlterTable(i) {
                if (i >= alterTables.length) {
                    // Todas as alterações feitas, inserir config padrão
                    pool.query(`INSERT IGNORE INTO youtube_config (id, channel_id, channel_name, enabled) VALUES (1, '', '', 0)`, (err) => {
                        console.log('✅ Tabelas MySQL criadas/verificadas!');
                        if (callback) callback(null, { pool, isMySQL: true });
                    });
                    return;
                }
                
                // Tentar adicionar coluna, ignorar erro se já existir
                pool.query(alterTables[i], (err) => {
                    // Ignorar erro de coluna duplicada
                    runAlterTable(i + 1);
                });
            }
            
            runAlterTable(0);
            return;
        }
        
        pool.query(tables[index], (err) => {
            const tableName = tables[index].match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
            if (err && !err.message.includes('already exists')) {
                console.log(`  ⚠️  Erro na tabela ${tableName}:`, err.message);
            } else {
                console.log(`  ✅ Tabela ${tableName}`);
            }
            createNextTable(index + 1);
        });
    }
    
    createNextTable(0);
}

// Função para determinar se é MySQL
function checkIsMySQL() {
    return isMySQL;
}

module.exports = {
    initDatabase,
    db: db,
    getPool: () => pool,
    isMySQL: checkIsMySQL,
    testConnection
};
