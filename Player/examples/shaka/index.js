// Import stylesheets
import './style.css';
import 'shaka-player/dist/controls.css';
import shaka from 'shaka-player/dist/shaka-player.ui';
//const shaka = require('shaka-player/dist/shaka-player.ui.js');
import './id3_utils.js';

console.log('loading script...');

async function initApp() {
    console.log('initApp');

    const manifestUrl = document.getElementById('manifestUrl');

    // Create a Player instance.
    const videoElement = document.getElementById('video');
    const videoContainerElement = document.getElementById('video-container');
    const player = new shaka.Player(videoElement);
    const ui = new shaka.ui.Overlay(player, videoContainerElement, videoElement);
    const controls = ui.getControls();

    // Force the TTML parser to load
    shaka.text.TextEngine.registerParser('text/vtt', shaka.text.Mp4TtmlParser);

    // Reference Shaka docs : https://shaka-player-demo.appspot.com/docs/api/index.html
    const uiConfig = {
        controlPanelElements: [
            'time_and_duration',
            'spacer',
            'captions',
            'language',
            'quality',
            'volume',
            'mute',
        ],
        addBigPlayButton: true,
        addSeekBar: true,
        enableTooltips: true,
        contextMenuElements: ['statistics'],
        customContextMenu: true,
        statisticsList: [
            'width',
            'height',
            'playTime',
            'liveLatency',
            'bufferingTime',
            'droppedFrames',
            'stallsDetected',
            'manifestTimeSeconds',
            'loadLatency',
        ],
        seekBarColors: {
            base: 'rgba(255, 255, 255, 0.3)',
            buffered: 'rgba(255, 255, 255, 0.54)',
            played: 'rgb(255, 255, 255)',
        },
    };
    ui.configure(uiConfig);

    player.configure({
        manifest: {
            defaultPresentationDelay: 0.1,
            availabilityWindowOverride: 30,
            dash: {},
            hls: {},
        },
        streaming: {
            autoLowLatencyMode: true,
            useNativeHlsOnSafari: true,
            alwaysStreamText: true,
            dispatchAllEmsgBoxes: true,
        },
    });

    player.setTextTrackVisibility(true);

    // Listen for Shaka Player events.
    // Reference Shaka docs : https://shaka-player-demo.appspot.com/docs/api/index.html
    player.addEventListener('error', onPlayerErrorEvent);
    player.addEventListener('onstatechange', onStateChange);
    player.addEventListener('adaptation', onAdaptation); //fires when an automatic ABR event happens

    player.addEventListener('emsg', onEventMessage); // fires when a timed metadata event is sent
    player.addEventListener('metadata', onMetadata); // This is now available in shaka-player 4.3.0+ but has some bugs in the number of times it is firing.

    // Listen for  HTML5 Video Element events
    // Reference : https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement
    videoElement.addEventListener('pause', onPause);
    videoElement.addEventListener('play', onPlay);
    videoElement.addEventListener('canPlay', onCanPlay(videoElement));
    videoElement.addEventListener('ended', onEnded);
    videoElement.addEventListener('stalled', onStalled);
    videoElement.addEventListener('seeking', onSeeking);
    videoElement.addEventListener('seeked', onSeeked);
    videoElement.addEventListener('waiting', onWaiting);


    try {
        await player.load(manifestUrl.value);
        // This runs if the asynchronous load is successful.
        console.log('The video has now been loaded!');

        console.log('Listing Text tracks');
        for (var track of videoElement.textTracks) {
            console.log("track kind =" + track.kind);
            console.log("track label =" + track.label);
            console.log("track lang =" + track.language);
            track.addEventListener('cuechange', onCueChange);
        };

        // Enable captions
        player.setTextTrackVisibility(true);

    } catch (error) {
        // onError is executed if the asynchronous load fails.
        onPlayerError(error);
    }

    manifestUrl.addEventListener('change', () => {
        try {
            player.load(manifestUrl.value);

            // This runs if the asynchronous load is successful.
            console.log('The video has now been loaded!');
            // Enable captions
            player.setTextTrackVisibility(true);
        } catch (event) {
            // onError is executed if the asynchronous load fails.
            onPlayerErrorEvent(event);
        }
    });
}

function onStateChange(event) {
    console.log('Player State:', event.state);
}

function onAdaptation(event) {
    console.log(
        'ABR adapted: ' + Math.round(event.newTrack.bandwidth / 1024) + ' kbps'
    );
}

function onPause(event) {
    console.log('Video Paused');
}

function onPlay(event) {
    console.log('Video Playing');
}

function onCanPlay(videoElement) {
    console.log('Video CanPlay');
}

function onEnded(event) {
    console.log('Video End');
}

function onStalled(event) {
    console.log('Video stalled');
}

function onSeeking(event) {
    console.log('Video seeking...');
    //video.play();
}

function onSeeked(event) {
    console.log('Video seeked');
}

function onWaiting(event) {
    console.log('Video waiting...');
}

function onCueChange(event) {
    console.log('Video Cue');
}

// <MetadataHandling>
// This is working in shaka-player 4.3.0 and higher
function onMetadata(metadata) {
    // This should fire on iOS Safari with HLS, might need to set streaming.useNativeHlsOnSafari to false on Safari
    console.log('***** Metadata Event Message *****');
    console.log(metadata);

    if (metadata.metadataType =='org.id3') {
        console.log('Event: startTime = ' + metadata.startTime);
        console.log('Event: timeStamp = ' + metadata.timeStamp);

        console.log('Event: ID3 Frame Type = ' + metadata.payload.key);
        if (metadata.payload.key == "GEOB"){
            /*
             * Format:
             * Text encoding           $xx
             * MIME type               <text string> $00
             * Filename                <text string according to encoding> $00 (00)
             * Content description     $00 (00)
             * Encapsulated object     <binary data>
             */
            console.log("Parsing ID3 'GEOB' object from the payload");

            const view = new Int8Array(metadata.payload.data);

            if (view[0] == 0x0 || view[0] == 0x03) { // Text encoding UTF8
                const mimeTypeEndIndex = view.subarray(1).indexOf(0x0);
                const mimeType = new TextDecoder().decode(view.subarray(1, mimeTypeEndIndex+1));
                console.log("MimeType=" + mimeType);
                
                if (mimeType =="application/json"){
                    console.log("Found a JSON payload in the ID3 - GEOB object");

                    const payload = JSON.parse(new TextDecoder().decode(view.subarray(view.lastIndexOf(0x0)+1)));
                    console.log("JSON payload: " + JSON.stringify(payload));

                    let message = payload.message;
                    console.log('message=' + message);
    
                    // Now do something with your custom JSON payload
                    let metadataDiv = document.getElementById('metadata');
                    metadataDiv.innerText = message;
    
                    let logLine = document.createElement('p');
                    logLine.innerText = 'onMetadata - timestamp:' + (metadata.startTime.toFixed(2) + ' ' + JSON.stringify(payload));
                    document.getElementById('console').appendChild(logLine).scrollIntoView(false);
    
                    metadataDiv.className = 'metadata-show';
    
                    setTimeout(() => {
                        metadataDiv.className = 'metadata-hide';
                    }, 5000); // clear the message
                }
            }

        }
       
    
    }
}
//</MetadataHandling>

//<EmgHandling>
function onEventMessage(event) {              
    console.log('Timed Metadata Event Message');
    //console.log('emsg:', event)
    // emsg box information are in emsg.details
    const dataMsg = new TextDecoder().decode(event.detail.messageData);
    console.log('EMSG: Scheme = ' + event.detail.schemeIdUri);
    console.log('EMSG: StartTime = ' + event.detail.startTime);
    console.log(
        'video.currenttime=' + document.getElementById('video').currentTime
    );

    // The start time and the presentationTimeDelta are in seconds on the presentation timeline. Shaka player does this work for us. The value startTime-presentationTimeDelta will give you the exact time in the video player's timeline to display the event.
    console.log(
        'EMSG: startTime-presentationTimeDelta = ' +
        (event.detail.startTime - event.detail.presentationTimeDelta)
    );

    console.log(
        'EMSG: presentationTimeDelta = ' + event.detail.presentationTimeDelta
    );
    console.log('EMSG: endTime = ' + event.detail.endTime);
    console.log('EMSG: timescale = ' + event.detail.timescale);
    console.log('EMSG: duration = ' + event.detail.eventDuration);
    console.log('EMSG: message length = ' + event.detail.messageData.length);

    try {
        const frames = shaka.util.Id3Utils.getID3Frames(event.detail.messageData);

        if (frames.length > 0) {
            console.log('EMSG: message = ', frames[0]);
            console.log('EMSG: mimeType = ', frames[0].mimeType);

            if (frames[0].mimeType === 'application/json') {
                const jsonPayload = JSON.parse(frames[0].data);
                let message = jsonPayload.message;
                console.log('message=' + message);

                // Now do something with your custom JSON payload
                let metadataDiv = document.getElementById('metadata');
                metadataDiv.innerText = message;

                let logLine = document.createElement('p');
                logLine.innerText = 'onEmsg - timestamp:' + (event.detail.startTime - event.detail.presentationTimeDelta).toFixed(2) + ' ' + JSON.stringify(jsonPayload);
                document.getElementById('console').appendChild(logLine).scrollIntoView(false);

                metadataDiv.className = 'metadata-show';

                setTimeout(() => {
                    metadataDiv.className = 'metadata-hide';
                }, 5000); // clear the message

                console.log('JSON= ' + JSON.stringify(jsonPayload));
            }
        }
    } catch (err) {
        console.error(err.stack);
    }
}
//</EmgHandling>
function onPlayerErrorEvent(errorEvent) {
    // Extract the shaka.util.Error object from the event.
    onPlayerError(errorEvent.detail);
}

function onPlayerError(error) {
    // Log the error.
    console.error('Shaka Player Error: ' + error.message);
    console.error(error.stack);
}

function initFailed(error) {
    // Handle the failure to load; errorEvent.detail.reasonCode has a
    // shaka.ui.FailReasonCode describing why.
    console.error('Unable to load the UI library!');
}

// Listen to the custom shaka-ui-loaded event, to wait until the UI is loaded.
document.addEventListener('shaka-ui-loaded', initApp);
document.addEventListener('shaka-ui-load-failed', initFailed);
