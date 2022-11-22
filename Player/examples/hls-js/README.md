# Player sample using HLS.js and timed-metadata insertion

This sample demonstrates how to use the HLS.js player with HLS low latency live streaming (LL-HLS) and timed metadata insertion.
Azure Media Services supports playback in any Javascript Media Source Extension based player that can support the streaming of HLS, Low latency HLS (LL-HLS) and MPEG DASH formats.  The Google Shaka player is a good choice for an open source player solution that works well with AMS streaming.


## Where do I learn more about HLS.js

Check out the documentation for HLS.js at [Github.com/video-dev/hls.js](https://github.com/video-dev/hls.js/)

To use HLS.js in your project, simply install and save the npm package:

```bash
npm install --save hls.js
```

Full developer documentation and samples are available at [https://hls-js.netlify.app/api-docs/](https://hls-js.netlify.app/api-docs/)

## What is Timed Metadata?

Timed metadata is custom data that is inserted into a live stream. Both the data and its insertion timestamp are preserved in the media stream itself so that all the clients playing back the video stream can get the same custom metadata at the exact same time in relation to the video stream.

In addition, the Shaka player supports timed metadata through the use of the Event Message payload format as defined in the Alliance for Open Media [Carriage of ID3 Timed Metadata in the Common Media Application Format](https://aomediacodec.github.io/id3-emsg/) specification.  This industry standard allows the used of ID3 timed metadata messages to be signaled in the HLS or DASH streaming format and signal a player to fire an event when received.

Media Services always wraps the message into an ID3 'GEOB' - generic object which has the following layout:

Format:

``` javascript
// Text encoding           $0x0 (00) | UTF8 = $0x03
// MIME type               'application/json'     $0x0 (00)
// Filename                <text string - which will be empty from AMS>     $0x0 (00)
// Content description     <text string - which will be empty from AMS>     $0x0 (00)
// Encapsulated object     <binary data> 
```

Both the Apple HTTP Live Streaming (HLS) specification and the MPEG DASH streaming specifications support the inclusion of timed metadata in ID3 format using event message payloads.

## Requirements

* Node.js
* VS Code

## Required NPM modules
* HLS.js version 1.2.7 or higher
* Vite - if you want to launch the sample locally

## Deploying the sample

The sample can be launched using the Vite server simply by running the following command:

```bash
npm run dev
```

Steps:

1) Run npm install to install the package.json requirements for HLS.js player
2) The sample can be deployed to any web server, or simply launched from VS Code using the Vite server module
3) npm run dev
4) Optionally run the sample on StackBlitz with the button below

## Running a fork of the sample on StackBlitz
Click the following button to launch a fork of this code on StackBlitz.com

[![Open Fork in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/fork/github/Azure-Samples/media-services-v3-node-tutorials/tree/main/Player/examples/hls-js?file=index.html&title=AMS%20HLS.js%20Timed%20Metadata%20Sample)

Once you are running in StackBlitz, you can hit F12 to open the Developer Tools window and monitor the console.

## How is timed metadata sent?

Timed metadata is sent to a live event via a POST to the endpoint for timed metadata. This endpoint is specified in the TimedMetadataEndpoints property of the LiveEvent.  Any tool can be used to send the http post including Postman, Curl, VS Code extensions for REST or HTTP requests, and any SDK that can send an HTTP post to the endpoint.

The format of the timed metadata endpoint is also deterministic based on the RTMP ingest URL for the live event. The metadata endpoint uses the following format:

https://<<<LIVEEVENTNAME>>>.channel.media.azure.net/<<<LIVE_INGEST_ID>>>/ingest.isml/eventdata

### Example POST using Curl

When using Curl, you must set the header using -H “Content-Type: application/json”
Use the -d flag to set the JSON data on the command line (escape quotes in the JSON body with a backslash when using the command line).  Optionally you can point to a JSON file using -d @<path-to-json-file>.

A POST is implicit when sending data in, so you do not need to use the -X POST flag.

#### Example POST:

```curl
curl https://<<LIVEEVENTNAME>>.channel.media.azure.net/<<LIVE_INGEST_ID>>/ingest.isml/eventdata -H "Content-Type: application/json" -d "{\"message\":\"Hello from Seattle\"}" -v 
```

## Limits on Timed Metadata 

**Total message body payload size:** 256 kb max payload for the JSON body. Any requests exceeding limit will get a 429 TOO MANY REQUESTS response code for back from the server. If it is larger than 256kb, then service returns 400. 

**Requests per second:** Max 2 requests per second. Server will return a throttling error response if exceeded.


