import * as Events from "events";
import {Socket} from "net";

export declare type Types = "undefined" | "object" | "boolean" | "number" | "bigint" | "string" | "symbol" | "function";

export declare class Utils {
    static isDefined(obj: any): boolean;

    static hasProp(obj: object, key: string): boolean;

    static isType(obj: any, ...type: Types[]): boolean;

    static fetch(url: string, options?: object): Promise<any>;

    static loadTwitchIngests(): Promise<string[]>;

    static flatten(obj: object): object;

    static objToQuery(obj: object): string;
}

export declare class RtmpAllowType {
    constructor(aliases: string | string[] | RtmpAllowType);

    static get All(): RtmpAllowType;

    static get Local(): RtmpAllowType;

    check(ip: string): boolean;
}

export declare interface WebhookOptions {
    url: string,
    method?: "GET" | "POST",
    headers?: object,
    retryAmount?: number,
    retryInterval?: number
}

export declare interface RtmpRelayOptions {
    port?: number,
    host?: string,
    ingest?: string,
    pushAllow?: string | string[],
    pullAllow?: string | string[],
    webhook?: string | WebhookOptions,
    debug?: false,
}

export declare enum WebhookEvent {
    publish = "publish",
    donePublish = "donePublish",
    play = "play",
    donePlay = "donePlay",
    codec = "codec",
}

export declare enum RtmpRelayEvent {
    publish = "publish",
    play = "play",
    donePublish = "donePublish",
    donePlay = "donePlay",
    socketClose = "socket-close",
    socketError = "socket-error",
    socketConnect = "socket-connect",
    ingestClose = "ingest-close",
    ingestError = "ingest-error",
    ingestConnect = "ingest-connect",
    videoCodec = "videoCodec",
    audioCodec = "audioCodec",
    codec = "codec",
    webhook = "webhook",
    error = "error",
}

export declare interface RtmpAddresses {
    remote?: { address: string, port: number },
    local?: { address: string, port: number },
}

export declare interface RtmpStreamInfo {
    sessionID: string;
    path: string;
    query?: string;
    publishUrl?: string;
    playUrl?: string;
    streamKey?: string;
    userID?: string;
}

export declare interface RtmpVideoInfo {
    width?: number;
    height?: number;
    fps?: number;
    codecName?: string;
    profileName?: string;
}

export declare interface RtmpAudioInfo {
    samplerate?: number;
    channels?: number;
    codecName?: string;
    profileName?: string;
}

export declare interface RtmpCodecInfo {
    audio?: RtmpAudioInfo;
    video?: RtmpVideoInfo;
}

export declare interface RtmpSessionInfo extends RtmpStreamInfo {
    eventType?: WebhookEvent,
    audio?: RtmpAudioInfo;
    video?: RtmpVideoInfo;
}

export declare class RtmpSession extends Events {
    constructor(socket: Socket, config: RtmpRelayOptions, passive?: boolean) ;

    get videoInfo(): RtmpVideoInfo;

    get audioInfo(): RtmpAudioInfo;

    get codecInfo(): RtmpCodecInfo;

    get streamInfo(): RtmpStreamInfo;

    get socket(): Socket;

    onSocketData(data: any): void;

    /*
     ###
     res: any;
     id: string;
     ip: any;
     TAG: string;
     handshakePayload: Buffer;
     handshakeState: number;
     handshakeBytes: number;
     parserBuffer: Buffer;
     parserState: number;
     parserBytes: number;
     parserBasicBytes: number;
     parserPacket: any;
     inPackets: Map<any, any>;
     inChunkSize: number;
     outChunkSize: number;
     pingTime: number;
     pingTimeout: number;
     isLocal: any;
     isStarting: boolean;
     isPublishing: boolean;
     isPlaying: boolean;
     isIdling: boolean;
     isPause: boolean;
     isReceiveAudio: boolean;
     isReceiveVideo: boolean;
     metaData: any;
     aacSequenceHeader: Buffer;
     avcSequenceHeader: Buffer;
     audioCodec: number;
     audioCodecName: string;
     audioProfileName: string;
     audioSamplerate: number;
     audioChannels: number;
     videoCodec: number;
     videoCodecName: string;
     videoProfileName: string;
     videoWidth: number;
     videoHeight: number;
     videoFps: number;
     videoLevel: number;
     gopCacheEnable: boolean;
     rtmpGopCacheQueue: Set<any>;
     ackSize: number;
     inAckSize: number;
     inLastAck: number;
     appname: string;
     streams: number;
     playStreamId: number;
     playStreamPath: string;
     playArgs: {};
     publishStreamId: number;
     publishStreamPath: string;
     publishArgs: {};
     players: Set<any>;
     numPlayCache: number;
     connectCmdObj: any;
     objectEncoding: any;
     connectTime: Date;
     startTimestamp: number;

     get name(): void;

     run(): void;

     stop(): void;

     reject(): void;

     flush(): void;

     onSocketClose(): void;

     onSocketError(e: any): void;

     onSocketTimeout(): void;
     rtmpChunkBasicHeaderCreate(fmt: any, cid: any): Buffer;

     rtmpChunkMessageHeaderCreate(header: any): Buffer;

     rtmpChunksCreate(packet: any): Buffer;

     rtmpChunkRead(data: any, p: any, bytes: any): void;

     rtmpPacketParse(): void;

     rtmpChunkMessageHeaderRead(): number;

     rtmpPacketAlloc(): void;

     rtmpHandler(): void | 0 | -1;

     rtmpControlHandler(): void;

     rtmpEventHandler(): void;

     rtmpAudioHandler(): void;

     isFirstAudioReceived: boolean;

     rtmpVideoHandler(): void;

     rtmpDataHandler(): void;

     rtmpInvokeHandler(): void;

     sendACK(size: any): void;

     sendWindowACK(size: any): void;

     setPeerBandwidth(size: any, type: any): void;

     setChunkSize(size: any): void;

     sendStreamStatus(st: any, id: any): void;

     sendInvokeMessage(sid: any, opt: any): void;

     sendDataMessage(opt: any, sid: any): void;

     sendStatusMessage(sid: any, level: any, code: any, description: any): void;

     sendRtmpSampleAccess(sid: any): void;

     sendPingRequest(): void;

     respondConnect(tid: any): void;

     respondCreateStream(tid: any): void;

     respondPlay(): void;

     onConnect(invokeMessage: any): void;

     onCreateStream(invokeMessage: any): void;

     onPublish(invokeMessage: any): void;

     onPlay(invokeMessage: any): void;

     onStartPlay(): void;

     onPause(invokeMessage: any): void;

     onReceiveAudio(invokeMessage: any): void;

     onReceiveVideo(invokeMessage: any): void;

     onCloseStream(): void;

     onDeleteStream(invokeMessage: any): void;*/
}

export declare class RtmpRelayServer extends Events {
    constructor(options?: RtmpRelayOptions);

    start(): Promise<void>;

    stop(): Promise<void>;

    enableProcessExitHandler(callback?: (error?: Error) => void): (exitCode?: number | string) => void;

    get sessions(): Map<string, RtmpSession>;

    //on(event: RtmpRelayEvent, listener: (...params: any) => void): this;

    on(event: "publish", listener: (rtmpSession: RtmpSession, isLocal: boolean, streamInfo: RtmpStreamInfo) => void): this;

    on(event: "play", listener: (rtmpSession: RtmpSession, isLocal: boolean, streamInfo: RtmpStreamInfo) => void): this;

    on(event: "socketClose", listener: (socket: Socket, hadError: boolean) => void): this;

    on(event: "socketError", listener: (socket: Socket, error: Error) => void): this;

    on(event: "socketConnect", listener: (socket: Socket, addresses: RtmpAddresses, rtmpSession: RtmpSession) => void): this;

    on(event: "ingestClose", listener: (socket: Socket, hadError: boolean) => void): this;

    on(event: "ingestError", listener: (socket: Socket, error: Error) => void): this;

    on(event: "ingestConnect", listener: (socket: Socket, addresses: RtmpAddresses) => void): this;

    on(event: "donePlay", listener: (rtmpSession: RtmpSession, isLocal: boolean, streamInfo: RtmpStreamInfo) => void): this;

    on(event: "donePublish", listener: (rtmpSession: RtmpSession, isLocal: boolean, streamInfo: RtmpStreamInfo) => void): this;

    on(event: "videoCodec", listener: (rtmpSession: RtmpSession, isLocal: boolean, videoInfo: RtmpVideoInfo) => void): this;

    on(event: "audioCodec", listener: (rtmpSession: RtmpSession, isLocal: boolean, videoInfo: RtmpAudioInfo) => void): this;

    on(event: "codec", listener: (rtmpSession: RtmpSession, isLocal: boolean, codecInfo: RtmpCodecInfo) => void): this;

    on(event: "webhook", listener: (error: Error | null, result: object | string | null, streamInfo: RtmpSessionInfo) => void): this;

    on(event: "error", listener: (error: Error) => void): this;

    /*
     ###
     on(event: "doneConnect", listener: (rtmpSession: RtmpSession, isLocal: boolean, params?: RtmpStreamInfo) => void): this;
     on(event: "connect", listener: (rtmpSession: RtmpSession, isLocal: boolean, params?: RtmpStreamInfo) => void): this;
     on(event: "preConnect", listener: (rtmpSession: RtmpSession, isLocal: boolean, params?: RtmpStreamInfo) => void): this;
     on(event: "prePublish", listener: (rtmpSession: RtmpSession, isLocal: boolean, params?: RtmpStreamInfo) => void): this;
     on(event: "postPublish", listener: (rtmpSession: RtmpSession, isLocal: boolean, params?: RtmpStreamInfo) => void): this;
     on(event: "prePlay", listener: (rtmpSession: RtmpSession, isLocal: boolean, params?: RtmpStreamInfo) => void): this;
     on(event: "postPlay", listener: (rtmpSession: RtmpSession, isLocal: boolean, params?: RtmpStreamInfo) => void): this;*/
}
