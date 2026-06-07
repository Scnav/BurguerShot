const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = process.env.DB_PATH || './database.sqlite';

// Create or open the database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    // Don't exit the application, let it continue and handle errors gracefully
  } else {
    console.log('Connected to the SQLite database.');
    // Initialize tables
    initializeTables();
  }
});

// Function to initialize tables
function initializeTables() {
  db.serialize(() => {
    // Jobs table
    db.run(`CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT,
      keyword TEXT,
      target_audience TEXT,
      main_product TEXT,
      status TEXT DEFAULT 'draft_pauta',
      current_step TEXT DEFAULT 'draft_pauta',
      priority INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        console.error('Error creating jobs table:', err.message);
      } else {
        console.log('Jobs table created or already exists');
      }
    });

    // Products table
    db.run(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      name TEXT NOT NULL,
      brand TEXT,
      price REAL,
      rating REAL,
      review_count INTEGER DEFAULT 0,
      warranty TEXT,
      specs_json TEXT, -- JSON string
      pros_json TEXT, -- JSON string
      cons_json TEXT, -- JSON string
      is_main BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs (id)
    )`, (err) => {
      if (err) {
        console.error('Error creating products table:', err.message);
      } else {
        console.log('Products table created or already exists');
      }
    });

    // Job steps table
    db.run(`CREATE TABLE IF NOT EXISTS job_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      step_name TEXT NOT NULL,
      status TEXT DEFAULT 'pending', -- pending, in_progress, completed, failed
      input_json TEXT, -- JSON string
      output_json TEXT, -- JSON string
      prompt_version TEXT,
      started_at DATETIME,
      finished_at DATETIME,
      FOREIGN KEY (job_id) REFERENCES jobs (id)
    )`, (err) => {
      if (err) {
        console.error('Error creating job_steps table:', err.message);
      } else {
        console.log('Job steps table created or already exists');
      }
    });

    // Articles table
    db.run(`CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      title TEXT NOT NULL,
      slug TEXT UNIQUE,
      meta_description TEXT,
      markdown_content TEXT,
      html_content TEXT,
      faq_json TEXT, -- JSON string
      schema_json TEXT, -- JSON string
      qa_score REAL DEFAULT 0,
      publish_status TEXT DEFAULT 'draft', -- draft, published, scheduled
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs (id)
    )`, (err) => {
      if (err) {
        console.error('Error creating articles table:', err.message);
      } else {
        console.log('Articles table created or already exists');
      }
    });

    // Logs table
    db.run(`CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      level TEXT DEFAULT 'info', -- info, warn, error
      message TEXT NOT NULL,
      context_json TEXT, -- JSON string
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs (id)
    )`, (err) => {
      if (err) {
        console.error('Error creating logs table:', err.message);
      } else {
        console.log('Logs table created or already exists');
      }
    });

    // Create indexes for better performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`, (err) => {
      if (err) console.error('Error creating index on jobs status:', err.message);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_products_job_id ON products(job_id)`, (err) => {
      if (err) console.error('Error creating index on products job_id:', err.message);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_job_steps_job_id ON job_steps(job_id)`, (err) => {
      if (err) console.error('Error creating index on job_steps job_id:', err.message);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_articles_job_id ON articles(job_id)`, (err) => {
      if (err) console.error('Error creating index on articles job_id:', err.message);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_job_id ON logs(job_id)`, (err) => {
      if (err) console.error('Error creating index on logs job_id:', err.message);
    });
  });
}

// Helper function to check if tables exist
function checkTables() {
  db.serialize(() => {
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'", [], (err, row) => {
      if (err) {
        console.error('Error checking jobs table:', err.message);
      } else if (row) {
        console.log('Jobs table exists');
      } else {
        console.log('Jobs table does not exist');
      }
    });
    
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='products'", [], (err, row) => {
      if (err) {
        console.error('Error checking products table:', err.message);
      } else if (row) {
        console.log('Products table exists');
      } else {
        console.log('Products table does not exist');
      }
    });
  });
}

// Call checkTables after a short delay to ensure initialization is complete
setTimeout(checkTables, 1000);

// Wrapper function for database queries with error handling
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Database query error:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Wrapper function for database gets with error handling
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('Database get error:', err.message);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Wrapper function for database runs with error handling
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        console.error('Database run error:', err.message);
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

module.exports = {
  db,
  query,
  get,
  run
};