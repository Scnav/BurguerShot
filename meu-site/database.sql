-- Script SQL para criar todas as tabelas do site MAANAIM
-- Execute este script no seu banco de dados MySQL na Hostinger

-- ============================================
-- TABELA DE USUÁRIOS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'frequentador',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DE NOTÍCIAS
-- ============================================
CREATE TABLE IF NOT EXISTS noticias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DE EVENTOS
-- ============================================
CREATE TABLE IF NOT EXISTS eventos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo TEXT NOT NULL,
    data DATE NOT NULL,
    horario TIME,
    local VARCHAR(255),
    tem_inscricao TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DE CONTEÚDO DAS PÁGINAS
-- ============================================
CREATE TABLE IF NOT EXISTS page_content (
    id INT AUTO_INCREMENT PRIMARY KEY,
    section VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255),
    content TEXT,
    link VARCHAR(500),
    image VARCHAR(500),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DE CONFIGURAÇÃO DO YOUTUBE
-- ============================================
CREATE TABLE IF NOT EXISTS youtube_config (
    id INT AUTO_INCREMENT PRIMARY KEY CHECK (id = 1),
    channel_id VARCHAR(255),
    channel_name VARCHAR(255),
    enabled TINYINT(1) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Inserir configuração padrão
INSERT IGNORE INTO youtube_config (id, channel_id, channel_name, enabled) VALUES (1, '', '', 0);

-- ============================================
-- TABELA DE MENSAGENS
-- ============================================
CREATE TABLE IF NOT EXISTS mensagens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo TEXT NOT NULL,
    conteudo TEXT,
    video_url VARCHAR(500),
    data_publicacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ativa TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DE MINISTÉRIOS
-- ============================================
CREATE TABLE IF NOT EXISTS ministerios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo TEXT NOT NULL,
    descricao TEXT,
    icone VARCHAR(100) DEFAULT 'fas fa-church',
    ordem INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DE CULTOS
-- ============================================
CREATE TABLE IF NOT EXISTS cultos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo TEXT NOT NULL,
    horario TIME,
    local VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DE INSCRIÇÕES EM EVENTOS
-- ============================================
CREATE TABLE IF NOT EXISTS inscricoes_eventos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    evento_id INT NOT NULL,
    nome TEXT NOT NULL,
    email VARCHAR(255),
    telefone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DE TÓPICOS BÍBLICOS
-- ============================================
CREATE TABLE IF NOT EXISTS topicos_biblia (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DE ÁREA DO MEMBRO
-- ============================================
CREATE TABLE IF NOT EXISTS area_membro (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DE VÍDEO AULAS
-- ============================================
CREATE TABLE IF NOT EXISTS aulas (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DE VISUALIZAÇÕES DE AULAS (BIBLIOTECA)
-- ============================================
CREATE TABLE IF NOT EXISTS visualizacoes_aulas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    aula_id INT NOT NULL,
    usuario_id INT,
    ip_address VARCHAR(45),
    data_visualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tempo_assistido INT DEFAULT 0,
    FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DE GALERIA DE IMAGENS
-- ============================================
CREATE TABLE IF NOT EXISTS gallery (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    url VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABELA DA BÍBLIA (para busca FTS)
-- ============================================
CREATE TABLE IF NOT EXISTS biblia_livros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    abreviacao VARCHAR(20),
    testamento ENUM('velho', 'novo') DEFAULT 'velho',
    ordem INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS biblia_versiculos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    livro_id INT NOT NULL,
    capitulo INT NOT NULL,
    versiculo INT NOT NULL,
    texto TEXT NOT NULL,
    FOREIGN KEY (livro_id) REFERENCES biblia_livros(id) ON DELETE CASCADE,
    INDEX idx_livro_capitulo (livro_id, capitulo),
    FULLTEXT INDEX idx_texto (texto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
