const Express = require("express");
const Path = require("path");
const {RtmpRelayServer, RtmpAllowType} = require("../index");


const LOGLEVELS = {
    "error": 1,
    "log": 2,
    "info": 3,
};
const LogLevel = LOGLEVELS.log;

function startHttpServer() {
    const app = Express();

    app.listen(80, () => {
        console.log(`WebHook Http-Server listening at http://localhost`);
    });

    app.post("/echo", (req, res) => {
        res.send(req.body);
    });

    app.get("/echo", (req, res) => {
        res.send(req.query);
    });

    app.use(Express.static(Path.resolve("./", "docs")));
}

(async function () {

    //RTMP Relay Server
    const relayServer = new RtmpRelayServer({
        pushAllowType: RtmpAllowType.All,
        pullAllowType: RtmpAllowType.Local,
        webhook: "http://localhost/echo"
    });

    //TODO use this stub for the Webhook Backend
    // router.post("/echo", (req, res) => {
    //      /*
    //          use 'req.body.playUrl' here to capture the stream
    //      */
    // /**/
    //      /* echo 'req.body' back to Relay-Server */
    //      res.send(req.body);
    // });

    relayServer.on("codec", (rtmpSession, isLocal, codecInfo) => {
        if (LogLevel >= LOGLEVELS.info) console.info(`<CODEC>: `, {
            isLocal,
            streamInfo: rtmpSession.streamInfo,
            codecInfo
        });
    });

    relayServer.on("error", (rtmpSession, isLocal, error) => {
        if (LogLevel >= LOGLEVELS.error) console.error(`<ERROR>: `, error);
    });

    relayServer.on("publish", (rtmpSession, isLocal, streamInfo) => {
        if (LogLevel >= LOGLEVELS.info) console.info(`<PUBLISH>: `, streamInfo);
    });

    relayServer.on("donePublish", (rtmpSession, isLocal, streamInfo) => {
        if (LogLevel >= LOGLEVELS.info) console.info(`<DONE-PUBLISH>: `, streamInfo);
    });

    relayServer.on("play", (rtmpSession, isLocal, streamInfo) => {
        if (LogLevel >= LOGLEVELS.info) console.info(`<PLAYING>: `, streamInfo);
    });

    relayServer.on("donePlay", (rtmpSession, isLocal, streamInfo) => {
        if (LogLevel >= LOGLEVELS.info) console.info(`<DONE-PLAY>: `, streamInfo);
    });

    relayServer.on("webhook", (error, result, streamInfo) => {
        if (error && LogLevel >= LOGLEVELS.error) console.error(`<WEBHOOK-ERROR> [${streamInfo.eventType}]: `, error, streamInfo);
        else if (LogLevel >= LOGLEVELS.log) console.log(`<WEBHOOK-RESPONSE> [${streamInfo.eventType}]: `, result);
    })

    startHttpServer();

    await relayServer.start();

    relayServer.enableProcessExitHandler();
})()
