const Express = require("express");
const Path = require("path");
const exec = require("child_process").exec;

(function () {
    const app = Express();

    const server = app.listen(80, () => {
        console.log(`WebHook Http-Server listening at http://localhost`);
    });

    app.post("/echo", (req, res) => {
        res.send(req.body);
    });

    app.get("/echo", (req, res) => {
        res.send(req.query);
    });

    app.use(Express.static(require.main.path, {
        extensions: ["html"]
    }));

    exec("start http://localhost");
})()
