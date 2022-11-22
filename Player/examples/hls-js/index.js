import './style.css';
import Hls from 'hls.js';
import Id3Utils from './id3_utils';

console.log('loading script...');

async function initApp() {
    console.log('initApp');


    let video = document.getElementById('video');
    const manifestUrl = document.getElementById('manifestUrl');
    let videoSrc = '//aka.ms/lowlatencydemo.m3u8';
    // Apple also hosts a live LL-HLS CMAF sample here https://ll-hls-test.apple.com/cmaf/master.m3u8

    //
    // First check for native browser HLS support
    //
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoSrc;
        //
        // If no native HLS support, check if HLS.js is supported
        //
    } else if (Hls.isSupported()) {

        var config = Hls.DefaultConfig;
        config = {
            autoStartLoad: true,
            lowLatencyMode: true,
            enableIMSC1: true,
            renderTextTracksNatively: true,
            enableEmsgMetadataCues: true,
            enableID3MetadataCues: true,
            debug: false,
            streaming:true,
            enableWorker: true,
            widevineLicenseUrl: undefined,
            drmSystemOptions: {},
        }

        var hls = new Hls(config);


        // Attach HLS.js player events
        hls.on(Hls.Events.MEDIA_ATTACHED, onMediaAttached);
        hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
        hls.on(Hls.Events.ERROR, onPlayerErrorEvent);
        hls.on(Hls.Events.FRAG_PARSING_METADATA, onMetadata);
        hls.on(Hls.Events.SUBTITLE_FRAG_PROCESSED, onSubtitleProcessed)

        hls.loadSource(videoSrc);
        hls.attachMedia(video);

        video.play();
    }

    manifestUrl.addEventListener('change', () => {
        try {
            hls.loadSource(manifestUrl.value);
            video.play();
            // This runs if the asynchronous load is successful.
            console.log('The video has now been loaded!');
        } catch (event) {
            // onError is executed if the asynchronous load fails.
            onPlayerErrorEvent(event);
        }
    });
}

function onMediaAttached() {
    console.log('video and hls.js are now bound together !');
}

function onManifestParsed(event, data) {
    console.log('manifest loaded, found ' + data.levels.length + ' quality level');
}

function onMetadata(event, data) {
    console.log("************ On Metadata Event ****************");
    /*
    data: payload,
    len: payload.byteLength,
    dts: pts,
    pts: pts,
    */

    let id3Frame = data.samples[0];
    let schemeIdUri = id3Frame.type;
    let timeStamp = id3Frame.pts
    let view = new Uint8Array(id3Frame.data);

    console.log("EVENT: schemeIdUri: " + schemeIdUri);
    console.log("EVENT: timeStamp: " + timeStamp);

    //view now contains a full ID3 frame and GEOB object that needs to be parsed now... 
    // <TODO> parse the GEOB ID3 payload now...

    let offset = 0;
    let frames = Id3Utils.getID3Frames(view, offset);

    console.log(JSON.stringify(JSON.parse(frames[0].data)));

    let message = JSON.parse(frames[0].data).message;;

    // Now do something with your custom JSON payload
    let metadataDiv = document.getElementById('metadata');
    metadataDiv.innerText = message;

    let logLine = document.createElement('p');
    logLine.innerText = 'onMetadata - timestamp:' + (timeStamp.toFixed(2) + ' ' + message);
    document.getElementById('console').appendChild(logLine).scrollIntoView(false);

    metadataDiv.className = 'metadata-show';

    setTimeout(() => {
        metadataDiv.className = 'metadata-hide';
    }, 5000); // clear the message
}


function onSubtitleProcessed(event, data) {
    //console.log("Subtitle processed: " + JSON.stringify(data.frag));
}

function onPlayerErrorEvent(event, data) {
    var errorType = data.type;
    var errorDetails = data.details;
    var errorFatal = data.fatal;

    if (data.fatal) {
        switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
                // try to recover network error
                console.log('fatal network error encountered, try to recover');
                hls.startLoad();
                break;
            case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('fatal media error encountered, try to recover');
                hls.recoverMediaError();
                break;
            default:
                // cannot recover
                hls.destroy();
                break;
        }
    }

    switch (data.details) {
        case Hls.ErrorDetails.FRAG_LOAD_ERROR:
            console.log("ERROR: FRAG_LOAD_ERROR" + data.details);
            break;
        default:
            console.log("ERROR: Player Error" + data.details);
            break;
    }


}

document.addEventListener('DOMContentLoaded', initApp);

// Start the system clock
setInterval(() => {
    const date = new Date();
    document.getElementById('clock').innerHTML = `${String(date.getUTCHours()).padStart(2,"0")}:${String(date.getUTCMinutes()).padStart(2,"0")}:${String(date.getSeconds()).padStart(2,"0")}.${String(date.getMilliseconds()).padStart(3,"0")}`;
}, 100);
