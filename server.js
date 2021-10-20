const http = require("http");
const fs = require("fs").promises;
const mime = require("mime-types");

const PORT = 8080;

const server = http.createServer(async (req, res) => {
    let urlPath = "." + req.url;
    let file = await fs.readFile(urlPath);
    if (file) {
        res.setHeader("Content-Type", mime.lookup(urlPath));
        res.end(file);
    } else {
        res.statusCode = 404;
        res.end("404 NOT FOUND");
    }

});

server.listen(PORT);