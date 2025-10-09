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
      nextId: {
        books: 3,
        members: 3,
        loans: 1,
        reservations: 1
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

  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 14);

  const loan = {
    id: db.nextId.loans++,
    bookId: parseInt(bookId),
    memberId: parseInt(memberId),
    bookTitle: book.title,
    memberName: member.name,
    loanDate: loanDate || now.toLocaleDateString(),
    returnDate: returnDate || dueDate.toLocaleDateString(),
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
  loan.returnRealDate = new Date().toLocaleDateString();

  const book = db.books.find(book => book.id === loan.bookId);
  const member = db.members.find(member => member.id === loan.memberId);

  if(book)
    book.available++;
  if(member)
    member.activeLoans--;

  const reservation = db.reservations.find(reservation => reservation.bookId === loan.bookId && reservation.status === 'Active');
  if(reservation) {
    reservation.status = 'Notificada';
    console.log(`Notificação: Livro "${book.title}" está disponível para ${reservation.memberNames}`);
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
    reservationDate: new Date().toLocaleDateString(),
    status: 'Active'
  };

  db.reservations.push(reservation);

  if(await writeDatabase(db))
    res.status(201).json(reservation);
  else
    res.status(500).json({error: 'Erro ao criar reserva'});
});

app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _, res, next) => {
  console.error(err.stack);
  res.status(500).json({error: 'Erro interno do servidor'});
});

async function startServer()
{
  try {
    console.log('\nStarting server...');
    await initDatabase();
    
    app.listen(PORT, () => {
      console.log('\nServer started at http://localhost:3000/');
    });
  } catch(error) {
    console.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => { process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });

startServer();
