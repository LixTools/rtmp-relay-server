const QueryString = require("querystring");
const AV = require("./core_av");
const {AUDIO_SOUND_RATE, AUDIO_CODEC_NAME, VIDEO_CODEC_NAME} = require("./core_av");
const AMF = require("./core_amf");
const Handshake = require("./handshake");
const NodeCoreUtils = require("./core_utils");
const context = require("./core_ctx");
const {RtmpSessionEvents} = require("./events");
const Events = require("events");
const {RtmpAllowType} = require("./allow_type");

const N_CHUNK_STREAM = 8;
const RTMP_VERSION = 3;
const RTMP_HANDSHAKE_SIZE = 1536;
const RTMP_HANDSHAKE_UNINIT = 0;
const RTMP_HANDSHAKE_0 = 1;
const RTMP_HANDSHAKE_1 = 2;
const RTMP_HANDSHAKE_2 = 3;

const RTMP_PARSE_INIT = 0;
const RTMP_PARSE_BASIC_HEADER = 1;
const RTMP_PARSE_MESSAGE_HEADER = 2;
const RTMP_PARSE_EXTENDED_TIMESTAMP = 3;
const RTMP_PARSE_PAYLOAD = 4;

const MAX_CHUNK_HEADER = 18;

const RTMP_CHUNK_TYPE_0 = 0; // 11-bytes: timestamp(3) + length(3) + stream type(1) + stream id(4)
const RTMP_CHUNK_TYPE_1 = 1; // 7-bytes: delta(3) + length(3) + stream type(1)
const RTMP_CHUNK_TYPE_2 = 2; // 3-bytes: delta(3)
const RTMP_CHUNK_TYPE_3 = 3; // 0-byte

const RTMP_CHANNEL_PROTOCOL = 2;
const RTMP_CHANNEL_INVOKE = 3;
const RTMP_CHANNEL_AUDIO = 4;
const RTMP_CHANNEL_VIDEO = 5;
const RTMP_CHANNEL_DATA = 6;

const rtmpHeaderSize = [11, 7, 3, 0];

/* Protocol Control Messages */
const RTMP_TYPE_SET_CHUNK_SIZE = 1;
const RTMP_TYPE_ABORT = 2;
const RTMP_TYPE_ACKNOWLEDGEMENT = 3; // bytes read report
const RTMP_TYPE_WINDOW_ACKNOWLEDGEMENT_SIZE = 5; // server bandwidth
const RTMP_TYPE_SET_PEER_BANDWIDTH = 6; // client bandwidth

/* User Control Messages Event (4) */
const RTMP_TYPE_EVENT = 4;

const RTMP_TYPE_AUDIO = 8;
const RTMP_TYPE_VIDEO = 9;

/* Data Message */
const RTMP_TYPE_FLEX_STREAM = 15; // AMF3
const RTMP_TYPE_DATA = 18; // AMF0

/* Shared Object Message */
const RTMP_TYPE_FLEX_OBJECT = 16; // AMF3
const RTMP_TYPE_SHARED_OBJECT = 19; // AMF0

/* Command Message */
const RTMP_TYPE_FLEX_MESSAGE = 17; // AMF3
const RTMP_TYPE_INVOKE = 20; // AMF0

/* Aggregate Message */
const RTMP_TYPE_METADATA = 22;

const RTMP_CHUNK_SIZE = 128;
const RTMP_PING_TIME = 60000;
const RTMP_PING_TIMEOUT = 30000;

const STREAM_BEGIN = 0x00;
const STREAM_EOF = 0x01;
const STREAM_DRY = 0x02;
const STREAM_EMPTY = 0x1f;
const STREAM_READY = 0x20;

const RtmpPacket = {
    create: (fmt = 0, cid = 0) => {
        return {
            header: {
                fmt: fmt,
                cid: cid,
                timestamp: 0,
                length: 0,
                type: 0,
                stream_id: 0
            },
            clock: 0,
            payload: null,
            capacity: 0,
            bytes: 0
        };
    }
};

function isPrimitiveType(value) {
    switch (typeof value) {
        case "number":
        case "string":
        case "boolean":
            return true;
        default:
            return false;
    }
}

let debug = false;

function customLog(...params) {
    if (debug) console.log(...params);
}

function customDebug(...params) {
    if (debug) console.debug(...params);
}

class RtmpSession extends Events {
    /**
     * @param {Socket} socket
     * @param {RtmpRelayOptions} config
     * @param {boolean} passive
     */
    constructor(socket, config, passive = false) {
        super();
        this.socket = socket;

        this.localPort = config.port;

        if (config.debug === true) {
            debug = true;
        }

        this.passive = passive;
        if (passive) {
            this.socketwrite = (data) => {

            };
        } else {
            this.socketwrite = (data) => {
                this.socket.write(data);
            };
        }

        this.res = socket;
        this.id = NodeCoreUtils.generateNewSessionID();
        this.ip = socket.remoteAddress;
        this.TAG = "rtmp";

        //TODO make available in config
        this.pushAllowType = config.pushAllowType || RtmpAllowType.All;
        this.pullAllowType = config.pullAllowType || RtmpAllowType.All;

        this.handshakePayload = Buffer.alloc(RTMP_HANDSHAKE_SIZE);
        this.handshakeState = RTMP_HANDSHAKE_UNINIT;
        this.handshakeBytes = 0;

        this.parserBuffer = Buffer.alloc(MAX_CHUNK_HEADER);
        this.parserState = RTMP_PARSE_INIT;
        this.parserBytes = 0;
        this.parserBasicBytes = 0;
        this.parserPacket = null;
        this.inPackets = new Map();

        this.inChunkSize = RTMP_CHUNK_SIZE;
        this.outChunkSize = RTMP_CHUNK_SIZE;
        this.pingTime = RTMP_PING_TIME;
        this.pingTimeout = RTMP_PING_TIMEOUT;
        this.pingInterval = null;

        this.isLocal = this.ip.startsWith("127.0.0.1") || this.ip === "::1" || this.ip.endsWith("127.0.0.1");
        this.isStarting = false;
        this.isPublishing = false;
        this.isPlaying = false;
        this.isIdling = false;
        this.isPause = false;
        this.isReceiveAudio = true;
        this.isReceiveVideo = true;
        this.metaData = null;
        this.aacSequenceHeader = null;
        this.avcSequenceHeader = null;
        this.audioCodec = 0;
        this.audioCodecName = "";
        this.audioProfileName = "";
        this.audioSamplerate = 0;
        this.audioChannels = 1;
        this.videoCodec = 0;
        this.videoCodecName = "";
        this.videoProfileName = "";
        this.videoWidth = 0;
        this.videoHeight = 0;
        this.videoFps = 0;
        this.videoLevel = 0;

        this.gopCacheEnable = true;
        this.rtmpGopCacheQueue = null;
        this.flvGopCacheQueue = null;

        this.ackSize = 0;
        this.inAckSize = 0;
        this.inLastAck = 0;

        this.appname = "";
        // this.appInfo = {
        //     app: "",
        //     name: "",
        //     query: []
        // };
        this.streams = 0;

        this.playStreamId = 0;
        this.playStreamPath = "";
        this.playArgs = {};

        this.publishStreamId = 0;
        this.publishStreamPath = "";
        this.publishArgs = {};

        this.players = new Set();
        this.numPlayCache = 0;
        context.sessions.set(this.id, this);

        this.run();
    }

    get streamInfo() {
        const streamPath = this.publishStreamPath || this.playStreamPath;
        const streamArgs = this.publishArgs || this.playArgs;
        const streamKey = streamPath.substring(streamPath.lastIndexOf("/") + 1);
        return {
            sessionID: this.id,
            path: streamPath,
            query: streamArgs,
            publishUrl: `rtmp://${this.socket.remoteAddress}:${this.localPort}${streamPath}`,
            playUrl: `rtmp://127.0.0.1:${this.localPort}${streamPath}`,
            streamKey: streamKey,
            userID: streamKey.substring(streamKey.indexOf("_") + 1, streamKey.lastIndexOf("_"))
        };
    }

    get audioInfo() {
        return {
            samplerate: this.audioSamplerate,
            channels: this.audioChannels,
            codecName: this.audioCodecName,
            profileName: this.audioProfileName,
        }
    }

    get videoInfo() {
        return {
            width: this.videoWidth,
            height: this.videoHeight,
            fps: this.videoFps,
            codecName: this.videoCodecName,
            profileName: this.videoProfileName
        };
    }

    get codecInfo() {
        return {
            audio: this.audioInfo,
            video: this.videoInfo
        };
    }

    run() {
        if (!this.passive) {
            this.socket.on("data", this.onSocketData.bind(this));
            this.socket.on("close", this.onSocketClose.bind(this));
            this.socket.on("error", this.onSocketError.bind(this));
            this.socket.on("timeout", this.onSocketTimeout.bind(this));
            this.socket.setTimeout(this.pingTimeout);
        }
        this.isStarting = true;
    }

    stop() {
        if (this.isStarting) {
            this.isStarting = false;

            if (this.playStreamId > 0) {
                this.onDeleteStream({streamId: this.playStreamId});
            }

            if (this.publishStreamId > 0) {
                this.onDeleteStream({streamId: this.publishStreamId});
            }

            if (this.pingInterval != null) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }

            customLog(`disconnect id=${this.id}`);
            this.emit(RtmpSessionEvents.DoneConnect, this.id, this.connectCmdObj);

            context.sessions.delete(this.id);
            this.socket.destroy();
        }
    }

    reject() {
        customLog(`[reject] id=${this.id}`);
        this.stop();
    }

    flush() {
        if (this.numPlayCache > 0) {
            this.res.uncork();
        }
    }

    onSocketClose() {
        customLog('onSocketClose');
        this.stop();
    }

    onSocketError(e) {
        customLog('onSocketError', e);
        this.stop();
    }

    onSocketTimeout() {
        customLog('onSocketTimeout');
        this.stop();
    }

    onSocketData(data) {
        let bytes = data.length;
        let p = 0;
        let n = 0;
        while (bytes > 0) {
            switch (this.handshakeState) {
                case RTMP_HANDSHAKE_UNINIT:
                    // customLog('RTMP_HANDSHAKE_UNINIT');
                    this.handshakeState = RTMP_HANDSHAKE_0;
                    this.handshakeBytes = 0;
                    bytes -= 1;
                    p += 1;
                    break;
                case RTMP_HANDSHAKE_0:
                    //  customLog('RTMP_HANDSHAKE_0');
                    n = RTMP_HANDSHAKE_SIZE - this.handshakeBytes;
                    n = n <= bytes ? n : bytes;
                    data.copy(this.handshakePayload, this.handshakeBytes, p, p + n);
                    this.handshakeBytes += n;
                    bytes -= n;
                    p += n;
                    if (this.handshakeBytes === RTMP_HANDSHAKE_SIZE) {
                        this.handshakeState = RTMP_HANDSHAKE_1;
                        this.handshakeBytes = 0;
                        let s0s1s2 = Handshake.generateS0S1S2(this.handshakePayload);
                        this.socketwrite(s0s1s2);
                    }
                    break;
                case RTMP_HANDSHAKE_1:
                    // customLog('RTMP_HANDSHAKE_1');
                    n = RTMP_HANDSHAKE_SIZE - this.handshakeBytes;
                    n = n <= bytes ? n : bytes;
                    data.copy(this.handshakePayload, this.handshakeBytes, p, n);
                    this.handshakeBytes += n;
                    bytes -= n;
                    p += n;
                    if (this.handshakeBytes === RTMP_HANDSHAKE_SIZE) {
                        this.handshakeState = RTMP_HANDSHAKE_2;
                        this.handshakeBytes = 0;
                        this.handshakePayload = null;
                    }
                    break;
                case RTMP_HANDSHAKE_2:
                default:
                    // customLog('RTMP_HANDSHAKE_2');
                    return this.rtmpChunkRead(data, p, bytes);
            }
        }
    }

    rtmpChunkBasicHeaderCreate(fmt, cid) {
        let out;
        if (cid >= 64 + 255) {
            out = Buffer.alloc(3);
            out[0] = (fmt << 6) | 1;
            out[1] = (cid - 64) & 0xff;
            out[2] = ((cid - 64) >> 8) & 0xff;
        } else if (cid >= 64) {
            out = Buffer.alloc(2);
            out[0] = (fmt << 6) | 0;
            out[1] = (cid - 64) & 0xff;
        } else {
            out = Buffer.alloc(1);
            out[0] = (fmt << 6) | cid;
        }
        return out;
    }

    rtmpChunkMessageHeaderCreate(header) {
        let out = Buffer.alloc(rtmpHeaderSize[header.fmt % 4]);
        if (header.fmt <= RTMP_CHUNK_TYPE_2) {
            out.writeUIntBE(header.timestamp >= 0xffffff ? 0xffffff : header.timestamp, 0, 3);
        }

        if (header.fmt <= RTMP_CHUNK_TYPE_1) {
            out.writeUIntBE(header.length, 3, 3);
            out.writeUInt8(header.type, 6);
        }

        if (header.fmt === RTMP_CHUNK_TYPE_0) {
            out.writeUInt32LE(header.stream_id, 7);
        }
        return out;
    }

    rtmpChunksCreate(packet) {
        let header = packet.header;
        let payload = packet.payload;
        let payloadSize = header.length;
        let chunkSize = this.outChunkSize;
        let chunksOffset = 0;
        let payloadOffset = 0;
        let chunkBasicHeader = this.rtmpChunkBasicHeaderCreate(header.fmt, header.cid);
        let chunkBasicHeader3 = this.rtmpChunkBasicHeaderCreate(RTMP_CHUNK_TYPE_3, header.cid);
        let chunkMessageHeader = this.rtmpChunkMessageHeaderCreate(header);
        let useExtendedTimestamp = header.timestamp >= 0xffffff;
        let headerSize = chunkBasicHeader.length + chunkMessageHeader.length + (useExtendedTimestamp ? 4 : 0);
        let n = headerSize + payloadSize + Math.floor(payloadSize / chunkSize);

        if (useExtendedTimestamp) {
            n += Math.floor(payloadSize / chunkSize) * 4;
        }
        if (!(payloadSize % chunkSize)) {
            n -= 1;
            if (useExtendedTimestamp) {
                //TODO CHECK
                n -= 4;
            }
        }

        let chunks = Buffer.alloc(n);
        chunkBasicHeader.copy(chunks, chunksOffset);
        chunksOffset += chunkBasicHeader.length;
        chunkMessageHeader.copy(chunks, chunksOffset);
        chunksOffset += chunkMessageHeader.length;
        if (useExtendedTimestamp) {
            chunks.writeUInt32BE(header.timestamp, chunksOffset);
            chunksOffset += 4;
        }
        while (payloadSize > 0) {
            if (payloadSize > chunkSize) {
                payload.copy(chunks, chunksOffset, payloadOffset, payloadOffset + chunkSize);
                payloadSize -= chunkSize;
                chunksOffset += chunkSize;
                payloadOffset += chunkSize;
                chunkBasicHeader3.copy(chunks, chunksOffset);
                chunksOffset += chunkBasicHeader3.length;
                if (useExtendedTimestamp) {
                    chunks.writeUInt32BE(header.timestamp, chunksOffset);
                    chunksOffset += 4;
                }
            } else {
                payload.copy(chunks, chunksOffset, payloadOffset, payloadOffset + payloadSize);
                payloadSize -= payloadSize;
                chunksOffset += payloadSize;
                payloadOffset += payloadSize;
            }
        }
        return chunks;
    }

    rtmpChunkRead(data, p, bytes) {
        customLog('rtmpChunkRead', p, bytes);

        let size = 0;
        let offset = 0;
        let extended_timestamp = 0;

        while (offset < bytes) {
            switch (this.parserState) {
                case RTMP_PARSE_INIT:
                    this.parserBytes = 1;
                    this.parserBuffer[0] = data[p + offset++];
                    if (0 === (this.parserBuffer[0] & 0x3f)) {
                        this.parserBasicBytes = 2;
                    } else if (1 === (this.parserBuffer[0] & 0x3f)) {
                        this.parserBasicBytes = 3;
                    } else {
                        this.parserBasicBytes = 1;
                    }
                    this.parserState = RTMP_PARSE_BASIC_HEADER;
                    break;
                case RTMP_PARSE_BASIC_HEADER:
                    while (this.parserBytes < this.parserBasicBytes && offset < bytes) {
                        this.parserBuffer[this.parserBytes++] = data[p + offset++];
                    }
                    if (this.parserBytes >= this.parserBasicBytes) {
                        this.parserState = RTMP_PARSE_MESSAGE_HEADER;
                    }
                    break;
                case RTMP_PARSE_MESSAGE_HEADER:
                    size = rtmpHeaderSize[this.parserBuffer[0] >> 6] + this.parserBasicBytes;
                    while (this.parserBytes < size && offset < bytes) {
                        this.parserBuffer[this.parserBytes++] = data[p + offset++];
                    }
                    if (this.parserBytes >= size) {
                        this.rtmpPacketParse();
                        this.parserState = RTMP_PARSE_EXTENDED_TIMESTAMP;
                    }
                    break;
                case RTMP_PARSE_EXTENDED_TIMESTAMP:
                    size = rtmpHeaderSize[this.parserPacket.header.fmt] + this.parserBasicBytes;
                    if (this.parserPacket.header.timestamp === 0xffffff) size += 4;
                    while (this.parserBytes < size && offset < bytes) {
                        this.parserBuffer[this.parserBytes++] = data[p + offset++];
                    }
                    if (this.parserBytes >= size) {
                        if (this.parserPacket.header.timestamp === 0xffffff) {
                            extended_timestamp = this.parserBuffer.readUInt32BE(rtmpHeaderSize[this.parserPacket.header.fmt] + this.parserBasicBytes);
                        } else {
                            extended_timestamp = this.parserPacket.header.timestamp;
                        }

                        if (this.parserPacket.bytes === 0) {
                            if (RTMP_CHUNK_TYPE_0 === this.parserPacket.header.fmt) {
                                this.parserPacket.clock = extended_timestamp;
                            } else {
                                this.parserPacket.clock += extended_timestamp;
                            }
                            this.rtmpPacketAlloc();
                        }
                        this.parserState = RTMP_PARSE_PAYLOAD;
                    }
                    break;
                case RTMP_PARSE_PAYLOAD:
                    size = Math.min(this.inChunkSize - (this.parserPacket.bytes % this.inChunkSize), this.parserPacket.header.length - this.parserPacket.bytes);
                    size = Math.min(size, bytes - offset);
                    if (size > 0) {
                        data.copy(this.parserPacket.payload, this.parserPacket.bytes, p + offset, p + offset + size);
                    }
                    this.parserPacket.bytes += size;
                    offset += size;

                    if (this.parserPacket.bytes >= this.parserPacket.header.length) {
                        this.parserState = RTMP_PARSE_INIT;
                        this.parserPacket.bytes = 0;
                        if (this.parserPacket.clock > 0xffffffff) {
                            //TODO Shit code, rewrite chunkcreate
                            break;
                        }
                        this.rtmpHandler();
                    } else if (0 === this.parserPacket.bytes % this.inChunkSize) {
                        this.parserState = RTMP_PARSE_INIT;
                    }
                    break;
            }
        }

        this.inAckSize += data.length;
        if (this.inAckSize >= 0xf0000000) {
            this.inAckSize = 0;
            this.inLastAck = 0;
        }
        if (this.ackSize > 0 && this.inAckSize - this.inLastAck >= this.ackSize) {
            this.inLastAck = this.inAckSize;
            this.sendACK(this.inAckSize);
        }
    }

    rtmpPacketParse() {
        let fmt = this.parserBuffer[0] >> 6;
        let cid = 0;
        if (this.parserBasicBytes === 2) {
            cid = 64 + this.parserBuffer[1];
        } else if (this.parserBasicBytes === 3) {
            cid = (64 + this.parserBuffer[1] + this.parserBuffer[2]) << 8;
        } else {
            cid = this.parserBuffer[0] & 0x3f;
        }
        let hasp = this.inPackets.has(cid);
        if (!hasp) {
            this.parserPacket = RtmpPacket.create(fmt, cid);
            this.inPackets.set(cid, this.parserPacket);
        } else {
            this.parserPacket = this.inPackets.get(cid);
        }
        this.parserPacket.header.fmt = fmt;
        this.parserPacket.header.cid = cid;
        this.rtmpChunkMessageHeaderRead();

        if (this.parserPacket.header.type > RTMP_TYPE_METADATA) {
            console.error("packet parse error.", this.parserPacket);
            this.stop();
        }
    }

    rtmpChunkMessageHeaderRead() {
        let offset = this.parserBasicBytes;

        // timestamp / delta
        if (this.parserPacket.header.fmt <= RTMP_CHUNK_TYPE_2) {
            this.parserPacket.header.timestamp = this.parserBuffer.readUIntBE(offset, 3);
            offset += 3;
        }

        // message length + type
        if (this.parserPacket.header.fmt <= RTMP_CHUNK_TYPE_1) {
            this.parserPacket.header.length = this.parserBuffer.readUIntBE(offset, 3);
            this.parserPacket.header.type = this.parserBuffer[offset + 3];
            offset += 4;
        }

        if (this.parserPacket.header.fmt === RTMP_CHUNK_TYPE_0) {
            this.parserPacket.header.stream_id = this.parserBuffer.readUInt32LE(offset);
            offset += 4;
        }
        return offset;
    }

    rtmpPacketAlloc() {
        if (this.parserPacket.capacity < this.parserPacket.header.length) {
            this.parserPacket.payload = Buffer.alloc(this.parserPacket.header.length + 1024);
            this.parserPacket.capacity = this.parserPacket.header.length + 1024;
        }
    }

    rtmpHandler() {
        switch (this.parserPacket.header.type) {
            case RTMP_TYPE_SET_CHUNK_SIZE:
            case RTMP_TYPE_ABORT:
            case RTMP_TYPE_ACKNOWLEDGEMENT:
            case RTMP_TYPE_WINDOW_ACKNOWLEDGEMENT_SIZE:
            case RTMP_TYPE_SET_PEER_BANDWIDTH:
                return 0 === this.rtmpControlHandler() ? -1 : 0;
            case RTMP_TYPE_EVENT:
                return 0 === this.rtmpEventHandler() ? -1 : 0;
            case RTMP_TYPE_AUDIO:
                return this.rtmpAudioHandler();
            case RTMP_TYPE_VIDEO:
                return this.rtmpVideoHandler();
            case RTMP_TYPE_FLEX_MESSAGE:
            case RTMP_TYPE_INVOKE:
                return this.rtmpInvokeHandler();
            case RTMP_TYPE_FLEX_STREAM: // AMF3
            case RTMP_TYPE_DATA: // AMF0
                return this.rtmpDataHandler();
        }
    }

    rtmpControlHandler() {
        let payload = this.parserPacket.payload;
        switch (this.parserPacket.header.type) {
            case RTMP_TYPE_SET_CHUNK_SIZE:
                this.inChunkSize = payload.readUInt32BE();
                customDebug('set inChunkSize', this.inChunkSize);
                break;
            case RTMP_TYPE_ABORT:
                break;
            case RTMP_TYPE_ACKNOWLEDGEMENT:
                break;
            case RTMP_TYPE_WINDOW_ACKNOWLEDGEMENT_SIZE:
                this.ackSize = payload.readUInt32BE();
                customDebug('set ack Size', this.ackSize);
                break;
            case RTMP_TYPE_SET_PEER_BANDWIDTH:
                break;
        }
    }

    rtmpEventHandler() {
    }

    rtmpAudioHandler() {
        let payload = this.parserPacket.payload.slice(0, this.parserPacket.header.length);
        let sound_format = (payload[0] >> 4) & 0x0f;
        let sound_type = payload[0] & 0x01;
        let sound_size = (payload[0] >> 1) & 0x01;
        let sound_rate = (payload[0] >> 2) & 0x03;

        if (this.audioCodec == 0) {
            this.audioCodec = sound_format;
            this.audioCodecName = AUDIO_CODEC_NAME[sound_format];
            this.audioSamplerate = AUDIO_SOUND_RATE[sound_rate];
            this.audioChannels = ++sound_type;

            if (sound_format == 4) {
                this.audioSamplerate = 16000;
            } else if (sound_format == 5) {
                this.audioSamplerate = 8000;
            } else if (sound_format == 11) {
                this.audioSamplerate = 16000;
            } else if (sound_format == 14) {
                this.audioSamplerate = 8000;
            }

            if (sound_format != 10) {
                //customLog(`[publish] Handle audio. id=${this.id} streamPath=${this.publishStreamPath} sound_format=${sound_format} sound_type=${sound_type} sound_size=${sound_size} sound_rate=${sound_rate} codec_name=${this.audioCodecName} ${this.audioSamplerate} ${this.audioChannels}ch`);
            }
            this.emit("audioCodec", this.audioInfo);
        }

        if (sound_format == 10 && payload[1] == 0) {
            //cache aac sequence header
            this.isFirstAudioReceived = true;
            this.aacSequenceHeader = Buffer.alloc(payload.length);
            payload.copy(this.aacSequenceHeader);
            let info = AV.readAACSpecificConfig(this.aacSequenceHeader);
            this.audioProfileName = AV.getAACProfileName(info);
            this.audioSamplerate = info.sample_rate;
            this.audioChannels = info.channels;
            //customLog(`[publish] Handle audio. id=${this.id} streamPath=${this.publishStreamPath} sound_format=${sound_format} sound_type=${sound_type} sound_size=${sound_size} sound_rate=${sound_rate} codec_name=${this.audioCodecName} ${this.audioSamplerate} ${this.audioChannels}ch`);

            this.emit("audioCodec", this.audioInfo);
        }

        let packet = RtmpPacket.create();
        packet.header.fmt = RTMP_CHUNK_TYPE_0;
        packet.header.cid = RTMP_CHANNEL_AUDIO;
        packet.header.type = RTMP_TYPE_AUDIO;
        packet.payload = payload;
        packet.header.length = packet.payload.length;
        packet.header.timestamp = this.parserPacket.clock;
        let rtmpChunks = this.rtmpChunksCreate(packet);

        //cache gop
        if (this.rtmpGopCacheQueue != null) {
            if (this.aacSequenceHeader != null && payload[1] === 0) {
                //skip aac sequence header
            } else {
                this.rtmpGopCacheQueue.add(rtmpChunks);
                // this.flvGopCacheQueue.add(flvTag);
            }
        }

        for (let playerId of this.players) {
            let playerSession = context.sessions.get(playerId);

            if (playerSession.numPlayCache === 0) {
                playerSession.res.cork();
            }

            if (playerSession instanceof RtmpSession) {
                if (playerSession.isStarting && playerSession.isPlaying && !playerSession.isPause && playerSession.isReceiveAudio) {
                    rtmpChunks.writeUInt32LE(playerSession.playStreamId, 8);
                    playerSession.res.write(rtmpChunks);
                }
            }

            playerSession.numPlayCache++;

            if (playerSession.numPlayCache === 10) {
                process.nextTick(() => playerSession.res.uncork());
                playerSession.numPlayCache = 0;
            }
        }
    }

    rtmpVideoHandler() {
        let payload = this.parserPacket.payload.slice(0, this.parserPacket.header.length);
        let frame_type = (payload[0] >> 4) & 0x0f;
        let codec_id = payload[0] & 0x0f;

        if (codec_id == 7 || codec_id == 12) {
            //cache avc sequence header
            if (frame_type == 1 && payload[1] == 0) {
                this.avcSequenceHeader = Buffer.alloc(payload.length);
                payload.copy(this.avcSequenceHeader);
                let info = AV.readAVCSpecificConfig(this.avcSequenceHeader);
                this.videoWidth = info.width;
                this.videoHeight = info.height;
                this.videoProfileName = AV.getAVCProfileName(info);
                this.videoLevel = info.level;
                this.rtmpGopCacheQueue = this.gopCacheEnable ? new Set() : null;
                this.flvGopCacheQueue = this.gopCacheEnable ? new Set() : null;
                this.emit("videoCodec", this.videoInfo);
                //if(DEBUG) customLog(`[rtmp publish] avc sequence header`,this.avcSequenceHeader);
            }
        }

        if (this.videoCodec == 0) {
            this.videoCodec = codec_id;
            this.videoCodecName = VIDEO_CODEC_NAME[codec_id];
            this.emit("videoCodec", this.videoInfo);
            this.emit("codec", this.codecInfo);
            //customLog(`[publish] Handle video. id=${this.id} streamPath=${this.publishStreamPath} frame_type=${frame_type} codec_id=${codec_id} codec_name=${this.videoCodecName} ${this.videoWidth}x${this.videoHeight}`);
        }

        let packet = RtmpPacket.create();
        packet.header.fmt = RTMP_CHUNK_TYPE_0;
        packet.header.cid = RTMP_CHANNEL_VIDEO;
        packet.header.type = RTMP_TYPE_VIDEO;
        packet.payload = payload;
        packet.header.length = packet.payload.length;
        packet.header.timestamp = this.parserPacket.clock;
        let rtmpChunks = this.rtmpChunksCreate(packet);

        //cache gop
        if ((codec_id == 7 || codec_id == 12) && this.rtmpGopCacheQueue != null) {
            if (frame_type == 1 && payload[1] == 1) {
                this.rtmpGopCacheQueue.clear();
                this.flvGopCacheQueue.clear();
            }
            if (frame_type == 1 && payload[1] == 0) {
                //skip avc sequence header
            } else {
                this.rtmpGopCacheQueue.add(rtmpChunks);
                //this.flvGopCacheQueue.add(flvTag);
            }
        }

        for (let playerId of this.players) {
            let playerSession = context.sessions.get(playerId);

            if (playerSession.numPlayCache === 0) {
                playerSession.res.cork();
            }

            if (playerSession instanceof RtmpSession) {
                if (playerSession.isStarting && playerSession.isPlaying && !playerSession.isPause && playerSession.isReceiveVideo) {
                    rtmpChunks.writeUInt32LE(playerSession.playStreamId, 8);
                    playerSession.res.write(rtmpChunks);
                }
            }

            playerSession.numPlayCache++;

            if (playerSession.numPlayCache === 10) {
                process.nextTick(() => playerSession.res.uncork());
                playerSession.numPlayCache = 0;
            }
        }
    }

    rtmpDataHandler() {
        let offset = this.parserPacket.header.type === RTMP_TYPE_FLEX_STREAM ? 1 : 0;
        let payload = this.parserPacket.payload.slice(offset, this.parserPacket.header.length);
        let dataMessage = AMF.decodeAmf0Data(payload);
        switch (dataMessage.cmd) {
            case "@setDataFrame":
                if (dataMessage.dataObj) {
                    this.audioSamplerate = dataMessage.dataObj.audiosamplerate;
                    this.audioChannels = dataMessage.dataObj.stereo ? 2 : 1;
                    this.videoWidth = dataMessage.dataObj.width;
                    this.videoHeight = dataMessage.dataObj.height;
                    this.videoFps = dataMessage.dataObj.framerate;

                }

                let opt = {
                    cmd: "onMetaData",
                    dataObj: dataMessage.dataObj
                };
                this.metaData = AMF.encodeAmf0Data(opt);

                let packet = RtmpPacket.create();
                packet.header.fmt = RTMP_CHUNK_TYPE_0;
                packet.header.cid = RTMP_CHANNEL_DATA;
                packet.header.type = RTMP_TYPE_DATA;
                packet.payload = this.metaData;
                packet.header.length = packet.payload.length;
                let rtmpChunks = this.rtmpChunksCreate(packet);

                for (let playerId of this.players) {
                    let playerSession = context.sessions.get(playerId);
                    if (playerSession instanceof RtmpSession) {
                        if (playerSession.isStarting && playerSession.isPlaying && !playerSession.isPause) {
                            rtmpChunks.writeUInt32LE(playerSession.playStreamId, 8);
                            playerSession.socket.write(rtmpChunks);
                        }
                    }
                }
                break;
        }
    }

    rtmpInvokeHandler() {
        let offset = this.parserPacket.header.type === RTMP_TYPE_FLEX_MESSAGE ? 1 : 0;
        let payload = this.parserPacket.payload.slice(offset, this.parserPacket.header.length);
        let invokeMessage = AMF.decodeAmf0Cmd(payload);
        customLog(invokeMessage);
        switch (invokeMessage.cmd) {
            case "connect":
                this.onConnect(invokeMessage);
                break;
            case "releaseStream":
                break;
            case "FCPublish":
                break;
            case "createStream":
                this.onCreateStream(invokeMessage);
                break;
            case "publish":
                this.onPublish(invokeMessage);
                break;
            case "play":
                this.onPlay(invokeMessage);
                break;
            case "pause":
                this.onPause(invokeMessage);
                break;
            case "FCUnpublish":
                break;
            case "deleteStream":
                this.onDeleteStream(invokeMessage);
                break;
            case "closeStream":
                this.onCloseStream();
                break;
            case "receiveAudio":
                this.onReceiveAudio(invokeMessage);
                break;
            case "receiveVideo":
                this.onReceiveVideo(invokeMessage);
                break;
        }
    }

    sendACK(size) {
        let rtmpBuffer = Buffer.from("02000000000004030000000000000000", "hex");
        rtmpBuffer.writeUInt32BE(size, 12);
        this.socketwrite(rtmpBuffer);
    }

    sendWindowACK(size) {
        let rtmpBuffer = Buffer.from("02000000000004050000000000000000", "hex");
        rtmpBuffer.writeUInt32BE(size, 12);
        this.socketwrite(rtmpBuffer);
    }

    setPeerBandwidth(size, type) {
        let rtmpBuffer = Buffer.from("0200000000000506000000000000000000", "hex");
        rtmpBuffer.writeUInt32BE(size, 12);
        rtmpBuffer[16] = type;
        this.socketwrite(rtmpBuffer);
    }

    setChunkSize(size) {
        let rtmpBuffer = Buffer.from("02000000000004010000000000000000", "hex");
        rtmpBuffer.writeUInt32BE(size, 12);
        this.socketwrite(rtmpBuffer);
    }

    sendStreamStatus(st, id) {
        let rtmpBuffer = Buffer.from("020000000000060400000000000000000000", "hex");
        rtmpBuffer.writeUInt16BE(st, 12);
        rtmpBuffer.writeUInt32BE(id, 14);
        this.socketwrite(rtmpBuffer);
    }

    sendInvokeMessage(sid, opt) {
        let packet = RtmpPacket.create();
        packet.header.fmt = RTMP_CHUNK_TYPE_0;
        packet.header.cid = RTMP_CHANNEL_INVOKE;
        packet.header.type = RTMP_TYPE_INVOKE;
        packet.header.stream_id = sid;
        packet.payload = AMF.encodeAmf0Cmd(opt);
        packet.header.length = packet.payload.length;
        let chunks = this.rtmpChunksCreate(packet);
        this.socketwrite(chunks);
    }

    sendDataMessage(opt, sid) {
        let packet = RtmpPacket.create();
        packet.header.fmt = RTMP_CHUNK_TYPE_0;
        packet.header.cid = RTMP_CHANNEL_DATA;
        packet.header.type = RTMP_TYPE_DATA;
        packet.payload = AMF.encodeAmf0Data(opt);
        packet.header.length = packet.payload.length;
        packet.header.stream_id = sid;
        let chunks = this.rtmpChunksCreate(packet);
        this.socketwrite(chunks);
    }

    sendStatusMessage(sid, level, code, description) {
        let opt = {
            cmd: "onStatus",
            transId: 0,
            cmdObj: null,
            info: {
                level: level,
                code: code,
                description: description
            }
        };
        this.sendInvokeMessage(sid, opt);
    }

    sendRtmpSampleAccess(sid) {
        let opt = {
            cmd: "|RtmpSampleAccess",
            bool1: false,
            bool2: false
        };
        this.sendDataMessage(opt, sid);
    }

    sendPingRequest() {
        let currentTimestamp = Date.now() - this.startTimestamp;
        let packet = RtmpPacket.create();
        packet.header.fmt = RTMP_CHUNK_TYPE_0;
        packet.header.cid = RTMP_CHANNEL_PROTOCOL;
        packet.header.type = RTMP_TYPE_EVENT;
        packet.header.timestamp = currentTimestamp;
        packet.payload = Buffer.from([0, 6, (currentTimestamp >> 24) & 0xff, (currentTimestamp >> 16) & 0xff, (currentTimestamp >> 8) & 0xff, currentTimestamp & 0xff]);
        packet.header.length = packet.payload.length;
        let chunks = this.rtmpChunksCreate(packet);
        this.socketwrite(chunks);
    }

    respondConnect(tid) {
        let opt = {
            cmd: "_result",
            transId: tid,
            cmdObj: {
                fmsVer: "FMS/3,0,1,123",
                capabilities: 31
            },
            info: {
                level: "status",
                code: "NetConnection.Connect.Success",
                description: "Connection succeeded.",
                objectEncoding: this.objectEncoding
            }
        };
        this.sendInvokeMessage(0, opt);
    }

    respondCreateStream(tid) {
        this.streams++;
        let opt = {
            cmd: "_result",
            transId: tid,
            cmdObj: null,
            info: this.streams
        };
        this.sendInvokeMessage(0, opt);
    }

    respondPlay() {
        this.sendStreamStatus(STREAM_BEGIN, this.playStreamId);
        this.sendStatusMessage(this.playStreamId, "status", "NetStream.Play.Reset", "Playing and resetting stream.");
        this.sendStatusMessage(this.playStreamId, "status", "NetStream.Play.Start", "Started playing stream.");
        this.sendRtmpSampleAccess();
    }

    onConnect(invokeMessage) {
        //invokeMessage.cmdObj.app = invokeMessage.cmdObj.app.replace("/", ""); //fix jwplayer

        this.connectCmdObj = invokeMessage.cmdObj;
        this.appname = invokeMessage.cmdObj.app;

        //customLog(appArr, this.appInfo);

        if (!this.isStarting) {
            customLog(this.playStreamId, "Is already Starting");
            return;
        }
        //customLog(invokeMessage.cmdObj);

        this.objectEncoding = invokeMessage.cmdObj.objectEncoding != null ? invokeMessage.cmdObj.objectEncoding : 0;
        this.connectTime = new Date();
        this.startTimestamp = Date.now();
        this.pingInterval = setInterval(() => {
            this.sendPingRequest();
        }, this.pingTime);
        this.sendWindowACK(5000000);
        this.setPeerBandwidth(5000000, 2);
        this.setChunkSize(this.outChunkSize);
        this.respondConnect(invokeMessage.transId);

        customLog(`[rtmp connect] id=${this.id} ip=${this.ip} app=${this.appname} args=${JSON.stringify(invokeMessage.cmdObj)}`);
        this.emit(RtmpSessionEvents.PostConnect, {
            id: this.id,
            ip: this.ip,
            app: this.appname,
            args: invokeMessage.cmdObj
        });
    }

    onCreateStream(invokeMessage) {
        this.respondCreateStream(invokeMessage.transId);
    }

    onPublish(invokeMessage) {
        if (typeof invokeMessage.streamName !== "string") {
            return;
        }

        if (!this.pushAllowType.check(this.ip)) {
            customLog("Push reject", this.pushAllowType);
            this.sendStatusMessage(this.playStreamId, "error", "NetStream.publish.Unauthorized", "Authorization required.");
            return;
        }

        this.publishStreamPath = ("/" + this.appname + "/" + invokeMessage.streamName.split("?")[0]);
        this.publishArgs = Object.fromEntries(Object.entries(QueryString.parse(invokeMessage.streamName.split("?")[1])));
        this.publishStreamId = this.parserPacket.header.stream_id;

        if (!this.isStarting) {
            return;
        }

        this.emit(RtmpSessionEvents.PrePublish, this.streamInfo);

        if (context.publishers.has(this.publishStreamPath)) {
            //customLog(`[publish] Already has a stream. id=${this.id} streamPath=${this.publishStreamPath} streamId=${this.publishStreamId}`);
            this.sendStatusMessage(this.publishStreamId, "error", "NetStream.Publish.BadName", "Stream already publishing");
        } else if (this.isPublishing) {
            //customLog(`[publish] NetConnection is publishing. id=${this.id} streamPath=${this.publishStreamPath} streamId=${this.publishStreamId}`);
            this.sendStatusMessage(this.publishStreamId, "error", "NetStream.Publish.BadConnection", "Connection already publishing");
        } else {
            //customLog(`[publish] New stream. id=${this.id} streamPath=${this.publishStreamPath} streamId=${this.publishStreamId}`);
            context.publishers.set(this.publishStreamPath, this.id);
            this.isPublishing = true;

            this.sendStatusMessage(this.publishStreamId, "status", "NetStream.Publish.Start", `${this.publishStreamPath} is now published.`);
            for (let idlePlayerId of context.idlePlayers) {
                let idlePlayer = context.sessions.get(idlePlayerId);
                if (idlePlayer.playStreamPath === this.publishStreamPath) {
                    idlePlayer.onStartPlay();
                    context.idlePlayers.delete(idlePlayerId);
                }
            }
            this.emit(RtmpSessionEvents.PostPublish, this.streamInfo);
        }
    }

    onPlay(invokeMessage) {
        if (typeof invokeMessage.streamName !== "string") {
            return;
        }
        this.playStreamPath = "/" + this.appname + "/" + invokeMessage.streamName.split("?")[0];
        this.playArgs = Object.fromEntries(Object.entries(QueryString.parse(invokeMessage.streamName.split("?")[1])));
        this.playStreamId = this.parserPacket.header.stream_id;

        if (!this.isStarting) {
            return;
        }

        this.emit(RtmpSessionEvents.PrePlay, this.streamInfo);

        if (!this.pullAllowType.check(this.ip)) {
            customLog("Pull Reject", this.pullAllowType);
            this.sendStatusMessage(this.playStreamId, "error", "NetStream.play.Unauthorized", "Authorization required.");
            return;
        }

        if (this.isPlaying) {
            customLog(`[play] NetConnection is playing. id=${this.id} streamPath=${this.playStreamPath}  streamId=${this.playStreamId} `);
            this.sendStatusMessage(this.playStreamId, "error", "NetStream.Play.BadConnection", "Connection already playing");
        } else {
            customLog(`[play] NetConnection responding playing. id=${this.id} streamPath=${this.playStreamPath}  streamId=${this.playStreamId} `);
            this.respondPlay();
        }
        //customLog("onPlay: ", [this.playStreamPath, context.publishers]);
        if (context.publishers.has(this.playStreamPath)) {
            this.onStartPlay();
        } else {
            customLog(`[play] Stream not found. id=${this.id} streamPath=${this.playStreamPath}  streamId=${this.playStreamId}`);
            this.isIdling = true;
            context.idlePlayers.add(this.id);
        }
    }

    onStartPlay() {
        let publisherId = context.publishers.get(this.playStreamPath);
        let publisher = context.sessions.get(publisherId);
        let players = publisher.players;
        players.add(this.id);
        //customLog("onStartPlay: ",[ this.playStreamPath, publisherId, publisher, players]);

        if (publisher.metaData != null) {
            let packet = RtmpPacket.create();
            packet.header.fmt = RTMP_CHUNK_TYPE_0;
            packet.header.cid = RTMP_CHANNEL_DATA;
            packet.header.type = RTMP_TYPE_DATA;
            packet.payload = publisher.metaData;
            packet.header.length = packet.payload.length;
            packet.header.stream_id = this.playStreamId;
            let chunks = this.rtmpChunksCreate(packet);
            this.socketwrite(chunks);
        }

        if (publisher.audioCodec === 10) {
            let packet = RtmpPacket.create();
            packet.header.fmt = RTMP_CHUNK_TYPE_0;
            packet.header.cid = RTMP_CHANNEL_AUDIO;
            packet.header.type = RTMP_TYPE_AUDIO;
            packet.payload = publisher.aacSequenceHeader;
            packet.header.length = packet.payload.length;
            packet.header.stream_id = this.playStreamId;
            let chunks = this.rtmpChunksCreate(packet);
            this.socketwrite(chunks);
        }

        if (publisher.videoCodec === 7 || publisher.videoCodec === 12) {
            let packet = RtmpPacket.create();
            packet.header.fmt = RTMP_CHUNK_TYPE_0;
            packet.header.cid = RTMP_CHANNEL_VIDEO;
            packet.header.type = RTMP_TYPE_VIDEO;
            packet.payload = publisher.avcSequenceHeader;
            packet.header.length = packet.payload.length;
            packet.header.stream_id = this.playStreamId;
            let chunks = this.rtmpChunksCreate(packet);
            this.socketwrite(chunks);
        }

        if (publisher.rtmpGopCacheQueue != null) {
            for (let chunks of publisher.rtmpGopCacheQueue) {
                chunks.writeUInt32LE(this.playStreamId, 8);
                this.socketwrite(chunks);
            }
        }

        this.isIdling = false;
        this.isPlaying = true;
        this.emit(RtmpSessionEvents.PostPlay, this.streamInfo);
        customLog(`[play] Join stream. id=${this.id} streamPath=${this.playStreamPath}  streamId=${this.playStreamId} `);
    }

    onPause(invokeMessage) {
        this.isPause = invokeMessage.pause;
        let c = this.isPause ? "NetStream.Pause.Notify" : "NetStream.Unpause.Notify";
        let d = this.isPause ? "Paused live" : "Unpaused live";
        customLog(`[play] ${d} stream. id=${this.id} streamPath=${this.playStreamPath}  streamId=${this.playStreamId} `);
        if (!this.isPause) {
            this.sendStreamStatus(STREAM_BEGIN, this.playStreamId);
            if (context.publishers.has(this.publishStreamPath)) {
                //fix ckplayer
                let publisherId = context.publishers.get(this.playStreamPath);
                let publisher = context.sessions.get(publisherId);
                let players = publisher.players;
                if (publisher.audioCodec === 10) {
                    let packet = RtmpPacket.create();
                    packet.header.fmt = RTMP_CHUNK_TYPE_0;
                    packet.header.cid = RTMP_CHANNEL_AUDIO;
                    packet.header.type = RTMP_TYPE_AUDIO;
                    packet.payload = publisher.aacSequenceHeader;
                    packet.header.length = packet.payload.length;
                    packet.header.stream_id = this.playStreamId;
                    packet.header.timestamp = publisher.parserPacket.clock; // ?? 0 or clock
                    let chunks = this.rtmpChunksCreate(packet);
                    this.socketwrite(chunks);
                }
                if (publisher.videoCodec === 7 || publisher.videoCodec === 12) {
                    let packet = RtmpPacket.create();
                    packet.header.fmt = RTMP_CHUNK_TYPE_0;
                    packet.header.cid = RTMP_CHANNEL_VIDEO;
                    packet.header.type = RTMP_TYPE_VIDEO;
                    packet.payload = publisher.avcSequenceHeader;
                    packet.header.length = packet.payload.length;
                    packet.header.stream_id = this.playStreamId;
                    packet.header.timestamp = publisher.parserPacket.clock; // ?? 0 or clock
                    let chunks = this.rtmpChunksCreate(packet);
                    this.socketwrite(chunks);
                }
            }
        } else {
            this.sendStreamStatus(STREAM_EOF, this.playStreamId);
        }
        this.sendStatusMessage(this.playStreamId, c, d);
    }

    onReceiveAudio(invokeMessage) {
        this.isReceiveAudio = invokeMessage.bool;
        customLog(`[play] receiveAudio=${this.isReceiveAudio} id=${this.id} `);
    }

    onReceiveVideo(invokeMessage) {
        this.isReceiveVideo = invokeMessage.bool;
        customLog(`[play] receiveVideo=${this.isReceiveVideo} id=${this.id} `);
    }

    onCloseStream() {
        //red5-publisher
        let closeStream = {streamId: this.parserPacket.header.stream_id};
        this.onDeleteStream(closeStream);
    }

    onDeleteStream(invokeMessage) {
        if (invokeMessage.streamId == this.playStreamId) {
            if (this.isIdling) {
                context.idlePlayers.delete(this.id);
                this.isIdling = false;
            } else {
                let publisherId = context.publishers.get(this.playStreamPath);
                if (publisherId != null) {
                    context.sessions.get(publisherId).players.delete(this.id);
                }
                this.emit(RtmpSessionEvents.DonePlay, this.id, this.playStreamPath, this.playArgs);
                this.isPlaying = false;
            }
            customLog(`[play] Close stream. id=${this.id} streamPath=${this.playStreamPath} streamId=${this.playStreamId}`);
            if (this.isStarting) {
                this.sendStatusMessage(this.playStreamId, "status", "NetStream.Play.Stop", "Stopped playing stream.");
            }
            this.playStreamId = 0;
            this.playStreamPath = "";
        }

        if (invokeMessage.streamId == this.publishStreamId) {
            if (this.isPublishing) {
                //customLog(`[publish] Close stream. id=${this.id} streamPath=${this.publishStreamPath} streamId=${this.publishStreamId}`);
                this.emit(RtmpSessionEvents.DonePublish, this.streamInfo);
                if (this.isStarting) {
                    this.sendStatusMessage(this.publishStreamId, "status", "NetStream.Unpublish.Success", `${this.publishStreamPath} is now unpublished.`);
                }

                for (let playerId of this.players) {
                    let playerSession = context.sessions.get(playerId);
                    if (playerSession instanceof RtmpSession) {
                        playerSession.sendStatusMessage(playerSession.playStreamId, "status", "NetStream.Play.UnpublishNotify", "stream is now unpublished.");
                        playerSession.flush();
                    } else {
                        playerSession.stop();
                    }
                }

                //let the players to idlePlayers
                for (let playerId of this.players) {
                    let playerSession = context.sessions.get(playerId);
                    context.idlePlayers.add(playerId);
                    playerSession.isPlaying = false;
                    playerSession.isIdling = true;
                    if (playerSession instanceof RtmpSession) {
                        playerSession.sendStreamStatus(STREAM_EOF, playerSession.playStreamId);
                    }
                }

                context.publishers.delete(this.publishStreamPath);
                if (this.rtmpGopCacheQueue) {
                    this.rtmpGopCacheQueue.clear();
                }
                if (this.flvGopCacheQueue) {
                    this.flvGopCacheQueue.clear();
                }
                this.players.clear();
                this.isPublishing = false;
            }
            this.publishStreamId = 0;
            //customLog("RESET publishStreamPath");
            this.publishStreamPath = "";
        }
    }
}


module.exports = {RtmpSession, RtmpSessionEvents, context};

