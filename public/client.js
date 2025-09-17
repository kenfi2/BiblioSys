let books = [];
let members = [];
let loans = [];

async function loadData()
{
  try {
    const [bookResult, membersResult, loansResult] = await Promise.all([
      fetch('/api/books'),
      fetch('/api/members'), 
      fetch('/api/loans')
    ]);
      
    books = await bookResult.json();
    members = await membersResult.json();
    loans = await loansResult.json();
      
    refresh();
  } catch(error) {
    console.error('Error loading data:', error);
    books = JSON.parse(localStorage.getItem("books")) || [];
    members = JSON.parse(localStorage.getItem("members")) || [];
    loans = JSON.parse(localStorage.getItem("loans")) || [];
    refresh();
  }
}

function saveLocalStorage()
{
  localStorage.setItem("books", JSON.stringify(books));
  localStorage.setItem("members", JSON.stringify(members));
  localStorage.setItem("loans", JSON.stringify(loans));
}

function showSection(id) {
  document.querySelectorAll("section").forEach(sec => sec.classList.add("hidden"));
  console.log(id);
  document.getElementById(id).classList.remove("hidden");
  
  if(id === 'loans')
    updateLoans();
  else if(id === 'returns')
    updateReturnTable();
  else if(id === 'reports')
    generateReports();
  
  refresh();
}

async function addBook(e)
{
  e.preventDefault();

  const title = document.getElementById("title").value;
  const author = document.getElementById("author").value;
  const category = document.getElementById("category").value;
  const count = parseInt(document.getElementById("count").value);
  
  try {
    const response = await fetch('/api/books', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({title, author, category, count})
    });
    
    if(response.ok) {
      const book = await response.json();
      books.push(book);
      refresh();
      e.target.reset();
      showMessage('Livro cadastrado com sucesso!', 'success');
    }
  } catch(error) {
    const book = {
      id: Date.now(),
      title, author, category, count,
      available: count
    };
    books.push(book);
    saveLocalStorage();
    refresh();
    e.target.reset();
    showMessage('Livro cadastrado com sucesso!', 'success');
  }
}

function searchBooks()
{
  const term = document.getElementById("searchBook").value.toLowerCase();
  const filter = document.getElementById("availableFilter").value;
  
  let filteredBooks = books.filter(book => {
    const matchTerm = book.title.toLowerCase().includes(term) || book.author.toLowerCase().includes(term) || book.category.toLowerCase().includes(term);
    if(filter === 'available')
      return matchTerm && book.available > 0;
    if(filter === 'unavailable') return matchTermo && livro.disponivel === 0;
      return matchTerm;
  });
  
  updateBooksTable(filteredBooks);
}

async function addMember(e)
{
  e.preventDefault();

  const name = document.getElementById("memberName").value;
  const contact = document.getElementById("memberContact").value;
  const email = document.getElementById("memberEmail").value;

  try {
    const response = await fetch('/api/members', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name, contact, email})
    });

    if(response.ok) {
      const member = await response.json();
      members.push(member);
      refresh();
      e.target.reset();
      showMessage('Membro cadastrado com sucesso!', 'success');
    }
  } catch(error) {
    const member = {
      id: Date.now(),
      name, contact, email,
      activeLoans: 0
    };
    members.push(member);
    saveLocalStorage();
    refresh();
    e.target.reset();
    showMessage('Membro cadastrado com sucesso!', 'success');
  }
}

async function addLoan(e)
{
  e.preventDefault();

  const bookId = document.getElementById("loanBook").value;
  const memberId = document.getElementById("loanMember").value;

  const book = books.find(book => book.id == bookId);
  const member = members.find(member => member.id == memberId);

  if(!book || book.available <= 0) {
    showMessage('Livro não disponível para empréstimo!', 'error');
    return;
  }

  if(member.activeLoans >= 3) {
    showMessage('Membro atingiu limite de empréstimos!', 'error');
    return;
  }

  const loanDate = new Date();
  const returnDate = new Date(loanDate);
  returnDate.setDate(returnDate.getDate() + 14);

  try {
    const response = await fetch('/api/loans', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        bookId, memberId,
        loanDate: loanDate.toISOString(),
        returnDate: returnDate.toISOString()
      })
    });

    if(response.ok) {
      const loan = await response.json();
      loans.push(loan);
      
      book.available--;
      member.activeLoans++;
      
      refresh();
      showMessage('Empréstimo registrado com sucesso!', 'success');
    }
  } catch(error) {
    const loan = {
      id: Date.now(),
      bookId, memberId,
      bookTitle: book.title,
      memberName: member.name,
      loanDate: loanDate.toLocaleDateString(),
      returnDate: returnDate.toLocaleDateString(),
      status: "Active"
    };

    loans.push(loan);

    book.available--;
    member.activeLoans++;
    
    saveLocalStorage();
    refresh();
    showMessage('Empréstimo registrado com sucesso!', 'success');
  }
}

async function returnLoan(loanId)
{
  try {
    const response = await fetch(`/api/loans/${loanId}/return`, { method: 'PUT' });

    if(response.ok) {
      const loan = loans.find(loan => loan.id == loanId);
      loan.status = "Devolvido";
      loan.returnRealDate = new Date().toLocaleDateString();

      const book = books.find(l => l.id == loan.bookId);
      const member = members.find(m => m.id == loan.memberId);

      if(book)
        book.available++;
      if(member)
        member.activeLoans--;

      refresh();
      showMessage('Devolução registrada com sucesso!', 'success');
    }
  } catch(error) {
    const loan = loans.find(loan => loan.id == loanId);
    loan.status = "Devolvido";
    loan.returnRealDate = new Date().toLocaleDateString();

    const book = books.find(book => book.id == loan.bookId);
    const member = members.find(member => member.id == loan.memberId);

    if(book)
      book.available++;
    if(member)
      member.activeLoans--;

    saveLocalStorage();
    refresh();
    showMessage('Devolução registrada com sucesso!', 'success');
  }
}

function checkOverdues()
{
  const now = new Date();
  const overdues = loans.filter(loan => {
    if(loan.status !== "Active")
      return false;
    const date = new Date(loan.returnDate);
    return now > date;
  });

  return overdues;
}

function updateOverduesTable()
{
  const tbody = document.querySelector("#overduesTable tbody");
  if(!tbody)
    return;

  const overdues = checkOverdues();

  tbody.innerHTML = "";
  overdues.forEach(loan => {
    const overdueDays = Math.floor((new Date() - new Date(loan.returnDate)) / (1000 * 60 * 60 * 24));
    tbody.innerHTML += `
      <tr style="background-color: #ffe6e6;">
        <td>${loan.bookTitle}</td>
        <td>${loan.memberName}</td>
        <td>${loan.returnDate}</td>
        <td style="color: red;">${overdueDays} dias</td>
        <td><button onclick="returnLoan(${loan.id})" class="btn-return">Devolver</button></td>
      </tr>
    `;
  });
    
  if(overdues.length === 0)
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum atraso encontrado</td></tr>';
}

async function generateReports()
{
  const bookCount = {};
  const userCount = {};

  loans.forEach(loan => {
    if(!bookCount[loan.bookTitle])
      bookCount[loan.bookTitle] = 0;
    bookCount[loan.bookTitle]++;

    if(!userCount[loan.memberName])
      userCount[loan.memberName] = 0;
    userCount[loan.memberName]++;
  });

  const mostBorrowedBooks = Object.entries(bookCount).sort(([,a], [,b]) => b - a).slice(0, 5);
  const mostActiveUsers = Object.entries(userCount).sort(([,a], [,b]) => b - a).slice(0, 5);

  const tbodyLivros = document.querySelector("#mostBorrowedBooksTable tbody");
  if(tbodyLivros) {
    tbodyLivros.innerHTML = "";
    mostBorrowedBooks.forEach(([title, count]) => {
      tbodyLivros.innerHTML += `
        <tr>
          <td>${title}</td>
          <td>${count}</td>
        </tr>
      `;
    });
  }

  const tbodyUsuarios = document.querySelector("#mostActiveUsersTable tbody");
  if(tbodyUsuarios) {
    tbodyUsuarios.innerHTML = "";
    mostActiveUsers.forEach(([name, count]) => {
      tbodyUsuarios.innerHTML += `
        <tr>
          <td>${name}</td>
          <td>${count}</td>
        </tr>
      `;
    });
  }

  const activeLoans = loans.filter(e => e.status === "Active").length;
  const overdues = checkOverdues().length;

  document.getElementById("bookLength").textContent = books.length;
  document.getElementById("memberLength").textContent = members.length;
  document.getElementById("activeLoans").textContent = activeLoans;
  document.getElementById("overdueBooks").textContent = overdues;
}

async function reserveBook(bookId)
{
  const member = members[0];

  try {
    const response = await fetch('/api/reservations', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({bookId, memberId: member.id})
    });

    if(response.ok)
      showMessage('Reserva realizada com sucesso! Você será notificado quando o livro estiver disponível.', 'success');
  } catch(error) {
    showMessage('Reserva realizada com sucesso! Você será notificado quando o livro estiver disponível.', 'success');
  }
}

function showMessage(texto, tipo) 
{
  const container = document.getElementById('messages');
  if(!container)
    return;

  const div = document.createElement('div');
  div.className = `message ${tipo}`;
  div.textContent = texto;

  container.appendChild(div);

  setTimeout(() => {
    div.remove();
  }, 3000);
}

function refresh()
{
  updateBooksTable();
  updateMembersTable();
  updateLoansTable();
  updateReturnTable();
  updateLoans();
  updateOverduesTable();
}

function updateBooksTable(filteredBooks = books) {
  const tbody = document.querySelector("#booksTable tbody");
  if(!tbody)
    return;
  
  tbody.innerHTML = "";
  filteredBooks.forEach(book => {
    const availableStatus = book.available > 0 ? `<span style="color: green;">Disponível (${book.available})</span>` : `<span style="color: red;">Indisponível</span>`;
    const reserveAction = book.available === 0 ? `<button onclick="reserveBook(${book.id})" style="background: orange; color: white; border: none; padding: 0.3rem; border-radius: 3px;">Reservar</button>` : '';

    tbody.innerHTML += `
      <tr>
        <td>${book.title}</td>
        <td>${book.author}</td>
        <td>${book.category || 'N/A'}</td>
        <td>${book.count}</td>
        <td>${availableStatus}</td>
        <td>${reserveAction}</td>
      </tr>
    `;
  });
}

function updateMembersTable()
{
  const tbody = document.querySelector("#membersTable tbody");
  if(!tbody)
    return;
  
  tbody.innerHTML = "";
  members.forEach(member => {
    tbody.innerHTML += `
      <tr>
        <td>${member.name}</td>
        <td>${member.contact}</td>
        <td>${member.email || 'N/A'}</td>
        <td>${member.activeLoans || 0}</td>
      </tr>
    `;
  });
}

function updateLoansTable()
{
  const tbody = document.querySelector("#loansTable tbody");
  if(!tbody)
    return;

  tbody.innerHTML = "";
  loans.forEach(loan => {
    const isOverdue = loan.status === "Active" && new Date() > new Date(loan.returnDate);
    const rowStyle = isOverdue ? 'style="background-color: #ffe6e6;"' : '';

    tbody.innerHTML += `
      <tr ${rowStyle}>
        <td>${loan.bookTitle}</td>
        <td>${loan.memberName}</td>
        <td>${loan.loanDate}</td>
        <td>${loan.returnDate}</td>
        <td>${loan.status}</td>
      </tr>
    `;
  });
}

function updateReturnTable()
{
  const tbody = document.querySelector("#returnTable tbody");
  if(!tbody)
    return;
    
  tbody.innerHTML = "";
  loans.forEach(loan => {
    if(loan.status !== "Active")
      return;

    const isOverdue = new Date() > new Date(loan.returnDate);
    const rowStyle = isOverdue ? 'style="background-color: #ffe6e6;"' : '';

    tbody.innerHTML += `
      <tr ${rowStyle}>
        <td>${loan.bookTitle}</td>
        <td>${loan.memberName}</td>
        <td>${loan.returnDate}</td>
        <td>${loan.returnDate}</td>
        <td>
          <button onclick="returnLoan(${loan.id})" class="btn-return">
            Devolver
          </button>
        </td>
      </tr>`;
  });
  
  if(loans.filter(e => e.status === "Active").length === 0)
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum empréstimo ativo</td></tr>';
}

function updateLoans()
{
  const loanBook = document.getElementById("loanBook");
  const loanMember = document.getElementById("loanMember");
  
  if(loanBook) {
    loanBook.innerHTML = '<option value="">Selecione um livro</option>';
    books.filter(book => book.available > 0).forEach(book => {
      loanBook.innerHTML += `<option value="${book.id}">${book.title} (${book.available} disponível)</option>`;
    });
  }
  
  if(loanMember) {
    loanMember.innerHTML = '<option value="">Selecione um membro</option>';
    members.filter(member => (member.activeLoans || 0) < 3).forEach(member => {
      loanMember.innerHTML += `<option value="${member.id}">${member.name}</option>`;
    });
  }
}

function phoneFormat(input)
{
  let value = input.value.replace(/\D/g, '');
  
  if(value.length > 11)
    value = value.substring(0, 11);
  
  if(value.length >= 1 && value.length <= 2)
    value = value.replace(/^(\d{0,2})/, '($1');
  else if(value.length <= 7)
    value = value.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
  else
    value = value.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  
  input.value = value;
  
  const phoneValue = value.replace(/\D/g, '');
  if(phoneValue.length >= 10 && phoneValue.length <= 11)
    input.style.borderColor = '#28a745';
  else if(phoneValue.length > 0)
    input.style.borderColor = '#dc3545';
  else
    input.style.borderColor = '';
}

document.addEventListener('DOMContentLoaded', function() {
  loadData();

  const memberContact = document.getElementById('memberContact');
  if(memberContact) {
    memberContact.addEventListener('input', function() {
      phoneFormat(this);
    });

    memberContact.addEventListener('blur', function() {
      phoneFormat(this);
    });

    if(memberContact.value)
      phoneFormat(memberContact);
  }

  setInterval(() => {
    const overdues = checkOverdues();
    if(overdues.length > 0)
      console.log(`⚠️ ${overdues.length} empréstimo(s) em atraso detectado(s)!`);
  }, 5 * 60 * 1000);
});
