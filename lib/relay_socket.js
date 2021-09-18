const Events = require("events");
const Net = require("net");

class LixSocket extends Net.Socket {
    /**
     * @param {number} port
     * @param {string} host
     */
    constructor(port, host) {
        super();

        this.chunks = [];
        this.isConnected = false;
        this.once("connect", () => {
            this.addresses = {
                remote: {host: this.remoteAddress, port: this.remotePort},
                local: {host: this.localAddress, port: this.localPort}
            };

            if (this.chunks.length > 0) {
                this.chunks.forEach((chunk) => {
                    this.write(chunk);
                });
            }
            this.isConnected = true;
        });
        this.connect(port, host);
    }

    /**
     * @param {number} port
     * @param {string} host
     * @returns {LixSocket}
     */
    static createConnection(port, host) {
        return new LixSocket(port, host);// socket;
    }
}

class RelaySocket extends Events {
    constructor(localPort, localHost, remotePort, remoteHost, autoconnect = true) {
        super();

        this.reconnectInterval = 2000;
        this.restartOnClose = true;

        this.localPort = localPort;
        this.localHost = localHost;
        this.remotePort = remotePort;
        this.remoteHost = remoteHost;

        if (autoconnect) {
            this.connect();
        }
    }

    connect() {
        this.localSocket = new LixSocket(this.localPort, this.localHost);
        this.remoteSocket = new LixSocket(this.remotePort, this.remoteHost);

        //local
        this.localSocket.once("connect", () => {
            this.emit("connect", true, this.localSocket);
            this.reconnectInterval = 2000;
        });
        this.localSocket.on("error", (err) => {
            this.emit("error", true, err);
            this.localSocket.destroy(err);
            this.remoteSocket.destroy();
        });
        this.localSocket.once("close", (hadError) => {
            this.emit("close", true, hadError);
            if (!hadError) this.remoteSocket.destroy();
            //TODO make extra reconnect per socket
            if (this.restartOnClose) {
                this.emit("reconnecting", true, this.reconnectInterval);
                setTimeout(() => {
                    this.reconnectInterval *= 2;
                    this.connect();
                }, Math.min(8000, this.reconnectInterval));
            }
        });
        this.localSocket.on("data", (buffer) => {
            this.emit("data", true, buffer);
            if (this.remoteSocket.isConnected) {
                this.remoteSocket.write(buffer);
            } else {
                this.remoteSocket.chunks.push(buffer);
            }
        });

        //remote
        this.remoteSocket.once("connect", () => {
            this.emit("connect", false, this.remoteSocket);
        });
        this.remoteSocket.on("error", (err) => {
            this.emit("error", false, err);
            this.localSocket.destroy();
            this.remoteSocket.destroy(err);
        });
        this.remoteSocket.once("close", (hadError) => {
            this.emit("close", false, hadError);
            if (!hadError) this.localSocket.destroy();
        });
        this.remoteSocket.on("data", (buffer) => {
            this.emit("data", false, buffer);
            if (this.localSocket.isConnected) {
                this.localSocket.write(buffer);
            } else {
                this.localSocket.chunks.push(buffer);
            }
        });
    }

    get addresses() {
        return {
            local: this.localSocket.addresses,
            remote: this.localSocket.addresses
        }
    }
}

module.exports = {RelaySocket};
