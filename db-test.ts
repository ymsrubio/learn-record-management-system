// https://nodejs.org/api/sqlite.html
// https://dev.to/otumianempire/introduction-to-sql-using-sqlite-node-sqlite-24gm 
import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync('data/dev.db');

// Execute SQL statements from strings.
database.exec(`
  CREATE TABLE patients(
    id INTEGER PRIMARY KEY,
    name TEXT,
    age INTEGER
  ) STRICT
`);

const insert = database.prepare('INSERT INTO patients (id, name, age) VALUES (?, ?, ?)');

insert.run(1, 'alice', 18);
insert.run(2, 'bob', 19);
insert.run(3, 'charlie', 20);

insert.close();

const query = database.prepare('SELECT * FROM patients ORDER BY id');

console.log(query.all());

query.close();
