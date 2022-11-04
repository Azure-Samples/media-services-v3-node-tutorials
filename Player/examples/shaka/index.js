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
    player.addEventListener('emsg', onEventMessage); // fires when a timed metadata event is sent
    player.addEventListener('adaptation', onAdaptation); //fires when an automatic ABR event happens
    // player.addEventListener('metadata', onMetadata); // This is coming soon in future version of Shaka and will help us parse the ID3 messages

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
//<EmgHandling>
// This is coming soon in future version of Shaka and will help us parse the ID3 messages
function onMetadata(metadata) {
    console.log('!!!!!!!!!!!!!!Metadata Event Message');
    console.log(metadata);
}

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
                logLine.innerText = 'timestamp:' + (event.detail.startTime - event.detail.presentationTimeDelta).toFixed(2) + ' ' + JSON.stringify(jsonPayload);
                document.getElementById('eventLog').appendChild(logLine).scrollIntoView(false);

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
