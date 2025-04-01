const WordExtractor = require("word-extractor");
const extractor = new WordExtractor();

const express = require('express');
const app = express();
const port = 5050;

const cors = require('cors');

const bodyParser = require('body-parser');

app.use(cors());

app.use(
    bodyParser.raw({ limit: '50mb', type: ['application/octet-stream'] })
);

app.post('/word-resolve', async (req, res) => {
    const buffer = req.body;
    extractor.extract(buffer)
        .then((extracted) => {
            res.send(extracted.getBody());
        });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
