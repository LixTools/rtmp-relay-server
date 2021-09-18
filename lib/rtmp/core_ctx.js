class RtmpMap extends Map {
    constructor() {
        super();
    }

    getName(name) {
        let pub = null;
        this.forEach((publisher, key) => {
            if (key.indexOf(name) >= 0) {
                pub = publisher;
            }
        });
        return pub;
    }

    hasName(name) {
        let isFind = false;
        this.forEach((publisher, key) => {
            if (key.indexOf(name) >= 0) {
                isFind = true;
            }
        });
        return isFind;
    }
}

const EventEmitter = require('events');

let sessions = new Map();
let publishers = new RtmpMap();
let idlePlayers = new Set();
let nodeEvent = new EventEmitter();
let stat = {
    inbytes: 0,
    outbytes: 0,
    accepted: 0
};
module.exports = {sessions, publishers, idlePlayers, nodeEvent, stat};
