const mysql = require('mysql2/promise');

const DB_HOST = '172.20.240.1';
const DB_USER = 'wsl_user';
const DB_PASSWORD = '';
const DB_NAME = 'bibliosys';

class Database {
  constructor() {
    this.pool = null;
  }

  async connect() {
    try {
      this.pool = mysql.createPool({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });

      const connection = await this.pool.getConnection();
      connection.release();

      return true;
    } catch(error) {
      console.error('Erro ao conectar ao MySQL:', error.message);
      throw error;
    }
  }

  async init() {
    try {
      const tempPool = mysql.createPool({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD
      });

      await tempPool.query('CREATE DATABASE IF NOT EXISTS bibliosys');
      await tempPool.end();

      await this.connect();

      await this.createTables();
      await this.insertInitialData();

    } catch(error) {
      console.error('Erro ao inicializar banco:', error);
      throw error;
    }
  }

  async createTables() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS books (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        author VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        count INT NOT NULL DEFAULT 1,
        available INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_title (title),
        INDEX idx_author (author)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        active_loans INT DEFAULT 0,
        register_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS loans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        book_id INT NOT NULL,
        member_id INT NOT NULL,
        loan_date DATETIME NOT NULL,
        return_date DATETIME NOT NULL,
        returned_date DATETIME NULL,
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
        INDEX idx_status (status),
        INDEX idx_dates (loan_date, return_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS reservations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        book_id INT NOT NULL,
        member_id INT NOT NULL,
        reservation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'Active',
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        loan_id INT,
        member_id INT,
        message TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at DATETIME NULL,
        resolved_at DATETIME NULL,
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ];

    for(const table of tables)
      await this.pool.query(table);
  }

  async insertInitialData() {
    const [books] = await this.pool.query('SELECT COUNT(*) as count FROM books');
    if(books[0].count > 0)
        return;

    await this.pool.query(`
      INSERT INTO books (title, author, category, count, available) VALUES
      ('Dom Casmurro', 'Machado de Assis', 'Literatura Brasileira', 3, 3),
      ('O Pequeno Príncipe', 'Antoine de Saint-Exupéry', 'Literatura Infantil', 2, 2),
      ('1984', 'George Orwell', 'Ficção Científica', 2, 2),
      ('O Senhor dos Anéis', 'J.R.R. Tolkien', 'Fantasia', 3, 3)
    `);

    await this.pool.query(`
      INSERT INTO members (name, contact, email, active_loans) VALUES
      ('Ana Silva', '(34) 99999-9999', 'ana@email.com', 0),
      ('Carlos Santos', '(34) 88888-8888', 'carlos@email.com', 0),
      ('Maria Oliveira', '(34) 77777-7777', 'maria@email.com', 0)
    `);
  }

  async query(sql, params = []) {
    try {
      const [results] = await this.pool.query(sql, params);
      return results;
    } catch(error) {
      console.error('QUERY error:', error);
      throw error;
    }
  }

  async getConnection() {
    return await this.pool.getConnection();
  }

  async close() {
    if(this.pool)
      await this.pool.end();
  }
}

module.exports = new Database();
