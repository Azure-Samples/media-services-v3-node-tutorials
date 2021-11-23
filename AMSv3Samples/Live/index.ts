// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

////////////////////////////////////////////////////////////////////////////////////
//  Azure Media Services Live streaming sample for Node.js
//
//  This sample assumes that you will use OBS Studio to broadcast RTMP
//  to the ingest endpoint. Please install OBS Studio first. 
//  Use the following settings in OBS:
//      Encoder: NVIDIA NVENC (if avail) or x264
//      Rate Control: CBR
//      Bitrate: 2500 Kbps (or something reasonable for your laptop)
//      Keyframe Interval : 2s, or 1s for low latency  
//      Preset : Low-latency Quality or Performance (NVENC) or "veryfast" using x264
//      Profile: high
//      GPU: 0 (Auto)
//      Max B-frames: 2
//      
//  The workflow for the sample and for the recommended use of the Live API:
//  1) Create the client for AMS using AAD service principal or managed ID
//  2) Set up your IP restriction allow objects for ingest and preview
//  3) Configure the Live Event object with your settings. Choose pass-through
//     or encoding channel type and size (720p or 1080p)
//  4) Create the Live Event without starting it
//  5) Create an Asset to be used for recording the live stream into
//  6) Create a Live Output, which acts as the "recorder" to record into the
//     Asset (which is like the tape in the recorder).
//  7) Start the Live Event - this can take a little bit.
//  8) Get the preview endpoint to monitor in a player for DASH or HLS.
//  9) Get the ingest RTMP endpoint URL for use in OBS Studio.
//     Set up OBS studio and start the broadcast.  Monitor the stream in 
//     your DASH or HLS player of choice. 
// 10) Create a new Streaming Locator on the recording Asset object from step 5.
// 11) Get the URLs for the HLS and DASH manifest to share with your audience
//     or CMS system. This can also be created earlier after step 5 if desired.
////////////////////////////////////////////////////////////////////////////////////

// <ImportMediaServices>

import { v4 as uuidv4 } from 'uuid';
// Load the .env file if it exists
import * as dotenv from "dotenv";
import * as readlineSync from 'readline-sync';
import { DefaultAzureCredential } from "@azure/identity";
import {
    AzureMediaServices,
    IPRange,
    LiveEvent,
    LiveEventInputAccessControl,
    LiveEventPreview,
    LiveOutput,
    MediaservicesGetResponse,
    ErrorResponse
} from "@azure/arm-mediaservices";

// </ImportMediaServices>

dotenv.config();

// This is the main Media Services client object
let mediaServicesClient: AzureMediaServices;

// Long running operation polling interval in milliseconds
const longRunningOperationUpdateIntervalMs = 2000;

// Copy the samples.env file and rename it to .env first, then populate it's values with the values obtained 
// from your Media Services account's API Access page in the Azure portal.
const clientId: string = process.env.AADCLIENTID as string;
const secret: string = process.env.AADSECRET as string;
const tenantDomain: string = process.env.AADTENANTDOMAIN as string;
const subscriptionId: string = process.env.SUBSCRIPTIONID as string;
const resourceGroup: string = process.env.RESOURCEGROUP as string;
const accountName: string = process.env.ACCOUNTNAME as string;

// This sample uses the default Azure Credential object, which relies on the environment variable settings.
// If you wish to use User assigned managed identity, see the samples for v2 of @azure/identity
// Managed identity authentication is supported via either the DefaultAzureCredential or the ManagedIdentityCredential classes
// https://docs.microsoft.com/javascript/api/overview/azure/identity-readme?view=azure-node-latest
// See the following examples for how ot authenticate in Azure with managed identity
// https://github.com/Azure/azure-sdk-for-js/blob/@azure/identity_2.0.1/sdk/identity/identity/samples/AzureIdentityExamples.md#authenticating-in-azure-with-managed-identity 

// const credential = new ManagedIdentityCredential("<USER_ASSIGNED_MANAGED_IDENTITY_CLIENT_ID>");
const credential = new DefaultAzureCredential();

//////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {
    let uniqueness = uuidv4().split('-')[0]; // Create a GUID for uniqueness 
    let liveEventName = `liveEvent-${uniqueness}`  // WARNING: Be careful not to leak live events using this sample!
    let assetName = `archiveAsset${uniqueness}`;
    let liveOutputName = `liveOutput${uniqueness}`;
    let streamingLocatorName = `liveStreamLocator${uniqueness}`;
    let streamingEndpointName = "default"; // Change this to your specific streaming endpoint name if not using "default"
    let mediaAccount: MediaservicesGetResponse;

    // The primary live event and output objects for creating and cleaning up later. 
    let liveEvent: LiveEvent;
    let liveOutput: LiveOutput;

    console.log("Starting the Live Streaming sample for Azure Media Services");
    try {
        mediaServicesClient = new AzureMediaServices(credential, subscriptionId)
    } catch (err) {
        console.log(`Error retrieving Media Services Client.`);
    }

    // Get the media services account object for information on the current location. 
    mediaAccount = await mediaServicesClient.mediaservices.get(resourceGroup, accountName);

    // </CreateMediaServicesClient>

    try {


        // <CreateLiveEvent>

        // Creating the LiveEvent - the primary object for live streaming in AMS. 
        // See the overview - https://docs.microsoft.com/azure/media-services/latest/live-streaming-overview

        // Create the LiveEvent

        // Understand the concepts of what a live event and a live output is in AMS first!
        // Read the following - https://docs.microsoft.com/azure/media-services/latest/live-events-outputs-concept
        // 1) Understand the billing implications for the various states
        // 2) Understand the different live event types, pass-through and encoding
        // 3) Understand how to use long-running async operations 
        // 4) Understand the available Standby mode and how it differs from the Running Mode. 
        // 5) Understand the differences between a LiveOutput and the Asset that it records to.  They are two different concepts.
        //    A live output can be considered as the "tape recorder" and the Asset is the tape that is inserted into it for recording.
        // 6) Understand the advanced options such as low latency, and live transcription/captioning support. 
        //    Live Transcription - https://docs.microsoft.com/en-us/azure/media-services/latest/live-transcription
        //    Low Latency - https://docs.microsoft.com/en-us/azure/media-services/latest/live-event-latency

        // When broadcasting to a live event, please use one of the verified on-premises live streaming encoders.
        // While operating this tutorial, it is recommended to start out using OBS Studio before moving to another encoder. 

        // Note: When creating a LiveEvent, you can specify allowed IP addresses in one of the following formats:                 
        //      IpV4 address with 4 numbers
        //      CIDR address range

        let allowAllInputRange: IPRange = {
            name: "AllowAll",
            address: "0.0.0.0",
            subnetPrefixLength: 0
        };

        // Create the LiveEvent input IP access control object
        // this will control the IP that the encoder is running on and restrict access to only that encoder IP range.
        let liveEventInputAccess: LiveEventInputAccessControl = {
            ip: {
                allow: [
                    // re-use the same range here for the sample, but in production you can lock this
                    // down to the ip range for your on-premises live encoder, laptop, or device that is sending
                    // the live stream
                    allowAllInputRange
                ]
            }
        };

        // Create the LiveEvent Preview IP access control object. 
        // This will restrict which clients can view the preview endpoint
        let liveEventPreview: LiveEventPreview = {
            accessControl: {
                ip: {
                    allow: [
                        // re-use the same range here for the sample, but in production you can lock this to the IPs of your 
                        // devices that would be monitoring the live preview. 
                        allowAllInputRange
                    ]
                }
            }
        }

        // To get the same ingest URL for the same LiveEvent name every single time...
        // 1. Set useStaticHostname  to true so you have ingest like: 
        //        rtmps://liveevent-hevc12-eventgridmediaservice-usw22.channel.media.azure.net:2935/live/522f9b27dd2d4b26aeb9ef8ab96c5c77           
        // 2. Set accessToken to a desired GUID string (with or without hyphen)

        // See REST API documentation for details on each setting value
        // https://docs.microsoft.com/rest/api/media/liveevents/create 

        let liveEventCreate: LiveEvent = {
            location: mediaAccount.location,
            description: "Sample Live Event from Node.js SDK sample",
            // Set useStaticHostname to true to make the ingest and preview URL host name the same. 
            // This can slow things down a bit. 
            useStaticHostname: true,
            //hostnamePrefix: "somethingstatic", /// When using Static host name true, you can control the host prefix name here if desired 
            // 1) Set up the input settings for the Live event...
            input: {
                streamingProtocol: "RTMP", // options are RTMP or Smooth Streaming ingest format.
                accessControl: liveEventInputAccess,  // controls the IP restriction for the source encoder. 
                // keyFrameIntervalDuration: "PT2S",  // Set this to match the ingest encoder's settings. This should not be used for encoding channels  
                accessToken: "9eb1f703b149417c8448771867f48501" // Use this value when you want to make sure the ingest URL is static and always the same. If omitted, the service will generate a random GUID value.
            },

            // 2) Set the live event to use pass-through or cloud encoding modes...
            encoding: {
                // Set this to Basic pass-through, Standard pass-through, Standard or Premium1080P to use the cloud live encoder.
                // See https://go.microsoft.com/fwlink/?linkid=2095101 for more information
                // Otherwise, leave as "None" to use pass-through mode
                encodingType: "PassthroughStandard",
                // OPTIONS for encoding type you can use:
                // encodingType: "PassthroughBasic", // Basic pass-through mode - the cheapest option!
                // encodingType: "PassthroughStandard", // also known as standard pass-through mode (formerly "none")
                // encodingType: "Premium1080p",// live transcoding up to 1080P 30fps with adaptive bitrate set
                // encodingType: "Standard",// use live transcoding in the cloud for 720P 30fps with adaptive bitrate set
                //
                // OPTIONS using live cloud encoding type:
                // keyFrameInterval: "PT2S", //If this value is not set for an encoding live event, the fragment duration defaults to 2 seconds. The value cannot be set for pass-through live events.
                // presetName: null, // only used for custom defined presets. 
                //stretchMode: "None" // can be used to determine stretch on encoder mode
            },
            // 3) Set up the Preview endpoint for monitoring based on the settings above we already set. 
            preview: liveEventPreview,

            // 4) Set up more advanced options on the live event. Low Latency is the most common one. 
            streamOptions: [
                "LowLatency"
            ],

            // 5) Optionally enable live transcriptions if desired. 
            // WARNING : This is extra cost ($$$), so please check pricing before enabling. Transcriptions are not supported on PassthroughBasic.
            //           switch this sample to use encodingType: "PassthroughStandard" first before un-commenting the transcriptions object below. 

            /* transcriptions : [
                {
                    inputTrackSelection: [], // chose which track to transcribe on the source input.
                    // The value should be in BCP-47 format (e.g: 'en-US'). See https://go.microsoft.com/fwlink/?linkid=2133742
                    language: "en-us", 
                    outputTranscriptionTrack: {
                        trackName : "English" // set the name you want to appear in the output manifest
                    }
                }
            ]
            */
        }



        console.log("Creating the LiveEvent, please be patient as this can take time to complete async.")
        console.log("Live Event creation is an async operation in Azure and timing can depend on resources available.")
        console.log();

        let timeStart = process.hrtime();
        // When autostart is set to true, the Live Event will be started after creation. 
        // That means, the billing starts as soon as the Live Event starts running. 
        // You must explicitly call Stop on the Live Event resource to halt further billing.
        // The following operation can sometimes take awhile. Be patient.
        // On optional workflow is to first call allocate() instead of create. 
        // https://docs.microsoft.com/en-us/rest/api/media/liveevents/allocate 
        // This allows you to allocate the resources and place the live event into a "Standby" mode until 
        // you are ready to transition to "Running". This is useful when you want to pool resources in a warm "Standby" state at a reduced cost.
        // The transition from Standby to "Running" is much faster than cold creation to "Running" using the autostart property.
        // Returns a long running operation polling object that can be used to poll until completion.
        await mediaServicesClient.liveEvents.beginCreateAndWait(
            resourceGroup,
            accountName,
            liveEventName,
            liveEventCreate,
            // When autostart is set to true, you should "await" this method operation to complete. 
            // The Live Event will be started after creation. 
            // You may choose not to do this, but create the object, and then start it using the standby state to 
            // keep the resources "warm" and billing at a lower cost until you are ready to go live. 
            // That increases the speed of startup when you are ready to go live. 
            {
                autoStart: false,
                updateIntervalInMs: longRunningOperationUpdateIntervalMs // This sets the polling interval for the long running ARM operation (LRO)
            }
        ).then((liveEvent) => {
            let timeEnd = process.hrtime(timeStart);
            console.info(`Live Event Created - long running operation complete! Name: ${liveEvent.name}`)
            console.info(`Execution time for create LiveEvent: %ds %dms`, timeEnd[0], timeEnd[1] / 1000000);
            console.log();
        }).catch((reason) => {
            if (reason.error && reason.error.message) {
                console.info(`Live Event creation failed: ${reason.message}`);
            }
        })

        // </CreateLiveEvent>




        // <CreateAsset>

        // Create an Asset for the LiveOutput to use. Think of this as the "tape" that will be recorded to. 
        // The asset entity points to a folder/container in your Azure Storage account. 
        console.log(`Creating an asset named: ${assetName}`);
        console.log();
        let asset = await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, assetName, {});

        // Create the Live Output - think of this as the "tape recorder for the live event". 
        // Live outputs are optional, but are required if you want to archive the event to storage,
        // use the asset for on-demand playback later, or if you want to enable cloud DVR time-shifting.
        // We will use the asset created above for the "tape" to record to. 
        let manifestName: string = "output";
        console.log(`Creating a live output named: ${liveOutputName}`);
        console.log();

        // See the REST API for details on each of the settings on Live Output
        // https://docs.microsoft.com/rest/api/media/liveoutputs/create

        // </CreateAsset>

        timeStart = process.hrtime();

        // <CreateLiveOutput>    
        let liveOutputCreate: LiveOutput;
        if (asset.name) {
            liveOutputCreate = {
                description: "Optional description when using more than one live output",
                assetName: asset.name,
                manifestName: manifestName, // The HLS and DASH manifest file name. This is recommended to set if you want a deterministic manifest path up front.
                archiveWindowLength: "PT1H", // sets a one hour time-shift DVR window. Uses ISO 8601 format string.
                hls: {
                    fragmentsPerTsSegment: 1 // Advanced setting when using HLS TS output only.
                },
            }

            // Create and await the live output
            await mediaServicesClient.liveOutputs.beginCreateAndWait(
                resourceGroup,
                accountName,
                liveEventName,
                liveOutputName,
                liveOutputCreate,
                {
                    updateIntervalInMs: longRunningOperationUpdateIntervalMs // Setting this adjusts the polling interval of the long running operation. 
                })
                .then((liveOutput) => {
                    console.log(`Live Output Created: ${liveOutput.name}`);
                    let timeEnd = process.hrtime(timeStart);
                    console.info(`Execution time for create Live Output: %ds %dms`, timeEnd[0], timeEnd[1] / 1000000);
                    console.log();
                })
                .catch((reason) => {
                    if (reason.error && reason.error.message) {
                        console.info(`Live Output creation failed: ${reason.message}`);
                    }
                });


        }
        // </CreateLiveOutput>

        // Lets patch something on the fly before starting, just to show whe can modify things in Stopped state. 
        // With the Channel stopped I should be able to update a few things as needed...
        // Lets just modify the accessToken on the ingest endpoint and the hostname prefix used. 
        // These should be unique per channel in your account 
        if (liveEventCreate.input != null) {
            liveEventCreate.input.accessToken = "8257f1d1-8247-4318-b743-f541c20ea7a6";
            liveEventCreate.hostnamePrefix = `${liveEventName}-updated`;
            // Calling update 
            await mediaServicesClient.liveEvents.beginUpdateAndWait(
                resourceGroup,
                accountName,
                liveEventName,
                liveEventCreate
            ).then((liveEvent) => {
                // ISSUE: This is not actually the full live Event object coming back in the promise value
                //        It appears to be a smaller subset of the live event object, with only a GUID returned as the name, which does not match the actual name of the live event.
                console.log(`Updated the Live Event accessToken for live event named: ${liveEvent.name}`);
            })
            .catch((reason) => {
                if (reason.error && reason.error.message) {
                    console.info(`Live Event Update failed: ${reason.message}`);
                }
            });
        }

        console.log(`Starting the Live Event operation... please stand by`);
        timeStart = process.hrtime();
        // Start the Live Event - this will take some time...
        console.log(`The Live Event is being allocated. If the service's hot pool is completely depleted in a region, this could delay here for up to 15-20 minutes while machines are allocated.`)
        console.log(`If this is taking a very long time, wait for at least 20 minutes and check on the status. If the code times out, or is cancelled, be sure to clean up in the portal!`)

        await mediaServicesClient.liveEvents.beginStartAndWait(
            resourceGroup,
            accountName,
            liveEventName,
            {
                updateIntervalInMs: longRunningOperationUpdateIntervalMs // Setting this adjusts the polling interval of the long running operation. 
            }
        ).then(() => {
            console.log(`Live Event Started`);
            let timeEnd = process.hrtime(timeStart);
            console.info(`Execution time for start Live Event: %ds %dms`, timeEnd[0], timeEnd[1] / 1000000);
            console.log();
        })


        // <GetIngestURL>

        // Refresh the liveEvent object's settings after starting it...
        let liveEvent = await mediaServicesClient.liveEvents.get(
            resourceGroup,
            accountName,
            liveEventName
        )

        // Get the RTMP ingest URL to configure in OBS Studio. 
        // The endpoints is a collection of RTMP primary and secondary, and RTMPS primary and secondary URLs. 
        // to get the primary secure RTMPS, it is usually going to be index 3, but you could add a  loop here to confirm...
        if (liveEvent.input?.endpoints) {
            let ingestUrl = liveEvent.input.endpoints[0].url;
            console.log(`The RTMP ingest URL to enter into OBS Studio is:`);
            console.log(`RTMP ingest : ${ingestUrl}`);
            console.log(`Make sure to enter a Stream Key into the OBS studio settings. It can be any value or you can repeat the accessToken used in the ingest URL path.`);
            console.log();
        }

        // </GetIngestURL>

        // <GetPreviewURL>
        if (liveEvent.preview?.endpoints) {
            // Use the previewEndpoint to preview and verify
            // that the input from the encoder is actually being received
            // The preview endpoint URL also support the addition of various format strings for HLS (format=m3u8-cmaf) and DASH (format=mpd-time-cmaf) for example.
            // The default manifest is Smooth. 
            let previewEndpoint = liveEvent.preview.endpoints[0].url;
            console.log("The preview url is:");
            console.log(previewEndpoint);
            console.log();
            console.log("Open the live preview in your browser and use any DASH or HLS player to monitor the preview playback:");
            console.log(`https://ampdemo.azureedge.net/?url=${previewEndpoint}(format=mpd-time-cmaf)&heuristicprofile=lowlatency`);
            console.log("You will need to refresh the player page SEVERAL times until enough data has arrived to allow for manifest creation.");
            console.log("In a production player, the player can inspect the manifest to see if it contains enough content for the player to load and auto reload.");
            console.log();
        }

        console.log("Start the live stream now, sending the input to the ingest url and verify that it is arriving with the preview url.");
        console.log("IMPORTANT TIP!: Make CERTAIN that the video is flowing to the Preview URL before continuing!");

        // </GetPreviewURL>

        // SET A BREAKPOINT HERE!
        console.log("PAUSE here in the Debugger until you are ready to continue...");
        if (readlineSync.keyInYN("Do you want to continue?")) {
            //Yes
        } else {
            throw new Error("User canceled. Cleaning up...")
        }


        // Create the Streaming Locator URL for playback of the contents in the Live Output recording
        console.log(`Creating a streaming locator named : ${streamingLocatorName}`);
        console.log();
        let locator = await createStreamingLocator(assetName, streamingLocatorName);


        // Get the default streaming endpoint on the account
        let streamingEndpoint = await mediaServicesClient.streamingEndpoints.get(resourceGroup, accountName, streamingEndpointName);

        if (streamingEndpoint?.resourceState !== "Running") {
            console.log(`Streaming endpoint is stopped. Starting the endpoint named ${streamingEndpointName}`);
            await mediaServicesClient.streamingEndpoints.beginStartAndWait(resourceGroup, accountName, streamingEndpointName, {
                updateIntervalInMs: longRunningOperationUpdateIntervalMs // Setting this adjusts the polling interval of the long running operation. 
            })
                .then(() => {
                    console.log("Streaming Endpoint Started.");
                })

        }

        // Get the url to stream the output
        console.log("The streaming URLs to stream the live output from a client player");
        console.log();

        let hostname = streamingEndpoint.hostName;
        let scheme = "https";

        // The next method "bulidManifestPaths" is a helper to list the streaming manifests for HLS and DASH. 
        // The paths are only available after the live streaming source has connected. 
        // If you wish to get the streaming manifest ahead of time, make sure to set the manifest name in the LiveOutput as done above.
        // This allows you to have a deterministic manifest path. <streaming endpoint hostname>/<streaming locator ID>/manifestName.ism/manifest(<format string>)
        //
        // Uncomment this line to see how to list paths dynamically:
        // await listStreamingPaths(streamingLocatorName, scheme, hostname);
        // 
        // Or use this line to build the paths statically. Which is highly recommended when you want to share the stream manifests
        // to a player application or CMS system ahead of the live event.
        await buildManifestPaths(scheme, hostname, locator.streamingLocatorId, manifestName);

        // SET A BREAKPOINT HERE!
        console.log("PAUSE here in the Debugger until you are ready to continue...");
        if (readlineSync.keyInYN("Do you want to continue and clean up the sample?")) {
            //Yes
        }

    } catch (err) {
        console.log(err);
        console.error("WARNING: If you hit this message, double check the Portal to make sure you do not have any Running live events after using this Sample- or they will remain billing!");
    }
    finally {
        // Cleaning Up all resources
        //@ts-ignore - these will be set, so avoiding the compiler complaint for now. 
        console.log("Cleaning up resources, stopping Live Event billing, and deleting live Event...")
        console.log("CRITICAL WARNING ($$$$) DON'T WASTE MONEY!: - Wait here for the All Clear - this takes a few minutes sometimes to clean up. DO NOT STOP DEBUGGER yet or you will leak billable resources!")
        await cleanUpResources(liveEventName, liveOutputName);
        console.log("All Clear, and all cleaned up. Please double check in the portal to make sure you have not leaked any Live Events, or left any Running still which would result in unwanted billing.")
    }
}

main().catch((err) => {
    console.error("Error running live streaming sample:", err.message);
    console.error("WARNING: If you hit this message, double check the Portal to make sure you do not have any Running live events - or they will remain billing!");
});


// <BuildManifestPaths>

// This method builds the manifest URL from the static values used during creation of the Live Output.
// This allows you to have a deterministic manifest path. <streaming endpoint hostname>/<streaming locator ID>/manifestName.ism/manifest(<format string>)
async function buildManifestPaths(scheme: string, hostname: string | undefined, streamingLocatorId: string | undefined, manifestName: string) {
    const hlsFormat: string = "format=m3u8-cmaf";
    const dashFormat: string = "format=mpd-time-cmaf";

    let manifestBase = `${scheme}://${hostname}/${streamingLocatorId}/${manifestName}.ism/manifest`
    let hlsManifest = `${manifestBase}(${hlsFormat})`;
    console.log(`The HLS (MP4) manifest URL is : ${hlsManifest}`);
    console.log("Open the following URL to playback the live stream in an HLS compliant player (HLS.js, Shaka, ExoPlayer) or directly in an iOS device");
    console.log(`${hlsManifest}`);
    console.log();

    let dashManifest = `${manifestBase}(${dashFormat})`;
    console.log(`The DASH manifest URL is : ${dashManifest}`);
    console.log("Open the following URL to playback the live stream from the LiveOutput in the Azure Media Player");
    console.log(`https://ampdemo.azureedge.net/?url=${dashManifest}&heuristicprofile=lowlatency`);
    console.log();
}

// </BuildManifestPaths>


// This method demonstrates using the listPaths method on Streaming locators to print out the DASH and HLS manifest links
// Optionally you can just build the paths if you are setting the manifest name and would like to create the streaming 
// manifest URls before you actually start streaming.
// The paths in the function listPaths on streaming locators are not available until streaming has actually started.  
// Keep in mind that this workflow is not great when you need to have the manifest URL up front for a CMS. 
// It is just provided here for example of listing all the dynamic format paths available at runtime of the live event.
async function listStreamingPaths(streamingLocatorName: string, scheme: string, hostname: string) {
    let streamingPaths = await mediaServicesClient.streamingLocators.listPaths(
        resourceGroup,
        accountName,
        streamingLocatorName
    );

    let hlsManifest: string;
    let dashManifest: string;

    // TODO : rewrite this to be more deterministic. 
    if (streamingPaths.streamingPaths && streamingPaths.streamingPaths.length > 0) {
        streamingPaths.streamingPaths.forEach(path => {
            if (path.streamingProtocol == "Hls") {
                if (path.paths) {
                    path.paths.forEach(hlsFormat => {
                        // Look for the CMAF HLS format URL. This is the most current HLS version supported
                        if (hlsFormat.indexOf('m3u8-cmaf') > 0) {
                            hlsManifest = `${scheme}://${hostname}${hlsFormat}`;
                            console.log(`The HLS (MP4) manifest URL is : ${hlsManifest}`);
                            console.log("Open the following URL to playback the live stream in an HLS compliant player (HLS.js, Shaka, ExoPlayer) or directly in an iOS device");
                            console.log(`${hlsManifest}`);
                            console.log();
                        }
                    });

                }
            }
            if (path.streamingProtocol == "Dash") {
                if (path.paths) {
                    path.paths.forEach(dashFormat => {
                        // Look for the CMAF DASH format URL. This is the most current DASH version supported
                        if (dashFormat.indexOf('cmaf') > 0) {
                            dashManifest = `${scheme}://${hostname}${dashFormat}`;
                            console.log(`The DASH manifest URL is : ${dashManifest}`);

                            console.log("Open the following URL to playback the live stream from the LiveOutput in the Azure Media Player");
                            console.log(`https://ampdemo.azureedge.net/?url=${dashManifest}&heuristicprofile=lowlatency"`);
                            console.log();
                        }
                    });

                }
            }
        });
    } else {
        console.error("No streaming paths found. Make sure that the encoder is sending data to the ingest point.");
    }
}

// <CreateStreamingLocator>
async function createStreamingLocator(assetName: string, locatorName: string) {
    let streamingLocator = {
        assetName: assetName,
        streamingPolicyName: "Predefined_ClearStreamingOnly"  // no DRM or AES128 encryption protection on this asset. Clear means un-encrypted.
    };

    let locator = await mediaServicesClient.streamingLocators.create(
        resourceGroup,
        accountName,
        locatorName,
        streamingLocator);

    return locator;
}
// </CreateStreamingLocator>

// <CleanUpResources>
// Stops and cleans up all resources used in the sample
// Be sure to double check the portal to make sure you do not have any accidentally leaking resources that are in billable states.
async function cleanUpResources(liveEventName: string, liveOutputName: string) {

    let liveOutputForCleanup = await mediaServicesClient.liveOutputs.get(
        resourceGroup,
        accountName,
        liveEventName,
        liveOutputName
    );

    // First clean up and stop all live outputs - "recordings" 
    // This will NOT delete the archive asset. It just stops the tape recording machine. 
    // All tapes (asset objects) are retained in your storage account and can continue to be streamed
    // as on-demand content without any changes. 

    console.log("Deleting Live Output");
    let timeStart = process.hrtime();
    // Wait for this to cleanup first and then continue...
    if (liveOutputForCleanup) {
        await mediaServicesClient.liveOutputs.beginDeleteAndWait(
            resourceGroup,
            accountName,
            liveEventName,
            liveOutputName,
            {
                updateIntervalInMs: longRunningOperationUpdateIntervalMs // Setting this adjusts the polling interval of the long running operation. 
            }
        )
            .then(() => {
                let timeEnd = process.hrtime(timeStart);
                console.info(`Execution time for delete live output: %ds %dms`, timeEnd[0], timeEnd[1] / 1000000);
                console.log();
            });
    };

    // OPTIONAL - If you want to immediately use the Asset for encoding, analysis, or other workflows, you can do so here.
    // This is the point at which you can immediately use the archived, recorded asset in storage for other tasks. 
    // You do not need to wait for the live event to clean up before continuing with other tasks on the recorded output.

    // Once the above completes, you can refresh the player to see that the live stream has stopped and you are now viewing the recorded asset in on-demand mode. 

    // Next we will clean up the live event by stopping it and then deleting it. 
    // Stop can take some time, as it has to clean up resources async.

    let liveEventForCleanup = await mediaServicesClient.liveEvents.get(
        resourceGroup,
        accountName,
        liveEventName
    );

    console.log("Stopping Live Event...");
    if (liveEventForCleanup) {
        timeStart = process.hrtime();
        if (liveEventForCleanup.resourceState == "Running") {
            await mediaServicesClient.liveEvents.beginStopAndWait(
                resourceGroup,
                accountName,
                liveEventName,
                {
                    // It can be faster to delete all live outputs first, and then delete the live event. 
                    // if you have additional workflows on the archive to run. Speeds things up!
                    //removeOutputsOnStop :true // this is OPTIONAL, but recommend deleting them manually first. 
                },
                {
                    updateIntervalInMs: longRunningOperationUpdateIntervalMs // Setting this adjusts the polling interval of the long running operation. 
                }
            )
                .then(() => {
                    let timeEnd = process.hrtime(timeStart);
                    console.info(`Execution time for Stop Live Event: %ds %dms`, timeEnd[0], timeEnd[1] / 1000000);
                    console.log();
                })
        }


        timeStart = process.hrtime();
        // Delete the Live Event
        console.log("Deleting Live Event...");
        let deleteLiveEventOperation = await mediaServicesClient.liveEvents.beginDeleteAndWait(
            resourceGroup,
            accountName,
            liveEventName,
            {
                updateIntervalInMs: longRunningOperationUpdateIntervalMs // Setting this adjusts the polling interval of the long running operation. 
            }
        )
            .then(() => {

                let timeEnd = process.hrtime(timeStart);
                console.info(`Execution time for Delete Live Event: %ds %dms`, timeEnd[0], timeEnd[1] / 1000000);
                console.log();
            })

        // IMPORTANT! Open the portal again and make CERTAIN that the live event is stopped and deleted - and that you do not have any billing live events running still.
    }
    // </CleanUpResources>
}