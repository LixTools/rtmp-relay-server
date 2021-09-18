const Net = require("net");
const Events = require("events");
const {RtmpSession, RtmpSessionEvents, context} = require("./rtmp/session");
const Utils = require("./utils");
const {RtmpAllowType} = require("./rtmp/allow_type");

const DefaultRelayOptions = {
    port: 1935,
    host: "0.0.0.0",
    ingest: "best",
    pushAllow: RtmpAllowType.All,
    pullAllow: RtmpAllowType.Local,
    webhook: null,
    debug: false,
};

const webhookRetries = {};

/**
 * @param {RtmpRelayOptions} options
 * @return {RtmpRelayOptions}
 */
function parseConfig(options) {
    let config = {...DefaultRelayOptions};
    if (options !== null && typeof options === "object") {
        Object.assign(config, options);
    }

    config.pushAllow = new RtmpAllowType(config.pushAllow);
    config.pullAllow = new RtmpAllowType(config.pullAllow);

    if (Utils.isType(config.webhook, "string")) {
        try {
            config.webhook = ({url: (new URL(config.webhook)).href});
        } catch (err) {
            console.warn(err);
            config.webhook = ((config.webhook.length > 0) ? ({url: config.webhook}) : null);
        }
    } else if (Utils.isType(config.webhook, "object")) {
        config.webhook = {
            url: config.webhook.url,
            method: ((/POST|GET/i).test(config.webhook.method) ? config.webhook.method.toUpperCase() : "POST"),
            header: Object.entries(Object.fromEntries(config.webhook.headers)
                .filter(([k, v]) => (Utils.isDefined(v)))
                .map(([k, v]) => ([k, (Utils.isType(v, "string", "number", "boolean") ? v.toString() : JSON.stringify(v))]))),
            retryAmount: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, config.webhook.retryAmount)) || 5,
            retryInterval: Math.max(0, Math.min(3_600_000, config.webhook.retryAmount)) || 5000,
        };
    } else {
        config.webhook = null;
    }
    return config;
}

/**
 * @param {RtmpStreamInfo} streamInfo
 * @param {string} eventType
 * @param {RtmpRelayServer} that
 * @param {number|false} [retryCnt]
 */
function sendWebHookEvent(streamInfo, eventType, that, retryCnt = false) {
    if (that.config.webhook) {
        streamInfo = {eventType, ...streamInfo};
        const reqConfig = {
            method: that.config.webhook.method,
            headers: that.config.webhook.headers,
            parse: "json",
        };
        let url = that.config.webhook.url;
        if (that.config.webhook.method === "POST") {
            reqConfig.body = streamInfo;
        } else {
            const query = Utils.objToQuery(streamInfo);
            if (url.indexOf("?") > 0) url += "&" + query
            else url += "?" + query;
        }

        Utils.fetch(url, reqConfig).then((result) => {
            that.emit("webhook", null, result, streamInfo);
        }).catch((error) => {
            if (typeof retryCnt !== "number") retryCnt = that.config.webhook.retryAmount;
            if (retryCnt <= 0) {
                error.message = `Failed to connect to Webhook Server${(that.config.webhook.retryAmount > 0) ? ` after ${that.config.webhook.retryAmount} retries` : ""}! ( ${error.message} )`;
            } else {
                error.message += ` (retrying in ${Math.floor(that.config.webhook.retryInterval / 1000)}s (attempt #${(6 - retryCnt)})`;

                const wKey = streamInfo.sessionID + "_" + eventType + "_" + process.hrtime.bigint().toString(36);
                webhookRetries[wKey] = setTimeout((si, et, th) => {
                    delete webhookRetries[wKey];
                    sendWebHookEvent(si, et, th, retryCnt - 1);
                }, that.config.webhook.retryInterval, streamInfo, eventType, that);
            }
            that.emit("webhook", error, null, streamInfo);
        });
    }
}

class IngestSocket extends Events {
    constructor(socket, rtmpSession, ingest) {
        super();
        let chunks = [];
        let isConnected = false;

        this.socket = Net.createConnection(DefaultRelayOptions.port, ingest);

        this.socket.on("error", (err) => {
            this.emit("error", this.socket, err);
        });
        this.socket.on("close", (hadError) => {
            this.emit("close", this.socket, hadError);
        });
        this.socket.on("connect", () => {
            if (chunks.length > 0) {
                chunks.forEach((buff) => {
                    this.socket.write(buff);
                });
                chunks = [];
            }
            isConnected = true;
            this.addresses = {
                remote: {host: this.socket.remoteAddress, port: this.socket.remotePort},
                local: {host: this.socket.localAddress, port: this.socket.localPort}
            };
            this.emit("connect", this.socket, this.addresses);
        });

        socket.on("close", (hadError) => {
            this.socket.destroy();
        });

        this.socket.on("data", (buffer) => {
            socket.write(buffer);
        });

        socket.on("data", (buffer) => {
            rtmpSession.onSocketData(buffer);
            if (isConnected) {
                this.socket.write(buffer);
            } else {
                chunks.push(buffer);
            }
        });

    }
}

class RtmpRelayServer extends Events {
    /**
     * @param {RtmpRelayOptions} [options]
     */
    constructor(options) {
        super();

        this.config = parseConfig(options);

        this.ingestSockets = {};

        const onSocketConnection = (socket) => {
            const isRemote = (socket.remoteAddress !== socket.localAddress);
            const rtmpSession = new RtmpSession(socket, this.config, isRemote);

            if (isRemote) {
                const ingestSocket = new IngestSocket(socket, rtmpSession, this.config.ingest);
                this.ingestSockets[rtmpSession.id] = ingestSocket;

                ingestSocket.on("error", (socket, error) => {
                    this.emit("ingest-error", socket, error);
                });
                ingestSocket.on("close", (socket, hadError) => {
                    this.emit("ingest-error", socket, hadError);
                    delete this.ingestSockets[rtmpSession.id];
                });
                ingestSocket.on("connect", (socket, addresses) => {
                    this.emit("ingest-connect", socket, addresses);
                });
            }

            rtmpSession.on(RtmpSessionEvents.PostPublish, (streamInfo) => {
                sendWebHookEvent(streamInfo, RtmpSessionEvents.Publish, this);
            });
            rtmpSession.on(RtmpSessionEvents.DonePublish, (streamInfo) => {
                sendWebHookEvent(streamInfo, RtmpSessionEvents.DonePublish, this);
            });
            rtmpSession.on(RtmpSessionEvents.PostPlay, (streamInfo) => {
                sendWebHookEvent(streamInfo, RtmpSessionEvents.Play, this);
            });
            rtmpSession.on(RtmpSessionEvents.DonePlay, (streamInfo) => {
                sendWebHookEvent(streamInfo, RtmpSessionEvents.DonePlay, this);
            });
            rtmpSession.on(RtmpSessionEvents.CodecInfo, (codecInfo) => {
                sendWebHookEvent({...rtmpSession.streamInfo, ...codecInfo}, RtmpSessionEvents.CodecInfo, this);
            });

            const sessionEvents = [];

            RtmpSessionEvents.AllSessionEvents.forEach((event) => {
                if (event.indexOf("-") > 0) return;

                if (sessionEvents.includes(event)) return;
                else sessionEvents.push(event);

                if (event.indexOf("error") >= 0) {
                    rtmpSession.on(event, (...params) => {
                        this.emit("error", rtmpSession, !isRemote, ...params);
                    });
                }
                rtmpSession.on(event, (...params) => {
                    this.emit(event, rtmpSession, !isRemote, ...params)
                });
            });

            socket.on("error", (error) => {
                this.emit("socket-error", socket, error);
            });

            socket.on("close", (hadError) => {
                delete this.ingestSockets[rtmpSession.id];
                rtmpSession.stop();
                this.emit("socketClose", socket, hadError);
            });

            this.emit("socket-connect", socket, {
                remote: {host: socket.remoteAddress, port: socket.remotePort},
                local: {host: socket.localAddress, port: socket.localPort}
            }, rtmpSession);
        };

        this.server = Net.createServer(onSocketConnection);
    }

    get sessions() {
        return context.sessions;
    }

    start() {
        return new Promise(async (resolve) => {
            let defIngest = this.config.ingest;
            if (typeof defIngest !== "string") {
                this.ingests = await Utils.loadTwitchIngests();
                this.config.ingest = this.ingests[0];
                defIngest = "auto";
            } else if ((defIngest === "best") || (defIngest === "auto")) {
                this.ingests = await Utils.loadTwitchIngests();
                this.config.ingest = this.ingests[0];
                defIngest = "auto";
            } else {
                defIngest = "custom";
            }

            try {
                this.config.ingest = (new URL(this.config.ingest)).host;
            } catch (e) {
                this.config.ingest = "ams03.contribute.live-video.net";
            }

            this.server.listen(this.config.port, this.config.host, () => {
                const conf = {};
                Object.entries(this.config).forEach(([k, v]) => {
                    if (k.endsWith("AllowType")) {
                        conf[k] = v.toString();
                    } else if (k === "ingest") {
                        conf[k] = v + ` (${defIngest})`;
                    } else {
                        conf[k] = v;
                    }
                });
                console.log(`Rtmp-Relay-Server started at ${this.config.host}:${this.config.port}`, {config: conf});
                resolve();
            });
        });
    }

    stop() {
        return new Promise(async (resolve, reject) => {
            this.server.close((err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    enableProcessExitHandler(callback) {
        const that = this;

        function exitHandler(exitCode) {
            exitHandlerOff();
            if (typeof callback == "function") callback(exitCode);
            that.stop().then(() => {
                console.log("Rtmp-Relay-Server stopped.");
                process.exit();
            }).catch((err) => {
                console.error("Error stopping Rtmp-Relay-Server.", err);
                process.exit();
            });
        }

        function exitHandlerOff() {
            process.off('exit', exitHandler);
            process.off('SIGINT', exitHandler);
            process.off('SIGUSR1', exitHandler);
            process.off('SIGUSR2', exitHandler);
            process.off('uncaughtException', exitHandler);
        }

        process.stdin.resume();//so the program will not close instantly
        //do something when app is closing
        process.once('exit', exitHandler);
        //catches ctrl+c event
        process.once('SIGINT', exitHandler);
        // catches "kill pid" (for example: nodemon restart)
        process.once('SIGUSR1', exitHandler);
        process.once('SIGUSR2', exitHandler);
        //catches uncaught exceptions
        process.once('uncaughtException', exitHandler);

        return exitHandler;
    }

    emit(event, ...params) {
        switch (event) {
            case "connect":
                return super.on(RtmpSessionEvents.PostConnect, ...params);
            case "play":
                return super.emit(RtmpSessionEvents.PostPlay, ...params);
            case "publish":
                return super.emit(RtmpSessionEvents.PostPublish, ...params);
            default:
                return super.emit(event, ...params);
        }
    }

    on(event, callback) {
        switch (event) {
            case "connect":
                return super.on(RtmpSessionEvents.PostConnect, callback);
            case "play":
                return super.on(RtmpSessionEvents.PostPlay, callback);
            case "publish":
                return super.on(RtmpSessionEvents.PostPublish, callback);
            default:
                return super.on(event, callback);
        }

    }
}

module.exports = {RtmpRelayServer, RtmpAllowType, Utils};
