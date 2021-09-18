class RtmpAllowType {
    static get All() {
        return new RtmpAllowType(["*", "all", "0.0.0.0"]);
    }

    static get Local() {
        return new RtmpAllowType(["local", "localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1"]);
    }

    check(ip) {
        if (this.names.includes("all")) {
            return true;
        }
        return this.names.includes(ip.trim().toLowerCase());
    }

    /**
     * @param {string[],string,RtmpAllowType} aliases
     */
    constructor(aliases) {
        if (aliases instanceof RtmpAllowType) {
            this.names = aliases.names;
        } else if (Array.isArray(aliases) || (typeof aliases === "string")) {
            this.names = Array.isArray(aliases) ? aliases : aliases.split(",").map((s) => (s.trim()));
        } else {
            throw new Error(`${typeof aliases} is not supported as 'RtmpAllowType' (allowed: string, string[], RtmpAllowType)`)
        }
    }

    toString() {
        return `RtmpAllowType [ ${this.names.map((n) => (`"${n}"`)).join(", ")} ]`;
    }
}

module.exports = {RtmpAllowType};
