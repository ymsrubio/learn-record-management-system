import express, { type Express, type Request, type Response } from 'express';

const app: Express = express();

app.use(express.static('public'));

app.get('/', (req: Request, res: Response) => {
    res.send('Hello World!');
});

app.get("/patients", (req, res) => {
    res.json([{
        name: "alice",
        age: "20"
    }, {
        name: "bob",
        age: "30"
    }, {
        name: "charlie",
        age: 40
    }]);
});

app.listen(3000);