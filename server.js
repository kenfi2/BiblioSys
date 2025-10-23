const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'database.json');

async function initDatabase()
{
  try {
    await fs.access(DB_FILE);
  } catch {
    const initialData = {
      books: [
        {
          id: 1,
          title: "Dom Casmurro",
          author: "Machado de Assis",
          category: "Literatura Brasileira",
          count: 3,
          available: 3
        },
        {
          id: 2,
          title: "O Pequeno Príncipe",
          author: "Antoine de Saint-Exupéry",
          category: "Literatura Infantil",
          count: 2,
          available: 2
        }
      ],
      members: [
        {
          id: 1,
          name: "Ana Silva",
          contact: "(34) 99999-9999",
          email: "ana@email.com",
          activeLoans: 0
        },
        {
          id: 2,
          name: "Carlos Santos",
          contact: "(34) 88888-8888",
          email: "carlos@email.com",
          activeLoans: 0
        }
      ],
      loans: [],
      reservations: [],
      notifications: [],
      nextId: {
        books: 3,
        members: 3,
        loans: 1,
        reservations: 1,
        notifications: 1
      }
    };
    await fs.writeFile(DB_FILE, JSON.stringify(initialData, null, 2));
  }
}

async function readDatabase()
{
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch(error) {
    console.error('Erro ao ler banco de dados:', error);
    return null;
  }
}

async function writeDatabase(data)
{
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch(error) {
    console.error('Erro ao escrever no banco de dados:', error);
    return false;
  }
}

async function checkOverdueLoans() {
  const db = await readDatabase();
  if(!db)
    return;

  const now = new Date();
  const systemConfig = {
    loanDays: 14,
    toleranceDays: 2
  };

  for(const loan of db.loans) {
    if(loan.status !== 'Active')
      continue;

    const returnDate = new Date(loan.returnDate);
    const toleranceDate = new Date(returnDate);
    toleranceDate.setDate(toleranceDate.getDate() + systemConfig.toleranceDays);

    if(now > toleranceDate) {
      const existingNotification = db.notifications.find(n => 
        n.loanId === loan.id && n.type === 'overdue' && n.status === 'pending'
      );

      if(!existingNotification) {
        const notification = {
          id: db.nextId.notifications++,
          type: 'overdue',
          loanId: loan.id,
          memberId: loan.memberId,
          memberName: loan.memberName,
          bookTitle: loan.bookTitle,
          message: `Empréstimo em atraso: "${loan.bookTitle}" deveria ter sido devolvido em ${returnDate.toLocaleDateString('pt-BR')}`,
          createdAt: new Date().toISOString(),
          status: 'pending'
        };

        db.notifications.push(notification);
        console.log(`Notificação criada: ${notification.message}`);
      }
    }
  }

  await writeDatabase(db);
}

app.get('/api/reports/:type', async(req, res) => {
  const { type } = req.params;
  const db = await readDatabase();
  
  if(!db)
    return res.status(500).json({error: 'Erro ao acessar banco de dados'});

  try {
    let report = {};

    switch(type) {
      case 'most-borrowed':
        const bookLoans = {};
        db.loans.forEach(loan => {
          bookLoans[loan.bookId] = (bookLoans[loan.bookId] || 0) + 1;
        });

        const sortedBooks = Object.entries(bookLoans)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([bookId, count]) => {
            const book = db.books.find(b => b.id === parseInt(bookId));
            return {
              bookId: parseInt(bookId),
              title: book ? book.title : 'Desconhecido',
              author: book ? book.author : 'Desconhecido',
              loanCount: count
            };
          });

        report = {
          type: 'most-borrowed',
          title: 'Livros Mais Emprestados',
          data: sortedBooks,
          generatedAt: new Date().toISOString()
        };
        break;

      case 'active-members':
        const memberLoans = {};
        db.loans.forEach(loan => {
          memberLoans[loan.memberId] = (memberLoans[loan.memberId] || 0) + 1;
        });

        const sortedMembers = Object.entries(memberLoans)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([memberId, count]) => {
            const member = db.members.find(m => m.id === parseInt(memberId));
            return {
              memberId: parseInt(memberId),
              name: member ? member.name : 'Desconhecido',
              contact: member ? member.contact : 'N/A',
              loanCount: count,
              activeLoans: member ? member.activeLoans : 0
            };
          });

        report = {
          type: 'active-members',
          title: 'Leitores Mais Ativos',
          data: sortedMembers,
          generatedAt: new Date().toISOString()
        };
        break;

      case 'overdue-summary':
        const now = new Date();
        const systemConfig = { toleranceDays: 2 };

        const overdueLoans = db.loans.filter(loan => {
          if(loan.status !== 'Active') return false;
          const returnDate = new Date(loan.returnDate);
          const toleranceDate = new Date(returnDate);
          toleranceDate.setDate(toleranceDate.getDate() + systemConfig.toleranceDays);
          return now > toleranceDate;
        }).map(loan => {
          const returnDate = new Date(loan.returnDate);
          const toleranceDate = new Date(returnDate);
          toleranceDate.setDate(toleranceDate.getDate() + systemConfig.toleranceDays);
          const daysOverdue = Math.floor((now - toleranceDate) / (1000 * 60 * 60 * 24));

          return {
            loanId: loan.id,
            bookTitle: loan.bookTitle,
            memberName: loan.memberName,
            returnDate: loan.returnDate,
            daysOverdue
          };
        });

        report = {
          type: 'overdue-summary',
          title: 'Resumo de Atrasos',
          data: overdueLoans,
          totalOverdue: overdueLoans.length,
          generatedAt: new Date().toISOString()
        };
        break;

      case 'collection-stats':
        const totalBooks = db.books.reduce((sum, b) => sum + b.count, 0);
        const availableBooks = db.books.reduce((sum, b) => sum + b.available, 0);
        const loanedBooks = totalBooks - availableBooks;

        const categoryCounts = {};
        db.books.forEach(book => {
          const cat = book.category || 'Sem categoria';
          categoryCounts[cat] = (categoryCounts[cat] || 0) + book.count;
        });

        report = {
          type: 'collection-stats',
          title: 'Estatísticas do Acervo',
          data: {
            totalBooks,
            availableBooks,
            loanedBooks,
            utilizationRate: ((loanedBooks / totalBooks) * 100).toFixed(1),
            totalTitles: db.books.length,
            categories: Object.entries(categoryCounts).map(([name, count]) => ({
              name,
              count
            }))
          },
          generatedAt: new Date().toISOString()
        };
        break;

      default:
        return res.status(400).json({error: 'Tipo de relatório inválido'});
    }

    res.json(report);
  } catch(error) {
    console.error('Erro ao gerar relatório:', error);
    res.status(500).json({error: 'Erro ao gerar relatório'});
  }
});

app.get('/api/notifications', async(_, res) => {
  const db = await readDatabase();
  if(!db)
    return res.status(500).json({error: 'Erro ao acessar banco de dados'});

  res.json(db.notifications || []);
});

app.put('/api/notifications/:id/read', async(req, res) => {
  const notificationId = parseInt(req.params.id);
  
  const db = await readDatabase();
  if(!db)
    return res.status(500).json({error: 'Erro ao acessar banco de dados'});

  const notification = db.notifications.find(n => n.id === notificationId);
  if(!notification)
    return res.status(404).json({error: 'Notificação não encontrada'});

  notification.status = 'read';
  notification.readAt = new Date().toISOString();

  if(await writeDatabase(db))
    res.json(notification);
  else
    res.status(500).json({error: 'Erro ao atualizar notificação'});
});

app.get('/api/books', async(_, res) => {
  const db = await readDatabase();
  if(!db)
    return res.status(500).json({error: 'Erro ao acessar banco de dados'});

  res.json(db.books);
});

app.post('/api/books', async(req, res) => {
  const {title, author, category, count} = req.body;
  
  if(!title || !author || !count)
    return res.status(400).json({error: 'Campos obrigatórios: title, author, count'});

  const db = await readDatabase();
  if(!db)
    return res.status(500).json({error: 'Erro ao acessar banco de dados'});

  const book = {
    id: db.nextId.books++,
    title,
    author,
    category: category || 'Não categorizado',
    count: parseInt(count),
    available: parseInt(count)
  };
  
  db.books.push(book);
  
  if(await writeDatabase(db))
    res.status(201).json(book);
  else
    res.status(500).json({error: 'Erro ao salvar livro'});
});

app.get('/api/members', async(_, res) => {
  const db = await readDatabase();
  if(!db)
    return res.status(500).json({error: 'Erro ao acessar banco de dados'});

  res.json(db.members);
});

app.post('/api/members', async(req, res) => {
  const {name, contact, email} = req.body;

  if(!name || !contact)
    return res.status(400).json({error: 'Campos obrigatórios: name, contact'});

  const db = await readDatabase();
  if(!db)
    return res.status(500).json({error: 'Erro ao acessar banco de dados'});

  const member = {
    id: db.nextId.members++,
    name,
    contact,
    email: email || '',
    activeLoans: 0,
    registerDate: new Date().toISOString()
  };

  db.members.push(member);

  if(await writeDatabase(db))
    res.status(201).json(member);
  else
    res.status(500).json({error: 'Erro ao salvar membro'});
});

app.get('/api/loans', async(_, res) => {
  const db = await readDatabase();
  if(!db)
    return res.status(500).json({error: 'Erro ao acessar banco de dados'});

  const completedLoans = db.loans.map(loan => {
    const book = db.books.find(book => book.id === loan.bookId);
    const member = db.members.find(member => member.id === loan.memberId);

    return { ...loan, bookTitle: book ? book.title : 'Livro não encontrado', memberName: member ? member.name : 'Membro não encontrado' };
  });

  res.json(completedLoans);
});

app.post('/api/loans', async(req, res) => {
  const {bookId, memberId, loanDate, returnDate} = req.body;

  if(!bookId || !memberId)
    return res.status(400).json({error: 'Campos obrigatórios: bookId, memberId'});

  const db = await readDatabase();
  if(!db)
    return res.status(500).json({error: 'Erro ao acessar banco de dados'});

  const book = db.books.find(book => book.id === parseInt(bookId));
  const member = db.members.find(member => member.id === parseInt(memberId));

  if(!book || !member)
    return res.status(404).json({error: 'Livro ou membro não encontrado'});

  if(book.available <= 0)
    return res.status(400).json({error: 'Livro não disponível'});

  if(member.activeLoans >= 3)
    return res.status(400).json({error: 'Limite de empréstimos atingido'});

  const loan = {
    id: db.nextId.loans++,
    bookId: parseInt(bookId),
    memberId: parseInt(memberId),
    bookTitle: book.title,
    memberName: member.name,
    loanDate: loanDate,
    returnDate: returnDate,
    status: 'Active'
  };

  book.available--;
  member.activeLoans++;

  db.loans.push(loan);

  if(await writeDatabase(db))
    res.status(201).json(loan);
  else
    res.status(500).json({error: 'Erro ao registrar empréstimo'});
});

app.put('/api/loans/:id/return', async(req, res) => {
  const loanId = parseInt(req.params.id);

  const db = await readDatabase();
  if(!db)
    return res.status(500).json({error: 'Erro ao acessar banco de dados'});

  const loan = db.loans.find(loan => loan.id === loanId);
  if(!loan)
    return res.status(404).json({error: 'Empréstimo não encontrado'});

  if(loan.status !== 'Active')
    return res.status(400).json({error: 'Empréstimo já foi devolvido'});

  loan.status = 'Devolvido';
  loan.returnRealDate = new Date().toISOString();

  const book = db.books.find(book => book.id === loan.bookId);
  const member = db.members.find(member => member.id === loan.memberId);

  if(book)
    book.available++;
  if(member)
    member.activeLoans--;

  if(db.notifications) {
    db.notifications.forEach(notification => {
      if(notification.loanId === loanId && notification.status === 'pending') {
        notification.status = 'resolved';
        notification.resolvedAt = new Date().toISOString();
      }
    });
  }

  const reservation = db.reservations.find(reservation => reservation.bookId === loan.bookId && reservation.status === 'Active');
  if(reservation) {
    reservation.status = 'Notificada';
    console.log(`Notificação: Livro "${book.title}" está disponível para ${reservation.memberName}`);
  }

  if(await writeDatabase(db))
    res.json({message: 'Devolução registrada com sucesso', loan});
  else
    res.status(500).json({error: 'Erro ao registrar devolução'});
});

app.get('/api/reservations', async(_, res) => {
  const db = await readDatabase();
  if(!db)
    return res.status(500).json({error: 'Erro ao acessar banco de dados'});
  
  res.json(db.reservations);
});

app.post('/api/reservations', async(req, res) => {
  const {bookId, memberId} = req.body;

  if(!bookId || !memberId)
    return res.status(400).json({error: 'Campos obrigatórios: bookId, memberId'});

  const db = await readDatabase();
  if(!db)
    return res.status(500).json({error: 'Erro ao acessar banco de dados'});

  const book = db.books.find(book => book.id === parseInt(bookId));
  const member = db.members.find(member => member.id === parseInt(memberId));

  if(!book || !member)
    return res.status(404).json({error: 'Livro ou membro não encontrado'});

  const reservationExists = db.reservations.find(r => 
    r.bookId === parseInt(bookId) && 
    r.memberId === parseInt(memberId) && 
    r.status === 'Active'
  );

  if(reservationExists)
    return res.status(400).json({error: 'Já existe uma reserva ativa para este livro'});

  const reservation = {
    id: db.nextId.reservations++,
    bookId: parseInt(bookId),
    memberId: parseInt(memberId),
    bookTitle: book.title,
    memberName: member.name,
    reservationDate: new Date().toISOString(),
    status: 'Active'
  };

  db.reservations.push(reservation);

  if(await writeDatabase(db))
    res.status(201).json(reservation);
  else
    res.status(500).json({error: 'Erro ao criar reserva'});
});

app.put('/api/reservations/:id/cancel', async(req, res) => {
  const reservationId = parseInt(req.params.id);
  
  if(!reservationId)
    return res.status(400).json({ error: 'ID da reserva é obrigatório' });

  const db = await readDatabase();
  if(!db)
    return res.status(500).json({ error: 'Erro ao acessar banco de dados' });

  const reservation = db.reservations.find(r => r.id === reservationId);
  if(!reservation)
    return res.status(404).json({ error: 'Reserva não encontrada' });

  if(reservation.status !== 'Active')
    return res.status(400).json({ error: 'Só é possível cancelar reservas ativas' });

  reservation.status = 'Cancelled';

  if(await writeDatabase(db))
    res.json(reservation);
  else
    res.status(500).json({ error: 'Erro ao cancelar reserva' });
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
    await initDatabase();
    
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

process.on('SIGINT', () => { process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });

startServer();
