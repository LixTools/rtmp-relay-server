const Path = require("path");
const {spawn} = require("child_process");

const {RtmpRelayServer, RtmpAllowType, Utils} = require("../index");

(async function () {
    //FFMPEG Stream Saving Example
    const ffmpegProcs = {};

    const alwaysCloseFFMPEG = true;

    function startFFMPEG(streamInfo) {
        const ffargs = ["-hide_banner", "-y", "-re", "-i", streamInfo.playUrl,
            "-map", "0:a", "-map", "0:v", "-codec", "copy", "-f", "mpegts",
            Path.resolve(process.env.HOMEPATH, (process.platform === "win32") ? "Desktop" : "RTMP_RELAY_DUMP", "dump.ts")];

        const ffmpeg = spawn("ffmpeg", ffargs, {detached: true});

        ffmpegProcs[streamInfo.id] = ffmpeg;

        ffmpeg.on("error", (error) => {
            console.error("<FFMPEG> ERROR: ", error);
        });
        ffmpeg.stdout.on("error", (error) => {
            console.error("<FFMPEG> STDOUT ERROR: ", error);
        });
        ffmpeg.stderr.on("error", (error) => {
            console.error("<FFMPEG> STDERR ERROR: ", error);
        });

        ffmpeg.stderr.on("data", (data) => {
            //console.info("<FFMPEG> DATA: " + data.toString().replace(/[\r\n\t ]+/gmi, () => (" ")));
        });
        ffmpeg.on("exit", (code, reason) => {
            console.warn("<FFMPEG> EXIT: ", {code, reason});
            delete ffmpegProcs[streamInfo.id];
        });

    }

    process.on("beforeExit", () => {
        Object.values(ffmpegProcs).forEach((p) => {
            p.kill();
        });
    });

    //RTMP Relay Server
    const relayServer = new RtmpRelayServer({
        pushAllowType: RtmpAllowType.All,
        pullAllowType: RtmpAllowType.Local
    });

    relayServer.on("codec", (rtmpSession, isLocal, codecInfo) => {
        console.info(`<CODEC>: `, {isLocal, streamInfo: rtmpSession.streamInfo, codecInfo});
    });

    relayServer.on("donePublish", (rtmpSession, isLocal, streamInfo) => {
        //TODO you can make sure ffmpeg closes definetly at the end of stream here
        if (alwaysCloseFFMPEG) {
            if (Utils.hasProp(ffmpegProcs, streamInfo.id)) {
                console.warn("[FFMPEG] CLOSE: ", {code, reason});
                ffmpegProcs[streamInfo.id].kill();//.close();
                delete ffmpegProcs[streamInfo.id];
            }
        }
    });

    relayServer.on("publish", (rtmpSession, isLocal, streamInfo) => {
        //TODO example: start.bat FFMPEG recording here
        startFFMPEG(streamInfo);
    });

    await relayServer.start();

    relayServer.enableProcessExitHandler();

    //Raw Relay Socket Example
    //const {RelaySocket} = require("./lib/relay_socket");
    // const relaySocket = new RelaySocket(80, "0.0.0.0", 80, "lix.tools");
    // relaySocket.on("connect", (isLocal, socket) => {
    //     console.log([`${isLocal ? "LOCAL" : "REMOTE"}-SOCKET-CONNECT`]);
    // });
    // relaySocket.on("data", (isLocal, data) => {
    //     console.log([`${isLocal ? "LOCAL" : "REMOTE"}-SOCKET-DATA`], {data: data.length});
    // });
    // relaySocket.on("error", (isLocal, error) => {
    //     console.error([`${isLocal ? "LOCAL" : "REMOTE"}-SOCKET-ERROR`], {error});
    // });
    // relaySocket.on("close", (isLocal, hadError) => {
    //     console.warn([`${isLocal ? "LOCAL" : "REMOTE"}-SOCKET-CLOSE`], {hadError});
    // });
    // relaySocket.on("reconnecting", (isLocal, reconnectInterval) => {
    //     console.warn([`${isLocal ? "LOCAL" : "REMOTE"}-SOCKET-RECONNECTING`], {reconnectInterval});
    // });
})()
