// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import {
    AzureMediaServices,
    AzureMediaServicesModels,
    Mediaservices
} from '@azure/arm-mediaservices';
import { v4 as uuidv4 } from 'uuid';
// Load the .env file if it exists
import * as dotenv from "dotenv";
import { IPRange, LiveEvent, LiveEventInputAccessControl, LiveEventPreview, LiveOutput } from "@azure/arm-mediaservices/esm/models";
import { getPathStringFromParameter } from "@azure/ms-rest-js/es/lib/operationParameter";
dotenv.config();

// This is the main Media Services client object
let mediaServicesClient: AzureMediaServices;

// Copy the samples.env file and rename it to .env first, then populate it's values with the values obtained 
// from your Media Services account's API Access page in the Azure portal.
const clientId: string = process.env.AZURE_CLIENT_ID as string;
const secret: string = process.env.AZURE_CLIENT_SECRET as string;
const tenantDomain: string = process.env.AAD_TENANT_DOMAIN as string;
const subscriptionId: string = process.env.AZURE_SUBSCRIPTION_ID as string;
const resourceGroup: string = process.env.AZURE_RESOURCE_GROUP as string;
const accountName: string = process.env.AZURE_MEDIA_ACCOUNT_NAME as string;
const location: string = process.env.AZURE_LOCATION as string;

// Credentials object used for Service Principal authentication to Azure Media Services and Storage account
let credentials: msRestNodeAuth.ApplicationTokenCredentials;


//////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {
    let uniqueness = uuidv4().split('-')[0]; // Create a GUID for uniqueness 
    let liveEventName = "liveEvent-" + uniqueness // WARNING: Be careful not to leak live events using this sample!
    let assetName = "archiveAsset" + uniqueness;
    let liveOutputName = "liveOutput" + uniqueness;
    let streamingLocatorName = "liveStreamLocator" + uniqueness;
    let streamingEndpointName = "default"; // Change this to your specific streaming endpoint name if not using "default"

    // The primary live event and output objects for creating and cleaning up later. 
    let liveEvent: LiveEvent;
    let liveOutput: LiveOutput;

    console.error("Starting the Live Streaming sample for Azure Media Services");
    try {
        credentials = await msRestNodeAuth.loginWithServicePrincipalSecret(clientId, secret, tenantDomain);
        mediaServicesClient = new AzureMediaServices(credentials, subscriptionId);
    } catch (err) {
        console.log(`Error retrieving Media Services Client. Status Code:${err.statusCode}  Body: ${err.Body}`);
    }

    try {


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

        // To get the same ingest URL for the same LiveEvent name every time...
        // 1. Set useStaticHostname  to true so you have ingest like: 
        //        rtmps://liveevent-hevc12-eventgridmediaservice-usw22.channel.media.azure.net:2935/live/522f9b27dd2d4b26aeb9ef8ab96c5c77           
        // 2. Set accessToken to a desired GUID string (with or without hyphen)

        // See REST API documentation for details on each setting value
        // https://docs.microsoft.com/rest/api/media/liveevents/create 

        let liveEventCreate: LiveEvent = {
            location: location,
            description: "Sample Live Event from Node.js SDK sample",
            useStaticHostname: false,
            // `) Set up the input settings for the Live event...
            input: {
                streamingProtocol: "RTMP", // options are RTMP or Smooth Streaming ingest format.
                accessControl: liveEventInputAccess,  // controls the IP restriction for the source encoder. 
                keyFrameIntervalDuration: "PT2S",  // Set this to match the ingest encoder's settings   
                accessToken: "9eb1f703b149417c8448771867f48501" // Use this value when you want to make sure the ingest URL is always the same and not random.f omitted, the service will generate a unique value.
            },

            // 2) Set the live event to use pass-through or cloud encoding modes...
            encoding: {
                // Set this to Standard or Premium1080P to use the cloud live encoder.
                // See https://go.microsoft.com/fwlink/?linkid=2095101 for more information
                // Otherwise, leave as "None" to use pass-through mode
                encodingType: "None",// also known as pass-through mode. 
                // OPTIONAL settings when using live cloud encoding type:
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
            // WARNING : This is extra cost, so please check pricing before enabling.
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
        console.log("Live Event creation is an aysnc operation in Azure and timing can depend on resources available.")
        console.log();

        // When autostart is set to true, the Live Event will be started after creation. 
        // That means, the billing starts as soon as the Live Event starts running. 
        // You must explicitly call Stop on the Live Event resource to halt further billing.
        // The following operation can sometimes take awhile. Be patient.
        let liveEvent = await mediaServicesClient.liveEvents.create(
            resourceGroup,
            accountName,
            liveEventName,
            liveEventCreate,
            // When autostart is set to true, the Live Event will be started after creation. 
            // You may choose not to do this, but create the object, and then start it using the standby state to 
            // keep the resources "warm" and billing at a lower cost until you are ready to go live. 
            // That increases the speed of startup when you are ready to go live. 
            {
                autoStart: true
            }
        );

        // Get the RTMP ingest URL to configure in OBS Studio. 
        if (liveEvent.input?.endpoints) {
            let ingestUrl = liveEvent.input.endpoints[0].url;
            console.log(`The RTMP ingest URL to enter into OBS Studio is:`);
            console.log(`RTMP ingest : ${ingestUrl}`);
            console.log(`Make sure to enter a Stream Key into the OBS studio settings. It can be any value or you can repeat the GUID used in the ingest URL path.`);
            console.log();
        }

        if (liveEvent.preview?.endpoints) {
            // Use the previewEndpoint to preview and verify
            // that the input from the encoder is actually being received
            let previewEndpoint = liveEvent.preview.endpoints[0].url;
            console.log("The preview url is:");
            console.log(previewEndpoint);
            console.log();
            console.log("Open the live preview in your browser and use any DASH or HLS player to monitor the preview playback:");
            console.log(`https://ampdemo.azureedge.net/?url=${previewEndpoint}&heuristicprofile=lowlatency`);
            console.log("You will need to refresh the player page SEVERAL times until enough data has arrived to allow for manifest creation.");
            console.log("In a production player, the player can inspect the manifest to see if it contains enough content for the player to load and auto reload.");
            console.log();
        }

        console.log("Start the live stream now, sending the input to the ingest url and verify that it is arriving with the preview url.");
        console.log("IMPORTANT TIP!: Make CERTAIN that the video is flowing to the Preview URL before continuing!");

         // SET A BREAKPOINT HERE!
         console.log("PAUSE here in the Debugger until you are ready to continue...");

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

        let liveOutputCreate: LiveOutput;
        let liveOutput: LiveOutput;
        if (asset.name) {
            liveOutputCreate = {
                description: "Optional description when using more than one live output",
                assetName: asset.name,
                manifestName: manifestName, // The HLS and DASH manifest file name. If not provided, the service will generate one automatically.
                archiveWindowLength: "PT1H", // sets a one hour time-shift DVR window. Uses ISO 8601 format string.
                hls: {
                    fragmentsPerTsSegment: 1 // Advanced setting when using HLS TS output only.
                },
            }

            // Create and await the live output
            let liveOutput: LiveOutput = await mediaServicesClient.liveOutputs.create(
                resourceGroup,
                accountName,
                liveEventName,
                liveOutputName,
                liveOutputCreate);
        }

        // Create the Streaming Locator URL for playback of the contents in the Live Output recording
        console.log(`Creating a streaming locator named : ${streamingLocatorName}`);
        console.log();
        let locator = await createStreamingLocator(assetName, streamingLocatorName);

        // Get the default streaming endpoint on the account
        let streamingEndpoint = await mediaServicesClient.streamingEndpoints.get(resourceGroup, accountName, streamingEndpointName);

        if (streamingEndpoint?.resourceState !== "Running") {
            console.log(`Streaming endpoint is stopped. Starting the endpoint named ${streamingEndpointName}`);
            await mediaServicesClient.streamingEndpoints.start(resourceGroup, accountName, streamingEndpointName);

        }

        // Get the url to stream the output
        console.log("The streaming URLs to stream the live output from a client player");
        console.log();

        let hostname = streamingEndpoint.hostName;
        let scheme = "https";

        let streamingPaths = await mediaServicesClient.streamingLocators.listPaths(
            resourceGroup,
            accountName,
            streamingLocatorName
        );

        let hlsManifest: string;
        let dashManifest: string;

        if (streamingPaths.streamingPaths && streamingPaths.streamingPaths.length > 0) {
            streamingPaths.streamingPaths.forEach(path => {
                if (path.streamingProtocol == "Hls") {
                    if (path.paths) {
                        hlsManifest = `${scheme}://${hostname}${path.paths[0]}`;
                        console.log(`The HLS manifest URL is : ${hlsManifest}`)

                        console.log("Open the following URL to playback the live stream in an HLS compliant player (HLS.js, Shaka, ExoPlayer) or directly in an iOS device");
                        console.log(`${hlsManifest}`)
                        console.log();
                    }
                }
                if (path.streamingProtocol == "Dash") {
                    if (path.paths) {
                        dashManifest = `${scheme}://${hostname}${path.paths[0]}`;
                        console.log(`The DASH manifest URL is : ${dashManifest}`)

                        console.log("Open the following URL to playback the live stream from the LiveOutput in the Azure Media Player");
                        console.log(`https://ampdemo.azureedge.net/?url=${dashManifest}&heuristicprofile=lowlatency"`)
                        console.log();
                    }
                }
            });
        } else {
            console.error("No streaming paths found. Make sure that the encoder is sending data to the ingest point.")
        }

        // SET A BREAKPOINT HERE!
        console.log("PAUSE here in the Debugger until you are ready to continue...");

        console.error("WARNING: If you hit this message, double check the Portal to make sure you do not have any Running live events after using this Sample- or they will remain billing!");


    } catch (err) {
        console.log(err);
    }
    finally {
        // Cleaning Up all resources
        //@ts-ignore - these will be set, so avoiding the compiler complaint for now. 
        await cleanUpResources(liveEventName, liveOutputName);
        console.error("WARNING: If you hit this message, double check the Portal to make sure you do not have any Running live events - or they will remain billing!");

    }
}

main().catch((err) => {
    console.error("Error running live streaming sample:", err.message);
    console.error("WARNING: If you hit this message, double check the Portal to make sure you do not have any Running live events - or they will remain billing!");
});


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

    // Wait for this to cleanup first and then continue...
    if (liveOutputForCleanup) {
        await mediaServicesClient.liveOutputs.deleteMethod(
            resourceGroup,
            accountName,
            liveEventName,
            liveOutputName
        )
    };

    // OPTIONAL - If you want to immediately use the Asset for encoding, analysis, or other workflows, you can do so here.
    // This is the point at which you can immediately use the archived, recorded asset in storage for other tasks. 
    // You do not need to wait for the live event to clean up before continuing with other tasks on the recorded output.

    let liveEventForCleanup = await mediaServicesClient.liveEvents.get(
        resourceGroup,
        accountName,
        liveEventName
    );

    if (liveEventForCleanup) {
        if (liveEventForCleanup.resourceState == "Running") {
            await mediaServicesClient.liveEvents.stop(
                resourceGroup,
                accountName,
                liveEventName,
                {
                    // It can be faster to delete all live outputs first, and then delete the live event. 
                    // if you have additional workflows on the archive to run. Speeds things up!
                    //removeOutputsOnStop :true // this is OPTIONAL, but recommend deleting them manually first. 
                }
            )
        }

        // Delete the Live Event
        await mediaServicesClient.liveEvents.deleteMethod(
            resourceGroup,
            accountName,
            liveEventName
        )
    }
}