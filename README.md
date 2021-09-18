# Lix RTMP Relay Server

[GitHub Repository](https://github.com/LixTools/rtmp-relay-server)
<br>
[GitHub Pages](https://lixtools.github.io/rtmp-relay-server/)

## Installation

No external dependencies required for production use.

## Development

Install the dev-dependencies.

```sh
npm i
```

## Options

```js
// Default options
const relayServer = new RtmpRelayServer({
    port: 1935,
    host: "0.0.0.0",
    ingest: "best",
    pushAllow: RtmpAllowType.All,
    pullAllow: RtmpAllowType.Local,
    webhook: null,
    debug: false
});
```

| Property       | Description                           | Type                                                                                                  | Default
| -------------  | ------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------
| port           | Server listen Port                    | Number                                                                                                | 1935
| host           | Server listen Address                 | String                                                                                                | '0.0.0.0'
| ingest         | Twitch Ingest Server                  | String                                                                                                | 'best'
| pushAllow      | Allowed publish IP(s)                 | RtmpAllowType, String, String[]                                                                       | ```[ '*', 'all', '0.0.0.0' ]```
| pullAllow      | Allowed play IP(s)                    | RtmpAllowType, String, String[]                                                                       | ```[ 'local', 'localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1' ]```
| webhook        | [Webhook Docs](#webhook)              | String, [WebhookOptions](https://lixtools.github.io/rtmp-relay-server/interfaces/WebhookOptions.html) | null
| debug          | verbose console output                | Boolean                                                                                               | false

### Webhook

| Property       | Description                           | Type                                                          | Default
| -------------  | ------------------------------------- | ------------------------------------------------------------- | -------
| url            |                                       | string                                                        | null
| method         | Request Method, either POST or GET    | string                                                        | 'POST'
| headers        | Extra headers for request             | object                                                        | ```{ 'Content-Type': 'application/json' }```
| retryAmount    | Retry request [n] times               | number                                                        | 5
| retryInterval  | Interval between retries (ms)         | number                                                        | 5000

If method is 'POST', stream-info is in BODY encoded as JSON(utf8) string<br>
If method is 'GET', stream-info is in QUERY flattened and URL-Encoded

### Events

[Events Typedef](https://lixtools.github.io/rtmp-relay-server/enums/RtmpRelayEvent.html)

## Api

### [Api Docs](https://lixtools.github.io/rtmp-relay-server/classes/RtmpRelayServer.html)  ( auto generated )

Start simple http server for showing the html Api Docs locally (run 'npm i' before launching the server)

```sh
npm run apidocs-server
```

## Examples

Basic Example

```js
const {RtmpRelayServer, RtmpAllowType, Utils} = require("../index");

const relayServer = new RtmpRelayServer();

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

## License

[GNU General Public License v3.0](LICENSE)<br>
© [LixTools](https://lix.tools) (Lukix29) 2021<br>