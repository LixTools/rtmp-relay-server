const Https = require("https");
const Http = require("http");
const Path = require("path");
const FS = require("fs");

class Utils {
    static isDefined(obj) {
        return ((typeof obj !== "undefined") && (obj !== null));
    }

    static hasProp(obj, key) {
        if ((typeof key !== "undefined") && key !== null) {
            if ((typeof obj !== "undefined") && obj !== null) {
                return Object.prototype.hasOwnProperty.call(obj, key);
            }
        }
        return false;
    }

    static isType(obj, ...types) {
        if (obj !== null) {
            const objType = (typeof obj);
            return types.some((t) => (objType === t));
        }
        return false;
    }

    static fetch(url, options) {
        return new Promise((resolve, reject) => {
            let port;
            try {
                port = (new URL(url)).port || (url.startsWith("https") ? 443 : 80);
            } catch (err) {
                port = (url.startsWith("https") ? 443 : 80);
            }
            const defConfig = {
                method: 'GET',
                parse: false,
                headers: {},
                port: port,
                body: null
            };

            if (Utils.isDefined(options.body)) {
                if (Buffer.isBuffer(options.body) || (typeof options.body === "string")) {
                    defConfig.headers["Content-Type"] = "text/plain";
                } else {
                    defConfig.headers["Content-Type"] = "application/json";
                }
            }

            if (options !== null && typeof options === "object") {
                options = {...defConfig, ...options};
            } else {
                options = {...defConfig};
            }

            const req = (url.startsWith("https") ? Https : Http).request(url, options, (res) => {
                const chunks = [];
                res.on('data', (chunk) => {
                    chunks.push(chunk);
                });
                res.on('end', () => {
                    switch (options.parse) {
                        case "ascii" :
                        case "utf8" :
                        case "utf-8" :
                        case "utf16le" :
                        case "ucs2" :
                        case "ucs-2" :
                        case "base64" :
                        case "latin1" :
                        case "binary" :
                        case "hex":
                            resolve(Buffer.concat(chunks).toString(options.parse));
                            break;
                        case "string":
                            resolve(Buffer.concat(chunks).toString("utf8"));
                            break;
                        case "json":
                        case "object":
                            try {
                                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
                            } catch (err) {
                                console.warn(err);
                                resolve(Buffer.concat(chunks).toString("utf8"));
                            }
                            break;
                        default:
                            resolve(Buffer.concat(chunks));
                            break;
                    }
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            if (Utils.isDefined(options.body)) {
                if (Buffer.isBuffer(options.body) || (typeof options.body === "string")) {
                    req.write(options.body);
                } else {
                    req.write(JSON.stringify(options.body));
                }
            }
            req.end();
        });
    }

    static flatten(obj) {
        const outObj = {};
        const _flatten = (obj, key = null) => {
            Object.entries(obj).forEach(([k, v]) => {
                if (typeof v === "object") {
                    _flatten(v, k);
                } else {
                    if (typeof key === "string") k = key + k[0].toUpperCase() + k.substring(1);
                    outObj[k] = v;
                }
            });
            return outObj;
        };
        return _flatten(obj);
    }

    static objToQuery(obj) {
        return Object.entries(Utils.flatten(obj)).map(([k, v]) => (`${k}=${encodeURIComponent(v)}`)).join("&").replace(/^[&?]+/gmi, () => (""));
    }

    static loadTwitchIngests() {
        return new Promise((resolve) => {
            Utils.fetch("https://ingest.twitch.tv/ingests", {parse: "json"}).then((result) => {
                if (Utils.hasProp(result, "ingests") && result["ingests"].length > 0) {
                    const ingests = result["ingests"].sort((a, b) => (a.priority - b.priority))
                        .filter((ig) => (ig.availability > 0))
                        .map((ig) => (ig.url_template));
                    resolve(ingests);
                } else {
                    console.error(new Error("Error loading Twitch-Ingest list. Using default ingest: 'rtmp://vie02.contribute.live-video.net'"));
                    resolve(["rtmp://vie02.contribute.live-video.net/app/{stream_key}"]);
                }
            }).catch((err) => {
                console.error(new Error(`Error loading Twitch-Ingest list. Using default ingest: 'rtmp://vie02.contribute.live-video.net' (${err.message})`));
                resolve(["rtmp://vie02.contribute.live-video.net/app/{stream_key}"]);
            });
        });
    }

    static recurseDirectory(dir) {
        const files = [];
        FS.readdirSync(dir, {withFileTypes: true}).forEach((entry) => {
            const path = Path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...Utils.recurseDirectory(path));
            } else {
                files.push(path);
            }
        });
        return files;
    }

}

if (require.main.filename === __filename) {

    const execSync = require("child_process").execSync;

    const path = Path.resolve(process.argv[2]);
    const search = new RegExp("lix-rtmprelay", "gmi");
    const replacer = "Lix RTMP Relay Server";
    const extensions = ["html"];

    execSync("npx typedoc index.d.ts")

    if (FS.existsSync(path)) {
        const files = Utils.recurseDirectory(path);
        files.forEach((file) => {
            if (extensions.some((e) => (file.endsWith(e)))) {
                let raw = FS.readFileSync(file, "utf8");

                raw = raw.replace(search, () => (replacer));

                FS.writeFileSync(file, raw);
            }
        })
    }

} else {
    module.exports = Utils;
}