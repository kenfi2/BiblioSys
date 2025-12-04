# 📚 BiblioSys

Sistema de Controle para Pequena Biblioteca - Projeto da faculdade

## O que é?

Um sistema web para gerenciar uma biblioteca pequena. Controla livros, leitores, empréstimos e manda avisos de atraso automaticamente.

## Funcionalidades

- Cadastro de livros e leitores
- Controle de empréstimos e devoluções
- Sistema de reservas
- Notificações automáticas de atraso
- Relatórios (livros mais emprestados, leitores ativos, etc.)
- Diferentes níveis de acesso (admin, gestor, bibliotecário, leitor)

## Tecnologias

- Node.js + Express (server)
- MySQL (banco de dados)
- HTML/CSS/JavaScript puro (client)

## Como rodar

1. Clone o projeto
2. Instale as dependências:
```bash
npm install
```

3. Configure o MySQL no arquivo `database.js` (host, usuário, senha)

4. Rode o servidor:
```bash
npm start
```

5. Acesse: `http://localhost:3000`

## Usuários para teste

- **Admin**: admin@biblioteca.com / admin
- **Gestora**: maria@biblioteca.com / 123456
- **Bibliotecária**: ana@biblioteca.com / 123456

## Estrutura

```
bibliosys/
├── public/index.html
├── database.js
├── server.js
└── package.json
```

## Autor

João Vítor Matias Santana - 2025
