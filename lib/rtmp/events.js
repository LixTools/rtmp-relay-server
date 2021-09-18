class RtmpSessionEvents {
    static get AllEvents() {
        return [
            RtmpSessionEvents.SocketClose,
            RtmpSessionEvents.SocketError,
            RtmpSessionEvents.SocketConnect,
            RtmpSessionEvents.IngestClose,
            RtmpSessionEvents.IngestError,
            RtmpSessionEvents.IngestConnect,
            RtmpSessionEvents.DoneConnect,//"doneConnect",
            RtmpSessionEvents.PreConnect,//"preConnect",
            RtmpSessionEvents.PostConnect,// "postConnect",
            RtmpSessionEvents.PrePublish,// "prePublish",
            RtmpSessionEvents.PostPublish,// "postPublish",
            RtmpSessionEvents.PrePlay,// "prePlay",
            RtmpSessionEvents.PostPlay,// "postPlay",
            RtmpSessionEvents.DonePlay,// "donePlay",
            RtmpSessionEvents.DonePublish,// "donePublish",
            RtmpSessionEvents.Publish,
            RtmpSessionEvents.Play,
            RtmpSessionEvents.VideoCodecInfo,
            RtmpSessionEvents.AudioCodecInfo,
            RtmpSessionEvents.CodecInfo,
        ]
    }

    static get Error() {
        return "error";
    }

    static get SocketClose() {
        return "socket-close";
    }

    static get SocketError() {
        return "socket-error";
    }

    static get SocketConnect() {
        return "socket-connect";
    }

    static get IngestClose() {
        return "ingest-close";
    }

    static get IngestError() {
        return "ingest-error";
    }

    static get IngestConnect() {
        return "ingest-connect";
    }

    static get DoneConnect() {
        return "doneConnect";
    }

    static get PreConnect() {
        return "preConnect";
    }

    static get PostConnect() {
        return "postConnect";
    }

    static get PrePublish() {
        return "prePublish";
    }

    static get PostPublish() {
        return "postPublish";
    }

    static get Publish() {
        return RtmpSessionEvents.PostPublish;
    }

    static get Play() {
        return RtmpSessionEvents.PostPlay;
    }

    static get PrePlay() {
        return "prePlay";
    }

    static get PostPlay() {
        return "postPlay";
    }

    static get DonePlay() {
        return "donePlay";
    }

    static get DonePublish() {
        return "donePublish";
    }

    static get VideoCodecInfo() {
        return "videoCodec";
    }

    static get AudioCodecInfo() {
        return "audioCodec";
    }

    static get CodecInfo() {
        return "codec";
    }
}

module.exports = {RtmpSessionEvents};
