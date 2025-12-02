const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function checkOverdueLoans()
{
  try {
    const now = new Date();
    const systemConfig = { loanDays: 14, toleranceDays: 2 };

    const loans = await db.query('SELECT * FROM loans WHERE status = ?', ['Active']);

    for(const loan of loans) {
      const returnDate = new Date(loan.return_date);
      const toleranceDate = new Date(returnDate);
      toleranceDate.setDate(toleranceDate.getDate() + systemConfig.toleranceDays);

      if(now > toleranceDate) {
        const existing = await db.query(
          'SELECT * FROM notifications WHERE loan_id = ? AND type = ? AND status = ?',
          [loan.id, 'overdue', 'pending']
        );

        if(existing.length === 0) {
          const [books] = await db.query('SELECT title FROM books WHERE id = ?', [loan.book_id]);

          await db.query(
            'INSERT INTO notifications (type, loan_id, member_id, message, status) VALUES (?, ?, ?, ?, ?)',
            [
              'overdue',
              loan.id,
              loan.member_id,
              `Empréstimo em atraso: "${books[0].title}" deveria ter sido devolvido em ${returnDate.toLocaleDateString('pt-BR')}`,
              'pending'
            ]
          );
        }
      }
    }
  } catch(error) {
    console.error('Erro ao verificar atrasos:', error);
  }
}

app.get('/api/reports/:type', async(req, res) => {
  const { type } = req.params;
  
  try {
    let report = {};

    if(type === 'most-borrowed') {
      const data = await db.query(`
        SELECT 
          b.id as bookId,
          b.title,
          b.author,
          COUNT(l.id) as loanCount
        FROM books b
        LEFT JOIN loans l ON b.id = l.book_id
        GROUP BY b.id
        ORDER BY loanCount DESC
        LIMIT 10
      `);

      report = {
        type: 'most-borrowed',
        title: 'Livros Mais Emprestados',
        data: data,
        generatedAt: new Date().toISOString()
      };
    }
    else if(type === 'active-members') {
      const data = await db.query(`
        SELECT 
          m.id as memberId,
          m.name,
          m.contact,
          COUNT(l.id) as loanCount,
          m.active_loans as activeLoans
        FROM members m
        LEFT JOIN loans l ON m.id = l.member_id
        GROUP BY m.id
        ORDER BY loanCount DESC
        LIMIT 10
      `);

      report = {
        type: 'active-members',
        title: 'Leitores Mais Ativos',
        data: data,
        generatedAt: new Date().toISOString()
      };
    }
    else if(type === 'overdue-summary') {
      const now = new Date();
      const systemConfig = { toleranceDays: 2 };

      const loans = await db.query(`
        SELECT 
          l.id as loanId,
          b.title as bookTitle,
          m.name as memberName,
          l.return_date as returnDate
        FROM loans l
        JOIN books b ON l.book_id = b.id
        JOIN members m ON l.member_id = m.id
        WHERE l.status = ?
      `, ['Active']);

      const overdueLoans = loans.filter(loan => {
        const returnDate = new Date(loan.returnDate);
        const toleranceDate = new Date(returnDate);
        toleranceDate.setDate(toleranceDate.getDate() + systemConfig.toleranceDays);
        return now > toleranceDate;
      }).map(loan => {
        const returnDate = new Date(loan.returnDate);
        const toleranceDate = new Date(returnDate);
        toleranceDate.setDate(toleranceDate.getDate() + systemConfig.toleranceDays);
        const daysOverdue = Math.floor((now - toleranceDate) / (1000 * 60 * 60 * 24));
        return { ...loan, daysOverdue };
      });

      report = {
        type: 'overdue-summary',
        title: 'Resumo de Atrasos',
        data: overdueLoans,
        totalOverdue: overdueLoans.length,
        generatedAt: new Date().toISOString()
      };
    }
    else if(type === 'collection-stats') {
      const [stats] = await db.query(`
        SELECT 
          SUM(count) as totalBooks,
          SUM(available) as availableBooks
        FROM books
      `);

      const categories = await db.query(`
        SELECT 
          category as name,
          SUM(count) as count
        FROM books
        GROUP BY category
      `);

      const totalTitles = await db.query('SELECT COUNT(*) as count FROM books');

      const totalBooks = stats.totalBooks || 0;
      const availableBooks = stats.availableBooks || 0;
      const loanedBooks = totalBooks - availableBooks;

      report = {
        type: 'collection-stats',
        title: 'Estatísticas do Acervo',
        data: {
          totalBooks,
          availableBooks,
          loanedBooks,
          utilizationRate: totalBooks > 0 ? ((loanedBooks / totalBooks) * 100).toFixed(1) : 0,
          totalTitles: totalTitles[0].count,
          categories: categories
        },
        generatedAt: new Date().toISOString()
      };
    }
    else {
      return res.status(400).json({error: 'Tipo de relatório inválido'});
    }

    res.json(report);
  } catch(error) {
    console.error('Erro ao gerar relatório:', error);
    res.status(500).json({error: 'Erro ao gerar relatório'});
  }
});

app.get('/api/notifications', async(_, res) => {
  try {
    const notifications = await db.query('SELECT * FROM notifications ORDER BY created_at DESC');
    res.json(notifications);
  } catch(error) {
    res.status(500).json({error: 'Erro ao buscar notificações'});
  }
});

app.put('/api/notifications/:id/read', async(req, res) => {
  const notificationId = parseInt(req.params.id);
  
  try {
    await db.query(
      'UPDATE notifications SET status = ?, read_at = NOW() WHERE id = ?',
      ['read', notificationId]
    );

    const [notification] = await db.query('SELECT * FROM notifications WHERE id = ?', [notificationId]);
    res.json(notification[0]);
  } catch(error) {
    res.status(500).json({error: 'Erro ao atualizar notificação'});
  }
});

app.get('/api/books', async(_, res) => {
  try {
    const books = await db.query('SELECT * FROM books ORDER BY title');
    res.json(books);
  } catch(error) {
    res.status(500).json({error: 'Erro ao buscar livros'});
  }
});

app.post('/api/books', async(req, res) => {
  const {title, author, category, count} = req.body;
  
  if(!title || !author || !count)
    return res.status(400).json({error: 'Campos obrigatórios: title, author, count'});

  try {
    const result = await db.query(
      'INSERT INTO books (title, author, category, count, available) VALUES (?, ?, ?, ?, ?)',
      [title, author, category || 'Não categorizado', count, count]
    );

    const book = {
      id: result.insertId,
      title,
      author,
      category: category || 'Não categorizado',
      count,
      available: count
    };

    res.status(201).json(book);
  } catch(error) {
    res.status(500).json({error: 'Erro ao cadastrar livro'});
  }
});

app.get('/api/members', async(_, res) => {
  try {
    const members = await db.query('SELECT * FROM members ORDER BY name');
    res.json(members);
  } catch(error) {
    res.status(500).json({error: 'Erro ao buscar membros'});
  }
});

app.post('/api/members', async(req, res) => {
  const {name, contact, email} = req.body;

  if(!name || !contact)
    return res.status(400).json({error: 'Campos obrigatórios: name, contact'});

  try {
    const result = await db.query(
      'INSERT INTO members (name, contact, email, active_loans) VALUES (?, ?, ?, 0)',
      [name, contact, email || '']
    );

    const member = {
      id: result.insertId,
      name,
      contact,
      email: email || '',
      activeLoans: 0
    };

    res.status(201).json(member);
  } catch(error) {
    res.status(500).json({error: 'Erro ao cadastrar membro'});
  }
});

app.get('/api/loans', async(_, res) => {
  try {
    const loans = await db.query(`
      SELECT 
        l.*,
        b.title as bookTitle,
        m.name as memberName
      FROM loans l
      JOIN books b ON l.book_id = b.id
      JOIN members m ON l.member_id = m.id
      ORDER BY l.loan_date DESC
    `);

    const formattedLoans = loans.map(loan => ({
      id: loan.id,
      bookId: loan.book_id,
      memberId: loan.member_id,
      bookTitle: loan.bookTitle,
      memberName: loan.memberName,
      loanDate: loan.loan_date,
      returnDate: loan.return_date,
      returnedDate: loan.returned_date,
      status: loan.status
    }));

    res.json(formattedLoans);
  } catch(error) {
    res.status(500).json({error: 'Erro ao buscar empréstimos'});
  }
});

app.post('/api/loans', async(req, res) => {
  const {bookId, memberId, loanDate, returnDate} = req.body;

  if(!bookId || !memberId)
    return res.status(400).json({error: 'Campos obrigatórios: bookId, memberId'});

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [books] = await connection.query('SELECT * FROM books WHERE id = ?', [bookId]);
    const [members] = await connection.query('SELECT * FROM members WHERE id = ?', [memberId]);

    if(books.length === 0 || members.length === 0) {
      await connection.rollback();
      return res.status(404).json({error: 'Livro ou membro não encontrado'});
    }

    const book = books[0];
    const member = members[0];

    if(book.available <= 0) {
      await connection.rollback();
      return res.status(400).json({error: 'Livro não disponível'});
    }

    if(member.active_loans >= 3) {
      await connection.rollback();
      return res.status(400).json({error: 'Limite de empréstimos atingido'});
    }

    const [result] = await connection.query(
      'INSERT INTO loans (book_id, member_id, loan_date, return_date, status) VALUES (?, ?, ?, ?, ?)',
      [bookId, memberId, loanDate, returnDate, 'Active']
    );

    await connection.query('UPDATE books SET available = available - 1 WHERE id = ?', [bookId]);
    await connection.query('UPDATE members SET active_loans = active_loans + 1 WHERE id = ?', [memberId]);

    await connection.commit();

    const loan = {
      id: result.insertId,
      bookId,
      memberId,
      bookTitle: book.title,
      memberName: member.name,
      loanDate,
      returnDate,
      status: 'Active'
    };

    res.status(201).json(loan);
  } catch(error) {
    await connection.rollback();
    res.status(500).json({error: 'Erro ao registrar empréstimo'});
  } finally {
    connection.release();
  }
});

app.put('/api/loans/:id/return', async(req, res) => {
  const loanId = parseInt(req.params.id);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [loans] = await connection.query('SELECT * FROM loans WHERE id = ?', [loanId]);

    if(loans.length === 0) {
      await connection.rollback();
      return res.status(404).json({error: 'Empréstimo não encontrado'});
    }

    const loan = loans[0];

    if(loan.status !== 'Active') {
      await connection.rollback();
      return res.status(400).json({error: 'Empréstimo já foi devolvido'});
    }

    await connection.query(
      'UPDATE loans SET status = ?, returned_date = NOW() WHERE id = ?',
      ['Devolvido', loanId]
    );

    await connection.query('UPDATE books SET available = available + 1 WHERE id = ?', [loan.book_id]);
    await connection.query('UPDATE members SET active_loans = active_loans - 1 WHERE id = ?', [loan.member_id]);

    await connection.query(
      'UPDATE notifications SET status = ?, resolved_at = NOW() WHERE loan_id = ? AND status = ?',
      ['resolved', loanId, 'pending']
    );

    await connection.commit();

    res.json({message: 'Devolução registrada com sucesso'});
  } catch(error) {
    await connection.rollback();
    res.status(500).json({error: 'Erro ao registrar devolução'});
  } finally {
    connection.release();
  }
});

app.get('/api/reservations', async(_, res) => {
  try {
    const reservations = await db.query(`
      SELECT 
        r.*,
        b.title as bookTitle,
        m.name as memberName
      FROM reservations r
      JOIN books b ON r.book_id = b.id
      JOIN members m ON r.member_id = m.id
      ORDER BY r.reservation_date DESC
    `);

    const formatted = reservations.map(r => ({
      id: r.id,
      bookId: r.book_id,
      memberId: r.member_id,
      bookTitle: r.bookTitle,
      memberName: r.memberName,
      reservationDate: new Date(r.reservation_date).toLocaleDateString('pt-BR'),
      status: r.status
    }));

    res.json(formatted);
  } catch(error) {
    res.status(500).json({error: 'Erro ao buscar reservas'});
  }
});

app.post('/api/reservations', async(req, res) => {
  const {bookId, memberId} = req.body;

  if(!bookId || !memberId)
    return res.status(400).json({error: 'Campos obrigatórios: bookId, memberId'});

  try {
    const existing = await db.query(
      'SELECT * FROM reservations WHERE book_id = ? AND member_id = ? AND status = ?',
      [bookId, memberId, 'Active']
    );

    if(existing.length > 0)
      return res.status(400).json({error: 'Já existe uma reserva ativa para este livro'});

    const [books] = await db.query('SELECT * FROM books WHERE id = ?', [bookId]);
    const [members] = await db.query('SELECT * FROM members WHERE id = ?', [memberId]);

    if(books.length === 0 || members.length === 0)
      return res.status(404).json({error: 'Livro ou membro não encontrado'});

    const result = await db.query(
      'INSERT INTO reservations (book_id, member_id, status) VALUES (?, ?, ?)',
      [bookId, memberId, 'Active']
    );

    const reservation = {
      id: result.insertId,
      bookId,
      memberId,
      bookTitle: books[0].title,
      memberName: members[0].name,
      reservationDate: new Date().toLocaleDateString('pt-BR'),
      status: 'Active'
    };

    res.status(201).json(reservation);
  } catch(error) {
    res.status(500).json({error: 'Erro ao criar reserva'});
  }
});

app.put('/api/reservations/:id/cancel', async(req, res) => {
  const reservationId = parseInt(req.params.id);
  
  if(!reservationId)
    return res.status(400).json({error: 'ID da reserva é obrigatório'});

  try {
    const [reservations] = await db.query('SELECT * FROM reservations WHERE id = ?', [reservationId]);

    if(reservations.length === 0)
      return res.status(404).json({error: 'Reserva não encontrada'});

    if(reservations[0].status !== 'Active')
      return res.status(400).json({error: 'Só é possível cancelar reservas ativas'});

    await db.query('UPDATE reservations SET status = ? WHERE id = ?', ['Cancelled', reservationId]);

    res.json({...reservations[0], status: 'Cancelled'});
  } catch(error) {
    res.status(500).json({error: 'Erro ao cancelar reserva'});
  }
});

app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _, res, next) => {
  console.error(err.stack);
  res.status(500).json({error: 'Erro interno do servidor'});
});

setInterval(checkOverdueLoans, 5 * 60 * 1000);

async function startServer()
{
  try {
    console.log('\nStarting server...');
    await db.init();
    await checkOverdueLoans();

    app.listen(PORT, () => {
      console.log('\nServer started at http://localhost:3000/');
      console.log('Sistema de notificações de atraso ativado!');
    });
  } catch(error) {
    console.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async() => { 
  await db.close();
  process.exit(0); 
});

process.on('SIGTERM', async() => { 
  await db.close();
  process.exit(0); 
});

startServer();
