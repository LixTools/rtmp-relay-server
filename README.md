# Lix RTMP Relay Server

## Installation

No external dependencies required for production use.

## Development

Install the Dev-Dependencies.

```sh
npm i
```

## Options

Work in Progress <sup style="font-size:60%">TM</sup>

## Examples

Basic Example

    port?: number,
    host?: string,
    ingest?: string,
    pushAllowType?: RtmpAllowType | string | string[],
    pullAllowType?: RtmpAllowType | string | string[],
    webhook?: string,
    webhookMethod?: "GET" | "POST",
    debug?: false,

```js
const {RtmpRelayServer, RtmpAllowType, Utils} = require("../index");

const relayServer = new RtmpRelayServer({
    pushAllowType: RtmpAllowType.All,
    pullAllowType: RtmpAllowType.Local
});

relayServer.on("codec", (rtmpSession, isLocal, codecInfo) => {
    //stream video/audio codec infos parsed
});

relayServer.on("error", (rtmpSession, isLocal, error) => {
    //called on every error (server, socket, session etc...)
});

relayServer.on("publish", (rtmpSession, isLocal, streamInfo) => {
    //stream started and relay to twitch started (e.g. start ffmpeg recording here)
});

relayServer.on("donePublish", (rtmpSession, isLocal, streamInfo) => {
    //stream stopped an relay to twitch closed (e.g. stop ffmpeg recording manually)
});

relayServer.on("play", (rtmpSession, isLocal, streamInfo) => {
    //rtmp client connection (e.g. ffmpeg connects to the server)
});

relayServer.on("donePlay", (rtmpSession, isLocal, streamInfo) => {
    //rtmp client disconnect (e.g. ffmpeg stops or exits)
});

//WebHook (if used) response event 
//if an error ocured, it will retry 5 times
relayServer.on("webhook", (error, result, streamInfo) => {
    if (error) console.error(`<WEBHOOK> [${sessionInfo.eventType}]: `, error, streamInfo);
    else console.log(`<WEBHOOK> [${sessionInfo.eventType}]: `, result);
})

await relayServer.start();

//[optional] ensure Relay-Server ist closed at process exit
relayServer.enableProcessExitHandler();
```

### Test Scripts

FFMPEG local recording

```sh
npm run ffmpeg_test
```

or with WebHooks
(also starts an example Server at Port 80)

```sh
npm run webhook_test
```

## Api

| Type          | README
| ----          | ------
| HTML          | [Api Docs (auto generated)](docs/index.html)
| TypeScript    | [Api Definitions](index.d.ts)

Start simple Http-Server for showing HMTL-Api-Docs

```sh
npm run apidocs-server
```
