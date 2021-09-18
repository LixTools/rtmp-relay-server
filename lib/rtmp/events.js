class RtmpSessionEvents {
    static get AllEvents() {
        return [
            RtmpSessionEvents.SocketClose,
            RtmpSessionEvents.SocketError,
            RtmpSessionEvents.SocketConnect,
            RtmpSessionEvents.IngestClose,
            RtmpSessionEvents.IngestError,
            RtmpSessionEvents.IngestConnect,
            RtmpSessionEvents.DoneConnect,
            RtmpSessionEvents.PreConnect,
            RtmpSessionEvents.PostConnect,
            RtmpSessionEvents.PrePublish,
            RtmpSessionEvents.PostPublish,
            RtmpSessionEvents.PrePlay,
            RtmpSessionEvents.PostPlay,
            RtmpSessionEvents.DonePlay,
            RtmpSessionEvents.DonePublish,
            RtmpSessionEvents.Publish,
            RtmpSessionEvents.Play,
            RtmpSessionEvents.Error,
            RtmpSessionEvents.VideoCodecInfo,
            RtmpSessionEvents.AudioCodecInfo,
            RtmpSessionEvents.CodecInfo,
        ];
    }

    static get AllSessionEvents() {
        return [
            RtmpSessionEvents.Error,
            RtmpSessionEvents.DoneConnect,
            RtmpSessionEvents.PreConnect,
            RtmpSessionEvents.PostConnect,
            RtmpSessionEvents.PrePublish,
            RtmpSessionEvents.PostPublish,
            RtmpSessionEvents.PrePlay,
            RtmpSessionEvents.PostPlay,
            RtmpSessionEvents.DonePlay,
            RtmpSessionEvents.DonePublish,
            RtmpSessionEvents.Publish,
            RtmpSessionEvents.Play,
            RtmpSessionEvents.VideoCodecInfo,
            RtmpSessionEvents.AudioCodecInfo,
            RtmpSessionEvents.CodecInfo,
        ];
    }

    static get AllWebhookEvents() {
        return [
            RtmpSessionEvents.Publish,
            RtmpSessionEvents.DonePublish,
            RtmpSessionEvents.Play,
            RtmpSessionEvents.DonePlay,
            RtmpSessionEvents.CodecInfo
        ];
    }

    static get Error() {
        return "error";
    }

    static get SocketClose() {
        return "socketClose";
    }

    static get SocketError() {
        return "socketError";
    }

    static get SocketConnect() {
        return "socketConnect";
    }

    static get IngestClose() {
        return "ingestClose";
    }

    static get IngestError() {
        return "ingestError";
    }

    static get IngestConnect() {
        return "ingestConnect";
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
