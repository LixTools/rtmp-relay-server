const Net = require("net");
const Events = require("events");
const {RtmpSession, RtmpSessionEvents, context} = require("./rtmp/session");
const Utils = require("./utils");
const {RtmpAllowType} = require("./rtmp/allow_type");

const DefaultRelayOptions = {
    port: 1935,
    host: "0.0.0.0",
    ingest: "best",
    pushAllowType: RtmpAllowType.All,
    pullAllowType: RtmpAllowType.Local,
    webhook: null,
    webhookMethod: "POST",
    debug: false,
};

/**
 * @param {RtmpRelayOptions} options
 * @return {RtmpRelayOptions}
 */
function parseConfig(options) {
    let config = {...DefaultRelayOptions};
    if (options !== null && typeof options === "object") {
        Object.assign(config, options);
    }

    if (typeof config.webhookMethod !== "string") config.webhookMethod = "POST";
    config.webhookMethod = config.webhookMethod.toUpperCase();
    switch (config.webhookMethod) {
        case "POST":
        case "GET":
            break;
        default:
            config.webhookMethod = "POST";
    }

    config.pushAllowType = new RtmpAllowType(config.pushAllowType);
    config.pullAllowType = new RtmpAllowType(config.pullAllowType);

    if (typeof config.webhook === "string" && config.webhook.length > 0) {
        try {
            config.webhook = (new URL(config.webhook)).href;
        } catch (err) {
            console.error(err);
            config.webhook = null;
        }
    } else {
        config.webhook = null;
    }
    return config;
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

        const webhookRetries = {};

        this.ingestSockets = {};

        /**
         * @param {RtmpStreamInfo} streamInfo
         * @param {string} eventType
         * @param {RtmpRelayServer} that
         */
        const sendWebHookEvent = (streamInfo, eventType, that) => {
            if (this.config.webhook) {
                streamInfo = {eventType, ...streamInfo};
                const reqConfig = {
                    method: that.config.webhookMethod,
                    parse: "json",
                };
                let url = that.config.webhook;
                if (that.config.webhookMethod === "POST") {
                    reqConfig.body = streamInfo;
                } else {
                    const query = Utils.objToQuery(streamInfo);
                    if (url.indexOf("?") > 0) url += "&" + query
                    else url += "?" + query;
                }

                Utils.fetch(url, reqConfig).then((result) => {
                    that.emit("webhook", null, result, streamInfo);
                }).catch((error) => {
                    that.emit("webhook", error, null, streamInfo);

                    webhookRetries[streamInfo.sessionID + "_" + eventType] = setTimeout((si, et, th) => {
                        delete webhookRetries[streamInfo.sessionID + "_" + eventType];
                        sendWebHookEvent(si, et, th);
                    }, 5000, streamInfo, eventType, that);
                });
            }
        };

        const onSocketConnection = (socket) => {
            const isRemote = (socket.remoteAddress !== socket.localAddress);
            const rtmpSession = new RtmpSession(socket, this.config, isRemote);

            const sessionEvents = [];

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

            RtmpSessionEvents.AllEvents.forEach((event) => {
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
                this.emit("socket-close", socket, hadError);
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
        return new Promise(async (resolve, reject) => {
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
